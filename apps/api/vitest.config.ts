import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@faircart/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/services/ai/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      MAX_UPLOAD_BYTES: '1024',
      DEMO_MODE: 'true',
      PAYPAL_CLIENT_ID: 'test-id',
      PAYPAL_CLIENT_SECRET: 'test-secret',
      PAYPAL_BASE_URL: 'https://api-m.sandbox.paypal.com',
      PAYPAL_WEBHOOK_ID: 'WH-TEST',
      FRONTEND_URL: 'http://localhost:5173',
    },
  },
});
