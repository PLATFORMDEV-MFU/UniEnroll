import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { AppEnv } from './types';
import { authRoutes } from './routes/auth';
import { enrollmentRoutes } from './routes/enrollments';
import { overrideRoutes } from './routes/overrides';
import { courseRoutes } from './routes/courses';
import { sectionRoutes } from './routes/sections';
import { studentRoutes } from './routes/students';
import { seedRoutes } from './routes/seed';
import { partnerRoutes } from './routes/partner';
import { webhookRoutes } from './routes/webhooks';
import { externalRoutes } from './routes/external';
import { mockPartnerRoutes } from './routes/mock-partner';

const app = new Hono<AppEnv>();

// Global Middlewares
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Partner-Key', 'X-Partner-Id', 'X-Webhook-Secret', 'X-UniEnroll-Signature']
}));

// Root Information & Health Check
app.get('/', (c) => {
  return c.json({
    project: 'UniEnroll API',
    description: 'Course Enrollment Platform REST API with Inter-Group Integration Hub',
    status: 'online',
    version: '1.2.0',
    a5_integration_hub: {
      box_1_consumer: {
        student_identity: 'GET /api/external/student-identity/me (Requires UniEnroll JWT)',
        legacy_eligibility: 'GET /api/external/check-eligibility?student_code=...'
      },
      box_2_provider: {
        sections: 'GET /api/partner/sections (Requires header: X-Partner-Key)',
        enrollments: 'GET /api/partner/enrollments (Requires header: X-Partner-Key)',
        logs: 'GET /api/partner/logs'
      },
      box_3_webhook_receiver: 'POST /api/webhooks/incoming (Requires header: X-Webhook-Secret)',
      box_4_webhook_sender: 'Dispatched automatically on POST /api/enrollments',
      box_5_idempotency: 'Supported on POST /api/enrollments via header Idempotency-Key',
      box_6_degradation: 'Triggered via GET /api/external/check-eligibility?simulate_breakage=true'
    }
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount Standard Platform Routes
app.route('/api/auth', authRoutes);
app.route('/api/courses', courseRoutes);
app.route('/api/sections', sectionRoutes);
app.route('/api/students', studentRoutes);
app.route('/api/seed', seedRoutes);
app.route('/api/enrollments', enrollmentRoutes);
app.route('/api/overrides', overrideRoutes);

// Direct root aliases to support exact PRD path requirements (e.g. POST /overrides)
app.route('/enrollments', enrollmentRoutes);
app.route('/sections', sectionRoutes);
app.route('/overrides', overrideRoutes);

// Mount A5 Inter-Group Integration Routes
app.route('/api/partner', partnerRoutes);
app.route('/api/webhooks', webhookRoutes);
app.route('/api/external', externalRoutes);
app.route('/api/mock-partner', mockPartnerRoutes);

// Global 404 Handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Endpoint not found',
    path: c.req.path
  }, 404);
});

// Global Error Handler
app.onError((err, c) => {
  console.error('Unhandled Server Error:', err);
  return c.json({
    success: false,
    error: err.message || 'Internal Server Error'
  }, 500);
});

export default app;
