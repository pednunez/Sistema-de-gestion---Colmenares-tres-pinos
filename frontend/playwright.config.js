// Pruebas E2E con Playwright (S4-T18 y S5-T04).
//
//   npm.cmd run test:e2e        corre todo sin mostrar el navegador
//   npm.cmd run test:e2e:ver    abre el navegador y muestra cada paso
//
// - Proyecto "simulado": la inspección con transferencia, con un backend falso
//   dentro de la prueba. No crea nada en la base de datos.
// - Proyecto "real": login, Dashboard, alertas, Por revisar y Reportes contra el
//   backend que esté corriendo. Solo lee. Necesita un usuario administrador en
//   las variables E2E_CORREO y E2E_CLAVE (no se guardan en el repositorio).
//
// En Windows usa Brave si está instalado. E2E_NAVEGADOR permite la ruta de otro
// navegador basado en Chromium, o "chromium" para el de Playwright (requiere
// npx playwright install chromium). E2E_LENTO=500 pausa medio segundo por acción.
import fs from "node:fs";
import { defineConfig } from "@playwright/test";

const BRAVE_WINDOWS = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const elegido = process.env.E2E_NAVEGADOR;
const navegador =
  elegido === "chromium" ? undefined : elegido || (fs.existsSync(BRAVE_WINDOWS) ? BRAVE_WINDOWS : undefined);
const URL_APP = process.env.E2E_URL || "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: URL_APP,
    locale: "es-CL",
    timezoneId: "America/Santiago",
    viewport: { width: 1366, height: 860 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { executablePath: navegador, slowMo: Number(process.env.E2E_LENTO || 0) },
  },
  projects: [
    { name: "simulado", testDir: "./e2e/simulado" },
    { name: "real", testDir: "./e2e/real" },
  ],
  // Si el frontend ya está corriendo (npm.cmd run dev), lo usa; si no, lo levanta.
  webServer: { command: "npm run dev", url: URL_APP, reuseExistingServer: true, timeout: 120_000 },
});
