-- UniEnroll D1 Database Schema

-- 1. Courses Table
CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 3 CHECK (credits > 0),
    department TEXT NOT NULL DEFAULT 'Computer Science',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Sections Table
CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    section_number TEXT NOT NULL,
    semester TEXT NOT NULL DEFAULT '2026/1',
    schedule TEXT NOT NULL,
    room TEXT,
    max_capacity INTEGER NOT NULL DEFAULT 40 CHECK (max_capacity > 0),
    enrolled_count INTEGER NOT NULL DEFAULT 0 CHECK (enrolled_count >= 0 AND enrolled_count <= max_capacity),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, section_number, semester)
);

-- 3. Students Table
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    major TEXT NOT NULL DEFAULT 'Software Engineering',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'STAFF')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Enrollments Table (Main CRUD Resource)
CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ENROLLED' CHECK (status IN ('ENROLLED', 'DROPPED', 'WITHDRAWN', 'OVERRIDDEN')),
    withdrawal_reason TEXT,
    enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Course prerequisite rules
CREATE TABLE IF NOT EXISTS course_prerequisites (
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    prerequisite_course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    minimum_grade TEXT NOT NULL DEFAULT 'D' CHECK (minimum_grade IN ('A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'P')),
    PRIMARY KEY (course_id, prerequisite_course_id),
    CHECK (course_id <> prerequisite_course_id)
);

-- 6. Completed-course evidence used by the prerequisite engine
CREATE TABLE IF NOT EXISTS student_course_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    grade TEXT NOT NULL CHECK (grade IN ('A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F', 'P', 'NP')),
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'IN_PROGRESS')),
    completed_at DATETIME,
    UNIQUE(student_id, course_id)
);

-- 7. Structured audit of deterministic decisions and explanation provenance
CREATE TABLE IF NOT EXISTS rule_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    eligible INTEGER NOT NULL CHECK (eligible IN (0, 1)),
    failed_rules TEXT NOT NULL DEFAULT '[]',
    explanation TEXT NOT NULL,
    explanation_source TEXT NOT NULL CHECK (explanation_source IN ('AI', 'DETERMINISTIC_FALLBACK', 'DETERMINISTIC')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Overrides Table (Staff Override Console & Audit Trail)
CREATE TABLE IF NOT EXISTS overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    staff_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    override_type TEXT NOT NULL CHECK (override_type IN ('CAPACITY', 'PREREQUISITE', 'LATE_ADD', 'SPECIAL_PERMISSION')),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Idempotency Keys Table (A5 Box 5: Idempotency Protection)
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    request_path TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Webhook Logs Table (A5 Box 3 & Box 4: Webhook Receiver & Sender Audits)
CREATE TABLE IF NOT EXISTS webhook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL CHECK (direction IN ('INCOMING', 'OUTGOING')),
    event TEXT NOT NULL,
    payload TEXT NOT NULL,
    signature TEXT,
    status TEXT NOT NULL CHECK (status IN ('VERIFIED', 'FAILED', 'DELIVERED', 'FAILED_DELIVERY')),
    response_status INTEGER,
    response_body TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Durable transactional outbox for enrollment state changes.
CREATE TABLE IF NOT EXISTS webhook_outbox (
    event_id TEXT PRIMARY KEY,
    event TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    claim_token TEXT,
    claimed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at DATETIME
);

-- 11. Partner Request Logs Table (A5 Box 2: Provider Proof)
CREATE TABLE IF NOT EXISTS partner_request_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sections_course ON sections(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_section ON enrollments(section_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);
CREATE INDEX IF NOT EXISTS idx_prerequisites_course ON course_prerequisites(course_id);
CREATE INDEX IF NOT EXISTS idx_course_history_student ON student_course_history(student_id);
CREATE INDEX IF NOT EXISTS idx_rule_decisions_student ON rule_decisions(student_id);
CREATE INDEX IF NOT EXISTS idx_overrides_student ON overrides(student_id);
CREATE INDEX IF NOT EXISTS idx_overrides_section ON overrides(section_id);
CREATE INDEX IF NOT EXISTS idx_overrides_staff ON overrides(staff_id);
CREATE INDEX IF NOT EXISTS idx_webhook_direction ON webhook_logs(direction);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_status ON webhook_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_partner_logs_partner ON partner_request_logs(partner_id);

-- Database-Level Constraint: Prevent duplicate active enrollments (Partial Unique Index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_enrollment
ON enrollments(student_id, section_id)
WHERE status IN ('ENROLLED', 'OVERRIDDEN');

-- A student may have only one active section of a course in a semester.
-- Triggers are required because the course is reached through sections and
-- SQLite does not allow a cross-table expression in a UNIQUE index.
CREATE TRIGGER IF NOT EXISTS trg_enrollments_unique_active_course_insert
BEFORE INSERT ON enrollments
WHEN NEW.status IN ('ENROLLED', 'OVERRIDDEN')
BEGIN
  SELECT RAISE(ABORT, 'ERR_DUPLICATE_COURSE_ENROLLMENT')
  WHERE EXISTS (
    SELECT 1
    FROM enrollments e
    JOIN sections current_section ON current_section.id = e.section_id
    JOIN sections requested_section ON requested_section.id = NEW.section_id
    WHERE e.student_id = NEW.student_id
      AND e.status IN ('ENROLLED', 'OVERRIDDEN')
      AND current_section.course_id = requested_section.course_id
      AND current_section.semester = requested_section.semester
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_enrollments_unique_active_course_update
BEFORE UPDATE OF student_id, section_id, status ON enrollments
WHEN NEW.status IN ('ENROLLED', 'OVERRIDDEN')
BEGIN
  SELECT RAISE(ABORT, 'ERR_DUPLICATE_COURSE_ENROLLMENT')
  WHERE EXISTS (
    SELECT 1
    FROM enrollments e
    JOIN sections current_section ON current_section.id = e.section_id
    JOIN sections requested_section ON requested_section.id = NEW.section_id
    WHERE e.id <> OLD.id
      AND e.student_id = NEW.student_id
      AND e.status IN ('ENROLLED', 'OVERRIDDEN')
      AND current_section.course_id = requested_section.course_id
      AND current_section.semester = requested_section.semester
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_enrollments_webhook_outbox_insert
AFTER INSERT ON enrollments
WHEN NEW.status IN ('ENROLLED', 'OVERRIDDEN')
BEGIN
  INSERT INTO webhook_outbox (event_id, event, payload)
  VALUES (
    lower(hex(randomblob(16))),
    CASE WHEN NEW.status = 'OVERRIDDEN' THEN 'enrollment.overridden' ELSE 'enrollment.created' END,
    json_object(
      'event_id', '', 'event_name', 'enrollment.changed',
      'student_id', CAST(NEW.student_id AS TEXT), 'section_id', CAST(NEW.section_id AS TEXT),
      'action', CASE WHEN NEW.status = 'OVERRIDDEN' THEN 'overridden' ELSE 'enrolled' END,
      'event', CASE WHEN NEW.status = 'OVERRIDDEN' THEN 'enrollment.overridden' ELSE 'enrollment.created' END,
      'timestamp', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      'data', json_object('enrollment_id', NEW.id, 'student_id', NEW.student_id, 'section_id', NEW.section_id, 'status', NEW.status)
    )
  );
  UPDATE webhook_outbox SET payload = json_set(payload, '$.event_id', event_id)
  WHERE rowid = last_insert_rowid();
END;

CREATE TRIGGER IF NOT EXISTS trg_enrollments_webhook_outbox_update
AFTER UPDATE OF section_id, status ON enrollments
WHEN NEW.section_id <> OLD.section_id OR NEW.status <> OLD.status
BEGIN
  INSERT INTO webhook_outbox (event_id, event, payload)
  VALUES (
    lower(hex(randomblob(16))),
    CASE
      WHEN NEW.section_id <> OLD.section_id THEN 'enrollment.swapped'
      WHEN NEW.status = 'DROPPED' THEN 'enrollment.dropped'
      WHEN NEW.status = 'WITHDRAWN' THEN 'enrollment.withdrawn'
      WHEN NEW.status = 'OVERRIDDEN' THEN 'enrollment.overridden'
      ELSE 'enrollment.created'
    END,
    json_object(
      'event_id', '', 'event_name', 'enrollment.changed',
      'student_id', CAST(NEW.student_id AS TEXT), 'section_id', CAST(NEW.section_id AS TEXT),
      'action', CASE
        WHEN NEW.section_id <> OLD.section_id THEN 'swapped'
        WHEN NEW.status = 'DROPPED' THEN 'dropped'
        WHEN NEW.status = 'WITHDRAWN' THEN 'withdrawn'
        WHEN NEW.status = 'OVERRIDDEN' THEN 'overridden'
        ELSE 'enrolled'
      END,
      'event', CASE
        WHEN NEW.section_id <> OLD.section_id THEN 'enrollment.swapped'
        WHEN NEW.status = 'DROPPED' THEN 'enrollment.dropped'
        WHEN NEW.status = 'WITHDRAWN' THEN 'enrollment.withdrawn'
        WHEN NEW.status = 'OVERRIDDEN' THEN 'enrollment.overridden'
        ELSE 'enrollment.created'
      END,
      'timestamp', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      'data', json_object(
        'enrollment_id', NEW.id, 'student_id', NEW.student_id,
        'section_id', NEW.section_id, 'previous_section_id', OLD.section_id, 'status', NEW.status
      )
    )
  );
  UPDATE webhook_outbox SET payload = json_set(payload, '$.event_id', event_id)
  WHERE rowid = last_insert_rowid();
END;

CREATE TRIGGER IF NOT EXISTS trg_enrollments_move_seat
AFTER UPDATE OF section_id ON enrollments
WHEN NEW.section_id <> OLD.section_id AND NEW.status IN ('ENROLLED', 'OVERRIDDEN')
BEGIN
  UPDATE sections SET enrolled_count = enrolled_count - 1
  WHERE id = OLD.section_id AND enrolled_count > 0;
  SELECT RAISE(ABORT, 'ERR_SEAT_COUNTER_INCONSISTENT') WHERE changes() <> 1;
  UPDATE sections SET enrolled_count = enrolled_count + 1
  WHERE id = NEW.section_id;
END;
