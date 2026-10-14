import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";

let llamadas, sesion, respuestas;
const usuario = { id: 1, nombre: "Carlos", email: "c@tp.cl", rol: "ADMIN" };

async function montar() {
  vi.resetModules();
  const { default: App } = await import("../../src/App");
  render(<App />);
}

beforeEach(() => {
  llamadas = []; sesion = false; respuestas = {};
  window.scrollTo = () => {};
  window.history.replaceState(null, "", "/");
  globalThis.fetch = vi.fn(async (url, o = {}) => {
    const ruta = new URL(url).pathname;
    const l = { ruta, metodo: o.method, cuerpo: o.body ? JSON.parse(o.body) : null, headers: o.headers, credentials: o.credentials };
    llamadas.push(l);
    const json = (c, s = 200) => new Response(JSON.stringify(c), { status: s });
    if (respuestas[ruta]) return respuestas[ruta](l);
    if (ruta === "/auth/login") {
      if (l.cuerpo.password !== "correcta1") return json({ detail: "Correo o contraseña incorrectos" }, 401);
      sesion = true; return json({ usuario, csrf_token: "csrf-login" });
    }
    if (!sesion) return json({ detail: "Sesion invalida o expirada" }, 401);
    if (o.method !== "GET" && l.headers["X-CSRF-Token"] !== "csrf-login" && l.headers["X-CSRF-Token"] !== "csrf-recarga")
      return json({ detail: "Token CSRF invalido" }, 403);
    if (ruta === "/auth/me") return json(usuario);
    if (ruta === "/auth/csrf") return json({ csrf_token: "csrf-recarga" });
    if (ruta === "/auth/logout") { sesion = false; return json({ mensaje: "ok" }); }
    if (o.method === "POST") return json({ id: 9, nombre: "Nuevo" }, 201);
    return json([]);
  });
});
afterEach(cleanup);

const escribir = (etiqueta, valor) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

it("login por cookie: sin token en almacenamiento, con credentials y CSRF en los POST", async () => {
  await montar();
  await screen.findByRole("heading", { name: "Iniciar sesión" });
  expect(screen.queryByText(/Mantener sesión/)).toBeNull();

  escribir("Correo electrónico", "c@tp.cl"); escribir("Contraseña", "incorrecta");
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  await screen.findByText("Correo o contraseña incorrectos.");

  escribir("Contraseña", "correcta1");
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  await screen.findByText("Colmenas que requieren atención");
  expect(localStorage.getItem("access_token")).toBeNull();
  expect(llamadas.every((l) => l.credentials === "include")).toBe(true);
  expect(llamadas.some((l) => l.headers?.Authorization)).toBe(false);

  const nav = screen.getAllByRole("navigation")[0];
  fireEvent.click(within(nav).getByText("Apiarios"));
  fireEvent.click(await screen.findByRole("button", { name: "Nuevo apiario" }));
  escribir(/Nombre/, "Popeta 2");
  fireEvent.click(screen.getByRole("button", { name: "Registrar apiario" }));
  await waitFor(() => expect(llamadas.find((l) => l.ruta === "/apiarios/" && l.metodo === "POST")).toBeTruthy());
  expect(llamadas.find((l) => l.ruta === "/apiarios/" && l.metodo === "POST").headers["X-CSRF-Token"]).toBe("csrf-login");

  fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  await screen.findByRole("heading", { name: "Iniciar sesión" });
  const salida = llamadas.find((l) => l.ruta === "/auth/logout");
  expect(salida.metodo).toBe("POST");
  expect(salida.headers["X-CSRF-Token"]).toBe("csrf-login");
});

it("al recargar sigue conectado y recupera el CSRF; si la sesión vence vuelve al login", async () => {
  sesion = true;
  await montar();
  await screen.findByText("Colmenas que requieren atención");
  expect(llamadas.map((l) => l.ruta).slice(0, 2)).toEqual(["/auth/me", "/auth/csrf"]);
  sesion = false;
  fireEvent.click(screen.getByRole("button", { name: /Actualizar/ }));
  await screen.findByText("Tu sesión expiró. Vuelve a iniciar sesión.");
});

it("si el logout falla, la sesión sigue abierta y se avisa", async () => {
  sesion = true;
  await montar();
  await screen.findByText("Colmenas que requieren atención");
  globalThis.fetch.mockImplementationOnce(async () => { throw new TypeError("red"); });
  fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  await screen.findByText(/No se pudo cerrar la sesión/);
  expect(screen.queryByRole("heading", { name: "Iniciar sesión" })).toBeNull();
});

it("renueva el CSRF y reintenta una vez si el backend lo rechaza", async () => {
  sesion = true;
  await montar();
  await screen.findByText("Colmenas que requieren atención");
  const { api, establecerSesion } = await import("../../src/services/api");
  establecerSesion(true, "viejo");
  await api.post("/apiarios/", { nombre: "X" });
  const posts = llamadas.filter((l) => l.ruta === "/apiarios/" && l.metodo === "POST");
  expect(posts.map((l) => l.headers["X-CSRF-Token"])).toEqual(["viejo", "csrf-recarga"]);
});

it("recuperar contraseña: pide el correo y muestra el mensaje genérico", async () => {
  respuestas["/auth/recuperar-password"] = () => new Response(JSON.stringify({ mensaje: "ok" }), { status: 200 });
  await montar();
  fireEvent.click(await screen.findByRole("button", { name: "¿Olvidaste tu contraseña?" }));
  fireEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));
  await screen.findByText(/Ingresa un correo electrónico válido/);
  escribir("Correo electrónico", " Ana@TP.cl ");
  fireEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));
  await screen.findByRole("heading", { name: "Revisa tu correo" });
  expect(llamadas.find((l) => l.ruta === "/auth/recuperar-password").cuerpo).toEqual({ email: "ana@tp.cl" });
  fireEvent.click(screen.getByRole("button", { name: "Volver a iniciar sesión" }));
  await screen.findByRole("heading", { name: "Iniciar sesión" });
});

it("restablecer: valida, envía el token del enlace y vuelve al login", async () => {
  respuestas["/auth/restablecer-password"] = () => new Response(JSON.stringify({ mensaje: "ok" }), { status: 200 });
  window.history.replaceState(null, "", "/restablecer-password?token=abc%2Bdefghijklmnopqrstuvwx");
  await montar();
  await screen.findByRole("heading", { name: "Crear contraseña nueva" });
  escribir("Contraseña nueva", "corta");
  fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
  await screen.findByText(/al menos 8 caracteres/);
  escribir("Contraseña nueva", "NuevaClave1"); escribir("Repetir contraseña", "OtraClave1");
  fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
  await screen.findByText("Las contraseñas no coinciden.");
  escribir("Repetir contraseña", "NuevaClave1");
  fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
  await screen.findByText("Contraseña actualizada. Ingresa con tu contraseña nueva.");
  expect(llamadas.find((l) => l.ruta === "/auth/restablecer-password").cuerpo).toEqual({
    token: "abc+defghijklmnopqrstuvwx", nueva_password: "NuevaClave1", confirmar_password: "NuevaClave1" });
  expect(window.location.pathname + window.location.search).toBe("/");
});

it("restablecer: enlace vencido o sin token ofrece pedir otro", async () => {
  respuestas["/auth/restablecer-password"] = () =>
    new Response(JSON.stringify({ detail: "El enlace de recuperación es inválido o ha expirado" }), { status: 400 });
  window.history.replaceState(null, "", "/restablecer-password?token=abcdefghijklmnopqrstuvwx");
  await montar();
  escribir("Contraseña nueva", "NuevaClave1"); escribir("Repetir contraseña", "NuevaClave1");
  fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
  await screen.findByRole("heading", { name: "Este enlace ya no sirve" });
  fireEvent.click(screen.getByRole("button", { name: "Solicitar un enlace nuevo" }));
  await screen.findByRole("heading", { name: "Recuperar contraseña" });
  cleanup();
  window.history.replaceState(null, "", "/restablecer-password");
  await montar();
  await screen.findByRole("heading", { name: "Este enlace ya no sirve" });
});
