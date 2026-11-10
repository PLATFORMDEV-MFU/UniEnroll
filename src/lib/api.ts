import { Course, Section, Student, Enrollment, Override, ApiLog, AuthUser, LoginResponse } from '../types';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://unienroll-backend.team03-enrollment.workers.dev';

export const TOKEN_STORAGE_KEY = 'unienroll_auth_token';
export const USER_STORAGE_KEY = 'unienroll_auth_user';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser | null): void {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

type UnauthorizedCallback = () => void;
let unauthorizedListener: UnauthorizedCallback | null = null;

export function setUnauthorizedListener(cb: UnauthorizedCallback | null) {
  unauthorizedListener = cb;
}

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

  // Inject Authorization Bearer token if available
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const token = getStoredToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
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

    // Notify listeners if 401 Unauthorized (e.g. token expired)
    if (res.status === 401 && endpoint !== '/api/auth/login') {
      unauthorizedListener?.();
    }

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
  // Auth API
  async login(studentCode: string, password: string): Promise<LoginResponse & { status: number; error?: string }> {
    const res = await request<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ student_code: studentCode, password }),
    });
    return res as any;
  },

  async getMe() {
    return request<AuthUser>('/api/auth/me');
  },

  // Resources
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

  async createEnrollment(sectionId: number, studentId?: number) {
    const body: Record<string, any> = { section_id: sectionId };
    if (studentId) body.student_id = studentId;

    return request<Enrollment>('/api/enrollments', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async updateEnrollment(
    enrollmentId: number,
    data: { section_id: number }
  ) {
    return request<Enrollment>(`/api/enrollments/${enrollmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async swapSection(enrollmentId: number, newSectionId: number) {
    return this.updateEnrollment(enrollmentId, { section_id: newSectionId });
  },

  async deleteEnrollment(enrollmentId: number) {
    return request<{ enrollment_id: number; status: string; freed_seats: number }>(
      `/api/enrollments/${enrollmentId}`,
      {
        method: 'DELETE',
      }
    );
  },

  async withdrawEnrollment(enrollmentId: number, reason?: string) {
    return request<Enrollment>(`/api/enrollments/${enrollmentId}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getOverrides() {
    return request<Override[]>('/api/overrides');
  },

  async createOverride(data: {
    student_id?: number;
    student_code?: string;
    section_id: number;
    override_type: 'CAPACITY' | 'PREREQUISITE' | 'LATE_ADD' | 'SPECIAL_PERMISSION';
    reason: string;
  }) {
    return request<any>('/api/overrides', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async seedDatabase() {
    return request('/api/seed', {
      method: 'POST',
    });
  },
};
