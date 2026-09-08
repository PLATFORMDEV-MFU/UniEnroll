import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { Bindings } from './types';
import { enrollmentRoutes } from './routes/enrollments';
import { courseRoutes } from './routes/courses';
import { sectionRoutes } from './routes/sections';
import { studentRoutes } from './routes/students';
import { seedRoutes } from './routes/seed';

const app = new Hono<{ Bindings: Bindings }>();

// Global Middlewares
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key']
}));

// Root Information & Health Check
app.get('/', (c) => {
  return c.json({
    project: 'UniEnroll API',
    description: 'Course Enrollment Platform REST API deployed on Cloudflare Workers & D1',
    status: 'online',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      enrollments: {
        create: 'POST /api/enrollments',
        readAll: 'GET /api/enrollments',
        readOne: 'GET /api/enrollments/:id',
        update: 'PATCH /api/enrollments/:id',
        delete: 'DELETE /api/enrollments/:id'
      },
      supporting_resources: {
        courses: 'GET /api/courses',
        sections: 'GET /api/sections',
        students: 'GET /api/students',
        seed: 'POST /api/seed'
      }
    }
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount Routes
app.route('/api/enrollments', enrollmentRoutes);
app.route('/api/courses', courseRoutes);
app.route('/api/sections', sectionRoutes);
app.route('/api/students', studentRoutes);
app.route('/api/seed', seedRoutes);

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
