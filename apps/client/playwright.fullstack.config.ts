import { defineConfig } from '@playwright/test';

const mongoUrl = process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017/trading-fullstack-test';
const secret = process.env.JWT_SECRET ?? 'fullstack-only-jwt-secret';
const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const trading = { TRADING_MODE: 'paper', TRADING_KILL_SWITCH: 'false', MAX_ORDER_QUANTITY: '10', MAX_ORDER_NOTIONAL: '1000000' };

export default defineConfig({
  testDir: './e2e/fullstack',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium' },
  webServer: [
    { command: 'bun index.ts', cwd: '../backend', url: 'http://127.0.0.1:3000/readyz', env: { MONGO_URL: mongoUrl, JWT_SECRET: secret, CREDENTIAL_ENCRYPTION_KEY: encryptionKey, CLIENT_URL: 'http://127.0.0.1:4173', ...trading }, reuseExistingServer: false },
    { command: 'bun index.ts', cwd: '../executor', url: 'http://127.0.0.1:3001/readyz', env: { MONGO_URL: mongoUrl, CREDENTIAL_ENCRYPTION_KEY: encryptionKey, ...trading }, reuseExistingServer: false },
    { command: 'bun run dev --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
  ],
});
