import { MiddlewareHandler } from 'hono';
import { AppEnv } from '../types';

/**
 * Idempotency Middleware (A5 Box 5: Idempotency Proof)
 * Intercepts requests containing an `Idempotency-Key` header.
 * Ensures identical repeated operations return the cached result without duplicate execution.
 */
export const idempotencyMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const idempotencyKey = c.req.header('Idempotency-Key')?.trim();

  // If no idempotency key is provided, proceed normally
  if (!idempotencyKey) {
    return next();
  }

  // Check if this idempotency key was previously processed
  try {
    const existing = await c.env.DB.prepare(
      'SELECT response_status, response_body, created_at FROM idempotency_keys WHERE key = ?'
    )
      .bind(idempotencyKey)
      .first<{ response_status: number; response_body: string; created_at: string }>();

    if (existing) {
      // Replay cached response without re-executing database mutations
      const parsedBody = JSON.parse(existing.response_body);
      return c.json(
        {
          ...parsedBody,
          _idempotent_replay: true,
          _original_created_at: existing.created_at,
        },
        existing.response_status as any,
        {
          'X-Cache-Lookup': 'HIT',
          'Idempotency-Key': idempotencyKey,
        }
      );
    }
  } catch (err) {
    console.error('Failed to lookup idempotency key:', err);
  }

  // Execute request
  await next();

  // Cache successful response for future replay
  if (c.res && c.res.status >= 200 && c.res.status < 300) {
    try {
      // Clone response to read body
      const cloned = c.res.clone();
      const bodyText = await cloned.text();

      await c.env.DB.prepare(
        'INSERT OR REPLACE INTO idempotency_keys (key, request_path, response_status, response_body) VALUES (?, ?, ?, ?)'
      )
        .bind(idempotencyKey, c.req.path, c.res.status, bodyText)
        .run();
    } catch (err) {
      console.error('Failed to store idempotency key result:', err);
    }
  }
};

