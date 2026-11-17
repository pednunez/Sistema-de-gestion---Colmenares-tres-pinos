// E2E simulado: inspección con transferencia de un marco a otra colmena.
// El backend es falso, así que no se crea nada en la base de datos.
import { expect, test } from "@playwright/test";
import { irA, registrarErrores, simularBackend } from "../apoyo";

const APICULTOR = { id: 7, nombre: "Ana", email: "ana@prueba.cl", rol: "APICULTOR" };
const col = (id) => ({ id, apiario_id: 1, codigo: `PRUEBA-00${id}`, estado: "ACTIVA", cantidad_marcos: 10 });
const piso = (contenidos) => contenidos.map((contenido, i) => ({ numero: i + 1, contenido }));
const LLENA = piso(["SOLO_CRIA", "SOLO_CRIA", "SOLO_CRIA", "SOLO_CRIA", "MIEL_Y_CRIA", "SOLO_MIEL", "SOLO_MIEL", "CERA_ESTIRADA", "CERA_UNTADA", "SOLO_MIEL"]);

const datos = {
  "/apiarios/": [{ id: 1, nombre: "Apiario PRUEBA" }],
  "/colmenas/": [col(1), col(2), col(3)],
};

async function abrirFormulario(page) {
  await page.goto("/");
  await irA(page, "Inspecciones");
  await page.getByRole("button", { name: "Registrar inspección" }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel(/^Apiario/).selectOption("1");
  await d.getByLabel(/^Colmena/).selectOption("1");
  await d.getByRole("radio", { name: "Completa" }).click();
  await d.getByLabel("Completar los marcos sin registrar de Cámara de cría").selectOption("SOLO_CRIA");
  return d;
}

test("registra una inspección que transfiere un marco a una colmena con espacio", async ({ page, baseURL }) => {
  const errores = registrarErrores(page);
  const llamadas = await simularBackend(page, {
    baseURL,
    usuario: APICULTOR,
    datos,
    respuestas: {
      "GET /colmenas/2/marcos": (_, json) =>
        json({ colmena_id: 2, camara_cria: piso(["SOLO_CRIA", "SOLO_MIEL", "SOLO_CRIA", ...Array(7).fill("SIN_MARCO")]), alza: null }),
      "POST /inspecciones/": (_, json) => json({ id: 50 }, 201),
    },
  });

  const d = await abrirFormulario(page);
  await d.getByRole("button", { name: "Transferir el marco 1 de Cámara de cría" }).click();
  await d.getByLabel("Colmena de destino del marco 1 de Cámara de cría").selectOption("2");
  await expect(d.getByText("Cámara de cría de PRUEBA-002: 3 de 10 marcos. Hay espacio.")).toBeVisible();

  await d.getByRole("button", { name: "Registrar inspección" }).last().click();
  await expect(page.getByText("Inspección de PRUEBA-001 registrada con 1 transferencia.")).toBeVisible();

  const post = llamadas.find((l) => l.metodo === "POST" && l.ruta === "/inspecciones/");
  expect(post.cuerpo).toMatchObject({ colmena_id: 1, estado_general: "COMPLETA" });
  expect(post.cuerpo.marcos).toHaveLength(10);
  expect(post.cuerpo.marcos[0]).toMatchObject({
    numero: 1,
    contenido: "SOLO_CRIA",
    transferido_a_colmena_id: 2,
    ubicacion_destino: "CAMARA_CRIA",
    marco_desplazado_numero: null,
    retirar_a_bodega: false,
  });
  expect(errores).toEqual([]);
});

test("si el destino está lleno, pide el marco que sale y lo envía", async ({ page, baseURL }) => {
  const llamadas = await simularBackend(page, {
    baseURL,
    usuario: APICULTOR,
    datos,
    respuestas: {
      "GET /colmenas/2/marcos": (_, json) => json({ colmena_id: 2, camara_cria: LLENA, alza: null }),
      "POST /inspecciones/": (_, json) => json({ id: 51 }, 201),
    },
  });

  const d = await abrirFormulario(page);
  await d.getByRole("button", { name: "Transferir el marco 4 de Cámara de cría" }).click();
  await d.getByLabel("Colmena de destino del marco 4 de Cámara de cría").selectOption("2");
  await expect(d.getByText(/Cámara de cría de PRUEBA-002: 10 de 10 marcos\. Está llena/)).toBeVisible();

  // Sin elegir el marco que sale, no deja guardar.
  await d.getByRole("button", { name: "Registrar inspección" }).last().click();
  await expect(d.getByText(/PRUEBA-002 tiene la cámara de cría llena: elige qué marco sale/)).toBeVisible();
  expect(llamadas.some((l) => l.metodo === "POST")).toBe(false);

  await d.getByLabel("Marco que sale de PRUEBA-002 para recibir el marco 4 de Cámara de cría").selectOption("6");
  await d.getByRole("button", { name: "Registrar inspección" }).last().click();
  await expect(page.getByText("Inspección de PRUEBA-001 registrada con 1 transferencia.")).toBeVisible();
  const post = llamadas.find((l) => l.metodo === "POST" && l.ruta === "/inspecciones/");
  expect(post.cuerpo.marcos[3]).toMatchObject({ transferido_a_colmena_id: 2, marco_desplazado_numero: 6 });
});

test("no deja transferir a una colmena sin marcos registrados", async ({ page, baseURL }) => {
  const llamadas = await simularBackend(page, {
    baseURL,
    usuario: APICULTOR,
    datos,
    respuestas: { "GET /colmenas/3/marcos": (_, json) => json({ colmena_id: 3, camara_cria: null, alza: null }) },
  });
  const d = await abrirFormulario(page);
  await d.getByRole("button", { name: "Transferir el marco 1 de Cámara de cría" }).click();
  await d.getByLabel("Colmena de destino del marco 1 de Cámara de cría").selectOption("3");
  await expect(d.getByText(/PRUEBA-003 todavía no tiene sus marcos registrados\. Inspecciónala primero/)).toBeVisible();
  await d.getByRole("button", { name: "Registrar inspección" }).last().click();
  await expect(d.getByText(/inspecciónala primero para poder transferirle el marco 1/)).toBeVisible();
  expect(llamadas.some((l) => l.metodo === "POST")).toBe(false);
});
