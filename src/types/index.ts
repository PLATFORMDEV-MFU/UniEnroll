export interface Course {
  id: number;
  course_code: string;
  title: string;
  credits: number;
  department: string;
  created_at?: string;
}

export interface Section {
  id: number;
  course_id: number;
  section_number: string;
  semester: string;
  schedule: string;
  room?: string;
  max_capacity: number;
  enrolled_count: number;
  available_seats: number;
  status: 'OPEN' | 'CLOSED';
  course_code: string;
  course_title: string;
  credits: number;
}

export interface Student {
  id: number;
  student_code: string;
  full_name: string;
  email: string;
  major: string;
  role?: 'STUDENT' | 'STAFF';
  created_at?: string;
}

export interface AuthUser {
  id: number;
  student_code: string;
  full_name: string;
  email: string;
  major: string;
  role: 'STUDENT' | 'STAFF';
}

export interface LoginRequest {
  student_code: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  token: string;
  user: AuthUser;
}

export interface Enrollment {
  id: number;
  student_id: number;
  section_id: number;
  status: 'ENROLLED' | 'DROPPED' | 'WITHDRAWN' | 'OVERRIDDEN';
  withdrawal_reason?: string;
  enrolled_at: string;
  updated_at: string;
  student_code: string;
  student_name: string;
  course_code: string;
  course_title: string;
  credits: number;
  section_number: string;
  semester: string;
  schedule: string;
  room?: string;
}

export interface Override {
  id: number;
  student_id: number;
  section_id: number;
  staff_id: number;
  override_type: 'CAPACITY' | 'PREREQUISITE' | 'LATE_ADD' | 'SPECIAL_PERMISSION';
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
  student_code?: string;
  student_name?: string;
  course_code?: string;
  course_title?: string;
  section_number?: string;
  staff_name?: string;
}

export interface ApiLog {
  id: string;
  timestamp: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  endpoint: string;
  status: number;
  durationMs: number;
  payload?: any;
  response?: any;
  error?: string;
}
