import { Hono } from 'hono';
import { AppEnv, Enrollment, Section, Student, CreateEnrollmentDTO, UpdateEnrollmentDTO } from '../types';
import { authMiddleware } from '../middleware/auth';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { publishEnrollmentChange } from '../lib/webhook-sender';
import { evaluateEnrollmentRules } from '../lib/enrollment-rule-engine';
import { explainRuleDecision } from '../lib/decision-explainer';

export const enrollmentRoutes = new Hono<AppEnv>();

// Enforce JWT authentication for all enrollment routes
enrollmentRoutes.use('*', authMiddleware);

// GET /api/enrollments/me (fetch current student's active and historical enrollments)
enrollmentRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const studentId = (user && user.sub) ? user.sub : 1;

  const query = `
    SELECT 
      e.id,
      e.student_id,
      e.section_id,
      e.status,
      e.withdrawal_reason,
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
    WHERE e.student_id = ?
    ORDER BY e.updated_at DESC, e.id DESC
  `;

  const { results } = await c.env.DB.prepare(query).bind(studentId).all<Enrollment>();

  return c.json({
    success: true,
    total: results.length,
    student_id: studentId,
    data: results
  });
});

// 1. GET /api/enrollments (Read All with optional filters)
enrollmentRoutes.get('/', async (c) => {
  const user = c.get('user');
  let studentId = c.req.query('student_id');
  if (user && user.role === 'STUDENT') {
    studentId = String(user.sub);
  }
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

  const user = c.get('user');
  if (user && user.role !== 'STAFF' && enrollment.student_id !== user.sub) {
    return c.json({ success: false, error: 'Forbidden: You can only view your own enrollment details' }, 403);
  }

  return c.json({
    success: true,
    data: enrollment
  });
});

// 3. POST /api/enrollments (Create Enrollment with Business Rules Validation & Idempotency)
enrollmentRoutes.post('/', idempotencyMiddleware, async (c) => {
  let body: CreateEnrollmentDTO;
  try {
    body = await c.req.json();
  } catch (err) {
    return c.json({ success: false, error: 'Invalid JSON request body' }, 400);
  }

  const user = c.get('user');
  const student_id = user ? user.sub : body.student_id;
  const section_id = body.section_id;

  if (!student_id || !section_id) {
    return c.json({
      success: false,
      error: 'Missing required fields: section_id is required'
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

  // Business Rule Step 3: Check Active Duplicate Enrollment (Section-level and Course-level)
  const existingSameCourse = await c.env.DB.prepare(`
    SELECT e.id, s.section_number, s.id as section_id
    FROM enrollments e
    JOIN sections s ON e.section_id = s.id
    WHERE e.student_id = ? AND s.course_id = ? AND s.semester = ? AND e.status IN ('ENROLLED', 'OVERRIDDEN')
  `).bind(student_id, section.course_id, section.semester).first<{ id: number, section_number: string, section_id: number }>();

  if (existingSameCourse) {
    if (existingSameCourse.section_id === section_id) {
      return c.json({
        success: false,
        error_code: 'ERR_DUPLICATE_ENROLLMENT',
        error: `Database constraint violation: Student ${student.student_code} is already actively enrolled in section ${section.section_number}`
      }, 409);
    } else {
      return c.json({
        success: false,
        error_code: 'ERR_DUPLICATE_COURSE_ENROLLMENT',
        error: `Student ${student.student_code} is already actively enrolled in another section of course ${section.course_code} for semester ${section.semester}. Use section swap to change sections.`
      }, 409);
    }
  }

  // Business Rule Step 4: deterministic academic rules. AI may explain the
  // result, but it never changes eligibility.
  const ruleDecision = await evaluateEnrollmentRules(c.env.DB, student_id, section_id);
  if (!ruleDecision.eligible) {
    const explanation = await explainRuleDecision(
      ruleDecision.failed_rules,
      c.env.AI_EXPLANATIONS_ENABLED === 'false' ? undefined : c.env.AI,
      c.env.AI_EXPLANATION_MODEL
    );
    await c.env.DB.prepare(`
      INSERT INTO rule_decisions
        (student_id, section_id, eligible, failed_rules, explanation, explanation_source)
      VALUES (?, ?, 0, ?, ?, ?)
    `).bind(
      student_id,
      section_id,
      JSON.stringify(ruleDecision.failed_rules),
      explanation.explanation,
      explanation.explanation_source
    ).run();

    return c.json({
      success: false,
      error_code: ruleDecision.failed_rules[0].code,
      error: explanation.explanation,
      explanation: explanation.explanation,
      explanation_source: explanation.explanation_source,
      failed_rules: ruleDecision.failed_rules,
    }, 422);
  }

  // Business Rule Step 5: Check Seat Capacity (BR-01 Strict Capacity Protection)
  if (section.enrolled_count >= section.max_capacity) {
    return c.json({
      success: false,
      error_code: 'ERR_CAPACITY_FULL',
      error: `Section ${section.section_number} for ${section.course_code} is full (${section.enrolled_count}/${section.max_capacity} seats taken)`,
      details: {
        total_capacity: section.max_capacity,
        enrolled_count: section.enrolled_count,
        available_seats: 0,
        contention_policy: 'FIRST_COMMITTED_REQUEST_WINS',
        retryable: false,
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
    if (errMsg.includes('ERR_DUPLICATE_COURSE_ENROLLMENT')) {
      return c.json({
        success: false,
        error_code: 'ERR_DUPLICATE_COURSE_ENROLLMENT',
        error: `Student ${student.student_code} already has an active section of ${section.course_code} in ${section.semester}`,
      }, 409);
    }
    if (errMsg.includes('CHECK') || errMsg.includes('enrolled_count')) {
      return c.json({
        success: false,
        error_code: 'ERR_CAPACITY_FULL',
        error: `The last available seat in ${section.course_code} ${section.section_number} was taken by another request that committed first. Your enrollment was not created.`,
        details: {
          total_capacity: section.max_capacity,
          available_seats: 0,
          contention_policy: 'FIRST_COMMITTED_REQUEST_WINS',
          retryable: false,
        }
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

  // Dispatch outgoing webhook to Partner (A5 Box 4: Webhook Sender)
  try {
    await publishEnrollmentChange(c.env, 'enrollment.created', {
      enrollment_id: newEnrollmentId,
      student_id,
      section_id,
      student_code: student.student_code,
      course_code: section.course_code,
      section_number: section.section_number,
      semester: section.semester,
      status: 'ENROLLED',
    });
  } catch (whErr) {
    console.error('Webhook dispatch error:', whErr);
  }

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

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch (err) {
    return c.json({ success: false, error: 'Invalid JSON request body' }, 400);
  }

  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return c.json({
      success: false,
      error_code: 'ERR_INVALID_UPDATE',
      error: 'PATCH only supports a positive integer section_id for section swaps.',
    }, 400);
  }
  const body = rawBody as UpdateEnrollmentDTO;
  const bodyKeys = Object.keys(rawBody);
  if (
    bodyKeys.length !== 1
    || bodyKeys[0] !== 'section_id'
    || !Number.isInteger(body.section_id)
    || body.section_id <= 0
  ) {
    return c.json({
      success: false,
      error_code: 'ERR_INVALID_UPDATE',
      error: 'PATCH only supports a positive integer section_id for section swaps.',
    }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT * FROM enrollments WHERE id = ?'
  ).bind(id).first<Enrollment>();

  if (!existing) {
    return c.json({ success: false, error: `Enrollment with ID ${id} not found` }, 404);
  }

  const user = c.get('user');
  if (user && user.role !== 'STAFF' && existing.student_id !== user.sub) {
    return c.json({ success: false, error: 'Forbidden: You can only modify your own enrollments' }, 403);
  }

  if (!['ENROLLED', 'OVERRIDDEN'].includes(existing.status)) {
    return c.json({
      success: false,
      error_code: 'ERR_ENROLLMENT_CHANGED',
      error: 'Only an active enrollment can be swapped.',
    }, 409);
  }

  if (body.section_id === existing.section_id) {
    return c.json({
      success: false,
      error_code: 'ERR_NO_CHANGE',
      error: 'The target section must differ from the current section.',
    }, 409);
  }

  const now = new Date().toISOString();

  // Section swap
  if (body.section_id !== existing.section_id) {
    const targetSectionId = body.section_id;

    // Check target section exists
    const targetSection = await c.env.DB.prepare(
      'SELECT * FROM sections WHERE id = ?'
    ).bind(targetSectionId).first<Section>();

    if (!targetSection) {
      return c.json({ success: false, error: `Target section with ID ${targetSectionId} not found` }, 404);
    }

    // Validate that swap is within the same course
    const currentSection = await c.env.DB.prepare(
      'SELECT * FROM sections WHERE id = ?'
    ).bind(existing.section_id).first<Section>();

    if (currentSection && currentSection.course_id !== targetSection.course_id) {
      return c.json({
        success: false,
        error_code: 'ERR_INVALID_SWAP',
        error: 'Cannot swap sections across different courses. Swap is only allowed between sections of the same course.'
      }, 400);
    }

    // Check target capacity
    if (targetSection.enrolled_count >= targetSection.max_capacity) {
      return c.json({
        success: false,
        error_code: 'ERR_CAPACITY_FULL',
        error: `Cannot swap: target section ${targetSection.section_number} is full (${targetSection.enrolled_count}/${targetSection.max_capacity})`
      }, 422);
    }

    // The database trigger moves both seat counters in the same transaction as
    // this compare-and-swap update. A full target rolls the entire update back.
    const updateEnrollStmt = c.env.DB.prepare(`
      UPDATE enrollments
      SET section_id = ?, updated_at = ?
      WHERE id = ?
        AND section_id = ?
        AND status IN ('ENROLLED', 'OVERRIDDEN')
    `).bind(targetSectionId, now, id, existing.section_id);

    let swapCommitted = false;
    try {
      const swapResult = await updateEnrollStmt.run();
      // D1 may include trigger side effects in meta.changes; zero alone means
      // the enrollment compare-and-swap lost the race.
      swapCommitted = (swapResult.meta.changes ?? 0) > 0;
    } catch (dbErr: any) {
      const errMsg = String(dbErr?.message || dbErr);
      if (errMsg.includes('CHECK') || errMsg.includes('enrolled_count')) {
        return c.json({
          success: false,
          error_code: 'ERR_CAPACITY_FULL',
          error: `Cannot swap: target section ${targetSection.section_number} became full before this request committed`,
        }, 422);
      }
      throw dbErr;
    }
    if (!swapCommitted) {
      return c.json({
        success: false,
        error_code: 'ERR_ENROLLMENT_CHANGED',
        error: 'This enrollment was already changed by another request.',
      }, 409);
    }

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

    try {
      await publishEnrollmentChange(c.env, 'enrollment.swapped', {
        enrollment_id: id,
        student_id: existing.student_id,
        previous_section_id: existing.section_id,
        section_id: targetSectionId,
        status: existing.status,
      });
    } catch (whErr) {
      console.error('Failed to dispatch swap webhook:', whErr);
    }

    return c.json({
      success: true,
      message: `Section swapped successfully from section ${existing.section_id} to ${targetSectionId}`,
      data: updatedRecord
    });
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

  const user = c.get('user');
  if (user && user.role !== 'STAFF' && existing.student_id !== user.sub) {
    return c.json({ success: false, error: 'Forbidden: You can only drop your own enrollments' }, 403);
  }

  const now = new Date().toISOString();

  // If currently active (ENROLLED or OVERRIDDEN), decrement seat count
  const wasActive = existing.status === 'ENROLLED' || existing.status === 'OVERRIDDEN';
  if (!wasActive) {
    return c.json({
      success: false,
      error_code: 'ERR_ENROLLMENT_NOT_ACTIVE',
      error: `Enrollment ID ${id} is already ${existing.status.toLowerCase()}`,
    }, 409);
  }

  {
    const updateEnrollStmt = c.env.DB.prepare(`
      UPDATE enrollments
      SET status = 'DROPPED', updated_at = ?
      WHERE id = ? AND status IN ('ENROLLED', 'OVERRIDDEN')
    `).bind(now, id);

    const decSectionStmt = c.env.DB.prepare(`
      UPDATE sections
      SET enrolled_count = enrolled_count - 1
      WHERE id = (
        SELECT section_id FROM enrollments
        WHERE id = ? AND status IN ('ENROLLED', 'OVERRIDDEN')
      )
        AND enrolled_count > 0
    `).bind(id);

    const batchResults = await c.env.DB.batch([decSectionStmt, updateEnrollStmt]);
    if ((batchResults[1].meta.changes ?? 0) === 0) {
      return c.json({
        success: false,
        error_code: 'ERR_ENROLLMENT_NOT_ACTIVE',
        error: `Enrollment ID ${id} was already changed by another request`,
      }, 409);
    }

    try {
      await publishEnrollmentChange(c.env, 'enrollment.dropped', {
        enrollment_id: id,
        student_id: existing.student_id,
        section_id: existing.section_id,
        status: 'DROPPED',
        dropped_at: now,
      });
    } catch (whErr) {
      console.error('Failed to dispatch drop webhook:', whErr);
    }
  }

  return c.json({
    success: true,
    message: `Enrollment ID ${id} has been dropped successfully`,
    freed_seats: wasActive ? 1 : 0,
    data: {
      enrollment_id: id,
      student_id: existing.student_id,
      section_id: existing.section_id,
      status: 'DROPPED',
      updated_at: now
    }
  });
});

// 6. POST /api/enrollments/:id/withdraw (Official Course Withdrawal with 'W' Grade)
enrollmentRoutes.post('/:id/withdraw', async (c) => {
  const id = Number(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'Invalid enrollment ID' }, 400);
  }

  let body: { reason?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // Body is optional
  }

  const existing = await c.env.DB.prepare(`
    SELECT e.*, st.student_code, st.full_name AS student_name, c.course_code, s.section_number
    FROM enrollments e
    JOIN students st ON e.student_id = st.id
    JOIN sections s ON e.section_id = s.id
    JOIN courses c ON s.course_id = c.id
    WHERE e.id = ?
  `).bind(id).first<Enrollment>();

  if (!existing) {
    return c.json({ success: false, error: `Enrollment with ID ${id} not found` }, 404);
  }

  const user = c.get('user');
  if (user && user.role !== 'STAFF' && existing.student_id !== user.sub) {
    return c.json({ success: false, error: 'Forbidden: You can only withdraw from your own enrollments' }, 403);
  }

  if (existing.status !== 'ENROLLED' && existing.status !== 'OVERRIDDEN') {
    return c.json({
      success: false,
      error_code: 'ERR_ENROLLMENT_NOT_ACTIVE',
      error: `Cannot withdraw an enrollment that is already ${existing.status}`
    }, 409);
  }

  const now = new Date().toISOString();
  const reason = body.reason?.trim() || 'Student requested official course withdrawal';

  // Decrement section seat count and update status to WITHDRAWN
  const updateEnrollStmt = c.env.DB.prepare(`
    UPDATE enrollments 
    SET status = 'WITHDRAWN', withdrawal_reason = ?, updated_at = ? 
    WHERE id = ? AND status IN ('ENROLLED', 'OVERRIDDEN')
  `).bind(reason, now, id);

  const decSectionStmt = c.env.DB.prepare(`
    UPDATE sections
    SET enrolled_count = enrolled_count - 1
    WHERE id = (
      SELECT section_id FROM enrollments
      WHERE id = ? AND status IN ('ENROLLED', 'OVERRIDDEN')
    )
      AND enrolled_count > 0
  `).bind(id);

  const batchResults = await c.env.DB.batch([decSectionStmt, updateEnrollStmt]);
  if ((batchResults[1].meta.changes ?? 0) === 0) {
    return c.json({
      success: false,
      error_code: 'ERR_ENROLLMENT_NOT_ACTIVE',
      error: `Enrollment ID ${id} was already changed by another request`,
    }, 409);
  }

  // Dispatch outgoing webhook: enrollment.withdrawn (A5 Box 4)
  try {
    await publishEnrollmentChange(c.env, 'enrollment.withdrawn', {
      enrollment_id: id,
      student_id: existing.student_id,
      section_id: existing.section_id,
      student_code: existing.student_code,
      course_code: existing.course_code,
      section_number: existing.section_number,
      status: 'WITHDRAWN',
      reason,
      withdrawn_at: now
    });
  } catch (whErr) {
    console.error('Failed to dispatch withdrawal webhook:', whErr);
  }

  return c.json({
    success: true,
    message: `Enrollment ID ${id} has been withdrawn with 'W' grade recorded.`,
    data: {
      enrollment_id: id,
      student_id: existing.student_id,
      student_code: existing.student_code,
      course_code: existing.course_code,
      section_number: existing.section_number,
      status: 'WITHDRAWN',
      grade: 'W',
      withdrawal_reason: reason,
      updated_at: now
    }
  });
});
