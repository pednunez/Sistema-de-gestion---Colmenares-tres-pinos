// S1-T06: el frontend muestra si el backend responde en /health.
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { montarApp, simularBackend } from "./apoyo";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const llamadasHealth = (llamadas) => llamadas.filter((l) => l.ruta === "/health");

test("la cabecera muestra servidor en línea cuando /health responde ok", async () => {
  const llamadas = simularBackend();
  await montarApp();
  expect(await screen.findByText("Servidor en línea")).toBeTruthy();
  expect(llamadasHealth(llamadas).length).toBeGreaterThan(0);
});

test("muestra servidor con problemas si /health responde con error", async () => {
  simularBackend({ respuestas: { "GET /health": (_, json) => json({ detail: "falla" }, 503) } });
  await montarApp();
  expect(await screen.findByText("Servidor con problemas")).toBeTruthy();
});

test("muestra sin conexión si /health no responde y se recupera al volver a verificar", async () => {
  let caido = true;
  simularBackend({
    respuestas: {
      "GET /health": (_, json) => {
        if (caido) throw new TypeError("Failed to fetch");
        return json({ status: "ok" });
      },
    },
  });
  await montarApp();
  const indicador = await screen.findByText("Sin conexión con el servidor");
  caido = false;
  fireEvent.click(indicador.closest("button"));
  expect(await screen.findByText("Servidor en línea")).toBeTruthy();
});

test("la falta de conexión en /health no llena el registro de errores", async () => {
  simularBackend({
    respuestas: { "GET /health": () => { throw new TypeError("Failed to fetch"); } },
  });
  const { erroresRegistrados } = await import("../../src/services/registroErrores.js");
  await montarApp();
  await screen.findByText("Sin conexión con el servidor");
  const { erroresRegistrados: actuales } = await import("../../src/services/registroErrores.js");
  expect((actuales ?? erroresRegistrados)().some((e) => e.endpoint === "/health")).toBe(false);
});

test("el login avisa cuando no hay conexión con el servidor", async () => {
  simularBackend({
    usuario: null,
    respuestas: { "GET /health": () => { throw new TypeError("Failed to fetch"); } },
  });
  await montarApp();
  expect(await screen.findByText(/No hay conexión con el servidor/)).toBeTruthy();
});

test("vuelve a consultar /health cada minuto", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const llamadas = simularBackend();
  await montarApp();
  await screen.findByText("Servidor en línea");
  const antes = llamadasHealth(llamadas).length;
  await act(async () => {
    vi.advanceTimersByTime(60_000);
  });
  await waitFor(() => expect(llamadasHealth(llamadas).length).toBeGreaterThan(antes));
});
