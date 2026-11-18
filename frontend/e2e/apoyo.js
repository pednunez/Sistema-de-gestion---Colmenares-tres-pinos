// Apoyo para las pruebas E2E.
import { expect } from "@playwright/test";

// Backend falso: responde toda petición que no sea del propio frontend (la API
// está en otro puerto) y guarda cada llamada para revisar qué se envió.
export async function simularBackend(page, { baseURL, usuario, datos = {}, respuestas = {} }) {
  const llamadas = [];
  const origenApp = new URL(baseURL).origin;
  await page.route(
    (url) => url.origin !== origenApp && /^https?:$/.test(url.protocol),
    async (route) => {
      const pedido = route.request();
      const u = new URL(pedido.url());
      const metodo = pedido.method();
      const cuerpo = pedido.postData() ? JSON.parse(pedido.postData()) : null;
      llamadas.push({ ruta: u.pathname, metodo, cuerpo, params: Object.fromEntries(u.searchParams) });
      const cabeceras = {
        "access-control-allow-origin": origenApp,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "content-type, x-csrf-token, x-correlation-id",
        "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      };
      const json = (body, status = 200) =>
        route.fulfill({ status, headers: cabeceras, contentType: "application/json", body: JSON.stringify(body) });
      if (metodo === "OPTIONS") return route.fulfill({ status: 204, headers: cabeceras });
      const clave = `${metodo} ${u.pathname}`;
      const archivo = (body, contentType, filename) => route.fulfill({ status: 200,
        headers: { ...cabeceras, "access-control-expose-headers": "Content-Disposition",
          "content-disposition": `attachment; filename="${filename}"` }, contentType, body });
      if (respuestas[clave]) return respuestas[clave](llamadas.at(-1), json, archivo);
      if (u.pathname === "/auth/me") return json(usuario);
      if (u.pathname === "/auth/csrf") return json({ csrf_token: "csrf-e2e" });
      if (u.pathname === "/health") return json({ status: "ok" });
      if (metodo === "GET") return json(datos[u.pathname] ?? []);
      return json({ id: 99 }, metodo === "POST" ? 201 : 200);
    }
  );
  return llamadas;
}

// Errores de JavaScript de la página: una prueba sana no debería tener ninguno.
export function registrarErrores(page) {
  const errores = [];
  page.on("pageerror", (error) => errores.push(error.message));
  return errores;
}

export async function irA(page, seccion) {
  await page.getByRole("navigation").first().getByText(seccion, { exact: true }).click();
}

export async function cerrarDialogo(page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
