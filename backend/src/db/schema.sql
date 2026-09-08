-- UniEnroll D1 Database Schema

-- 1. Courses Table
CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 3,
    department TEXT NOT NULL DEFAULT 'Computer Science',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, section_number, semester)
);

-- 3. Students Table
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    major TEXT NOT NULL DEFAULT 'Software Engineering',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Enrollments Table (Main CRUD Resource)
CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ENROLLED' CHECK (status IN ('ENROLLED', 'DROPPED')),
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sections_course ON sections(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_section ON enrollments(section_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);

-- Database-Level Constraint: Prevent duplicate active enrollments (Partial Unique Index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_enrollment 
ON enrollments(student_id, section_id) 
WHERE status = 'ENROLLED';
