import { MiddlewareHandler } from 'hono';
import { verify } from 'hono/jwt';
import { AppEnv, AuthPayload } from '../types';

export const DEFAULT_JWT_SECRET = 'unienroll-dev-secret-change-in-production-2026';

export function getJwtSecret(env?: { JWT_SECRET?: string }): string {
  return env?.JWT_SECRET || DEFAULT_JWT_SECRET;
}

/**
 * Authentication Middleware: Validates Bearer JWT in Authorization header.
 * Attaches verified payload to `c.set('user', payload)`.
 */
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Allow partner service with X-Partner-Key
  const partnerKey = c.req.header('X-Partner-Key');
  if (partnerKey && (partnerKey === 'partner-secret-key-2026' || partnerKey === 'team-04-timetable-key')) {
    c.set('user', {
      sub: 1,
      student_code: 'PARTNER',
      role: 'STAFF'
    });
    return await next();
  }

  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        success: false,
        error: 'Unauthorized: Missing or invalid Authorization header. Expected Bearer token.',
      },
      401
    );
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return c.json(
      {
        success: false,
        error: 'Unauthorized: Empty token provided.',
      },
      401
    );
  }

  try {
    const secret = getJwtSecret(c.env);
    const payload = (await verify(token, secret, 'HS256')) as unknown as AuthPayload;

    if (!payload || !payload.sub || !payload.student_code) {
      return c.json(
        {
          success: false,
          error: 'Unauthorized: Malformed token payload.',
        },
        401
      );
    }

    c.set('user', payload);
    await next();
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: 'Unauthorized: Invalid or expired token.',
      },
      401
    );
  }
};

/**
 * Role-Based Access Control Middleware.
 */
export function requireRole(allowedRole: 'STUDENT' | 'STAFF'): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user || user.role !== allowedRole) {
      return c.json(
        {
          success: false,
          error: `Forbidden: Requires ${allowedRole} privilege.`,
        },
        403
      );
    }
    await next();
  };
}

