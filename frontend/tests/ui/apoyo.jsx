// Backend simulado para las pruebas de interfaz: responde según la ruta y
// guarda cada llamada para revisar qué envió el frontend.
import { vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

export const ADMIN = { id: 1, nombre: "Carlos", email: "carlos@tp.cl", rol: "ADMIN" };
export const APICULTOR = { id: 7, nombre: "Ana", email: "ana@tp.cl", rol: "APICULTOR" };

export function simularBackend({ usuario = ADMIN, datos = {}, respuestas = {} } = {}) {
  const llamadas = [];
  globalThis.fetch = vi.fn(async (url, opciones = {}) => {
    const u = new URL(url);
    const llamada = {
      ruta: u.pathname,
      metodo: opciones.method ?? "GET",
      cuerpo: opciones.body ? JSON.parse(opciones.body) : null,
      headers: opciones.headers ?? {},
      params: Object.fromEntries(u.searchParams),
    };
    llamadas.push(llamada);
    const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status });
    const clave = `${llamada.metodo} ${llamada.ruta}`;
    if (respuestas[clave]) return respuestas[clave](llamada, json);
    if (u.pathname === "/auth/me") return usuario ? json(usuario) : json({ detail: "Sesion invalida" }, 401);
    if (u.pathname === "/auth/csrf") return json({ csrf_token: "csrf-prueba" });
    if (u.pathname === "/health") return json({ status: "ok" });
    if (llamada.metodo === "GET") return json(datos[u.pathname] ?? []);
    return json({ id: 99 }, llamada.metodo === "POST" ? 201 : 200);
  });
  return llamadas;
}

export async function montarApp() {
  window.scrollTo = () => {};
  window.history.replaceState(null, "", "/");
  vi.resetModules();
  const { default: App } = await import("../../src/App");
  render(<App />);
}

export async function irA(seccion) {
  const nav = (await screen.findAllByRole("navigation"))[0];
  fireEvent.click(within(nav).getByText(seccion));
}
