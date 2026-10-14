// S1-T26: pruebas básicas de los formularios de usuarios, apiarios y colmenas.
import { it, expect, afterEach } from "vitest";
import { screen, within, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { simularBackend, montarApp, irA } from "./apoyo";

afterEach(cleanup);

const datos = {
  "/apiarios/": [{ id: 1, nombre: "Mandinga" }],
  "/colmenas/": [{ id: 1, apiario_id: 1, codigo: "COL-001", estado: "ACTIVA" }],
  "/usuarios/": [{ id: 1, nombre: "Carlos", apellido: null, email: "carlos@tp.cl", rol: "ADMIN" }],
};
const escribir = (d, etiqueta, valor) => fireEvent.change(within(d).getByLabelText(etiqueta), { target: { value: valor } });
const posts = (llamadas, ruta) => llamadas.filter((l) => l.metodo === "POST" && l.ruta === ruta);

it("apiario: exige nombre y envía los datos limpios", async () => {
  const llamadas = simularBackend({ datos });
  await montarApp();
  await irA("Apiarios");
  fireEvent.click(await screen.findByRole("button", { name: "Nuevo apiario" }));
  const d = screen.getByRole("dialog");
  fireEvent.click(within(d).getByRole("button", { name: "Registrar apiario" }));
  await within(d).findByText("Ingresa un nombre de al menos 2 caracteres.");
  expect(posts(llamadas, "/apiarios/")).toHaveLength(0);

  escribir(d, /Nombre/, "  Popeta Norte ");
  escribir(d, "Ubicación", "   ");
  fireEvent.click(within(d).getByRole("button", { name: "Registrar apiario" }));
  await screen.findByText("Apiario registrado.");
  expect(posts(llamadas, "/apiarios/")[0].cuerpo).toEqual({ nombre: "Popeta Norte", ubicacion: null, descripcion: null });
});

it("colmena: valida apiario, código y duplicados antes de enviar", async () => {
  const llamadas = simularBackend({ datos });
  await montarApp();
  await irA("Colmenas");
  fireEvent.click(await screen.findByRole("button", { name: "Nueva colmena" }));
  const d = screen.getByRole("dialog");
  fireEvent.click(within(d).getByRole("button", { name: "Registrar colmena" }));
  await within(d).findByText("Selecciona el apiario donde está la colmena.");
  within(d).getByText("Ingresa el código de la colmena.");

  escribir(d, /Apiario/, "1");
  escribir(d, /Código/, "col-001");
  fireEvent.click(within(d).getByRole("button", { name: "Registrar colmena" }));
  await within(d).findByText("Ya existe una colmena con ese código.");
  expect(posts(llamadas, "/colmenas/")).toHaveLength(0);

  escribir(d, /Código/, "col-002");
  fireEvent.click(within(d).getByRole("button", { name: "Registrar colmena" }));
  await screen.findByText("Colmena COL-002 registrada.");
  expect(posts(llamadas, "/colmenas/")[0].cuerpo).toMatchObject({ apiario_id: 1, codigo: "COL-002", estado: "ACTIVA" });
});

it("colmena: muestra el error del backend sin cerrar el formulario", async () => {
  simularBackend({
    datos,
    respuestas: {
      "POST /colmenas/": (_l, json) => json({ detail: "El apiario indicado no existe o está inactivo" }, 422),
    },
  });
  await montarApp();
  await irA("Colmenas");
  fireEvent.click(await screen.findByRole("button", { name: "Nueva colmena" }));
  const d = screen.getByRole("dialog");
  escribir(d, /Apiario/, "1");
  escribir(d, /Código/, "COL-050");
  fireEvent.click(within(d).getByRole("button", { name: "Registrar colmena" }));
  await within(d).findByText("El apiario indicado no existe o está inactivo");
  expect(within(d).getByLabelText(/Código/).value).toBe("COL-050");
});

it("usuario: valida correo y contraseñas, y crea la cuenta", async () => {
  const llamadas = simularBackend({ datos });
  await montarApp();
  await irA("Usuarios");
  fireEvent.click(await screen.findByRole("button", { name: "Nuevo usuario" }));
  const d = screen.getByRole("dialog");
  escribir(d, /^Nombre/, "Ana");
  escribir(d, /Correo electrónico/, "ana@");
  escribir(d, /Contraseña inicial/, "corta");
  escribir(d, /Repetir contraseña/, "otra");
  fireEvent.click(within(d).getByRole("button", { name: "Crear usuario" }));
  await within(d).findByText(/Ingresa un correo válido/);
  within(d).getByText("La contraseña debe tener al menos 8 caracteres.");
  within(d).getByText("Las contraseñas no coinciden.");

  escribir(d, /Correo electrónico/, "Carlos@TP.cl");
  fireEvent.click(within(d).getByRole("button", { name: "Crear usuario" }));
  await within(d).findByText("Ya existe un usuario con ese correo.");

  escribir(d, /Correo electrónico/, " Ana@TP.cl ");
  escribir(d, /Contraseña inicial/, "Segura2026");
  escribir(d, /Repetir contraseña/, "Segura2026");
  fireEvent.click(within(d).getByRole("button", { name: "Crear usuario" }));
  await waitFor(() => expect(posts(llamadas, "/usuarios/")).toHaveLength(1));
  expect(posts(llamadas, "/usuarios/")[0].cuerpo).toEqual({
    nombre: "Ana", apellido: null, email: "ana@tp.cl", rol: "APICULTOR", password: "Segura2026" });
});
