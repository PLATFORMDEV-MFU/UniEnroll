import { Hono } from 'hono';
import { Bindings, Enrollment, Section, Student, CreateEnrollmentDTO, UpdateEnrollmentDTO } from '../types';

export const enrollmentRoutes = new Hono<{ Bindings: Bindings }>();

// 1. GET /api/enrollments (Read All with optional filters)
enrollmentRoutes.get('/', async (c) => {
  const studentId = c.req.query('student_id');
  const sectionId = c.req.query('section_id');
  const status = c.req.query('status');

  let query = `
    SELECT 
      e.id,
      e.student_id,
      e.section_id,
      e.status,
      e.enrolled_at,
      e.updated_at,
      st.student_code,
      st.full_name AS student_name,
      c.course_code,
      c.title AS course_title,
      c.credits,
      s.section_number,
      s.semester,
      s.schedule,
      s.room
    FROM enrollments e
    JOIN students st ON e.student_id = st.id
    JOIN sections s ON e.section_id = s.id
    JOIN courses c ON s.course_id = c.id
    WHERE 1=1
  `;

  const params: any[] = [];

  if (studentId) {
    query += ' AND e.student_id = ?';
    params.push(Number(studentId));
  }
  if (sectionId) {
    query += ' AND e.section_id = ?';
    params.push(Number(sectionId));
  }
  if (status) {
    query += ' AND e.status = ?';
    params.push(status);
  }

  query += ' ORDER BY e.id DESC';

  const { results } = await c.env.DB.prepare(query).bind(...params).all<Enrollment>();

  return c.json({
    success: true,
    total: results.length,
    data: results
  });
});

// 2. GET /api/enrollments/:id (Read One)
enrollmentRoutes.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'Invalid enrollment ID' }, 400);
  }

  const query = `
    SELECT 
      e.id,
      e.student_id,
      e.section_id,
      e.status,
      e.enrolled_at,
      e.updated_at,
      st.student_code,
      st.full_name AS student_name,
      c.course_code,
      c.title AS course_title,
      c.credits,
      s.section_number,
      s.semester,
      s.schedule,
      s.room
    FROM enrollments e
    JOIN students st ON e.student_id = st.id
    JOIN sections s ON e.section_id = s.id
    JOIN courses c ON s.course_id = c.id
    WHERE e.id = ?
  `;

  const enrollment = await c.env.DB.prepare(query).bind(id).first<Enrollment>();

  if (!enrollment) {
    return c.json({ success: false, error: `Enrollment with ID ${id} not found` }, 404);
  }

  return c.json({
    success: true,
    data: enrollment
  });
});

// 3. POST /api/enrollments (Create Enrollment with Business Rules Validation)
enrollmentRoutes.post('/', async (c) => {
  let body: CreateEnrollmentDTO;
  try {
    body = await c.req.json();
  } catch (err) {
    return c.json({ success: false, error: 'Invalid JSON request body' }, 400);
  }

  const { student_id, section_id } = body;

  if (!student_id || !section_id) {
    return c.json({
      success: false,
      error: 'Missing required fields: student_id and section_id are required'
    }, 400);
  }

  // Business Rule Step 1: Verify Student Exists
  const student = await c.env.DB.prepare(
    'SELECT * FROM students WHERE id = ?'
  ).bind(student_id).first<Student>();

  if (!student) {
    return c.json({
      success: false,
      error: `Student with ID ${student_id} not found`
    }, 404);
  }

  // Business Rule Step 2: Verify Section Exists & Fetch Capacity
  const section = await c.env.DB.prepare(`
    SELECT s.*, c.course_code, c.title as course_title, c.credits
    FROM sections s
    JOIN courses c ON s.course_id = c.id
    WHERE s.id = ?
  `).bind(section_id).first<Section>();

  if (!section) {
    return c.json({
      success: false,
      error: `Section with ID ${section_id} not found`
    }, 404);
  }

  // Business Rule Step 3: Check Active Duplicate Enrollment
  const existingActive = await c.env.DB.prepare(`
    SELECT id FROM enrollments 
    WHERE student_id = ? AND section_id = ? AND status = 'ENROLLED'
  `).bind(student_id, section_id).first();

  if (existingActive) {
    return c.json({
      success: false,
      error_code: 'ERR_DUPLICATE_ENROLLMENT',
      error: `Student ${student.student_code} is already actively enrolled in section ${section.section_number} of ${section.course_code}`
    }, 409);
  }

  // Business Rule Step 4: Check Seat Capacity (BR-01 Strict Capacity Protection)
  if (section.enrolled_count >= section.max_capacity) {
    return c.json({
      success: false,
      error_code: 'ERR_CAPACITY_FULL',
      error: `Section ${section.section_number} for ${section.course_code} is full (${section.enrolled_count}/${section.max_capacity} seats taken)`,
      details: {
        total_capacity: section.max_capacity,
        enrolled_count: section.enrolled_count,
        available_seats: 0
      }
    }, 422);
  }

  // Atomic Execution: Invariant Protection via DB-level CHECK (enrolled_count <= max_capacity)
  const now = new Date().toISOString();
  
  const updateSectionStmt = c.env.DB.prepare(`
    UPDATE sections 
    SET enrolled_count = enrolled_count + 1 
    WHERE id = ?
  `).bind(section_id);

  const insertStmt = c.env.DB.prepare(`
    INSERT INTO enrollments (student_id, section_id, status, enrolled_at, updated_at)
    VALUES (?, ?, 'ENROLLED', ?, ?)
  `).bind(student_id, section_id, now, now);

  let newEnrollmentId: number;
  try {
    // Both statements execute in an atomic batch.
    // If enrolled_count reaches max_capacity, updateSectionStmt fails the CHECK constraint,
    // automatically rolling back the entire batch (all-or-nothing).
    const batchResults = await c.env.DB.batch([updateSectionStmt, insertStmt]);
    newEnrollmentId = Number(batchResults[1].meta.last_row_id);
  } catch (dbErr: any) {
    const errMsg = String(dbErr?.message || dbErr);
    if (errMsg.includes('CHECK') || errMsg.includes('enrolled_count')) {
      return c.json({
        success: false,
        error_code: 'ERR_CAPACITY_FULL',
        error: `Section ${section.section_number} for ${section.course_code} is full (capacity limit enforced by database constraint)`,
        details: { total_capacity: section.max_capacity, available_seats: 0 }
      }, 422);
    }
    if (errMsg.includes('UNIQUE') || errMsg.includes('idx_unique_active_enrollment')) {
      return c.json({
        success: false,
        error_code: 'ERR_DUPLICATE_ENROLLMENT',
        error: `Database constraint violation: Student ${student.student_code} is already actively enrolled in section ${section.section_number}`
      }, 409);
    }
    return c.json({ success: false, error: errMsg || 'Database transaction failed' }, 500);
  }

  // Retrieve newly created full record
  const createdRecord = await c.env.DB.prepare(`
    SELECT 
      e.id,
      e.student_id,
      e.section_id,
      e.status,
      e.enrolled_at,
      e.updated_at,
      st.student_code,
      st.full_name AS student_name,
      c.course_code,
      c.title AS course_title,
      c.credits,
      s.section_number,
      s.semester,
      s.schedule,
      s.room
    FROM enrollments e
    JOIN students st ON e.student_id = st.id
    JOIN sections s ON e.section_id = s.id
    JOIN courses c ON s.course_id = c.id
    WHERE e.id = ?
  `).bind(newEnrollmentId).first<Enrollment>();

  return c.json({
    success: true,
    message: `Successfully enrolled in ${section.course_code} ${section.section_number}`,
    data: createdRecord
  }, 201);
});

// 4. PATCH /api/enrollments/:id (Update / Section Swap)
enrollmentRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'Invalid enrollment ID' }, 400);
  }

  let body: UpdateEnrollmentDTO;
  try {
    body = await c.req.json();
  } catch (err) {
    return c.json({ success: false, error: 'Invalid JSON request body' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT * FROM enrollments WHERE id = ?'
  ).bind(id).first<Enrollment>();

  if (!existing) {
    return c.json({ success: false, error: `Enrollment with ID ${id} not found` }, 404);
  }

  const now = new Date().toISOString();

  // Scenario A: Section Swap (target_section_id or section_id provided)
  if (body.section_id && body.section_id !== existing.section_id) {
    const targetSectionId = body.section_id;

    // Check target section exists
    const targetSection = await c.env.DB.prepare(
      'SELECT * FROM sections WHERE id = ?'
    ).bind(targetSectionId).first<Section>();

    if (!targetSection) {
      return c.json({ success: false, error: `Target section with ID ${targetSectionId} not found` }, 404);
    }

    // Check target capacity
    if (targetSection.enrolled_count >= targetSection.max_capacity) {
      return c.json({
        success: false,
        error_code: 'ERR_CAPACITY_FULL',
        error: `Cannot swap: target section ${targetSection.section_number} is full (${targetSection.enrolled_count}/${targetSection.max_capacity})`
      }, 422);
    }

    // Batch operations: update enrollment, decrement old section, increment new section
    const updateEnrollStmt = c.env.DB.prepare(`
      UPDATE enrollments 
      SET section_id = ?, updated_at = ? 
      WHERE id = ?
    `).bind(targetSectionId, now, id);

    const decOldSectionStmt = c.env.DB.prepare(`
      UPDATE sections 
      SET enrolled_count = MAX(0, enrolled_count - 1) 
      WHERE id = ?
    `).bind(existing.section_id);

    const incNewSectionStmt = c.env.DB.prepare(`
      UPDATE sections 
      SET enrolled_count = enrolled_count + 1 
      WHERE id = ?
    `).bind(targetSectionId);

    await c.env.DB.batch([updateEnrollStmt, decOldSectionStmt, incNewSectionStmt]);

    const updatedRecord = await c.env.DB.prepare(`
      SELECT 
        e.id, e.student_id, e.section_id, e.status, e.enrolled_at, e.updated_at,
        st.student_code, st.full_name AS student_name,
        c.course_code, c.title AS course_title, c.credits,
        s.section_number, s.semester, s.schedule, s.room
      FROM enrollments e
      JOIN students st ON e.student_id = st.id
      JOIN sections s ON e.section_id = s.id
      JOIN courses c ON s.course_id = c.id
      WHERE e.id = ?
    `).bind(id).first<Enrollment>();

    return c.json({
      success: true,
      message: `Section swapped successfully from section ${existing.section_id} to ${targetSectionId}`,
      data: updatedRecord
    });
  }

  // Scenario B: Status Update (e.g. DROPPED or ENROLLED)
  if (body.status && body.status !== existing.status) {
    if (body.status === 'DROPPED' && existing.status === 'ENROLLED') {
      const updateStmt = c.env.DB.prepare(`
        UPDATE enrollments SET status = 'DROPPED', updated_at = ? WHERE id = ?
      `).bind(now, id);

      const decSectionStmt = c.env.DB.prepare(`
        UPDATE sections SET enrolled_count = MAX(0, enrolled_count - 1) WHERE id = ?
      `).bind(existing.section_id);

      await c.env.DB.batch([updateStmt, decSectionStmt]);
    } else if (body.status === 'ENROLLED' && existing.status === 'DROPPED') {
      // Re-enroll: check capacity
      const section = await c.env.DB.prepare('SELECT * FROM sections WHERE id = ?').bind(existing.section_id).first<Section>();
      if (section && section.enrolled_count >= section.max_capacity) {
        return c.json({ success: false, error_code: 'ERR_CAPACITY_FULL', error: 'Section is now full' }, 422);
      }

      const updateStmt = c.env.DB.prepare(`
        UPDATE enrollments SET status = 'ENROLLED', updated_at = ? WHERE id = ?
      `).bind(now, id);

      const incSectionStmt = c.env.DB.prepare(`
        UPDATE sections SET enrolled_count = enrolled_count + 1 WHERE id = ?
      `).bind(existing.section_id);

      await c.env.DB.batch([updateStmt, incSectionStmt]);
    }
  }

  const result = await c.env.DB.prepare('SELECT * FROM enrollments WHERE id = ?').bind(id).first<Enrollment>();

  return c.json({
    success: true,
    message: 'Enrollment updated successfully',
    data: result
  });
});

// 5. DELETE /api/enrollments/:id (Drop Enrollment / Delete Resource)
enrollmentRoutes.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'Invalid enrollment ID' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT * FROM enrollments WHERE id = ?'
  ).bind(id).first<Enrollment>();

  if (!existing) {
    return c.json({ success: false, error: `Enrollment with ID ${id} not found` }, 404);
  }

  const now = new Date().toISOString();

  // If currently active ENROLLED, decrement seat count
  if (existing.status === 'ENROLLED') {
    const updateEnrollStmt = c.env.DB.prepare(`
      UPDATE enrollments SET status = 'DROPPED', updated_at = ? WHERE id = ?
    `).bind(now, id);

    const decSectionStmt = c.env.DB.prepare(`
      UPDATE sections SET enrolled_count = MAX(0, enrolled_count - 1) WHERE id = ?
    `).bind(existing.section_id);

    await c.env.DB.batch([updateEnrollStmt, decSectionStmt]);
  }

  return c.json({
    success: true,
    message: `Enrollment ID ${id} has been dropped successfully`,
    freed_seats: existing.status === 'ENROLLED' ? 1 : 0,
    data: {
      enrollment_id: id,
      student_id: existing.student_id,
      section_id: existing.section_id,
      status: 'DROPPED',
      updated_at: now
    }
  });
});
