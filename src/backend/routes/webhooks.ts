import { Hono } from 'hono';
import { AppEnv } from '../types';

export const webhookRoutes = new Hono<AppEnv>();

export const EXPECTED_INCOMING_SECRET = 'whsec_partner_secret_2026';

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

  // Verify secret signature
  const isVerified = secretHeader.includes(EXPECTED_INCOMING_SECRET) || secretHeader === EXPECTED_INCOMING_SECRET;

  if (!isVerified) {
    // Record rejection audit in D1
    try {
      await c.env.DB.prepare(
        `INSERT INTO webhook_logs (direction, event, payload, signature, status, response_status, response_body)
         VALUES ('INCOMING', ?, ?, ?, 'FAILED', 401, 'Unauthorized: Secret verification failed')`
      )
        .bind(eventName, rawBodyText, secretHeader)
        .run();
    } catch {}

    return c.json(
      {
        success: false,
        error: 'Unauthorized: Invalid or missing X-Webhook-Secret header.',
        hint: 'Please provide header X-Webhook-Secret: whsec_partner_secret_2026',
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
      .bind(eventName, rawBodyText, secretHeader)
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
webhookRoutes.get('/logs', async (c) => {
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

