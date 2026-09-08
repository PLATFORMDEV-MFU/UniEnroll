export type Bindings = {
  DB: D1Database;
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
  created_at: string;
}

export interface Enrollment {
  id: number;
  student_id: number;
  section_id: number;
  status: 'ENROLLED' | 'DROPPED';
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
}

export interface CreateEnrollmentDTO {
  student_id: number;
  section_id: number;
}

export interface UpdateEnrollmentDTO {
  section_id?: number;
  status?: 'ENROLLED' | 'DROPPED';
}
