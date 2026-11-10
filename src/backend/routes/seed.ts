import { Hono } from 'hono';
import { AppEnv } from '../types';
import { hashPassword } from '../lib/crypto';
import { authMiddleware, requireRole } from '../middleware/auth';

export const seedRoutes = new Hono<AppEnv>();

const seedUsers = [
  { id: 1, code: '6731503119', name: 'Waritpon Kokong', email: 's6731503119@university.ac.th', major: 'Software Engineering', role: 'STUDENT' },
  { id: 2, code: '65010088', name: 'Wipada Srisuk', email: 's65010088@university.ac.th', major: 'Computer Science', role: 'STUDENT' },
  { id: 3, code: '66010123', name: 'Thanawat Jaiyen', email: 's66010123@university.ac.th', major: 'Information Technology', role: 'STUDENT' },
  { id: 4, code: '66010199', name: 'Nattaporn Meedee', email: 's66010199@university.ac.th', major: 'Computer Science', role: 'STUDENT' },
  { id: 5, code: 'staff01', name: 'Dr. Apinya Somboon (Registrar Staff)', email: 'staff01@university.ac.th', major: 'Academic Registrar Office', role: 'STAFF' },
] as const;

export function isValidSeedPassword(password: string | undefined): password is string {
  return Boolean(
    password
    && password.length >= 16
    && !seedUsers.some((user) => user.code === password)
  );
}

seedRoutes.use('*', authMiddleware);
seedRoutes.use('*', requireRole('STAFF'));
seedRoutes.use('*', async (c, next) => {
  if (c.env.SEED_ENABLED !== 'true') {
    return c.json({
      success: false,
      error: {
        code: 'ERR_SEED_DISABLED',
        message: 'Database seeding is disabled in this environment',
      },
    }, 403);
  }
  await next();
});

// POST /api/seed - Initialize or Reset Database with demo dataset
seedRoutes.post('/', async (c) => {
  try {
    const seedPassword = c.env.SEED_ACCOUNT_PASSWORD;
    if (!isValidSeedPassword(seedPassword)) {
      return c.json({
        success: false,
        error: {
          code: 'ERR_SEED_PASSWORD_NOT_CONFIGURED',
          message: 'SEED_ACCOUNT_PASSWORD must be a non-public secret of at least 16 characters.',
        },
      }, 500);
    }

    // 1. Clean existing tables
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM rule_decisions'),
      c.env.DB.prepare('DELETE FROM student_course_history'),
      c.env.DB.prepare('DELETE FROM course_prerequisites'),
      c.env.DB.prepare('DELETE FROM overrides'),
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

    // 4. Insert Students & Staff with a configured secret password.
    const studentStmts = await Promise.all(
      seedUsers.map(async (u) => {
        const hash = await hashPassword(seedPassword);
        return c.env.DB.prepare(
          'INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(u.id, u.code, u.name, u.email, u.major, hash, u.role);
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

    // 6. Insert prerequisite rules and completed-course evidence
    const academicRuleStmts = [
      c.env.DB.prepare("INSERT INTO course_prerequisites (course_id, prerequisite_course_id, minimum_grade) VALUES (2, 1, 'C')"),
      c.env.DB.prepare("INSERT INTO course_prerequisites (course_id, prerequisite_course_id, minimum_grade) VALUES (3, 2, 'C')"),
      c.env.DB.prepare("INSERT INTO student_course_history (student_id, course_id, grade, status, completed_at) VALUES (2, 1, 'B', 'COMPLETED', '2026-05-20 00:00:00')"),
      c.env.DB.prepare("INSERT INTO student_course_history (student_id, course_id, grade, status, completed_at) VALUES (3, 1, 'B+', 'COMPLETED', '2026-05-20 00:00:00')"),
      c.env.DB.prepare("INSERT INTO student_course_history (student_id, course_id, grade, status, completed_at) VALUES (4, 1, 'A', 'COMPLETED', '2026-05-20 00:00:00')"),
    ];

    // 7. Insert Sample Override Log
    const overrideStmts = [
      c.env.DB.prepare('INSERT INTO overrides (id, student_id, section_id, staff_id, override_type, reason, status, created_at) VALUES (1, 1, 5, 5, "SPECIAL_PERMISSION", "Academic advisor approved SE201 registration exception", "APPROVED", "2026-08-15 09:30:00")'),
    ];

    await c.env.DB.batch([
      ...courseStmts,
      ...sectionStmts,
      ...studentStmts,
      ...enrollmentStmts,
      ...academicRuleStmts,
      ...overrideStmts,
    ]);

    return c.json({
      success: true,
      message: 'Database seeded successfully with courses, sections, users, enrollments, prerequisite evidence, and override audit data.',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to seed database',
    }, 500);
  }
});
