import { defineConfig, devices } from "@playwright/test";
import { FAKE } from "./tests/e2e/fakes";

const PORT = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "on-first-retry" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: {
    command: process.env.CI ? `pnpm start --port ${PORT}` : `pnpm dev --port ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    // SM y Mercado Pago falsos (tests/e2e/fakes.ts). Nunca credenciales reales en el e2e.
    env: {
      SITE_URL: `http://localhost:${PORT}`,
      SM_API_KEY: FAKE.smKey,
      SM_API_BASE_URL: `http://127.0.0.1:${FAKE.smPort}`,
      MP_ACCESS_TOKEN: FAKE.mpToken,
      MP_API_BASE_URL: `http://127.0.0.1:${FAKE.mpPort}`,
      MP_WEBHOOK_SECRET: FAKE.mpSecret,
      TRANSFER_HOLDER: "Titular de Prueba",
      TRANSFER_CBU: "0000003100000000000001",
      TRANSFER_ALIAS: "tesera.prueba",
      WHATSAPP_NUMBER: "5492230000000",
    },
  },
});
