import { MiddlewareHandler } from 'hono';
import { AppEnv } from '../types';

interface StoredResponseEnvelope {
  request_hash: string;
  body?: string;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parseEnvelope(value: string): StoredResponseEnvelope | null {
  try {
    const parsed = JSON.parse(value) as StoredResponseEnvelope;
    return typeof parsed.request_hash === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Claims an actor/method/path/key tuple before mutation. Concurrent duplicates
 * wait for and replay the first response; a different request body is rejected.
 */
export const idempotencyMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const idempotencyKey = c.req.header('Idempotency-Key')?.trim();
  if (!idempotencyKey) return next();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 255) {
    return c.json({
      success: false,
      error_code: 'ERR_INVALID_IDEMPOTENCY_KEY',
      error: 'Idempotency-Key must contain between 8 and 255 characters.',
    }, 400);
  }

  const actor = c.get('user');
  const method = c.req.method.toUpperCase();
  const requestUrl = new URL(c.req.url);
  const requestPath = `${requestUrl.pathname}${requestUrl.search}`;
  const storageKey = `${actor?.role ?? 'ANONYMOUS'}:${actor?.sub ?? 0}:${method}:${requestPath}:${idempotencyKey}`;
  const requestBody = await c.req.raw.clone().text();
  const requestHash = await sha256(requestBody);
  const pendingEnvelope = JSON.stringify({ request_hash: requestHash });

  const claim = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO idempotency_keys
      (key, request_path, response_status, response_body)
     VALUES (?, ?, 0, ?)`
  ).bind(storageKey, requestPath, pendingEnvelope).run();

  if ((claim.meta.changes ?? 0) === 0) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const existing = await c.env.DB.prepare(
        'SELECT response_status, response_body, created_at FROM idempotency_keys WHERE key = ?'
      ).bind(storageKey).first<{
        response_status: number;
        response_body: string;
        created_at: string;
      }>();

      if (!existing) break;
      const envelope = parseEnvelope(existing.response_body);
      if (!envelope || envelope.request_hash !== requestHash) {
        return c.json({
          success: false,
          error_code: 'ERR_IDEMPOTENCY_KEY_REUSED',
          error: 'This Idempotency-Key was already used with a different request body.',
        }, 409);
      }

      if (existing.response_status !== 0 && envelope.body !== undefined) {
        const parsedBody = JSON.parse(envelope.body) as Record<string, unknown>;
        return c.json({
          ...parsedBody,
          _idempotent_replay: true,
          _original_created_at: existing.created_at,
        }, existing.response_status as any, {
          'X-Cache-Lookup': 'HIT',
          'Idempotency-Key': idempotencyKey,
        });
      }

      await wait(10);
    }

    const pending = await c.env.DB.prepare(
      'SELECT created_at FROM idempotency_keys WHERE key = ? AND response_status = 0'
    ).bind(storageKey).first<{ created_at: string }>();
    const pendingAgeMs = pending ? Date.now() - new Date(`${pending.created_at}Z`).getTime() : 0;
    if (pending && pendingAgeMs >= 30_000) {
      return c.json({
        success: false,
        error_code: 'ERR_IDEMPOTENCY_OUTCOME_UNKNOWN',
        error: 'The original request did not record a canonical response. Manual reconciliation is required before retrying.',
        retryable: false,
      }, 409);
    }

    return c.json({
      success: false,
      error_code: 'ERR_IDEMPOTENCY_IN_PROGRESS',
      error: 'A request with this Idempotency-Key is still being processed.',
      retryable: true,
    }, 409);
  }

  try {
    await next();
    const responseBody = await c.res.clone().text();
    const completedEnvelope = JSON.stringify({
      request_hash: requestHash,
      body: responseBody,
    });
    await c.env.DB.prepare(
      `UPDATE idempotency_keys
       SET response_status = ?, response_body = ?
       WHERE key = ? AND response_status = 0`
    ).bind(c.res.status, completedEnvelope, storageKey).run();
  } catch (error) {
    // Never release a claim automatically: downstream may have committed before
    // throwing. Keep unknown outcomes fail-closed for explicit reconciliation.
    throw error;
  }
};