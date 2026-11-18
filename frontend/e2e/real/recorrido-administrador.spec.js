// E2E contra el backend real: recorrido del administrador.
// La descarga crea un evento de auditoría. Usar solo un entorno de pruebas autorizado.
// Necesita E2E_CORREO y E2E_CLAVE
// de un usuario ADMIN; sin ellas, estas pruebas se saltan.
import { expect, test } from "@playwright/test";
import { cerrarDialogo, irA, registrarErrores } from "../apoyo";

const CORREO = process.env.E2E_CORREO;
const CLAVE = process.env.E2E_CLAVE;

test.describe.configure({ mode: "serial" });
test.skip(!CORREO || !CLAVE, "Define E2E_CORREO y E2E_CLAVE de un administrador para probar contra el backend real.");

let page;
let errores;

test.beforeAll(async ({ browser, baseURL }) => {
  page = await browser.newPage({ baseURL });
  errores = registrarErrores(page);
});

test.afterAll(async () => {
  await page?.close();
});

test("login: inicia sesión y entra al Dashboard", async () => {
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill(CORREO);
  await page.getByLabel("Contraseña", { exact: true }).fill(CLAVE);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  await expect(page.getByRole("navigation").first().getByText("Dashboard", { exact: true })).toBeVisible();
  await expect(page.getByText("Colmenas que requieren atención")).toBeVisible();
  await expect(page.getByText("Servidor en línea")).toBeVisible();
});

test("Dashboard: filtra por apiario y por colmena", async () => {
  const apiarios = page.getByRole("radiogroup").first().getByRole("radio");
  if ((await apiarios.count()) > 1) await apiarios.nth(1).click();

  const colmena = page.getByLabel("Colmena", { exact: true });
  const opciones = await colmena.locator("option").count();
  test.skip(opciones < 2, "No hay colmenas en operación para probar el filtro por colmena.");
  const valor = await colmena.locator("option").nth(1).getAttribute("value");
  await colmena.selectOption(valor);
  await expect(page.getByText(/^Estado de .+ en sus inspecciones$/)).toBeVisible();
  await colmena.selectOption("");
  await expect(page.getByText("Estado según última inspección")).toBeVisible();
});

test("alerta: abre la colmena y la inspección que la originó", async () => {
  await irA(page, "Dashboard");
  const verColmena = page.getByRole("button", { name: /^Ver colmena / });
  if ((await verColmena.count()) === 0) {
    await expect(page.getByText(/está(n)? al día/)).toBeVisible();
    test.info().annotations.push({ type: "aviso", description: "No había alertas: se comprobó el mensaje de todo al día." });
    return;
  }
  await verColmena.first().click();
  await expect(page.getByRole("dialog", { name: /^Colmena / })).toBeVisible();
  await cerrarDialogo(page);

  const verInspeccion = page.getByRole("button", { name: /^Ver la inspección que originó la alerta de / });
  if ((await verInspeccion.count()) > 0) {
    await verInspeccion.first().click();
    await expect(page.getByRole("dialog", { name: /^Inspección de / })).toBeVisible();
    await cerrarDialogo(page);
  }
});

test("Por revisar: consulta el backend y cambia el período", async () => {
  const respuesta = page.waitForResponse((r) => r.url().includes("/colmenas/sin-revision"));
  await irA(page, "Por revisar");
  expect((await respuesta).status()).toBe(200);
  await expect(
    page.getByRole("table", { name: "Colmenas que requieren revisión" }).or(page.getByText("No hay colmenas por revisar"))
  ).toBeVisible();

  const otra = page.waitForResponse((r) => r.url().includes("/colmenas/sin-revision") && r.url().includes("dias=60"));
  await page.getByLabel("Sin inspección en los últimos").selectOption("60");
  expect((await otra).status()).toBe(200);
});

test("reporte: muestra la vista previa de cada reporte", async () => {
  await irA(page, "Reportes");
  await expect(page.getByText("Vista previa: Inspecciones")).toBeVisible();
  await expect(page.getByText(/\d+ filas?$/).first()).toBeVisible();

  await page.getByRole("radio", { name: "Tratamientos" }).click();
  await expect(page.getByText("Vista previa: Tratamientos")).toBeVisible();

  await page.getByRole("radio", { name: "Colmenas" }).click();
  await expect(page.getByText("Vista previa: Estado de las colmenas")).toBeVisible();
  await expect(page.getByLabel("Desde")).toHaveCount(0);

  // El backend genera y audita cada archivo.
  const descargas = page.getByRole("group", { name: "Descargar reporte" });
  for (const [nombre, extension] of [["PDF", "pdf"], ["Excel (XLSX)", "xlsx"], ["CSV", "csv"]]) {
    const pendiente = page.waitForEvent("download");
    await descargas.getByRole("button", { name: nombre }).click();
    const archivo = await pendiente;
    expect(archivo.suggestedFilename()).toBe(`reporte-colmenas.${extension}`);
    expect(await archivo.failure()).toBeNull();
  }
});

test("sin errores de JavaScript en todo el recorrido", async () => {
  expect(errores).toEqual([]);
});
