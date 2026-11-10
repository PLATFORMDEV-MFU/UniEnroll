import { env, SELF } from 'cloudflare:test';
import { sign } from 'hono/jwt';
import { describe, expect, it } from 'vitest';
import { evaluateEnrollmentRules } from '../src/backend/lib/enrollment-rule-engine';

async function seedRuleScenario() {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO courses (id, course_code, title, credits, department) VALUES (1, 'CS101', 'Introduction', 3, 'CS')"
    ),
    env.DB.prepare(
      "INSERT INTO courses (id, course_code, title, credits, department) VALUES (2, 'CS202', 'Data Structures', 3, 'CS')"
    ),
    env.DB.prepare(
      "INSERT INTO sections (id, course_id, section_number, semester, schedule, max_capacity, enrolled_count) VALUES (2, 2, 'SEC01', '2026/1', 'TUE 09:00-12:00', 50, 0)"
    ),
    env.DB.prepare(
      "INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (1, 'student-1', 'Student One', 'student-1@test.local', 'CS', 'unused', 'STUDENT')"
    ),
  ]);
}

describe('deterministic enrollment rule engine', () => {
  it('lists the failed prerequisite rule when the student has not completed the required course', async () => {
    await seedRuleScenario();
    await env.DB.prepare(
      "INSERT INTO course_prerequisites (course_id, prerequisite_course_id, minimum_grade) VALUES (2, 1, 'C')"
    ).run();

    const decision = await evaluateEnrollmentRules(env.DB, 1, 2);

    expect(decision.eligible).toBe(false);
    expect(decision.failed_rules).toContainEqual(
      expect.objectContaining({
        code: 'ERR_PREREQUISITE_NOT_MET',
        details: expect.objectContaining({ required_course: 'CS101', minimum_grade: 'C' }),
      })
    );
  });

  it('accepts the prerequisite when the student completed it at the minimum grade', async () => {
    await seedRuleScenario();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO course_prerequisites (course_id, prerequisite_course_id, minimum_grade) VALUES (2, 1, 'C')"
      ),
      env.DB.prepare(
        "INSERT INTO student_course_history (student_id, course_id, grade, status) VALUES (1, 1, 'B', 'COMPLETED')"
      ),
    ]);

    const decision = await evaluateEnrollmentRules(env.DB, 1, 2);

    expect(decision).toMatchObject({ eligible: true, failed_rules: [] });
  });

  it('rejects enrollment that would exceed the 22-credit maximum', async () => {
    await seedRuleScenario();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO courses (id, course_code, title, credits, department) VALUES (3, 'LOAD200', 'Heavy Existing Load', 21, 'CS')"
      ),
      env.DB.prepare(
        "INSERT INTO sections (id, course_id, section_number, semester, schedule, max_capacity, enrolled_count) VALUES (3, 3, 'SEC01', '2026/1', 'WED 09:00-12:00', 50, 1)"
      ),
      env.DB.prepare(
        "INSERT INTO enrollments (student_id, section_id, status) VALUES (1, 3, 'ENROLLED')"
      ),
    ]);

    const decision = await evaluateEnrollmentRules(env.DB, 1, 2);
    expect(decision.failed_rules).toContainEqual(
      expect.objectContaining({ code: 'ERR_CREDIT_LIMIT_EXCEEDED' })
    );
  });

  it('rejects an overlapping meeting time in the same semester', async () => {
    await seedRuleScenario();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO courses (id, course_code, title, credits, department) VALUES (3, 'TIME200', 'Existing Schedule', 3, 'CS')"
      ),
      env.DB.prepare(
        "INSERT INTO sections (id, course_id, section_number, semester, schedule, max_capacity, enrolled_count) VALUES (3, 3, 'SEC01', '2026/1', 'TUE 10:00-11:00', 50, 1)"
      ),
      env.DB.prepare(
        "INSERT INTO enrollments (student_id, section_id, status) VALUES (1, 3, 'ENROLLED')"
      ),
    ]);

    const decision = await evaluateEnrollmentRules(env.DB, 1, 2);
    expect(decision.failed_rules).toContainEqual(
      expect.objectContaining({
        code: 'ERR_SCHEDULE_CONFLICT',
        details: expect.objectContaining({ conflicting_course: 'TIME200' }),
      })
    );
  });

  it('rejects the enrollment API with structured failed rules and a fallback explanation', async () => {
    await seedRuleScenario();
    await env.DB.prepare(
      "INSERT INTO course_prerequisites (course_id, prerequisite_course_id, minimum_grade) VALUES (2, 1, 'C')"
    ).run();
    const token = await sign(
      { sub: 1, student_code: 'student-1', role: 'STUDENT', exp: Math.floor(Date.now() / 1000) + 300 },
      env.JWT_SECRET,
      'HS256'
    );

    const response = await SELF.fetch('https://unienroll.test/api/enrollments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'prerequisite-rejection',
      },
      body: JSON.stringify({ section_id: 2 }),
    });
    const body = await response.json<{
      success: boolean;
      error_code: string;
      explanation_source: string;
      failed_rules: Array<{ code: string }>;
    }>();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      error_code: 'ERR_PREREQUISITE_NOT_MET',
      explanation_source: 'DETERMINISTIC_FALLBACK',
    });
    expect(body.failed_rules).toContainEqual(
      expect.objectContaining({ code: 'ERR_PREREQUISITE_NOT_MET' })
    );

    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM rule_decisions').first<{ count: number }>();
    expect(count?.count).toBe(1);
  });
});
