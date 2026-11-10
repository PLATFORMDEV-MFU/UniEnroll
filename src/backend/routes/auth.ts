import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { AppEnv, Student } from '../types';
import { verifyPassword } from '../lib/crypto';
import { authenticateStudentIdentity } from '../lib/student-identity-client';
import { authMiddleware, getJwtSecret } from '../middleware/auth';

type StudentIdentityAuthenticator = typeof authenticateStudentIdentity;

export function createAuthRoutes(
  authenticate: StudentIdentityAuthenticator = authenticateStudentIdentity,
): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

// 1. POST /api/auth/login
routes.post('/login', async (c) => {
  let body: { student_code?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON request body' }, 400);
  }

  const { student_code, password } = body;

  if (!student_code || !password) {
    return c.json(
      {
        success: false,
        error: 'Missing required credentials: student_code and password are required',
      },
      400
    );
  }

  const normalizedStudentCode = student_code.trim();
  let student = await c.env.DB.prepare(
    'SELECT * FROM students WHERE student_code = ?'
  )
    .bind(normalizedStudentCode)
    .first<Student>();

  let isValid = false;
  const usesStudentIdentity = /^\d{10}$/.test(normalizedStudentCode)
    && (!student || student.role?.toUpperCase() === 'STUDENT');

  if (usesStudentIdentity) {
    const identityAuth = await authenticate(c.env, normalizedStudentCode, password);
    if (identityAuth.ok === false) {
      return c.json(
        {
          success: false,
          error: identityAuth.message,
          error_code: identityAuth.code,
        },
        identityAuth.status,
      );
    }

    if (!student) {
      const profile = identityAuth.profile;
      await c.env.DB.prepare(
        `INSERT INTO students (student_code, full_name, email, major, password_hash, role)
         VALUES (?, ?, ?, ?, 'federated:team01', 'STUDENT')
         ON CONFLICT(student_code) DO NOTHING`
      )
        .bind(profile.studentId, profile.fullName, profile.email, profile.major)
        .run();
      student = await c.env.DB.prepare('SELECT * FROM students WHERE student_code = ?')
        .bind(normalizedStudentCode)
        .first<Student>();
    }

    isValid = true;
  } else if (student?.password_hash) {
    isValid = await verifyPassword(password, student.password_hash);
  }

  if (!isValid || !student) {
    return c.json(
      {
        success: false,
        error: 'Invalid student code or password',
      },
      401
    );
  }

  // Issue 24-hour JWT
  const secret = getJwtSecret(c.env);
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours
  const payload = {
    sub: student.id,
    student_code: student.student_code,
    role: student.role || 'STUDENT',
    exp,
  };

  const token = await sign(payload, secret, 'HS256');

  return c.json({
    success: true,
    message: 'Authentication successful',
    token,
    user: {
      id: student.id,
      student_code: student.student_code,
      full_name: student.full_name,
      email: student.email,
      major: student.major,
      role: student.role || 'STUDENT',
    },
  });
});

// 2. GET /api/auth/me (Get profile for currently authenticated user)
routes.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');

  const student = await c.env.DB.prepare(
    'SELECT id, student_code, full_name, email, major, role, created_at FROM students WHERE id = ?'
  )
    .bind(user.sub)
    .first<Omit<Student, 'password_hash'>>();

  if (!student) {
    return c.json({ success: false, error: 'User profile not found' }, 404);
  }

  return c.json({
    success: true,
    user: student,
  });
});

  return routes;
}

export const authRoutes = createAuthRoutes();

