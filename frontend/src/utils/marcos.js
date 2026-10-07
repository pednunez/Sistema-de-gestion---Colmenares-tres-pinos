// Registro unitario de marcos durante una inspección: una caja (cámara de cría
// o alza) tiene 10 posiciones y cada una guarda su contenido y, si corresponde,
// la colmena a la que se transfiere ese marco.
import { CONTENIDO_MARCO, UBICACION_MARCO, texto } from "./etiquetas";

export const MARCOS_POR_CAJA = 10;
export const SIN_MARCO = "SIN_MARCO";

export function crearCaja() {
  return Array.from({ length: MARCOS_POR_CAJA }, (_, indice) => ({
    numero: indice + 1,
    contenido: "",
    transferir: false,
    destino: "",
  }));
}

export function tieneMarco(marco) {
  return marco.contenido !== "" && marco.contenido !== SIN_MARCO;
}

export function cajaSinRegistrar(caja) {
  return caja.every((marco) => marco.contenido === "");
}

export function cajaCompleta(caja) {
  return caja.every((marco) => marco.contenido !== "");
}

export function contarMarcos(caja) {
  return caja.filter(tieneMarco).length;
}

export function marcosATransferir(caja) {
  return caja.filter((marco) => tieneMarco(marco) && marco.transferir);
}

// El backend clasifica las transferencias con un tipo de marco más general.
const TIPO_POR_CONTENIDO = {
  MIEL_Y_CRIA: "CRIA",
  SOLO_CRIA: "CRIA",
  SOLO_MIEL: "MIEL",
  CERA_ESTIRADA: "VACIO",
  CERA_ESTAMPADA: "VACIO",
};

function cajasRegistradas({ camara, tieneAlza, alza }) {
  const cajas = [{ ubicacion: "CAMARA_CRIA", marcos: camara }];
  if (tieneAlza) cajas.push({ ubicacion: "ALZA", marcos: alza });
  return cajas.filter((caja) => !cajaSinRegistrar(caja.marcos));
}

// Total de marcos presentes en la colmena al momento de revisarla, o null si
// no se registró el detalle (así no se pisa la cantidad que ya tiene la colmena).
export function totalMarcos(registro) {
  const cajas = cajasRegistradas(registro);
  if (cajas.length === 0) return null;
  return cajas.reduce((total, caja) => total + contarMarcos(caja.marcos), 0);
}

// Detalle por marco que acompaña a la inspección.
export function detalleMarcos(registro) {
  return cajasRegistradas(registro).flatMap((caja) =>
    caja.marcos.map((marco) => ({
      ubicacion: caja.ubicacion,
      numero: marco.numero,
      contenido: marco.contenido,
      transferido_a_colmena_id: tieneMarco(marco) && marco.transferir ? Number(marco.destino) : null,
    }))
  );
}

// Una transferencia por cada marco marcado para salir de la colmena inspeccionada.
export function planDeTransferencias(registro, colmenaOrigenId) {
  return cajasRegistradas(registro).flatMap((caja) =>
    marcosATransferir(caja.marcos).map((marco) => ({
      colmena_origen_id: Number(colmenaOrigenId),
      colmena_destino_id: Number(marco.destino),
      cantidad_marcos: 1,
      tipo_marco: TIPO_POR_CONTENIDO[marco.contenido] ?? "OTRO",
      motivo: "Transferencia registrada durante la inspección",
      observaciones: `Marco ${marco.numero} de ${texto(UBICACION_MARCO, caja.ubicacion).toLowerCase()}: ${texto(
        CONTENIDO_MARCO,
        marco.contenido
      ).toLowerCase()}.`,
      ubicacion: caja.ubicacion,
      numero_marco: marco.numero,
      contenido: marco.contenido,
    }))
  );
}

// Devuelve el mensaje de error de una caja, o "" si está bien.
export function validarCaja(caja, nombre, colmenaId, { obligatoria = false } = {}) {
  if (cajaSinRegistrar(caja)) {
    return obligatoria ? `Registra los ${MARCOS_POR_CAJA} marcos ${nombre}. Si falta un marco, elige «Sin marco».` : "";
  }
  if (!cajaCompleta(caja)) {
    const faltan = caja.filter((marco) => marco.contenido === "").map((marco) => marco.numero);
    return `Falta registrar ${faltan.length === 1 ? "el marco" : "los marcos"} ${faltan.join(", ")} ${nombre}. Si no hay marco en esa posición, elige «Sin marco».`;
  }
  for (const marco of marcosATransferir(caja)) {
    if (!marco.destino) return `Elige la colmena de destino del marco ${marco.numero} ${nombre}.`;
    if (String(marco.destino) === String(colmenaId)) {
      return `El marco ${marco.numero} ${nombre} no se puede transferir a la misma colmena.`;
    }
  }
  return "";
}
