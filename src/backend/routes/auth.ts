import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { AppEnv, Student } from '../types';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { authMiddleware, getJwtSecret } from '../middleware/auth';

export const authRoutes = new Hono<AppEnv>();

// 1. POST /api/auth/login
authRoutes.post('/login', async (c) => {
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

  const student = await c.env.DB.prepare(
    'SELECT * FROM students WHERE student_code = ?'
  )
    .bind(student_code.trim())
    .first<Student>();

  if (!student) {
    return c.json(
      {
        success: false,
        error: 'Invalid student code or password',
      },
      401
    );
  }

  // Validate password
  let isValid = false;
  if (student.password_hash) {
    isValid = await verifyPassword(password, student.password_hash);
  }

  // Fallback demo support: if student has no password_hash or default password matches student_code
  if (!isValid && password === student.student_code) {
    isValid = true;
    // Upgrade / update password hash in background
    try {
      const newHash = await hashPassword(password);
      await c.env.DB.prepare('UPDATE students SET password_hash = ? WHERE id = ?')
        .bind(newHash, student.id)
        .run();
    } catch {
      // Ignore background upgrade error
    }
  }

  if (!isValid) {
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
authRoutes.get('/me', authMiddleware, async (c) => {
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

