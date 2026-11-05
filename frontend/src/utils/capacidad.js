// Límite de 10 marcos por piso en la colmena que recibe una transferencia
// (regla del Product Owner, 28-10; PENDIENTES_BACKEND.md, sección 8).
//
// Con los marcos actuales de cada colmena de destino (GET /colmenas/{id}/marcos)
// se calcula, para cada marco que se transfiere, si el piso de destino tiene
// espacio o si hay que elegir qué marco sale de la otra colmena (el desplazado).
import { MARCOS_POR_CAJA, SIN_MARCO, marcosATransferir, puedeRetirarse } from "./marcos";

export const PISO_CAMARA = "CAMARA_CRIA";
export const PISO_ALZA = "ALZA";

// Estado de los marcos actuales de una colmena de destino.
export const CARGANDO = "cargando";
export const SIN_DATOS = "sin_datos";
export const CON_DATOS = "con_datos";

// Clave de un marco dentro del formulario: ubicación + número.
export const claveMarco = (ubicacion, numero) => `${ubicacion}-${numero}`;

// Normaliza la respuesta del backend. null si no hay detalle registrado.
export function leerMarcosActuales(respuesta) {
  if (!respuesta || !Array.isArray(respuesta.camara_cria)) return null;
  const piso = (lista) =>
    Array.isArray(lista)
      ? lista
          .map((m) => ({ numero: Number(m.numero), contenido: m.contenido }))
          .filter((m) => m.numero >= 1 && m.numero <= MARCOS_POR_CAJA)
          .sort((a, b) => a.numero - b.numero)
      : null;
  return { camara: piso(respuesta.camara_cria), alza: piso(respuesta.alza) };
}

const conMarco = (posicion) => posicion.contenido && posicion.contenido !== SIN_MARCO;

export function pisoDestino(marco, actuales) {
  return marco.pisoDestino === PISO_ALZA && actuales?.alza ? PISO_ALZA : PISO_CAMARA;
}

// Para cada marco que va a otra colmena, devuelve un Map clave → información
// del destino: { estado, piso, tieneAlza, ocupados, libres, requiereDesplazado,
// posiciones (las que tienen marco y pueden salir) }.
export function planDeDestinos(registro, marcosDestinos) {
  const cajas = [{ ubicacion: PISO_CAMARA, marcos: registro.camara }];
  if (registro.tieneAlza) cajas.push({ ubicacion: PISO_ALZA, marcos: registro.alza });

  const plan = new Map();
  const entrantes = new Map(); // destino+piso → cuántos marcos ya entran
  for (const caja of cajas) {
    for (const marco of marcosATransferir(caja.marcos)) {
      if (!marco.destino) continue;
      const clave = claveMarco(caja.ubicacion, marco.numero);
      const consulta = marcosDestinos.get(String(marco.destino));
      if (!consulta || consulta.estado !== CON_DATOS) {
        plan.set(clave, { estado: consulta?.estado ?? CARGANDO, piso: PISO_CAMARA, tieneAlza: false });
        continue;
      }
      const actuales = consulta.marcos;
      const piso = pisoDestino(marco, actuales);
      const posiciones = (piso === PISO_ALZA ? actuales.alza : actuales.camara).filter(conMarco);
      const ocupados = posiciones.length;
      const libres = Math.max(0, MARCOS_POR_CAJA - ocupados);
      const llave = `${marco.destino}-${piso}`;
      const orden = entrantes.get(llave) ?? 0;
      entrantes.set(llave, orden + 1);
      plan.set(clave, {
        estado: CON_DATOS,
        piso,
        tieneAlza: Boolean(actuales.alza),
        ocupados,
        libres,
        // Los primeros marcos ocupan las posiciones libres; los siguientes
        // necesitan que salga un marco de la otra colmena.
        requiereDesplazado: orden >= libres,
        posiciones,
      });
    }
  }
  return plan;
}

// Qué pasa con el marco que sale de la colmena de destino.
export function destinoDelDesplazado(contenido) {
  return puedeRetirarse({ contenido }) ? "BODEGA" : "INTERCAMBIO";
}

// Mensaje de error de capacidad para una caja, o "".
export function validarCapacidad(caja, ubicacion, nombre, plan, codigoColmena) {
  const usados = new Map();
  for (const marco of marcosATransferir(caja)) {
    const info = plan.get(claveMarco(ubicacion, marco.numero));
    if (!info || info.estado !== CON_DATOS || !info.requiereDesplazado) continue;
    const destino = codigoColmena(Number(marco.destino));
    const nombrePiso = info.piso === PISO_ALZA ? "el alza" : "la cámara de cría";
    if (!marco.desplazado) {
      return `${destino} tiene ${nombrePiso} llena: elige qué marco sale de ella para recibir el marco ${marco.numero} ${nombre}.`;
    }
    const llave = `${marco.destino}-${info.piso}-${marco.desplazado}`;
    if (usados.has(llave)) {
      return `El marco ${marco.desplazado} de ${destino} ya sale por otro marco: elige uno distinto para el marco ${marco.numero} ${nombre}.`;
    }
    usados.set(llave, true);
  }
  return "";
}
