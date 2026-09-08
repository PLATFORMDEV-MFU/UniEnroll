-- Migration to rebuild sections table with strict CHECK constraint
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS sections_new (
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

INSERT OR IGNORE INTO sections_new SELECT * FROM sections;
DROP TABLE IF EXISTS sections;
ALTER TABLE sections_new RENAME TO sections;

CREATE INDEX IF NOT EXISTS idx_sections_course ON sections(course_id);

PRAGMA foreign_keys = ON;

