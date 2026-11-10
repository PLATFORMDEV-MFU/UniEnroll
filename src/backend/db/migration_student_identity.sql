-- One-time data migration for the Team 01 Student Identity integration.
-- Relationships remain intact because enrollments and academic records reference students.id.
UPDATE students
SET student_code = '6731503119',
    full_name = 'Waritpon Kokong',
    email = 's6731503119@university.ac.th'
WHERE id = 1
  AND student_code = '65010042';
