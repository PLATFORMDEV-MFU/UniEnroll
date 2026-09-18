-- UniEnroll Seed Data

-- Clear existing data
DELETE FROM enrollments;
DELETE FROM sections;
DELETE FROM courses;
DELETE FROM students;

-- Reset SQLite sequence if exists
DELETE FROM sqlite_sequence WHERE name IN ('courses', 'sections', 'students', 'enrollments');

-- 1. Insert Courses
INSERT INTO courses (id, course_code, title, credits, department) VALUES
(1, 'CS101', 'Introduction to Computer Science', 3, 'Computer Science'),
(2, 'CS202', 'Data Structures & Algorithms', 3, 'Computer Science'),
(3, 'CS301', 'Database Systems & Cloud Architecture', 3, 'Information Technology'),
(4, 'SE201', 'Software Engineering Principles', 3, 'Software Engineering'),
(5, 'GEN101', 'Effective Communication & Academic Writing', 2, 'General Education');

-- 2. Insert Sections
INSERT INTO sections (id, course_id, section_number, semester, schedule, room, max_capacity, enrolled_count) VALUES
-- CS101 SEC01: Open (5/40)
(1, 1, 'SEC01', '2026/1', 'MON_WED 09:00-10:30', 'CB2-301', 40, 1),
-- CS202 SEC01: Open (2/30)
(2, 2, 'SEC01', '2026/1', 'TUE_THU 10:30-12:00', 'CB2-405', 30, 1),
-- CS202 SEC02: Full Section (2/2) for testing capacity limit!
(3, 2, 'SEC02', '2026/1', 'MON_WED 13:30-15:00', 'CB2-405', 2, 2),
-- CS301 SEC01: Open (0/35)
(4, 3, 'SEC01', '2026/1', 'FRI 09:00-12:00', 'LAB-102', 35, 0),
-- SE201 SEC01: Open (1/30)
(5, 4, 'SEC01', '2026/1', 'THU 13:00-16:00', 'CB1-201', 30, 1);

-- 3. Insert Students
INSERT INTO students (id, student_code, full_name, email, major) VALUES
(1, '65010042', 'Somchai Prasert', 's65010042@university.ac.th', 'Software Engineering'),
(2, '65010088', 'Wipada Srisuk', 's65010088@university.ac.th', 'Computer Science'),
(3, '66010123', 'Thanawat Jaiyen', 's66010123@university.ac.th', 'Information Technology'),
(4, '66010199', 'Nattaporn Meedee', 's66010199@university.ac.th', 'Computer Science');
INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES
(1, '65010042', 'Somchai Prasert', 's65010042@university.ac.th', 'Software Engineering', '', 'STUDENT'),
(2, '65010088', 'Wipada Srisuk', 's65010088@university.ac.th', 'Computer Science', '', 'STUDENT'),
(3, '66010123', 'Thanawat Jaiyen', 's66010123@university.ac.th', 'Information Technology', '', 'STUDENT'),
(4, '66010199', 'Nattaporn Meedee', 's66010199@university.ac.th', 'Computer Science', '', 'STUDENT');

-- 4. Initial Seed Enrollments
-- Student 1 enrolled in CS101 SEC01
INSERT INTO enrollments (id, student_id, section_id, status, enrolled_at, updated_at) VALUES
(1, 1, 1, 'ENROLLED', '2026-08-15 08:30:00', '2026-08-15 08:30:00'),
-- Student 2 enrolled in CS202 SEC01
(2, 2, 2, 'ENROLLED', '2026-08-15 08:45:00', '2026-08-15 08:45:00'),
-- Student 3 & Student 4 enrolled in CS202 SEC02 (making it full: 2/2)
(3, 3, 3, 'ENROLLED', '2026-08-15 09:00:00', '2026-08-15 09:00:00'),
(4, 4, 3, 'ENROLLED', '2026-08-15 09:05:00', '2026-08-15 09:05:00'),
-- Student 1 enrolled in SE201 SEC01
(5, 1, 5, 'ENROLLED', '2026-08-15 09:30:00', '2026-08-15 09:30:00');
