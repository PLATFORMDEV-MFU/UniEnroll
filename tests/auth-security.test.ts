import { env, SELF } from 'cloudflare:test';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { getJwtSecret } from '../src/backend/middleware/auth';
import { createAuthRoutes } from '../src/backend/routes/auth';
import { isValidSeedPassword } from '../src/backend/routes/seed';
import { AppEnv } from '../src/backend/types';

describe('authentication security', () => {
  it('fails closed when JWT_SECRET is missing', () => {
    expect(() => getJwtSecret({})).toThrow(/JWT_SECRET/);
  });

  it('does not accept the account code as a password fallback', async () => {
    await env.DB.prepare(
      "INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (1, 'student-1', 'Student One', 'student-1@test.local', 'CS', 'invalid-hash', 'STUDENT')"
    ).run();

    const response = await SELF.fetch('https://unienroll.test/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_code: 'student-1', password: 'student-1' }),
    });

    expect(response.status).toBe(401);
  });

  it('uses Team 01 credentials for a linked student account', async () => {
    const app = new Hono<AppEnv>();
    app.route('/api/auth', createAuthRoutes(async () => ({
      ok: true,
      profile: {
        studentId: '6731503119',
        fullName: 'Waritpon Kokong',
        email: 'student@test.local',
        major: 'Software Engineering',
      },
    })));

    const response = await app.request('https://unienroll.test/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_code: '6731503119', password: 'team01-password' }),
    }, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      user: { student_code: '6731503119', role: 'STUDENT' },
    });
    expect(await env.DB.prepare(
      "SELECT full_name, email, major, role FROM students WHERE student_code = '6731503119'"
    ).first()).toEqual({
      full_name: 'Waritpon Kokong',
      email: 'student@test.local',
      major: 'Software Engineering',
      role: 'STUDENT',
    });
  });

  it('requires a non-public configured password before destructive seeding', () => {
    expect(isValidSeedPassword(undefined)).toBe(false);
    expect(isValidSeedPassword('staff01')).toBe(false);
    expect(isValidSeedPassword('short-secret')).toBe(false);
    expect(isValidSeedPassword('x'.repeat(16))).toBe(true);
  });
});