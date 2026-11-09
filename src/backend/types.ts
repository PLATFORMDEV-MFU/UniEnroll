export type Bindings = {
  DB: D1Database;
  JWT_SECRET?: string;
};

export type AuthPayload = {
  sub: number;
  student_code: string;
  role: 'STUDENT' | 'STAFF';
  exp?: number;
};

export type Variables = {
  user: AuthPayload;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

export interface Course {
  id: number;
  course_code: string;
  title: string;
  credits: number;
  department: string;
  created_at: string;
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
  created_at: string;
  // joined fields
  course_code?: string;
  course_title?: string;
  credits?: number;
  available_seats?: number;
}

export interface Student {
  id: number;
  student_code: string;
  full_name: string;
  email: string;
  major: string;
  password_hash?: string;
  role: 'STUDENT' | 'STAFF';
  created_at: string;
}

export interface Enrollment {
  id: number;
  student_id: number;
  section_id: number;
  status: 'ENROLLED' | 'DROPPED' | 'WITHDRAWN' | 'OVERRIDDEN';
  withdrawal_reason?: string;
  enrolled_at: string;
  updated_at: string;
  // joined fields
  student_code?: string;
  student_name?: string;
  course_code?: string;
  course_title?: string;
  section_number?: string;
  semester?: string;
  credits?: number;
  schedule?: string;
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
  // joined fields
  student_code?: string;
  student_name?: string;
  course_code?: string;
  course_title?: string;
  section_number?: string;
  staff_name?: string;
}

export interface CreateEnrollmentDTO {
  student_id?: number;
  section_id: number;
}

export interface UpdateEnrollmentDTO {
  section_id?: number;
  status?: 'ENROLLED' | 'DROPPED' | 'WITHDRAWN' | 'OVERRIDDEN';
}

export interface CreateOverrideDTO {
  student_id?: number;
  student_code?: string;
  section_id: number;
  override_type: 'CAPACITY' | 'PREREQUISITE' | 'LATE_ADD' | 'SPECIAL_PERMISSION';
  reason: string;
}

export interface WithdrawEnrollmentDTO {
  reason?: string;
}
