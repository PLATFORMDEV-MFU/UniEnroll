/**
 * UniEnroll webhook publisher.
 *
 * A payload is created once and reused for every retry, so consumers can
 * safely deduplicate deliveries by event_id.
 */

import type { Bindings } from '../types';

export type EnrollmentWebhookEvent =
  | 'enrollment.created'
  | 'enrollment.swapped'
  | 'enrollment.dropped'
  | 'enrollment.withdrawn'
  | 'enrollment.overridden';

export interface WebhookEventPayload {
  event_id: string;
  event_name: 'enrollment.changed';
  student_id: string;
  section_id: string;
  action: 'enrolled' | 'swapped' | 'dropped' | 'withdrawn' | 'overridden';
  event: EnrollmentWebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface WebhookDispatchOptions {
  fetcher?: Fetcher;
  maxAttempts?: number;
  retryDelayMs?: number;
  preparedPayload?: WebhookEventPayload;
}

export interface WebhookDispatchResult {
  success: boolean;
  status: number;
  signature: string;
  response: string;
  event_id: string;
  attempt_count: number;
}

export async function generateHmacSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function actionFor(event: EnrollmentWebhookEvent): WebhookEventPayload['action'] {
  const actions: Record<EnrollmentWebhookEvent, WebhookEventPayload['action']> = {
    'enrollment.created': 'enrolled',
    'enrollment.swapped': 'swapped',
    'enrollment.dropped': 'dropped',
    'enrollment.withdrawn': 'withdrawn',
    'enrollment.overridden': 'overridden',
  };
  return actions[event];
}

function buildPayload(
  event: EnrollmentWebhookEvent,
  eventData: Record<string, unknown>
): WebhookEventPayload {
  const sectionId = eventData.section_id_str ?? eventData.section_id;
  if (sectionId === undefined || sectionId === null || String(sectionId).trim() === '') {
    throw new Error('Webhook event data requires section_id');
  }
  return {
    event_id: crypto.randomUUID(),
    event_name: 'enrollment.changed',
    student_id: String(eventData.student_code ?? eventData.student_id ?? ''),
    section_id: String(sectionId),
    action: actionFor(event),
    event,
    timestamp: new Date().toISOString(),
    data: eventData,
  };
}

function isRetryable(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function logAttempt(
  db: D1Database,
  event: EnrollmentWebhookEvent,
  payloadString: string,
  signature: string,
  status: 'DELIVERED' | 'FAILED_DELIVERY',
  responseStatus: number,
  responseBody: string
): Promise<void> {
  await db.prepare(`
    INSERT INTO webhook_logs
      (direction, event, payload, signature, status, response_status, response_body)
    VALUES ('OUTGOING', ?, ?, ?, ?, ?, ?)
  `).bind(
    event,
    payloadString,
    signature,
    status,
    responseStatus,
    responseBody.slice(0, 500)
  ).run();
}

export async function dispatchWebhook(
  db: D1Database,
  targetUrl: string,
  event: EnrollmentWebhookEvent,
  eventData: Record<string, unknown>,
  secret: string,
  options: WebhookDispatchOptions = {}
): Promise<WebhookDispatchResult> {
  if (!targetUrl || !secret) {
    throw new Error('Webhook target URL and signing secret are required');
  }

  const fetcher = options.fetcher ?? fetch;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 250);
  const payload = options.preparedPayload ?? buildPayload(event, eventData);
  const payloadString = JSON.stringify(payload);
  const signature = `sha256=${await generateHmacSignature(payloadString, secret)}`;

  let responseStatus = 0;
  let responseBody = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetcher(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-UniEnroll-Signature': signature,
          'X-UniEnroll-Event': event,
          'X-UniEnroll-Event-Id': payload.event_id,
        },
        body: payloadString,
      });
      responseStatus = response.status;
      responseBody = await response.text().catch(() => '');
    } catch (error) {
      responseStatus = 0;
      responseBody = error instanceof Error ? error.message : 'Connection failed';
    }

    const success = responseStatus >= 200 && responseStatus < 300;
    const retry = !success && isRetryable(responseStatus) && attempt < maxAttempts;
    await logAttempt(
      db,
      event,
      payloadString,
      signature,
      success ? 'DELIVERED' : 'FAILED_DELIVERY',
      responseStatus,
      responseBody
    );

    if (success || !retry) {
      return {
        success,
        status: responseStatus,
        signature,
        response: responseBody,
        event_id: payload.event_id,
        attempt_count: attempt,
      };
    }

    await delay(retryDelayMs * 2 ** (attempt - 1));
  }

  throw new Error('Webhook retry loop exited unexpectedly');
}

export async function publishEnrollmentChange(
  env: Pick<Bindings, 'DB' | 'PARTNER_WEBHOOK_URL' | 'WEBHOOK_SIGNING_SECRET'>,
  _event: EnrollmentWebhookEvent,
  _eventData: Record<string, unknown>
): Promise<{ processed: number; delivered: number; pending: number } | null> {
  if (!env.PARTNER_WEBHOOK_URL || !env.WEBHOOK_SIGNING_SECRET) {
    console.warn('Webhook delivery deferred: partner URL or signing secret is not configured');
    return null;
  }
  return deliverPendingWebhooks(env);
}

export async function deliverPendingWebhooks(
  env: Pick<Bindings, 'DB' | 'PARTNER_WEBHOOK_URL' | 'WEBHOOK_SIGNING_SECRET'>,
  limit = 10,
  options: WebhookDispatchOptions = {}
): Promise<{ processed: number; delivered: number; pending: number }> {
  if (!env.PARTNER_WEBHOOK_URL || !env.WEBHOOK_SIGNING_SECRET) {
    return { processed: 0, delivered: 0, pending: 0 };
  }

  const claimToken = crypto.randomUUID();
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  await env.DB.prepare(`
    UPDATE webhook_outbox
    SET status = 'PROCESSING', claim_token = ?, claimed_at = CURRENT_TIMESTAMP
    WHERE event_id IN (
      SELECT event_id
      FROM webhook_outbox
      WHERE status IN ('PENDING', 'FAILED')
         OR (status = 'PROCESSING' AND claimed_at < datetime('now', '-5 minutes'))
      ORDER BY created_at, event_id
      LIMIT ?
    )
      AND (status IN ('PENDING', 'FAILED')
        OR (status = 'PROCESSING' AND claimed_at < datetime('now', '-5 minutes')))
  `).bind(claimToken, boundedLimit).run();

  const rows = await env.DB.prepare(`
    SELECT event_id, event, payload
    FROM webhook_outbox
    WHERE status = 'PROCESSING' AND claim_token = ?
    ORDER BY created_at, event_id
  `).bind(claimToken).all<{
    event_id: string;
    event: EnrollmentWebhookEvent;
    payload: string;
  }>();

  let delivered = 0;
  for (const row of rows.results) {
    const payload = JSON.parse(row.payload) as WebhookEventPayload;
    const result = await dispatchWebhook(
      env.DB,
      env.PARTNER_WEBHOOK_URL,
      row.event,
      payload.data,
      env.WEBHOOK_SIGNING_SECRET,
      { ...options, preparedPayload: payload }
    );
    const completion = await env.DB.prepare(`
      UPDATE webhook_outbox
      SET status = ?, attempt_count = attempt_count + ?, last_error = ?,
          delivered_at = CASE WHEN ? = 'DELIVERED' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
          claim_token = NULL, claimed_at = NULL
      WHERE event_id = ? AND status = 'PROCESSING' AND claim_token = ?
    `).bind(
      result.success ? 'DELIVERED' : 'FAILED',
      result.attempt_count,
      result.success ? null : result.response.slice(0, 500),
      result.success ? 'DELIVERED' : 'FAILED',
      row.event_id,
      claimToken
    ).run();
    if (result.success && (completion.meta.changes ?? 0) > 0) delivered += 1;
  }

  return {
    processed: rows.results.length,
    delivered,
    pending: rows.results.length - delivered,
  };
}
