-- Non-destructive migration for databases created before capacity constraints
-- and enrollment-rule tables were added. Triggers enforce the same capacity
-- invariant without replacing `sections`, which would cascade-delete children.
CREATE TRIGGER IF NOT EXISTS trg_sections_capacity_insert
BEFORE INSERT ON sections
WHEN NEW.max_capacity <= 0
  OR NEW.enrolled_count < 0
  OR NEW.enrolled_count > NEW.max_capacity
BEGIN
  SELECT RAISE(ABORT, 'ERR_INVALID_SECTION_CAPACITY');
END;

CREATE TRIGGER IF NOT EXISTS trg_sections_capacity_update
BEFORE UPDATE OF max_capacity, enrolled_count ON sections
WHEN NEW.max_capacity <= 0
  OR NEW.enrolled_count < 0
  OR NEW.enrolled_count > NEW.max_capacity
BEGIN
  SELECT RAISE(ABORT, 'ERR_INVALID_SECTION_CAPACITY');
END;

CREATE TABLE IF NOT EXISTS course_prerequisites (
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    prerequisite_course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    minimum_grade TEXT NOT NULL DEFAULT 'D' CHECK (minimum_grade IN ('A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'P')),
    PRIMARY KEY (course_id, prerequisite_course_id),
    CHECK (course_id <> prerequisite_course_id)
);

CREATE TABLE IF NOT EXISTS student_course_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    grade TEXT NOT NULL CHECK (grade IN ('A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F', 'P', 'NP')),
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'IN_PROGRESS')),
    completed_at DATETIME,
    UNIQUE(student_id, course_id)
);

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

CREATE INDEX IF NOT EXISTS idx_prerequisites_course ON course_prerequisites(course_id);
CREATE INDEX IF NOT EXISTS idx_course_history_student ON student_course_history(student_id);
CREATE INDEX IF NOT EXISTS idx_rule_decisions_student ON rule_decisions(student_id);

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
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_status ON webhook_outbox(status, created_at);

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
      'data', json_object('enrollment_id', NEW.id, 'student_id', NEW.student_id, 'section_id', NEW.section_id, 'previous_section_id', OLD.section_id, 'status', NEW.status)
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

