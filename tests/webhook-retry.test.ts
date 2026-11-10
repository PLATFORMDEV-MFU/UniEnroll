import { env, SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { deliverPendingWebhooks, dispatchWebhook } from '../src/backend/lib/webhook-sender';

describe('idempotent webhook delivery', () => {
  it('rejects payloads that omit the required section identifier', async () => {
    await expect(dispatchWebhook(
      env.DB,
      'https://partner.test/events',
      'enrollment.created',
      { student_id: 1 },
      'test-signing-secret',
      { fetcher: vi.fn(), retryDelayMs: 0 }
    )).rejects.toThrow(/section_id/i);
  });

  it('retries transient failures with the same event_id and succeeds on the third attempt', async () => {
    const seenBodies: string[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenBodies.push(String(init?.body));
      const attempt = seenBodies.length;
      return new Response(attempt < 3 ? 'temporary failure' : null, {
        status: attempt < 3 ? 503 : 204,
      });
    });

    const result = await dispatchWebhook(
      env.DB,
      'https://partner.test/events',
      'enrollment.created',
      { student_id: 1, section_id: 2 },
      'test-signing-secret',
      { fetcher, maxAttempts: 3, retryDelayMs: 0 }
    );

    expect(result).toMatchObject({ success: true, status: 204, attempt_count: 3 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const eventIds = seenBodies.map((body) => JSON.parse(body).event_id);
    expect(new Set(eventIds).size).toBe(1);

    const logs = await env.DB.prepare(
      "SELECT status, response_status FROM webhook_logs WHERE direction = 'OUTGOING' ORDER BY id"
    ).all<{ status: string; response_status: number }>();
    expect(logs.results).toEqual([
      { status: 'FAILED_DELIVERY', response_status: 503 },
      { status: 'FAILED_DELIVERY', response_status: 503 },
      { status: 'DELIVERED', response_status: 204 },
    ]);
  });

  it('does not retry a non-transient 4xx contract error', async () => {
    const fetcher = vi.fn(async () => new Response('bad signature', { status: 401 }));

    const result = await dispatchWebhook(
      env.DB,
      'https://partner.test/events',
      'enrollment.created',
      { student_id: 1, section_id: 2 },
      'test-signing-secret',
      { fetcher, maxAttempts: 3, retryDelayMs: 0 }
    );

    expect(result).toMatchObject({ success: false, status: 401, attempt_count: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('persists state-change events and can retry the same outbox event later', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO courses (id, course_code, title, credits, department) VALUES (1, 'OUT101', 'Outbox', 3, 'CS')"),
      env.DB.prepare("INSERT INTO sections (id, course_id, section_number, semester, schedule, max_capacity, enrolled_count) VALUES (1, 1, 'A', '2026/1', 'MON', 1, 1)"),
      env.DB.prepare("INSERT INTO students (id, student_code, full_name, email, major, password_hash, role) VALUES (1, 'S001', 'Outbox Student', 'outbox@test.local', 'CS', 'unused', 'STUDENT')"),
      env.DB.prepare("INSERT INTO enrollments (id, student_id, section_id, status) VALUES (1, 1, 1, 'ENROLLED')"),
    ]);

    const pending = await env.DB.prepare('SELECT event_id, payload, status FROM webhook_outbox').first<{
      event_id: string; payload: string; status: string;
    }>();
    expect(pending?.status).toBe('PENDING');
    expect(JSON.parse(pending?.payload || '{}').event_id).toBe(pending?.event_id);

    const failedBodies: string[] = [];
    await deliverPendingWebhooks({
      DB: env.DB,
      PARTNER_WEBHOOK_URL: 'https://partner.test/events',
      WEBHOOK_SIGNING_SECRET: 'test-signing-secret',
    }, 10, {
      fetcher: vi.fn(async (_input, init) => {
        failedBodies.push(String(init?.body));
        return new Response('temporary failure', { status: 503 });
      }),
      maxAttempts: 2,
      retryDelayMs: 0,
    });
    const failed = await env.DB.prepare('SELECT status, attempt_count FROM webhook_outbox').first<{
      status: string; attempt_count: number;
    }>();
    expect(failed).toEqual({ status: 'FAILED', attempt_count: 2 });

    const recoveredBodies: string[] = [];
    await deliverPendingWebhooks({
      DB: env.DB,
      PARTNER_WEBHOOK_URL: 'https://partner.test/events',
      WEBHOOK_SIGNING_SECRET: 'test-signing-secret',
    }, 10, {
      fetcher: vi.fn(async (_input, init) => {
        recoveredBodies.push(String(init?.body));
        return new Response(null, { status: 204 });
      }),
      retryDelayMs: 0,
    });
    const recovered = await env.DB.prepare('SELECT status, attempt_count FROM webhook_outbox').first<{
      status: string; attempt_count: number;
    }>();
    expect(recovered).toEqual({ status: 'DELIVERED', attempt_count: 3 });
    expect(JSON.parse(failedBodies[0]).event_id).toBe(JSON.parse(recoveredBodies[0]).event_id);
  });

  it('claims an outbox event once across concurrent drainers', async () => {
    const payload = {
      event_id: 'evt-concurrent-drain',
      event: 'enrollment.created',
      timestamp: new Date().toISOString(),
      data: { enrollment_id: 1, student_id: 1, section_id: 1, status: 'ENROLLED' },
    };
    await env.DB.prepare(
      "INSERT INTO webhook_outbox (event_id, event, payload) VALUES (?, 'enrollment.created', ?)"
    ).bind(payload.event_id, JSON.stringify(payload)).run();

    let releaseDelivery!: () => void;
    const deliveryGate = new Promise<void>((resolve) => { releaseDelivery = resolve; });
    const fetcher = vi.fn(async () => {
      await deliveryGate;
      return new Response(null, { status: 204 });
    });
    const deliveryEnv = {
      DB: env.DB,
      PARTNER_WEBHOOK_URL: 'https://partner.test/events',
      WEBHOOK_SIGNING_SECRET: 'test-signing-secret',
    };

    const first = deliverPendingWebhooks(deliveryEnv, 10, { fetcher, retryDelayMs: 0 });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const second = await deliverPendingWebhooks(deliveryEnv, 10, { fetcher, retryDelayMs: 0 });
    releaseDelivery();
    const firstResult = await first;

    expect(firstResult.processed + second.processed).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const stored = await env.DB.prepare(
      'SELECT status, claim_token, claimed_at FROM webhook_outbox WHERE event_id = ?'
    ).bind(payload.event_id).first<{ status: string; claim_token: string | null; claimed_at: string | null }>();
    expect(stored).toEqual({ status: 'DELIVERED', claim_token: null, claimed_at: null });
  });

  it('verifies the incoming secret exactly and stores only a fingerprint', async () => {
    const invalid = await SELF.fetch('https://unienroll.test/api/webhooks/incoming', {
      method: 'POST',
      headers: { 'X-Webhook-Secret': 'prefix-test-incoming-webhook-secret-suffix' },
      body: JSON.stringify({ event: 'partner.changed' }),
    });
    expect(invalid.status).toBe(401);

    const valid = await SELF.fetch('https://unienroll.test/api/webhooks/incoming', {
      method: 'POST',
      headers: { 'X-Webhook-Secret': env.INCOMING_WEBHOOK_SECRET },
      body: JSON.stringify({ event: 'partner.changed' }),
    });
    expect(valid.status).toBe(200);

    const { results } = await env.DB.prepare(
      "SELECT status, signature FROM webhook_logs WHERE direction = 'INCOMING' ORDER BY id"
    ).all<{ status: string; signature: string }>();
    expect(results.map((row) => row.status)).toEqual(['FAILED', 'VERIFIED']);
    expect(results.every((row) => row.signature.startsWith('sha256:'))).toBe(true);
    expect(results.every((row) => !row.signature.includes('incoming-webhook-secret'))).toBe(true);
  });
});
