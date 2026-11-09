import { Hono } from 'hono';
import { AppEnv, CreateOverrideDTO, Override, Section, Student } from '../types';
import { authMiddleware } from '../middleware/auth';
import { dispatchWebhook } from '../lib/webhook-sender';

export const overrideRoutes = new Hono<AppEnv>();

// Enforce JWT authentication
overrideRoutes.use('*', authMiddleware);

// 1. GET /api/overrides - List all overrides (Audit Trail)
overrideRoutes.get('/', async (c) => {
  const user = c.get('user');

  let query = `
    SELECT 
      o.id,
      o.student_id,
      o.section_id,
      o.staff_id,
      o.override_type,
      o.reason,
      o.status,
      o.created_at,
      st.student_code,
      st.full_name AS student_name,
      c.course_code,
      c.title AS course_title,
      s.section_number,
      sf.full_name AS staff_name
    FROM overrides o
    JOIN students st ON o.student_id = st.id
    JOIN sections s ON o.section_id = s.id
    JOIN courses c ON s.course_id = c.id
    JOIN students sf ON o.staff_id = sf.id
    WHERE 1=1
  `;

  const params: any[] = [];
  if (user && user.role === 'STUDENT') {
    query += ' AND o.student_id = ?';
    params.push(user.sub);
  }

  query += ' ORDER BY o.created_at DESC';

  const { results } = await c.env.DB.prepare(query).bind(...params).all<Override>();

  return c.json({
    success: true,
    total: results.length,
    data: results,
  });
});

// 2. POST /api/overrides - Grant authorized staff override (FR-07)
overrideRoutes.post('/', async (c) => {
  const user = c.get('user');

  // Enforce staff authority check
  if (!user || user.role !== 'STAFF') {
    return c.json(
      {
        success: false,
        error_code: 'ERR_UNAUTHORIZED_OVERRIDE_AUTHORITY',
        error: 'Forbidden: Only academic staff (ROLE_STAFF) can authorize enrollment overrides.',
      },
      403
    );
  }

  let body: CreateOverrideDTO;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON request body' }, 400);
  }

  const { section_id, override_type, reason, student_code, student_id: explicitStudentId } = body;

  if (!section_id || !override_type || !reason) {
    return c.json(
      {
        success: false,
        error: 'Missing required fields: section_id, override_type, and reason are required.',
      },
      400
    );
  }

  // Resolve Student
  let student: Student | null = null;
  if (explicitStudentId) {
    student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ?').bind(explicitStudentId).first<Student>();
  } else if (student_code) {
    student = await c.env.DB.prepare('SELECT * FROM students WHERE student_code = ?').bind(student_code.trim()).first<Student>();
  }

  if (!student) {
    return c.json(
      {
        success: false,
        error: `Student '${student_code || explicitStudentId}' not found.`,
      },
      404
    );
  }

  // Resolve Section
  const section = await c.env.DB.prepare(`
    SELECT s.*, c.course_code, c.title AS course_title
    FROM sections s
    JOIN courses c ON s.course_id = c.id
    WHERE s.id = ?
  `).bind(section_id).first<Section>();

  if (!section) {
    return c.json(
      {
        success: false,
        error: `Section ID ${section_id} not found.`,
      },
      404
    );
  }

  // Check duplicate active enrollment
  const existingActive = await c.env.DB.prepare(`
    SELECT id, status FROM enrollments 
    WHERE student_id = ? AND section_id = ? AND status IN ('ENROLLED', 'OVERRIDDEN')
  `).bind(student.id, section_id).first<{ id: number; status: string }>();

  if (existingActive) {
    return c.json(
      {
        success: false,
        error_code: 'ERR_DUPLICATE_ENROLLMENT',
        error: `Student ${student.student_code} already has an active enrollment in section ${section.section_number} (status: ${existingActive.status}).`,
      },
      409
    );
  }

  const now = new Date().toISOString();

  // If section is at or above capacity, expand capacity atomically to accommodate override
  const isAtCapacity = section.enrolled_count >= section.max_capacity;
  const updateSectionStmt = isAtCapacity
    ? c.env.DB.prepare(`
        UPDATE sections 
        SET max_capacity = max_capacity + 1, enrolled_count = enrolled_count + 1 
        WHERE id = ?
      `).bind(section_id)
    : c.env.DB.prepare(`
        UPDATE sections 
        SET enrolled_count = enrolled_count + 1 
        WHERE id = ?
      `).bind(section_id);

  // Insert or update enrollment as OVERRIDDEN
  const insertEnrollmentStmt = c.env.DB.prepare(`
    INSERT INTO enrollments (student_id, section_id, status, enrolled_at, updated_at)
    VALUES (?, ?, 'OVERRIDDEN', ?, ?)
  `).bind(student.id, section_id, now, now);

  // Insert into overrides table for immutable audit trail
  const insertOverrideStmt = c.env.DB.prepare(`
    INSERT INTO overrides (student_id, section_id, staff_id, override_type, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'APPROVED', ?)
  `).bind(student.id, section_id, user.sub, override_type, reason, now);

  let newOverrideId = 0;
  let newEnrollmentId = 0;

  try {
    const batchRes = await c.env.DB.batch([updateSectionStmt, insertEnrollmentStmt, insertOverrideStmt]);
    newEnrollmentId = Number(batchRes[1].meta.last_row_id);
    newOverrideId = Number(batchRes[2].meta.last_row_id);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: err.message || 'Failed to process override in database transaction.',
      },
      500
    );
  }

  // Dispatch outgoing webhook: enrollment.overridden
  try {
    const webhookTarget = 'https://unienroll-backend.team03-enrollment.workers.dev/api/mock-partner/webhook';
    await dispatchWebhook(c.env.DB, webhookTarget, 'enrollment.overridden', {
      enrollment_id: newEnrollmentId,
      override_id: newOverrideId,
      student_id: student.id,
      student_code: student.student_code,
      course_code: section.course_code,
      section_number: section.section_number,
      override_type,
      reason,
      authorized_by_staff_id: user.sub,
      status: 'OVERRIDDEN',
      timestamp: now,
    });
  } catch (whErr) {
    console.error('Failed to dispatch override webhook:', whErr);
  }

  return c.json(
    {
      success: true,
      message: `Staff override granted successfully for student ${student.student_code} in ${section.course_code} ${section.section_number}.`,
      data: {
        override_id: newOverrideId,
        enrollment_id: newEnrollmentId,
        student_id: student.id,
        student_code: student.student_code,
        student_name: student.full_name,
        course_code: section.course_code,
        section_number: section.section_number,
        override_type,
        reason,
        status: 'OVERRIDDEN',
        authorized_at: now,
      },
    },
    201
  );
});
