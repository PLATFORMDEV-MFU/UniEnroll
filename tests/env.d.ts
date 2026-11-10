declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      TEST_SCHEMA_STATEMENTS: string;
      AI_EXPLANATIONS_ENABLED: string;
      JWT_SECRET: string;
      PARTNER_WEBHOOK_URL: string;
      WEBHOOK_SIGNING_SECRET: string;
      PARTNER_API_KEY: string;
      INCOMING_WEBHOOK_SECRET: string;
    }
  }
}

export {};
