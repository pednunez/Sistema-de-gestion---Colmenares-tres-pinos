// Creación de colmenas en lote (carga inicial, S5-T11).
//
// El backend no tiene un endpoint de creación masiva: se llama a
// POST /colmenas/ una vez por colmena, con unas pocas peticiones a la vez. Cada
// colmena pasa por las mismas validaciones y queda en la auditoría.

export const MAXIMO_POR_LOTE = 500;
export const MARCOS_POR_DEFECTO = 10;
const CONCURRENCIA = 4;

const sinTildes = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Tres primeras letras del apiario: «Popeta» → POP, «Culipran» → CUL.
export function prefijoSugerido(nombreApiario = "") {
  return sinTildes(nombreApiario).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
}

export const limpiarPrefijo = (prefijo) => sinTildes(prefijo).toUpperCase().replace(/[^A-Z0-9]/g, "");

// Siguiente número libre para un prefijo, mirando los códigos que ya existen.
export function siguienteNumero(prefijo, codigos) {
  if (!prefijo) return 1;
  const patron = new RegExp(`^${prefijo}-(\\d+)$`, "i");
  const usados = codigos.map((c) => Number(String(c).match(patron)?.[1] ?? 0));
  return Math.max(0, ...usados) + 1;
}

export function generarCodigos({ prefijo, desde, cantidad, digitos = 3 }) {
  return Array.from({ length: cantidad }, (_, i) => `${prefijo}-${String(desde + i).padStart(digitos, "0")}`);
}

// Errores por campo (vacío si todo está bien).
export function validarLote(v) {
  const cantidad = Number(v.cantidad);
  const desde = Number(v.desde);
  const marcos = Number(v.cantidad_marcos);
  return {
    apiario_id: !v.apiario_id && "Selecciona el apiario.",
    prefijo: !v.prefijo
      ? "Ingresa el prefijo del código, por ejemplo POP."
      : v.prefijo.length > 10 && "El prefijo puede tener hasta 10 letras o números.",
    cantidad:
      !Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAXIMO_POR_LOTE
        ? `Ingresa una cantidad entre 1 y ${MAXIMO_POR_LOTE}.`
        : "",
    desde: !Number.isInteger(desde) || desde < 1 ? "Ingresa un número inicial desde 1." : "",
    cantidad_marcos:
      !Number.isInteger(marcos) || marcos < 0 || marcos > 20 ? "Ingresa una cantidad de marcos entre 0 y 20." : "",
  };
}

// Crea las colmenas y avisa el avance. Un código que ya existe (409) se omite;
// cualquier otro error se informa y se sigue con las demás.
export async function crearEnLote(lista, crear, { onAvance = () => {}, detenido = () => false } = {}) {
  const resultado = { creadas: [], omitidas: [], errores: [], detenido: false };
  let siguiente = 0;
  let listas = 0;

  const trabajador = async () => {
    while (siguiente < lista.length) {
      if (detenido()) {
        resultado.detenido = true;
        return;
      }
      const datos = lista[siguiente++];
      try {
        resultado.creadas.push(await crear(datos));
      } catch (error) {
        if (error?.estado === 409) resultado.omitidas.push(datos.codigo);
        else resultado.errores.push({ codigo: datos.codigo, mensaje: error?.message ?? "Error desconocido" });
      }
      onAvance(++listas, lista.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, lista.length) }, trabajador));
  return resultado;
}
