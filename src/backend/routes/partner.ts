import { Hono } from 'hono';
import { AppEnv, Section, Enrollment } from '../types';

export const partnerRoutes = new Hono<AppEnv>();

export const VALID_PARTNER_KEYS = new Set([
  'partner-secret-key-2026',
  'team-04-timetable-key',
  'team-05-attendance-key',
  'team-02-bursar-key',
]);

// Partner API Key Authentication Middleware
partnerRoutes.use('*', async (c, next) => {
  // Allow inspection logs without key or check key
  const apiKey =
    c.req.header('X-Partner-Key') ||
    c.req.header('Authorization')?.replace('Bearer ', '').trim();

  const partnerId = c.req.header('X-Partner-Id') || 'external-partner-group';

  if (!apiKey || !VALID_PARTNER_KEYS.has(apiKey)) {
    // Record rejected attempt in logs
    try {
      await c.env.DB.prepare(
        'INSERT INTO partner_request_logs (partner_id, endpoint, method, status_code) VALUES (?, ?, ?, 401)'
      )
        .bind(partnerId, c.req.path, c.req.method)
        .run();
    } catch {}

    return c.json(
      {
        success: false,
        error: 'Unauthorized: Invalid or missing X-Partner-Key header.',
        hint: 'Please provide X-Partner-Key: partner-secret-key-2026',
      },
      401
    );
  }

  // Record authorized request in partner_request_logs
  try {
    await c.env.DB.prepare(
      'INSERT INTO partner_request_logs (partner_id, endpoint, method, status_code) VALUES (?, ?, ?, 200)'
    )
      .bind(partnerId, c.req.path, c.req.method)
      .run();
  } catch {}

  await next();
});

// 1. GET /api/partner/sections (For Timetable & Classroom Allocation Teams)
partnerRoutes.get('/sections', async (c) => {
  const query = `
    SELECT 
      s.id AS section_id,
      c.course_code,
      c.title AS course_title,
      c.credits,
      s.section_number,
      s.semester,
      s.schedule,
      s.room,
      s.max_capacity,
      s.enrolled_count,
      (s.max_capacity - s.enrolled_count) AS available_seats,
      CASE WHEN s.enrolled_count >= s.max_capacity THEN 'FULL' ELSE 'AVAILABLE' END AS seat_status
    FROM sections s
    JOIN courses c ON s.course_id = c.id
    ORDER BY c.course_code ASC, s.section_number ASC
  `;

  const { results } = await c.env.DB.prepare(query).all();

  return c.json({
    success: true,
    provider: 'UniEnroll Team 03',
    service: 'Course & Section Roster Provider',
    total_sections: results.length,
    data: results,
  });
});

// 2. GET /api/partner/enrollments (For Attendance Tracking & Analytics Teams)
partnerRoutes.get('/enrollments', async (c) => {
  const courseCode = c.req.query('course_code');
  const sectionNumber = c.req.query('section_number');

  let query = `
    SELECT 
      e.id AS enrollment_id,
      e.status,
      e.enrolled_at,
      st.student_code,
      st.full_name AS student_name,
      st.email AS student_email,
      st.major,
      c.course_code,
      c.title AS course_title,
      s.section_number,
      s.schedule,
      s.room
    FROM enrollments e
    JOIN students st ON e.student_id = st.id
    JOIN sections s ON e.section_id = s.id
    JOIN courses c ON s.course_id = c.id
    WHERE e.status = 'ENROLLED'
  `;

  const params: any[] = [];
  if (courseCode) {
    query += ' AND c.course_code = ?';
    params.push(courseCode);
  }
  if (sectionNumber) {
    query += ' AND s.section_number = ?';
    params.push(sectionNumber);
  }

  query += ' ORDER BY c.course_code ASC, s.section_number ASC, st.student_code ASC';

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({
    success: true,
    provider: 'UniEnroll Team 03',
    service: 'Active Student Enrollment Roster',
    total_active_students: results.length,
    data: results,
  });
});

// 3. GET /api/partner/logs (Provider Proof Audit Logs)
partnerRoutes.get('/logs', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM partner_request_logs ORDER BY id DESC LIMIT 50'
  ).all();

  return c.json({
    success: true,
    total_logs: results.length,
    data: results,
  });
});

