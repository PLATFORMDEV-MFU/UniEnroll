import { Hono } from 'hono';
import { Bindings, Section } from '../types';

export const sectionRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/sections (with availability calculation)
sectionRoutes.get('/', async (c) => {
  const courseId = c.req.query('course_id');
  const semester = c.req.query('semester');

  let query = `
    SELECT 
      s.id,
      s.course_id,
      s.section_number,
      s.semester,
      s.schedule,
      s.room,
      s.max_capacity,
      s.enrolled_count,
      (s.max_capacity - s.enrolled_count) AS available_seats,
      CASE WHEN s.enrolled_count >= s.max_capacity THEN 'CLOSED' ELSE 'OPEN' END AS status,
      c.course_code,
      c.title AS course_title,
      c.credits
    FROM sections s
    JOIN courses c ON s.course_id = c.id
    WHERE 1=1
  `;

  const params: any[] = [];
  if (courseId) {
    query += ' AND s.course_id = ?';
    params.push(Number(courseId));
  }
  if (semester) {
    query += ' AND s.semester = ?';
    params.push(semester);
  }

  query += ' ORDER BY c.course_code ASC, s.section_number ASC';

  const { results } = await c.env.DB.prepare(query).bind(...params).all<Section>();

  return c.json({
    success: true,
    total: results.length,
    data: results
  });
});

// GET /api/sections/:id (availability for specific section)
sectionRoutes.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ success: false, error: 'Invalid section ID' }, 400);
  }

  const query = `
    SELECT 
      s.id,
      s.course_id,
      s.section_number,
      s.semester,
      s.schedule,
      s.room,
      s.max_capacity,
      s.enrolled_count,
      (s.max_capacity - s.enrolled_count) AS available_seats,
      CASE WHEN s.enrolled_count >= s.max_capacity THEN 'CLOSED' ELSE 'OPEN' END AS status,
      c.course_code,
      c.title AS course_title,
      c.credits
    FROM sections s
    JOIN courses c ON s.course_id = c.id
    WHERE s.id = ?
  `;

  const section = await c.env.DB.prepare(query).bind(id).first<Section>();

  if (!section) {
    return c.json({ success: false, error: `Section with ID ${id} not found` }, 404);
  }

  return c.json({
    success: true,
    data: section
  });
});
