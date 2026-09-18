import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { AppEnv } from './types';
import { authRoutes } from './routes/auth';
import { enrollmentRoutes } from './routes/enrollments';
import { courseRoutes } from './routes/courses';
import { sectionRoutes } from './routes/sections';
import { studentRoutes } from './routes/students';
import { seedRoutes } from './routes/seed';

const app = new Hono<AppEnv>();

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
      auth: {
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me'
      },
      enrollments: {
        create: 'POST /api/enrollments (Authenticated)',
        readAll: 'GET /api/enrollments (Authenticated)',
        readOne: 'GET /api/enrollments/:id (Authenticated)',
        update: 'PATCH /api/enrollments/:id (Authenticated)',
        delete: 'DELETE /api/enrollments/:id (Authenticated)'
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
app.route('/api/auth', authRoutes);
app.route('/api/courses', courseRoutes);
app.route('/api/sections', sectionRoutes);
app.route('/api/students', studentRoutes);
app.route('/api/seed', seedRoutes);
app.route('/api/enrollments', enrollmentRoutes);

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
