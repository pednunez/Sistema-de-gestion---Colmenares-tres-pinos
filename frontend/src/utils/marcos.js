// Registro unitario de marcos durante una inspección: una caja (cámara de cría
// o alza) tiene 10 posiciones y cada una guarda su contenido y, si corresponde,
// la colmena a la que se transfiere ese marco o si se retira a bodega.

export const MARCOS_POR_CAJA = 10;
export const SIN_MARCO = "SIN_MARCO";

// Regla del Product Owner (28-10): el contenido decide qué se puede hacer.
// Los marcos con cría solo se transfieren, para fortalecer una colmena débil.
export const CONTENIDOS_TRANSFERIBLES = ["MIEL_Y_CRIA", "SOLO_CRIA"];
// Los de cera o miel solo se retiran a bodega y entran al stock tal como están.
export const CONTENIDOS_RETIRABLES = ["CERA_ESTIRADA", "CERA_UNTADA", "CERA_ESTAMPADA", "SOLO_MIEL"];

export function puedeTransferirse(marco) {
  return CONTENIDOS_TRANSFERIBLES.includes(marco.contenido);
}

export function puedeRetirarse(marco) {
  return CONTENIDOS_RETIRABLES.includes(marco.contenido);
}

// Quita la transferencia o el retiro que el nuevo contenido ya no permite.
export function ajustarAccion(marco) {
  const ajustado = { ...marco };
  if (!puedeTransferirse(ajustado)) {
    ajustado.transferir = false;
    ajustado.destino = "";
  }
  if (!puedeRetirarse(ajustado)) ajustado.retirar = false;
  return ajustado;
}

export function crearCaja() {
  return Array.from({ length: MARCOS_POR_CAJA }, (_, indice) => ({
    numero: indice + 1,
    contenido: "",
    transferir: false,
    destino: "",
    retirar: false,
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
  return caja.filter((marco) => puedeTransferirse(marco) && marco.transferir);
}

export function marcosARetirar(caja) {
  return caja.filter((marco) => puedeRetirarse(marco) && marco.retirar);
}

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

// Detalle por marco que acompaña a la inspección. `conRetiro` agrega
// `retirar_a_bodega` solo cuando el backend ya lo acepta.
export function detalleMarcos(registro, { conRetiro = false } = {}) {
  return cajasRegistradas(registro).flatMap((caja) =>
    caja.marcos.map((marco) => ({
      ubicacion: caja.ubicacion,
      numero: marco.numero,
      contenido: marco.contenido,
      transferido_a_colmena_id: puedeTransferirse(marco) && marco.transferir ? Number(marco.destino) : null,
      ...(conRetiro ? { retirar_a_bodega: puedeRetirarse(marco) && Boolean(marco.retirar) } : {}),
    }))
  );
}

// Cantidad de marcos marcados para salir de la colmena inspeccionada. El backend
// crea esas transferencias al guardar la inspección, a partir de
// marcos[].transferido_a_colmena_id, en la misma operación.
export function contarTransferencias(registro) {
  return cajasRegistradas(registro).reduce((total, caja) => total + marcosATransferir(caja.marcos).length, 0);
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
  const transferidoSinCria = caja.find((marco) => marco.transferir && !puedeTransferirse(marco));
  if (transferidoSinCria) {
    return `El marco ${transferidoSinCria.numero} ${nombre} no se puede transferir: solo se transfieren marcos con cría.`;
  }
  for (const marco of marcosATransferir(caja)) {
    if (!marco.destino) return `Elige la colmena de destino del marco ${marco.numero} ${nombre}.`;
    if (String(marco.destino) === String(colmenaId)) {
      return `El marco ${marco.numero} ${nombre} no se puede transferir a la misma colmena.`;
    }
  }
  return "";
}
