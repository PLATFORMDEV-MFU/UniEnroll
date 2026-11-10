import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authenticateStudentIdentity,
  fetchStudentIdentityClaims,
} from '../src/backend/lib/student-identity-client';
import { Bindings } from '../src/backend/types';

const envWithKey = {
  DB: {} as D1Database,
  STUDENT_IDENTITY_API_KEY: 'test-student-identity-key',
} satisfies Bindings;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Student Identity client', () => {
  it('authenticates the student and verifies the returned token subject', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token: 'short-lived-user-token',
        role: 'student',
        expiresIn: 900,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 42,
        student_id: '6731503119',
        email: 'student@example.com',
        first_name: 'Waritpon',
        last_name: 'Kokong',
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await authenticateStudentIdentity({}, '6731503119', 'team01-password');

    expect(result).toEqual({
      ok: true,
      profile: {
        studentId: '6731503119',
        fullName: 'Waritpon Kokong',
        email: 'student@example.com',
        major: 'Software Engineering',
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://student-identity.onrender.com/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ studentId: '6731503119', password: 'team01-password' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://student-identity.onrender.com/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer short-lived-user-token' }),
      }),
    );
  });

  it('fails clearly when the service key is not configured', async () => {
    const result = await fetchStudentIdentityClaims({ DB: {} as D1Database }, '6731503119');

    expect(result).toMatchObject({
      ok: false,
      status: 503,
      code: 'ERR_STUDENT_IDENTITY_NOT_CONFIGURED',
    });
  });

  it('uses the service key and normalizes claims required for enrollment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      studentId: '6731503119',
      claims: {
        verified: true,
        name: {
          first: 'Waritpon',
          last: 'Kokong',
        },
        profileComplete: true,
        missingFields: [],
        skills: ['software-engineering'],
      },
      issuedAt: '2026-11-10T04:01:38.565Z',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchStudentIdentityClaims(envWithKey, '6731503119');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims).toMatchObject({
        verified: true,
        profileComplete: true,
        name: 'Waritpon Kokong',
      });
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'https://student-identity.onrender.com/students/6731503119/claims',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-student-identity-key',
        }),
      }),
    );
  });

  it('rejects a successful partner response with an unexpected schema', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));

    const result = await fetchStudentIdentityClaims(envWithKey, '6731503119');

    expect(result).toMatchObject({
      ok: false,
      status: 502,
      code: 'ERR_STUDENT_IDENTITY_RESPONSE',
    });
  });
});
