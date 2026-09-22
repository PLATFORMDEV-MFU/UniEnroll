import { Hono } from 'hono';
import { AppEnv, Section } from '../types';

export const sectionRoutes = new Hono<AppEnv>();

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

// Helper function for section availability query
async function getSectionAvailability(db: D1Database, id: number) {
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
  return await db.prepare(query).bind(id).first<Section>();
}

// GET /api/sections/:id (availability for specific section)
sectionRoutes.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ success: false, error: 'Invalid section ID' }, 400);
  }

  const section = await getSectionAvailability(c.env.DB, id);
  if (!section) {
    return c.json({ success: false, error: `Section with ID ${id} not found` }, 404);
  }

  return c.json({
    success: true,
    data: section
  });
});

// GET /api/sections/:id/availability (explicit alias requested by partner group)
sectionRoutes.get('/:id/availability', async (c) => {
  const id = Number(c.req.param('id'));
  const partnerKey = c.req.header('X-Partner-Key');
  const partnerId = c.req.header('X-Partner-Id') || 'team-04-timetable-and-scheduling';

  if (partnerKey) {
    try {
      await c.env.DB.prepare(
        'INSERT INTO partner_request_logs (partner_id, endpoint, method, status_code) VALUES (?, ?, ?, ?)'
      ).bind(partnerId, c.req.path, c.req.method, 200).run();
    } catch {}
  }

  if (isNaN(id)) {
    return c.json({ success: false, error: 'Invalid section ID' }, 400);
  }

  const section = await getSectionAvailability(c.env.DB, id);
  if (!section) {
    return c.json({ success: false, error: `Section with ID ${id} not found` }, 404);
  }

  return c.json({
    success: true,
    data: section
  });
});
