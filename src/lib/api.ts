import { Course, Section, Student, Enrollment, ApiLog } from '../types';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://unienroll-backend.team03-enrollment.workers.dev';

type LogCallback = (log: ApiLog) => void;
const logListeners: Set<LogCallback> = new Set();

export function subscribeApiLogs(callback: LogCallback) {
  logListeners.add(callback);
  return () => {
    logListeners.delete(callback);
  };
}

function broadcastLog(log: ApiLog) {
  logListeners.forEach((fn) => fn(log));
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; total?: number; message?: string; error?: string; error_code?: string; details?: any; status: number }> {
  const url = `${API_BASE_URL}${endpoint}`;
  const method = (options.method || 'GET') as ApiLog['method'];
  const startTime = performance.now();

  let bodyPayload: any = undefined;
  if (options.body && typeof options.body === 'string') {
    try {
      bodyPayload = JSON.parse(options.body);
    } catch {
      bodyPayload = options.body;
    }
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const durationMs = Math.round(performance.now() - startTime);
    const json: any = await res.json().catch(() => ({}));

    broadcastLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      method,
      endpoint,
      status: res.status,
      durationMs,
      payload: bodyPayload,
      response: json,
      error: !res.ok ? json.error || `HTTP ${res.status}` : undefined,
    });

    return {
      ...json,
      status: res.status,
    };
  } catch (error: any) {
    const durationMs = Math.round(performance.now() - startTime);
    const errorMessage = error.message || 'Network error';

    broadcastLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      method,
      endpoint,
      status: 0,
      durationMs,
      payload: bodyPayload,
      response: null,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      status: 0,
    };
  }
}

export const api = {
  async getHealth() {
    return request<{ status: string; timestamp: string }>('/health');
  },

  async getCourses() {
    return request<Course[]>('/api/courses');
  },

  async getSections(courseId?: number, semester?: string) {
    let query = '';
    const params = new URLSearchParams();
    if (courseId) params.append('course_id', courseId.toString());
    if (semester) params.append('semester', semester);
    if (params.toString()) query = `?${params.toString()}`;
    return request<Section[]>(`/api/sections${query}`);
  },

  async getStudents() {
    return request<Student[]>('/api/students');
  },

  async getEnrollments(studentId?: number, sectionId?: number, status?: string) {
    const params = new URLSearchParams();
    if (studentId) params.append('student_id', studentId.toString());
    if (sectionId) params.append('section_id', sectionId.toString());
    if (status) params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<Enrollment[]>(`/api/enrollments${query}`);
  },

  async createEnrollment(studentId: number, sectionId: number) {
    return request<Enrollment>('/api/enrollments', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, section_id: sectionId }),
    });
  },

  async updateEnrollment(
    enrollmentId: number,
    data: { section_id?: number; status?: 'ENROLLED' | 'DROPPED' }
  ) {
    return request<Enrollment>(`/api/enrollments/${enrollmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteEnrollment(enrollmentId: number) {
    return request<{ enrollment_id: number; status: string; freed_seats: number }>(
      `/api/enrollments/${enrollmentId}`,
      {
        method: 'DELETE',
      }
    );
  },

  async seedDatabase() {
    return request('/api/seed', {
      method: 'POST',
    });
  },
};
