import { beforeEach } from 'vitest';
import { env } from 'cloudflare:test';

beforeEach(async () => {
  const tables = [
    'webhook_outbox',
    'partner_request_logs',
    'webhook_logs',
    'idempotency_keys',
    'overrides',
    'rule_decisions',
    'student_course_history',
    'course_prerequisites',
    'enrollments',
    'students',
    'sections',
    'courses',
  ];
  await env.DB.batch(tables.map((table) => env.DB.prepare(`DROP TABLE IF EXISTS ${table}`)));
  const statements = JSON.parse(env.TEST_SCHEMA_STATEMENTS) as string[];
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
});
