import { readFileSync } from 'node:fs';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const schemaStatements = readFileSync('./src/backend/db/schema.sql', 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/^\s*--.*$/gm, '')
  // Keep CREATE TRIGGER bodies together; their internal statements contain
  // semicolons and must be prepared as one SQLite statement.
  .split(/;\s*(?=CREATE\b)/i)
  .map((statement) => statement.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.test.jsonc' },
      miniflare: {
        bindings: {
          TEST_SCHEMA_STATEMENTS: JSON.stringify(schemaStatements),
          AI_EXPLANATIONS_ENABLED: 'false',
          JWT_SECRET: 'unienroll-test-secret-not-for-production-2026',
          PARTNER_WEBHOOK_URL: '',
          WEBHOOK_SIGNING_SECRET: '',
          PARTNER_API_KEY: 'test-partner-key',
          INCOMING_WEBHOOK_SECRET: 'test-incoming-webhook-secret',
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./tests/setup.ts'],
    silent: true,
  },
});
