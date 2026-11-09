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

-- 5. Overrides Table (Staff Override Console & Audit Trail)
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

-- 6. Idempotency Keys Table (A5 Box 5: Idempotency Protection)
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    request_path TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Webhook Logs Table (A5 Box 3 & Box 4: Webhook Receiver & Sender Audits)
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

-- 8. Partner Request Logs Table (A5 Box 2: Provider Proof)
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
CREATE INDEX IF NOT EXISTS idx_overrides_student ON overrides(student_id);
CREATE INDEX IF NOT EXISTS idx_overrides_section ON overrides(section_id);
CREATE INDEX IF NOT EXISTS idx_overrides_staff ON overrides(staff_id);
CREATE INDEX IF NOT EXISTS idx_webhook_direction ON webhook_logs(direction);
CREATE INDEX IF NOT EXISTS idx_partner_logs_partner ON partner_request_logs(partner_id);

-- Database-Level Constraint: Prevent duplicate active enrollments (Partial Unique Index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_enrollment 
ON enrollments(student_id, section_id) 
WHERE status IN ('ENROLLED', 'OVERRIDDEN');
