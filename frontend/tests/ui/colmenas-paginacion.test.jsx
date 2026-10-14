import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";

let llamadas;
const colmenas = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1, apiario_id: i < 22 ? 1 : 2, codigo: `COL-${String(i + 1).padStart(3, "0")}`, estado: i === 3 ? "EN_OBSERVACION" : "ACTIVA",
}));

beforeEach(() => {
  llamadas = [];
  window.scrollTo = () => {};
  window.history.replaceState(null, "", "/");
  globalThis.fetch = vi.fn(async (url) => {
    const u = new URL(url);
    llamadas.push({ ruta: u.pathname, params: Object.fromEntries(u.searchParams) });
    const json = (c) => new Response(JSON.stringify(c), { status: 200 });
    if (u.pathname === "/auth/me") return json({ id: 1, nombre: "Carlos", email: "c@tp.cl", rol: "ADMIN" });
    if (u.pathname === "/auth/csrf") return json({ csrf_token: "t" });
    if (u.pathname === "/apiarios/") return json([{ id: 1, nombre: "Mandinga" }, { id: 2, nombre: "Popeta" }]);
    if (u.pathname === "/colmenas/") {
      let lista = colmenas;
      if (u.searchParams.get("apiario_id")) lista = lista.filter((c) => String(c.apiario_id) === u.searchParams.get("apiario_id"));
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = u.searchParams.get("limit") ? Number(u.searchParams.get("limit")) : lista.length;
      return json(lista.slice(offset, offset + limit));
    }
    return json([]);
  });
});
afterEach(cleanup);

async function abrirColmenas() {
  vi.resetModules();
  const { default: App } = await import("../../src/App");
  render(<App />);
  const nav = (await screen.findAllByRole("navigation"))[0];
  fireEvent.click(within(nav).getByText("Colmenas"));
  await screen.findByText("COL-001");
}
const filas = () => screen.getAllByRole("row").length - 1;
const paginas = () => llamadas.filter((l) => l.ruta === "/colmenas/" && l.params.limit);

it("usa la paginación del backend de 20 en 20", async () => {
  await abrirColmenas();
  expect(filas()).toBe(20);
  expect(paginas().at(-1).params).toEqual({ offset: "0", limit: "21" });
  screen.getByText("Página 1");
  fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
  await screen.findByText("COL-021");
  expect(paginas().at(-1).params).toEqual({ offset: "20", limit: "21" });
  expect(filas()).toBe(5);
  expect(screen.getByRole("button", { name: /Siguiente/ }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Anterior/ }));
  await screen.findByText("COL-001");
});

it("filtra por apiario en el backend y vuelve a la página 1", async () => {
  await abrirColmenas();
  fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
  await screen.findByText("COL-021");
  fireEvent.change(screen.getByLabelText("Filtrar por apiario"), { target: { value: "2" } });
  await screen.findByText("COL-023");
  expect(paginas().at(-1).params).toEqual({ offset: "0", limit: "21", apiario_id: "2" });
  expect(filas()).toBe(3);
  expect(screen.queryByRole("navigation", { name: "Paginación" })).toBeNull();
});

it("con búsqueda o estado pagina sobre la lista cargada", async () => {
  await abrirColmenas();
  fireEvent.change(screen.getByLabelText("Buscar colmena por código"), { target: { value: "COL-0" } });
  await screen.findByText("Página 1 de 2");
  expect(filas()).toBe(20);
  fireEvent.change(screen.getByLabelText("Filtrar por estado"), { target: { value: "EN_OBSERVACION" } });
  await waitFor(() => expect(filas()).toBe(1));
  screen.getByText("COL-004");
});
