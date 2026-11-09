import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: [
    {
      command:
        "uv run uvicorn http_agent:app --app-dir examples --host 127.0.0.1 --port 9000",
      cwd: "../..",
      url: "http://127.0.0.1:9000/health",
      env: { PYTHONPATH: "backend/src" },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "uv run python scripts/preview_subpath.py",
      cwd: "../..",
      url: "http://127.0.0.1:4174/agentguard/",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run preview -- --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "uv run uvicorn agentguard.api:create_app --factory --app-dir backend/src --host 127.0.0.1 --port 8000",
      cwd: "../..",
      url: "http://127.0.0.1:8000/health",
      env: {
        DATABASE_URL: "sqlite:///playwright.db",
        AGENTGUARD_ALLOWED_ENDPOINTS:
          "http://127.0.0.1:9000/baseline,http://127.0.0.1:9000/candidate",
        AGENTGUARD_ALLOW_LOOPBACK: "1",
      },
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
      },
    },
  ],
});
