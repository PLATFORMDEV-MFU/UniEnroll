import { Hono } from 'hono';
import { AppEnv } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { deliverPendingWebhooks } from '../lib/webhook-sender';

export const webhookRoutes = new Hono<AppEnv>();

async function fingerprint(value: string): Promise<string | null> {
  if (!value) return null;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

// 1. POST /api/webhooks/incoming (A5 Box 3: Webhook Receiver)
webhookRoutes.post('/incoming', async (c) => {
  const secretHeader =
    c.req.header('X-Webhook-Secret') ||
    c.req.header('X-Partner-Signature') ||
    '';

  let rawBodyText = '';
  let parsedPayload: any = {};

  try {
    rawBodyText = await c.req.text();
    parsedPayload = JSON.parse(rawBodyText);
  } catch {
    parsedPayload = { raw: rawBodyText };
  }

  const eventName = parsedPayload.event || 'generic.event';

  // Verify the configured secret exactly; never accept substrings or source-code defaults.
  const isVerified = Boolean(
    c.env.INCOMING_WEBHOOK_SECRET && secretHeader === c.env.INCOMING_WEBHOOK_SECRET
  );
  const signatureFingerprint = await fingerprint(secretHeader);

  if (!isVerified) {
    // Record rejection audit in D1
    try {
      await c.env.DB.prepare(
        `INSERT INTO webhook_logs (direction, event, payload, signature, status, response_status, response_body)
         VALUES ('INCOMING', ?, ?, ?, 'FAILED', 401, 'Unauthorized: Secret verification failed')`
      )
        .bind(eventName, rawBodyText, signatureFingerprint)
        .run();
    } catch {}

    return c.json(
      {
        success: false,
        error: 'Unauthorized: Invalid or missing X-Webhook-Secret header.',
        hint: 'Provide the incoming webhook secret assigned out-of-band.',
      },
      401
    );
  }

  // Record verified incoming webhook in D1
  let logId = 0;
  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO webhook_logs (direction, event, payload, signature, status, response_status, response_body)
       VALUES ('INCOMING', ?, ?, ?, 'VERIFIED', 200, 'Processed successfully')`
    )
      .bind(eventName, rawBodyText, signatureFingerprint)
      .run();
    logId = Number(result.meta.last_row_id);
  } catch (err) {
    console.error('Failed to log incoming webhook:', err);
  }

  return c.json({
    success: true,
    receiver: 'UniEnroll Team 03 Webhook Hub',
    status: 'VERIFIED',
    log_id: logId,
    event_received: eventName,
    message: `Incoming webhook event '${eventName}' verified and processed.`,
    received_at: new Date().toISOString(),
  });
});

// 2. GET /api/webhooks/logs (Evidence Audit for Incoming & Outgoing Webhooks)
webhookRoutes.get('/logs', authMiddleware, requireRole('STAFF'), async (c) => {
  const direction = c.req.query('direction'); // 'INCOMING' or 'OUTGOING'
  let query = 'SELECT * FROM webhook_logs WHERE 1=1';
  const params: any[] = [];

  if (direction) {
    query += ' AND direction = ?';
    params.push(direction.toUpperCase());
  }

  query += ' ORDER BY id DESC LIMIT 50';

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({
    success: true,
    total_logs: results.length,
    data: results,
  });
});

webhookRoutes.post('/retry-pending', authMiddleware, requireRole('STAFF'), async (c) => {
  if (!c.env.PARTNER_WEBHOOK_URL || !c.env.WEBHOOK_SIGNING_SECRET) {
    return c.json({
      success: false,
      error_code: 'ERR_WEBHOOK_NOT_CONFIGURED',
      error: 'Partner webhook URL and signing secret must be configured before delivery.',
    }, 503);
  }
  const result = await deliverPendingWebhooks(c.env);
  return c.json({ success: true, data: result });
});

