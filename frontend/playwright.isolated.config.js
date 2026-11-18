import { defineConfig } from "@playwright/test";
import config from "./playwright.config.js";

export default defineConfig({
  ...config,
  projects: [{ name: "simulado", testDir: "./e2e/simulado" }],
  use: { ...config.use, baseURL: "http://127.0.0.1:5179" },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --config vite.isolated.config.js",
    url: "http://127.0.0.1:5179", reuseExistingServer: false, timeout: 60000,
  },
});
