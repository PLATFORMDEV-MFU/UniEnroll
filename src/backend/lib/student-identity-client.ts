import { Bindings } from '../types';

export const DEFAULT_STUDENT_IDENTITY_BASE_URL = 'https://student-identity.onrender.com';

export interface StudentIdentityClaims {
  verified: boolean;
  name: string;
  profileComplete: boolean;
  missingFields: string[];
  skills: string[];
}

export interface StudentIdentityProfile {
  studentId: string;
  fullName: string;
  email: string;
  major: string;
}

export type StudentIdentityResult =
  | {
      ok: true;
      status: number;
      durationMs: number;
      claims: StudentIdentityClaims;
    }
  | {
      ok: false;
      status: number;
      durationMs: number;
      code: string;
      message: string;
    };

export type StudentIdentityAuthResult =
  | { ok: true; profile: StudentIdentityProfile }
  | {
      ok: false;
      status: 401 | 502;
      code: string;
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return null;
  }
  return value;
}

function personName(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!isRecord(value)) return null;

  const first = typeof value.first === 'string' ? value.first.trim() : '';
  const last = typeof value.last === 'string' ? value.last.trim() : '';
  return [first, last].filter(Boolean).join(' ') || null;
}

function authenticatedStudentProfile(value: unknown): StudentIdentityProfile | null {
  if (!isRecord(value)) return null;

  const candidates = [value, value.data, value.user].filter(isRecord);
  for (const candidate of candidates) {
    const studentId = typeof candidate.studentId === 'string'
      ? candidate.studentId
      : typeof candidate.student_id === 'string'
        ? candidate.student_id
        : null;
    const role = typeof candidate.role === 'string' ? candidate.role.toLowerCase() : null;
    const firstName = typeof candidate.firstName === 'string'
      ? candidate.firstName.trim()
      : typeof candidate.first_name === 'string'
        ? candidate.first_name.trim()
        : '';
    const lastName = typeof candidate.lastName === 'string'
      ? candidate.lastName.trim()
      : typeof candidate.last_name === 'string'
        ? candidate.last_name.trim()
        : '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const email = typeof candidate.email === 'string' ? candidate.email.trim() : '';
    const faculty = typeof candidate.faculty === 'string' ? candidate.faculty.trim() : '';

    if (studentId && fullName && email && (role === null || role === 'student')) {
      return {
        studentId,
        fullName,
        email,
        major: faculty || 'Software Engineering',
      };
    }
  }

  return null;
}

function parseClaims(value: unknown): StudentIdentityClaims | null {
  if (!isRecord(value)) return null;

  const envelope = isRecord(value.data) ? value.data : value;
  const candidate = isRecord(envelope.claims) ? envelope.claims : envelope;
  const name = personName(candidate.name);
  const missingFields = stringArray(candidate.missingFields);
  const skills = stringArray(candidate.skills);

  if (
    typeof candidate.verified !== 'boolean'
    || name === null
    || typeof candidate.profileComplete !== 'boolean'
    || missingFields === null
    || skills === null
  ) {
    return null;
  }

  return {
    verified: candidate.verified,
    name,
    profileComplete: candidate.profileComplete,
    missingFields,
    skills,
  };
}

export async function authenticateStudentIdentity(
  env: Pick<Bindings, 'STUDENT_IDENTITY_BASE_URL'>,
  studentId: string,
  password: string,
): Promise<StudentIdentityAuthResult> {
  const baseUrl = (env.STUDENT_IDENTITY_BASE_URL || DEFAULT_STUDENT_IDENTITY_BASE_URL).replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ studentId, password }),
      signal: controller.signal,
    });

    if (!loginResponse.ok) {
      return loginResponse.status === 401 || loginResponse.status === 403
        ? {
            ok: false,
            status: 401,
            code: 'ERR_INVALID_CREDENTIALS',
            message: 'Invalid student code or password',
          }
        : {
            ok: false,
            status: 502,
            code: 'ERR_STUDENT_IDENTITY_AUTH',
            message: 'Student Identity could not authenticate this account',
          };
    }

    const loginPayload: unknown = await loginResponse.json().catch(() => null);
    if (!isRecord(loginPayload) || typeof loginPayload.token !== 'string') {
      return {
        ok: false,
        status: 502,
        code: 'ERR_STUDENT_IDENTITY_AUTH_RESPONSE',
        message: 'Student Identity returned an unexpected login response',
      };
    }

    const profileResponse = await fetch(`${baseUrl}/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${loginPayload.token}`,
      },
      signal: controller.signal,
    });
    const profilePayload: unknown = await profileResponse.json().catch(() => null);

    const profile = authenticatedStudentProfile(profilePayload);
    if (!profileResponse.ok || profile?.studentId !== studentId) {
      return {
        ok: false,
        status: 502,
        code: 'ERR_STUDENT_IDENTITY_SUBJECT',
        message: 'Student Identity could not verify the authenticated student',
      };
    }

    return { ok: true, profile };
  } catch {
    return {
      ok: false,
      status: 502,
      code: 'ERR_STUDENT_IDENTITY_UNAVAILABLE',
      message: 'Student Identity service is unavailable',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchStudentIdentityClaims(
  env: Bindings,
  studentId: string,
): Promise<StudentIdentityResult> {
  if (!env.STUDENT_IDENTITY_API_KEY) {
    return {
      ok: false,
      status: 503,
      durationMs: 0,
      code: 'ERR_STUDENT_IDENTITY_NOT_CONFIGURED',
      message: 'Student Identity integration is not configured',
    };
  }

  const baseUrl = (env.STUDENT_IDENTITY_BASE_URL || DEFAULT_STUDENT_IDENTITY_BASE_URL).replace(/\/$/, '');
  const endpoint = `${baseUrl}/students/${encodeURIComponent(studentId)}/claims`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const startedAt = performance.now();

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${env.STUDENT_IDENTITY_API_KEY}`,
      },
      signal: controller.signal,
    });
    const durationMs = Math.round(performance.now() - startedAt);
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const remoteMessage = isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : 'Student Identity rejected the verification request';
      return {
        ok: false,
        status: response.status,
        durationMs,
        code: 'ERR_STUDENT_IDENTITY_PARTNER',
        message: remoteMessage,
      };
    }

    const claims = parseClaims(payload);
    if (!claims) {
      return {
        ok: false,
        status: 502,
        durationMs,
        code: 'ERR_STUDENT_IDENTITY_RESPONSE',
        message: 'Student Identity returned an unexpected claims response',
      };
    }

    return { ok: true, status: response.status, durationMs, claims };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    return {
      ok: false,
      status: 502,
      durationMs,
      code: 'ERR_STUDENT_IDENTITY_UNAVAILABLE',
      message: error instanceof Error && error.name === 'AbortError'
        ? 'Student Identity request timed out'
        : 'Student Identity service is unavailable',
    };
  } finally {
    clearTimeout(timeout);
  }
}
