import { Hono } from 'hono';
import { AppEnv, Student } from '../types';

export const studentRoutes = new Hono<AppEnv>();

// GET /api/students - List students (public profile info only, excluding password_hash)
studentRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, student_code, full_name, email, major, role, created_at FROM students ORDER BY student_code ASC'
  ).all<Omit<Student, 'password_hash'>>();

  return c.json({
    success: true,
    total: results.length,
    data: results
  });
});

// GET /api/students/:id - Get student by ID
studentRoutes.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ success: false, error: 'Invalid student ID' }, 400);
  }

  const student = await c.env.DB.prepare(
    'SELECT id, student_code, full_name, email, major, role, created_at FROM students WHERE id = ?'
  ).bind(id).first<Omit<Student, 'password_hash'>>();

  if (!student) {
    return c.json({ success: false, error: `Student with ID ${id} not found` }, 404);
  }

  return c.json({
    success: true,
    data: student
  });
});
