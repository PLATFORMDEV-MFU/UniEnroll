import { Hono } from 'hono';
import { AppEnv, Course } from '../types';

export const courseRoutes = new Hono<AppEnv>();

// GET /api/courses
courseRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM courses ORDER BY course_code ASC'
  ).all<Course>();

  return c.json({
    success: true,
    total: results.length,
    data: results
  });
});

// GET /api/courses/:id
courseRoutes.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ success: false, error: 'Invalid course ID' }, 400);
  }

  const course = await c.env.DB.prepare(
    'SELECT * FROM courses WHERE id = ?'
  ).bind(id).first<Course>();

  if (!course) {
    return c.json({ success: false, error: `Course with ID ${id} not found` }, 404);
  }

  return c.json({
    success: true,
    data: course
  });
});
