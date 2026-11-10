import { env, SELF } from 'cloudflare:test';
import { sign } from 'hono/jwt';
import { describe, expect, it } from 'vitest';

async function seedLastSeatScenario() {
  await env.DB.prepare(
    "INSERT INTO courses (id, course_code, title, credits, department) VALUES (1, 'RACE101', 'Concurrent Registration', 3, 'Computer Science')"
  ).run();
  await env.DB.prepare(
    "INSERT INTO sections (id, course_id, section_number, semester, schedule, room, max_capacity, enrolled_count) VALUES (1, 1, 'SEC01', '2026/1', 'MON 09:00-12:00', 'LAB-1', 50, 49)"
  ).run();

  const statements: D1PreparedStatement[] = [];
  for (let id = 1; id <= 51; id += 1) {
    statements.push(
      env.DB.prepare(
        'INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        id,
        `race-${id}`,
        `Race Student ${id}`,
        `race-${id}@university.test`,
        'Software Engineering',
        'unused-in-api-test',
        'STUDENT'
      )
    );
  }
  for (let id = 1; id <= 49; id += 1) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO enrollments (student_id, section_id, status) VALUES (?, 1, 'ENROLLED')"
      ).bind(id)
    );
  }
  await env.DB.batch(statements);
}

async function tokenFor(studentId: number) {
  return sign(
    {
      sub: studentId,
      student_code: `race-${studentId}`,
      role: 'STUDENT',
      exp: Math.floor(Date.now() / 1000) + 300,
    },
    env.JWT_SECRET,
    'HS256'
  );
}

describe('atomic capacity protection', () => {
  it('allows only one active section of the same course under concurrent requests', async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO courses (id, course_code, title, credits, department) VALUES (1, 'DUP101', 'Duplicate Course Race', 3, 'Computer Science')"
      ),
      env.DB.prepare(
        "INSERT INTO sections (id, course_id, section_number, semester, schedule, room, max_capacity, enrolled_count) VALUES (1, 1, 'SEC01', '2026/1', 'MON 09:00-12:00', 'A', 10, 0)"
      ),
      env.DB.prepare(
        "INSERT INTO sections (id, course_id, section_number, semester, schedule, room, max_capacity, enrolled_count) VALUES (2, 1, 'SEC02', '2026/1', 'TUE 09:00-12:00', 'B', 10, 0)"
      ),
      env.DB.prepare(
        "INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (1, 'race-1', 'Race Student 1', 'race-1@university.test', 'CS', 'unused', 'STUDENT')"
      ),
    ]);
    const token = await tokenFor(1);
    const enroll = (sectionId: number) => SELF.fetch('https://unienroll.test/api/enrollments', {
      method: 'POST',
      headers: {
        Authorization: ['Bearer', token].join(' '),
        'Content-Type': 'application/json',
        'Idempotency-Key': `same-course-section-${sectionId}`,
      },
      body: JSON.stringify({ section_id: sectionId }),
    });

    const responses = await Promise.all([enroll(1), enroll(2)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const rejected = responses.find((response) => response.status === 409);
    await expect(rejected?.json()).resolves.toMatchObject({
      error_code: 'ERR_DUPLICATE_COURSE_ENROLLMENT',
    });
    const active = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM enrollments WHERE status IN ('ENROLLED', 'OVERRIDDEN')"
    ).first<{ count: number }>();
    expect(active?.count).toBe(1);
    const seats = await env.DB.prepare('SELECT SUM(enrolled_count) AS count FROM sections')
      .first<{ count: number }>();
    expect(seats?.count).toBe(1);
  });

  it('awards the 50th seat to exactly one of two simultaneous students and clearly rejects the loser', async () => {
    await seedLastSeatScenario();
    const [token50, token51] = await Promise.all([tokenFor(50), tokenFor(51)]);

    const responses = await Promise.all([
      SELF.fetch('https://unienroll.test/api/enrollments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token50}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'last-seat-student-50',
        },
        body: JSON.stringify({ section_id: 1 }),
      }),
      SELF.fetch('https://unienroll.test/api/enrollments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token51}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'last-seat-student-51',
        },
        body: JSON.stringify({ section_id: 1 }),
      }),
    ]);

    const statuses = responses.map((response) => response.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 422]);

    const bodies = await Promise.all(responses.map((response) => response.json<Record<string, unknown>>()));
    const rejected = bodies.find((body) => body.success === false);
    expect(rejected).toMatchObject({
      success: false,
      error_code: 'ERR_CAPACITY_FULL',
      details: {
        contention_policy: 'FIRST_COMMITTED_REQUEST_WINS',
        available_seats: 0,
        retryable: false,
      },
    });
    expect(String(rejected?.error)).toMatch(/full|last available seat/i);

    const section = await env.DB.prepare(
      'SELECT enrolled_count, max_capacity FROM sections WHERE id = 1'
    ).first<{ enrolled_count: number; max_capacity: number }>();
    expect(section).toEqual({ enrolled_count: 50, max_capacity: 50 });

    const active = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM enrollments WHERE section_id = 1 AND status IN ('ENROLLED', 'OVERRIDDEN')"
    ).first<{ count: number }>();
    expect(active?.count).toBe(50);
  });

  it('never oversells when 60 students race for 50 seats', async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO courses (id, course_code, title, credits, department) VALUES (1, 'LOAD101', 'Oversubscription Test', 3, 'Computer Science')"
      ),
      env.DB.prepare(
        "INSERT INTO sections (id, course_id, section_number, semester, schedule, room, max_capacity, enrolled_count) VALUES (1, 1, 'SEC01', '2026/1', 'MON 09:00-12:00', 'LOAD-LAB', 50, 0)"
      ),
      ...Array.from({ length: 60 }, (_, index) => {
        const id = index + 1;
        return env.DB.prepare(
          'INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, `load-${id}`, `Load Student ${id}`, `load-${id}@university.test`, 'CS', 'unused', 'STUDENT');
      }),
    ]);

    const tokens = await Promise.all(
      Array.from({ length: 60 }, (_, index) => {
        const id = index + 1;
        return sign(
          { sub: id, student_code: `load-${id}`, role: 'STUDENT', exp: Math.floor(Date.now() / 1000) + 300 },
          env.JWT_SECRET,
          'HS256'
        );
      })
    );
    const responses = await Promise.all(
      tokens.map((token, index) =>
        SELF.fetch('https://unienroll.test/api/enrollments', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `load-student-${index + 1}`,
          },
          body: JSON.stringify({ section_id: 1 }),
        })
      )
    );

    const statusCounts = responses.reduce<Record<number, number>>((counts, response) => {
      counts[response.status] = (counts[response.status] ?? 0) + 1;
      return counts;
    }, {});
    expect(statusCounts).toEqual({ 201: 50, 422: 10 });

    const rejectedBodies = await Promise.all(
      responses.filter((response) => response.status === 422).map((response) => response.json<{ error_code: string }>())
    );
    expect(rejectedBodies.every((body) => body.error_code === 'ERR_CAPACITY_FULL')).toBe(true);

    const section = await env.DB.prepare(
      'SELECT enrolled_count, max_capacity FROM sections WHERE id = 1'
    ).first<{ enrolled_count: number; max_capacity: number }>();
    const active = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM enrollments WHERE section_id = 1 AND status IN ('ENROLLED', 'OVERRIDDEN')"
    ).first<{ count: number }>();
    expect(section).toEqual({ enrolled_count: 50, max_capacity: 50 });
    expect(active?.count).toBe(50);
  });
});
