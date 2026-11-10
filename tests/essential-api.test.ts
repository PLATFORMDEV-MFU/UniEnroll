import { env, SELF } from 'cloudflare:test';
import { sign } from 'hono/jwt';
import { beforeEach, describe, expect, it } from 'vitest';

const TEST_JWT_SECRET = 'unienroll-test-secret-not-for-production-2026';

async function tokenFor(id: number, role: 'STUDENT' | 'STAFF' = 'STUDENT') {
  return sign(
    { sub: id, student_code: role === 'STAFF' ? 'staff-1' : `student-${id}`, role, exp: Math.floor(Date.now() / 1000) + 300 },
    TEST_JWT_SECRET,
    'HS256'
  );
}

async function request(path: string, token: string, init: RequestInit = {}) {
  return SELF.fetch(`https://unienroll.test${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

describe('essential enrollment API paths', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO courses (id, course_code, title, credits, department) VALUES (1, 'TEST101', 'Essential Paths', 3, 'CS')"
      ),
      env.DB.prepare(
        "INSERT INTO sections (id, course_id, section_number, semester, schedule, max_capacity, enrolled_count) VALUES (1, 1, 'SEC01', '2026/1', 'MON 09:00-12:00', 2, 0)"
      ),
      env.DB.prepare(
        "INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (1, 'student-1', 'Student One', 'student-1@test.local', 'CS', 'unused', 'STUDENT')"
      ),
      env.DB.prepare(
        "INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (2, 'staff-1', 'Staff One', 'staff-1@test.local', 'Registrar', 'unused', 'STAFF')"
      ),
    ]);
  });

  it('adds and drops an enrollment while returning the seat', async () => {
    const token = await tokenFor(1);
    const created = await request('/api/enrollments', token, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'add-then-drop' },
      body: JSON.stringify({ section_id: 1 }),
    });
    const createdBody = await created.json<{ data: { id: number } }>();
    expect(created.status).toBe(201);

    const dropped = await request(`/api/enrollments/${createdBody.data.id}`, token, { method: 'DELETE' });
    expect(dropped.status).toBe(200);
    await expect(dropped.json()).resolves.toMatchObject({ success: true, freed_seats: 1 });

    const section = await env.DB.prepare('SELECT enrolled_count FROM sections WHERE id = 1').first<{ enrolled_count: number }>();
    expect(section?.enrolled_count).toBe(0);

    const history = await request('/api/enrollments/me', token);
    expect(history.status).toBe(200);
    await expect(history.json()).resolves.toMatchObject({
      total: 1,
      data: [{ id: createdBody.data.id, status: 'DROPPED' }],
    });
  });

  it('returns one seat exactly once when the same enrollment is dropped concurrently', async () => {
    const token = await tokenFor(1);
    const created = await request('/api/enrollments', token, {
      method: 'POST',
      body: JSON.stringify({ section_id: 1 }),
    });
    const enrollmentId = (await created.json<{ data: { id: number } }>()).data.id;

    const responses = await Promise.all([
      request(`/api/enrollments/${enrollmentId}`, token, { method: 'DELETE' }),
      request(`/api/enrollments/${enrollmentId}`, token, { method: 'DELETE' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const rejected = responses.find((response) => response.status === 409);
    await expect(rejected?.json()).resolves.toMatchObject({
      error_code: 'ERR_ENROLLMENT_NOT_ACTIVE',
    });
    const section = await env.DB.prepare('SELECT enrolled_count FROM sections WHERE id = 1')
      .first<{ enrolled_count: number }>();
    expect(section?.enrolled_count).toBe(0);
  });

  it('returns one seat exactly once when the same enrollment is withdrawn concurrently', async () => {
    const token = await tokenFor(1);
    const created = await request('/api/enrollments', token, {
      method: 'POST',
      body: JSON.stringify({ section_id: 1 }),
    });
    const enrollmentId = (await created.json<{ data: { id: number } }>()).data.id;
    const withdraw = () => request(`/api/enrollments/${enrollmentId}/withdraw`, token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Concurrent withdrawal test' }),
    });

    const responses = await Promise.all([withdraw(), withdraw()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const rejected = responses.find((response) => response.status === 409);
    await expect(rejected?.json()).resolves.toMatchObject({
      error_code: 'ERR_ENROLLMENT_NOT_ACTIVE',
    });
    const section = await env.DB.prepare('SELECT enrolled_count FROM sections WHERE id = 1')
      .first<{ enrolled_count: number }>();
    expect(section?.enrolled_count).toBe(0);
  });

  it('moves one seat exactly once when the same enrollment is swapped concurrently', async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO sections (id, course_id, section_number, semester, schedule, max_capacity, enrolled_count) VALUES (2, 1, 'SEC02', '2026/1', 'TUE 09:00-12:00', 2, 0)"
      ),
      env.DB.prepare(
        "INSERT INTO sections (id, course_id, section_number, semester, schedule, max_capacity, enrolled_count) VALUES (3, 1, 'SEC03', '2026/1', 'WED 09:00-12:00', 2, 0)"
      ),
    ]);
    const token = await tokenFor(1);
    const created = await request('/api/enrollments', token, {
      method: 'POST',
      body: JSON.stringify({ section_id: 1 }),
    });
    const enrollmentId = (await created.json<{ data: { id: number } }>()).data.id;
    const swap = (sectionId: number) => request(`/api/enrollments/${enrollmentId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ section_id: sectionId }),
    });

    const responses = await Promise.all([swap(2), swap(3)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const rejected = responses.find((response) => response.status === 409);
    await expect(rejected?.json()).resolves.toMatchObject({
      error_code: 'ERR_ENROLLMENT_CHANGED',
    });
    const seats = await env.DB.prepare('SELECT id, enrolled_count FROM sections ORDER BY id')
      .all<{ id: number; enrolled_count: number }>();
    expect(seats.results.reduce((sum, section) => sum + section.enrolled_count, 0)).toBe(1);
    expect(seats.results.find((section) => section.id === 1)?.enrolled_count).toBe(0);
    const enrollment = await env.DB.prepare('SELECT section_id FROM enrollments WHERE id = ?')
      .bind(enrollmentId)
      .first<{ section_id: number }>();
    expect([2, 3]).toContain(enrollment?.section_id);
  });

  it.each([
    ['DELETE', (id: number, token: string) => request(`/api/enrollments/${id}`, token, { method: 'DELETE' }), 'DROPPED'],
    ['withdraw', (id: number, token: string) => request(`/api/enrollments/${id}/withdraw`, token, {
      method: 'POST', body: JSON.stringify({ reason: 'Mixed transition race' }),
    }), 'WITHDRAWN'],
  ])('keeps seat counters consistent when swap races with %s', async (_name, terminalTransition, expectedStatus) => {
    await env.DB.prepare(
      "INSERT INTO sections (id, course_id, section_number, semester, schedule, max_capacity, enrolled_count) VALUES (2, 1, 'SEC02', '2026/1', 'TUE 09:00-12:00', 2, 0)"
    ).run();
    const token = await tokenFor(1);
    const created = await request('/api/enrollments', token, {
      method: 'POST', body: JSON.stringify({ section_id: 1 }),
    });
    const enrollmentId = (await created.json<{ data: { id: number } }>()).data.id;

    const [swap, terminal] = await Promise.all([
      request(`/api/enrollments/${enrollmentId}`, token, {
        method: 'PATCH', body: JSON.stringify({ section_id: 2 }),
      }),
      terminalTransition(enrollmentId, token),
    ]);

    expect([200, 409]).toContain(swap.status);
    expect(terminal.status).toBe(200);
    const enrollment = await env.DB.prepare('SELECT section_id, status FROM enrollments WHERE id = ?')
      .bind(enrollmentId).first<{ section_id: number; status: string }>();
    expect(enrollment?.status).toBe(expectedStatus);
    const seats = await env.DB.prepare('SELECT enrolled_count FROM sections WHERE id IN (1, 2)')
      .all<{ enrolled_count: number }>();
    expect(seats.results.reduce((sum, section) => sum + section.enrolled_count, 0)).toBe(0);
  });

  it('strictly validates section-swap PATCH requests and active state', async () => {
    const token = await tokenFor(1);
    const created = await request('/api/enrollments', token, {
      method: 'POST',
      body: JSON.stringify({ section_id: 1 }),
    });
    const enrollmentId = (await created.json<{ data: { id: number } }>()).data.id;
    for (const invalidBody of [
      { status: 'DROPPED' },
      { section_id: 0 },
      { section_id: -1 },
      { section_id: 1.5 },
      { section_id: 2, unexpected: true },
    ]) {
      const response = await request(`/api/enrollments/${enrollmentId}`, token, {
        method: 'PATCH',
        body: JSON.stringify(invalidBody),
      });
      expect(response.status).toBe(400);
    }

    const sameSection = await request(`/api/enrollments/${enrollmentId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ section_id: 1 }),
    });
    expect(sameSection.status).toBe(409);

    const enrollment = await env.DB.prepare('SELECT status FROM enrollments WHERE id = ?')
      .bind(enrollmentId).first<{ status: string }>();
    expect(enrollment?.status).toBe('ENROLLED');
    let section = await env.DB.prepare('SELECT enrolled_count FROM sections WHERE id = 1')
      .first<{ enrolled_count: number }>();
    expect(section?.enrolled_count).toBe(1);

    await env.DB.prepare(
      "INSERT INTO sections (id, course_id, section_number, semester, schedule, max_capacity, enrolled_count) VALUES (2, 1, 'SEC02', '2026/1', 'TUE', 2, 0)"
    ).run();
    const dropped = await request(`/api/enrollments/${enrollmentId}`, token, { method: 'DELETE' });
    expect(dropped.status).toBe(200);
    const inactiveSwap = await request(`/api/enrollments/${enrollmentId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ section_id: 2 }),
    });
    expect(inactiveSwap.status).toBe(409);
    section = await env.DB.prepare('SELECT enrolled_count FROM sections WHERE id = 2')
      .first<{ enrolled_count: number }>();
    expect(section?.enrolled_count).toBe(0);
  });

  it('replays a duplicate idempotency key without creating a second enrollment', async () => {
    const token = await tokenFor(1);
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Idempotency-Key': 'same-request-twice' },
      body: JSON.stringify({ section_id: 1 }),
    };

    const first = await request('/api/enrollments', token, init);
    const second = await request('/api/enrollments', token, init);
    expect([first.status, second.status]).toEqual([201, 201]);

    const firstBody = await first.json<{ data: { id: number } }>();
    const secondBody = await second.json<{ data: { id: number } }>();
    expect(secondBody.data.id).toBe(firstBody.data.id);

    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM enrollments').first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it('coalesces concurrent requests that use the same idempotency key', async () => {
    const token = await tokenFor(1);
    const create = () => request('/api/enrollments', token, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'concurrent-same-request' },
      body: JSON.stringify({ section_id: 1 }),
    });

    const responses = await Promise.all([create(), create()]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json<{ data: { id: number } }>()))
    expect(bodies[0].data.id).toBe(bodies[1].data.id);
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM enrollments').first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it('rejects reuse of an idempotency key with a different request body', async () => {
    const token = await tokenFor(1);
    const headers = { 'Idempotency-Key': 'body-mismatch-key' };
    const first = await request('/api/enrollments', token, {
      method: 'POST',
      headers,
      body: JSON.stringify({ section_id: 1 }),
    });
    expect(first.status).toBe(201);

    const mismatch = await request('/api/enrollments', token, {
      method: 'POST',
      headers,
      body: JSON.stringify({ section_id: 999 }),
    });
    expect(mismatch.status).toBe(409);
    await expect(mismatch.json()).resolves.toMatchObject({
      error_code: 'ERR_IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('rejects an invalid Idempotency-Key length before mutation', async () => {
    const response = await request('/api/enrollments', await tokenFor(1), {
      method: 'POST',
      headers: { 'Idempotency-Key': 'short' },
      body: JSON.stringify({ section_id: 1 }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error_code: 'ERR_INVALID_IDEMPOTENCY_KEY' });
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM enrollments').first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it('scopes the same idempotency key to each authenticated student', async () => {
    await env.DB.prepare(
      "INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (3, 'S003', 'Student Three', 's3@example.test', 'SE', 'unused', 'STUDENT')"
    ).run();
    const [token1, token3] = await Promise.all([tokenFor(1), tokenFor(3)]);
    const create = (token: string) => request('/api/enrollments', token, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'shared-client-key' },
      body: JSON.stringify({ section_id: 1 }),
    });

    const [first, second] = await Promise.all([create(token1), create(token3)]);
    expect([first.status, second.status].sort()).toEqual([201, 201]);
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM enrollments').first<{ count: number }>();
    expect(count?.count).toBe(2);
  });

  it('forbids a student from granting an override', async () => {
    const token = await tokenFor(1);
    const response = await request('/api/overrides', token, {
      method: 'POST',
      body: JSON.stringify({
        student_id: 1,
        section_id: 1,
        override_type: 'CAPACITY',
        reason: 'Not authorized',
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error_code: 'ERR_UNAUTHORIZED_OVERRIDE_AUTHORITY',
    });
  });

  it('does not accept an unconfigured partner key', async () => {
    const response = await SELF.fetch('https://unienroll.test/api/enrollments/me', {
      headers: { 'X-Partner-Key': 'unconfigured-test-key' },
    });
    expect(response.status).toBe(401);
  });

  it('does not grant student or staff privileges to a configured partner key', async () => {
    const response = await SELF.fetch('https://unienroll.test/api/enrollments/me', {
      headers: { 'X-Partner-Key': env.PARTNER_API_KEY },
    });
    expect(response.status).toBe(401);
  });

  it('protects and disables the destructive seed endpoint by default', async () => {
    const unauthenticated = await SELF.fetch('https://unienroll.test/api/seed', {
      method: 'POST',
    });
    expect(unauthenticated.status).toBe(401);

    const student = await request('/api/seed', await tokenFor(1), { method: 'POST' });
    expect(student.status).toBe(403);

    const staff = await request('/api/seed', await tokenFor(2, 'STAFF'), { method: 'POST' });
    expect(staff.status).toBe(403);
  });

  it('restricts webhook audit logs to staff', async () => {
    const unauthenticated = await SELF.fetch('https://unienroll.test/api/webhooks/logs');
    expect(unauthenticated.status).toBe(401);

    const student = await request('/api/webhooks/logs', await tokenFor(1));
    expect(student.status).toBe(403);

    const staff = await request('/api/webhooks/logs', await tokenFor(2, 'STAFF'));
    expect(staff.status).toBe(200);
  });

  it('restricts durable webhook retries to staff and fails closed without configuration', async () => {
    const unauthenticated = await SELF.fetch('https://unienroll.test/api/webhooks/retry-pending', {
      method: 'POST',
    });
    expect(unauthenticated.status).toBe(401);

    const student = await request('/api/webhooks/retry-pending', await tokenFor(1), { method: 'POST' });
    expect(student.status).toBe(403);

    const staff = await request('/api/webhooks/retry-pending', await tokenFor(2, 'STAFF'), { method: 'POST' });
    expect(staff.status).toBe(503);
    await expect(staff.json()).resolves.toMatchObject({ error_code: 'ERR_WEBHOOK_NOT_CONFIGURED' });
  });

  it('atomically expands capacity when two staff overrides arrive together', async () => {
    await env.DB.batch([
      env.DB.prepare('UPDATE sections SET max_capacity = 1, enrolled_count = 0 WHERE id = 1'),
      env.DB.prepare("INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (3, 'S003', 'Student Three', 's3@example.test', 'SE', 'unused', 'STUDENT')"),
      env.DB.prepare("INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (4, 'S004', 'Student Four', 's4@example.test', 'SE', 'unused', 'STUDENT')"),
    ]);
    const staffToken = await tokenFor(2, 'STAFF');
    const createOverride = (studentId: number) => SELF.fetch('https://unienroll.test/api/overrides', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: studentId,
        section_id: 1,
        override_type: 'CAPACITY',
        reason: 'Approved by registrar',
      }),
    });

    const responses = await Promise.all([createOverride(3), createOverride(4)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 201]);

    const section = await env.DB.prepare('SELECT max_capacity, enrolled_count FROM sections WHERE id = 1')
      .first<{ max_capacity: number; enrolled_count: number }>();
    expect(section).toEqual({ max_capacity: 2, enrolled_count: 2 });
  });
});
