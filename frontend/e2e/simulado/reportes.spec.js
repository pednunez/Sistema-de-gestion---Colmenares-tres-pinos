import { expect, test } from "@playwright/test";
import { irA, simularBackend } from "../apoyo";

test("descarga PDF, XLSX y CSV con filtros y omite período para colmenas", async ({ page, baseURL }) => {
  const responder = (peticion, _, archivo) => {
    const formato = peticion.params.formato;
    const tipos = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv" };
    return archivo(`archivo-simulado-${formato}`, tipos[formato], `reporte-prueba.${formato}`);
  };
  const llamadas = await simularBackend(page, { baseURL,
    usuario: { id: 1, nombre: "Prueba", rol: "ADMIN" },
    datos: { "/apiarios/": [{ id: 1, nombre: "Mandinga" }],
      "/colmenas/": [{ id: 1, apiario_id: 1, codigo: "COL-1", estado: "ACTIVA" }] },
    respuestas: { "GET /reportes/inspecciones": responder, "GET /reportes/colmenas": responder },
  });
  await page.goto("/"); await irA(page, "Reportes");
  await page.getByLabel("Desde", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Hasta", { exact: true }).fill("2026-11-17");
  await page.getByLabel("Apiario", { exact: true }).selectOption("1");
  await page.getByLabel("Colmena", { exact: true }).selectOption("1");
  for (const [nombre, formato] of [["PDF", "pdf"], ["Excel (XLSX)", "xlsx"], ["CSV", "csv"]]) {
    const pendiente = page.waitForEvent("download");
    await page.getByRole("button", { name: nombre, exact: true }).click();
    const descarga = await pendiente;
    expect(descarga.suggestedFilename()).toBe(`reporte-prueba.${formato}`);
    expect(await descarga.failure()).toBeNull();
    const stream = await descarga.createReadStream();
    const partes = [];
    for await (const parte of stream) partes.push(parte);
    expect(Buffer.concat(partes).toString()).toBe(`archivo-simulado-${formato}`);
    expect(llamadas.filter((l) => l.ruta === "/reportes/inspecciones").at(-1).params)
      .toEqual({ formato, apiario_id: "1", colmena_id: "1", desde: "2026-11-01", hasta: "2026-11-17" });
  }
  await page.getByRole("radio", { name: "Colmenas", exact: true }).click();
  const pendiente = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  await pendiente;
  expect(llamadas.filter((l) => l.ruta === "/reportes/colmenas").at(-1).params)
    .toEqual({ formato: "csv", apiario_id: "1", colmena_id: "1" });
});
