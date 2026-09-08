import { Hono } from 'hono';
import { Bindings, Student } from '../types';

export const studentRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/students
studentRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM students ORDER BY student_code ASC'
  ).all<Student>();

  return c.json({
    success: true,
    total: results.length,
    data: results
  });
});

// GET /api/students/:id
studentRoutes.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ success: false, error: 'Invalid student ID' }, 400);
  }

  const student = await c.env.DB.prepare(
    'SELECT * FROM students WHERE id = ?'
  ).bind(id).first<Student>();

  if (!student) {
    return c.json({ success: false, error: `Student with ID ${id} not found` }, 404);
  }

  return c.json({
    success: true,
    data: student
  });
});
