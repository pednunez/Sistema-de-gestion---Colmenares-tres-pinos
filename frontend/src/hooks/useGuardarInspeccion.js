// Guarda una inspección (nueva o editada) y, después, finaliza los tratamientos
// marcados. Lo usan la pantalla Inspecciones y la revisión por grupo.
import { useCallback } from "react";
import { useAuth } from "./useAuth";
import { useAvisos } from "./useAvisos";
import { useDatos } from "./useDatos";
import { inspeccionesService } from "../services/inspeccionesService";
import { tratamientosService } from "../services/tratamientosService";
import { hoyISO, humanizar } from "../utils/formato";

const textoFinalizados = (cantidad) =>
  cantidad > 0 ? ` ${cantidad === 1 ? "Se finalizó 1 tratamiento" : `Se finalizaron ${cantidad} tratamientos`}.` : "";

export function useGuardarInspeccion() {
  const { usuario } = useAuth();
  const { datos, recargar, codigoColmena } = useDatos();
  const avisos = useAvisos();

  // Finaliza con fecha de hoy los tratamientos marcados en la inspección.
  const finalizarTratamientos = useCallback(
    async (ids) => {
      const fallidos = [];
      for (const id of ids) {
        try {
          await tratamientosService.actualizar(id, { estado: "FINALIZADO", fecha_fin: hoyISO() });
        } catch (error) {
          const tratamiento = datos.tratamientos.find((t) => t.id === id);
          fallidos.push({
            id,
            nombre: tratamiento ? humanizar(tratamiento.tipo_tratamiento) : `Tratamiento #${id}`,
            mensaje: error.message,
          });
        }
      }
      return fallidos;
    },
    [datos.tratamientos]
  );

  // Devuelve { codigo, tratamientosFallidos }. Si la inspección no se guarda, lanza
  // el error para que el formulario lo muestre y no se cierre.
  return useCallback(
    async ({ existente, valores, cantidadTransferencias = 0, finalizar = [] }) => {
      if (existente) {
        // Al editar, el backend no permite cambiar la colmena.
        const cambios = { ...valores };
        delete cambios.colmena_id;
        await inspeccionesService.actualizar(existente.id, cambios);
      } else {
        // Las transferencias marcadas viajan en marcos[].transferido_a_colmena_id y
        // el backend las crea en la misma operación. usuario_id lo exige el esquema;
        // el backend lo reemplaza por el usuario de la sesión.
        await inspeccionesService.crear({ ...valores, usuario_id: usuario.id });
      }
      const tratamientosFallidos = await finalizarTratamientos(finalizar);
      await recargar().catch(() => {});

      const codigo = codigoColmena(existente ? existente.colmena_id : valores.colmena_id);
      const finalizados = textoFinalizados(finalizar.length - tratamientosFallidos.length);
      if (existente) avisos.exito(`Inspección actualizada.${finalizados}`);
      else
        avisos.exito(
          (cantidadTransferencias > 0
            ? `Inspección de ${codigo} registrada con ${cantidadTransferencias} ${cantidadTransferencias === 1 ? "transferencia" : "transferencias"}.`
            : `Inspección de ${codigo} registrada.`) + finalizados
        );
      return { codigo, tratamientosFallidos };
    },
    [usuario, finalizarTratamientos, recargar, codigoColmena, avisos]
  );
}
