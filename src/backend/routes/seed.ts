import { Hono } from 'hono';
import { AppEnv } from '../types';
import { hashPassword } from '../lib/crypto';

export const seedRoutes = new Hono<AppEnv>();

// POST /api/seed - Initialize or Reset Database with demo dataset
seedRoutes.post('/', async (c) => {
  try {
    // 1. Clean existing tables
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM enrollments'),
      c.env.DB.prepare('DELETE FROM sections'),
      c.env.DB.prepare('DELETE FROM courses'),
      c.env.DB.prepare('DELETE FROM students'),
    ]);

    // 2. Insert Courses
    const courseStmts = [
      c.env.DB.prepare('INSERT INTO courses (id, course_code, title, credits, department) VALUES (1, "CS101", "Introduction to Computer Science", 3, "Computer Science")'),
      c.env.DB.prepare('INSERT INTO courses (id, course_code, title, credits, department) VALUES (2, "CS202", "Data Structures & Algorithms", 3, "Computer Science")'),
      c.env.DB.prepare('INSERT INTO courses (id, course_code, title, credits, department) VALUES (3, "CS301", "Database Systems & Cloud Architecture", 3, "Information Technology")'),
      c.env.DB.prepare('INSERT INTO courses (id, course_code, title, credits, department) VALUES (4, "SE201", "Software Engineering Principles", 3, "Software Engineering")'),
      c.env.DB.prepare('INSERT INTO courses (id, course_code, title, credits, department) VALUES (5, "GEN101", "Effective Communication & Academic Writing", 2, "General Education")'),
    ];

    // 3. Insert Sections
    const sectionStmts = [
      c.env.DB.prepare('INSERT INTO sections (id, course_id, section_number, semester, schedule, room, max_capacity, enrolled_count) VALUES (1, 1, "SEC01", "2026/1", "MON_WED 09:00-10:30", "CB2-301", 40, 1)'),
      c.env.DB.prepare('INSERT INTO sections (id, course_id, section_number, semester, schedule, room, max_capacity, enrolled_count) VALUES (2, 2, "SEC01", "2026/1", "TUE_THU 10:30-12:00", "CB2-405", 30, 1)'),
      c.env.DB.prepare('INSERT INTO sections (id, course_id, section_number, semester, schedule, room, max_capacity, enrolled_count) VALUES (3, 2, "SEC02", "2026/1", "MON_WED 13:30-15:00", "CB2-405", 2, 2)'),
      c.env.DB.prepare('INSERT INTO sections (id, course_id, section_number, semester, schedule, room, max_capacity, enrolled_count) VALUES (4, 3, "SEC01", "2026/1", "FRI 09:00-12:00", "LAB-102", 35, 0)'),
      c.env.DB.prepare('INSERT INTO sections (id, course_id, section_number, semester, schedule, room, max_capacity, enrolled_count) VALUES (5, 4, "SEC01", "2026/1", "THU 13:00-16:00", "CB1-201", 30, 1)'),
      c.env.DB.prepare('INSERT INTO sections (id, course_id, section_number, semester, schedule, room, max_capacity, enrolled_count) VALUES (6, 2, "SEC03", "2026/1", "FRI 13:30-15:00", "CB2-405", 30, 0)'),
    ];

    // 4. Insert Students with hashed default passwords (password == student_code)
    const seedStudents = [
      { id: 1, code: '65010042', name: 'Somchai Prasert', email: 's65010042@university.ac.th', major: 'Software Engineering' },
      { id: 2, code: '65010088', name: 'Wipada Srisuk', email: 's65010088@university.ac.th', major: 'Computer Science' },
      { id: 3, code: '66010123', name: 'Thanawat Jaiyen', email: 's66010123@university.ac.th', major: 'Information Technology' },
      { id: 4, code: '66010199', name: 'Nattaporn Meedee', email: 's66010199@university.ac.th', major: 'Computer Science' },
    ];

    const studentStmts = await Promise.all(
      seedStudents.map(async (st) => {
        const hash = await hashPassword(st.code);
        return c.env.DB.prepare(
          'INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, "STUDENT")'
        ).bind(st.id, st.code, st.name, st.email, st.major, hash);
      })
    );

    // 5. Insert Sample Enrollments
    const enrollmentStmts = [
      c.env.DB.prepare('INSERT INTO enrollments (id, student_id, section_id, status, enrolled_at, updated_at) VALUES (1, 1, 1, "ENROLLED", "2026-08-15 08:30:00", "2026-08-15 08:30:00")'),
      c.env.DB.prepare('INSERT INTO enrollments (id, student_id, section_id, status, enrolled_at, updated_at) VALUES (2, 2, 2, "ENROLLED", "2026-08-15 08:45:00", "2026-08-15 08:45:00")'),
      c.env.DB.prepare('INSERT INTO enrollments (id, student_id, section_id, status, enrolled_at, updated_at) VALUES (3, 3, 3, "ENROLLED", "2026-08-15 09:00:00", "2026-08-15 09:00:00")'),
      c.env.DB.prepare('INSERT INTO enrollments (id, student_id, section_id, status, enrolled_at, updated_at) VALUES (4, 4, 3, "ENROLLED", "2026-08-15 09:05:00", "2026-08-15 09:05:00")'),
      c.env.DB.prepare('INSERT INTO enrollments (id, student_id, section_id, status, enrolled_at, updated_at) VALUES (5, 1, 5, "ENROLLED", "2026-08-15 09:30:00", "2026-08-15 09:30:00")'),
    ];

    await c.env.DB.batch([
      ...courseStmts,
      ...sectionStmts,
      ...studentStmts,
      ...enrollmentStmts,
    ]);

    return c.json({
      success: true,
      message: 'Database seeded successfully with 5 courses, 5 sections, 4 students (with hashed passwords), and 5 enrollments.',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to seed database',
    }, 500);
  }
});
