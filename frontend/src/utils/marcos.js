// Registro unitario de marcos durante una inspección: una caja (cámara de cría
// o alza) tiene 10 posiciones y cada una guarda su contenido y, si corresponde,
// la colmena a la que se transfiere ese marco o si se retira a bodega.

export const MARCOS_POR_CAJA = 10;
export const SIN_MARCO = "SIN_MARCO";

// Regla del Product Owner (28-10): cualquier marco se puede transferir a otra
// colmena. Además, los de cera o miel se pueden mandar a bodega, donde entran al
// stock tal como están. Los marcos con cría no van a bodega.
export const CONTENIDOS_RETIRABLES = ["CERA_ESTIRADA", "CERA_UNTADA", "CERA_ESTAMPADA", "SOLO_MIEL"];
// Valor del destino que significa «a bodega (Stock)» en vez de una colmena.
export const DESTINO_BODEGA = "BODEGA";

export function puedeTransferirse(marco) {
  return tieneMarco(marco);
}

export function puedeRetirarse(marco) {
  return CONTENIDOS_RETIRABLES.includes(marco.contenido);
}

export function vaABodega(marco) {
  return puedeRetirarse(marco) && marco.transferir && marco.destino === DESTINO_BODEGA;
}

// Quita la transferencia o el destino que el nuevo contenido ya no permite.
export function ajustarAccion(marco) {
  const ajustado = { ...marco };
  if (!puedeTransferirse(ajustado)) {
    ajustado.transferir = false;
    ajustado.destino = "";
  } else if (ajustado.destino === DESTINO_BODEGA && !puedeRetirarse(ajustado)) {
    ajustado.destino = "";
  }
  return ajustado;
}

// Al cambiar de apiario, las colmenas de destino elegidas ya no corresponden.
export function quitarDestinosColmena(caja) {
  return caja.map((marco) => (marco.destino && marco.destino !== DESTINO_BODEGA ? { ...marco, destino: "" } : marco));
}

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

// Marcos que salen hacia otra colmena (incluye los que aún no tienen destino).
export function marcosATransferir(caja) {
  return caja.filter((marco) => puedeTransferirse(marco) && marco.transferir && marco.destino !== DESTINO_BODEGA);
}

export function marcosARetirar(caja) {
  return caja.filter(vaABodega);
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

// Detalle por marco que acompaña a la inspección. `retirar_a_bodega` se envía
// siempre: el backend actual lo ignora y, cuando lo acepte, suma el marco al stock.
export function detalleMarcos(registro) {
  return cajasRegistradas(registro).flatMap((caja) =>
    caja.marcos.map((marco) => ({
      ubicacion: caja.ubicacion,
      numero: marco.numero,
      contenido: marco.contenido,
      transferido_a_colmena_id:
        puedeTransferirse(marco) && marco.transferir && marco.destino && marco.destino !== DESTINO_BODEGA
          ? Number(marco.destino)
          : null,
      retirar_a_bodega: vaABodega(marco),
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
  for (const marco of marcosATransferir(caja)) {
    if (!marco.destino) return `Elige el destino del marco ${marco.numero} ${nombre}.`;
    if (String(marco.destino) === String(colmenaId)) {
      return `El marco ${marco.numero} ${nombre} no se puede transferir a la misma colmena.`;
    }
  }
  return "";
}
