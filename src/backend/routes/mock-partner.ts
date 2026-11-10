import { Hono } from 'hono';
import { AppEnv } from '../types';

export const mockPartnerRoutes = new Hono<AppEnv>();

// In-memory receiver buffer for immediate partner confirmation verification
const partnerReceivedEvents: any[] = [];

// 1. POST /api/mock-partner/webhook (Simulates Partner Webhook Endpoint)
mockPartnerRoutes.post('/webhook', async (c) => {
  const signature = c.req.header('X-UniEnroll-Signature');
  const event = c.req.header('X-UniEnroll-Event');

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = { raw: await c.req.text() };
  }

  const record = {
    received_at: new Date().toISOString(),
    event,
    signature,
    payload: body,
  };

  partnerReceivedEvents.unshift(record);
  if (partnerReceivedEvents.length > 20) partnerReceivedEvents.pop();

  return c.json({
    success: true,
    partner_ack: 'Event successfully received by Partner System (Team 04/05)',
    event_processed: event,
    signature_verified: !!signature,
    timestamp: new Date().toISOString(),
  });
});

// 2. GET /api/mock-partner/webhook/received (View events received by partner)
mockPartnerRoutes.get('/webhook/received', (c) => {
  return c.json({
    success: true,
    partner_name: 'Partner System (Timetable & Attendance)',
    total_received: partnerReceivedEvents.length,
    events: partnerReceivedEvents,
  });
});

// 3. GET /api/mock-partner/eligibility (Simulates Partner Tuition / Clearance API)
mockPartnerRoutes.get('/eligibility', (c) => {
  const studentCode = c.req.query('student_code') || '6731503119';
  const simulateBreakage = c.req.query('simulate_breakage') === 'true';

  // Box 6: If simulate_breakage is requested, return 503 Service Unavailable
  if (simulateBreakage) {
    return c.json(
      {
        error: 'Service Unavailable: Partner Tuition Gateway Database Connection Timeout',
        system: 'University Bursar System',
        status: 503,
      },
      503
    );
  }

  // Normal healthy response
  return c.json({
    success: true,
    student_code: studentCode,
    tuition_status: 'PAID',
    academic_standing: 'GOOD',
    eligible_for_enrollment: true,
    verified_at: new Date().toISOString(),
  });
});

