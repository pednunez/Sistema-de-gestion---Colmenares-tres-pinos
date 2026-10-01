// Carga una sola vez los datos que comparten todas las vistas y ofrece
// funciones para mostrar nombres en vez de IDs.
import { useCallback, useEffect, useMemo, useState } from "react";
import { DatosContext } from "./contextos";
import { useAuth } from "../hooks/useAuth";
import { apiariosService } from "../services/apiariosService";
import { colmenasService } from "../services/colmenasService";
import { inspeccionesService } from "../services/inspeccionesService";
import { tratamientosService } from "../services/tratamientosService";
import { transferenciasService } from "../services/transferenciasService";
import { usuariosService } from "../services/usuariosService";
import { nombreCompleto } from "../utils/formato";

const VACIO = {
  apiarios: [],
  colmenas: [],
  inspecciones: [],
  tratamientos: [],
  transferencias: [],
  usuarios: [],
};

export function DatosProvider({ children }) {
  const { usuario, esAdmin } = useAuth();
  const [datos, setDatos] = useState(VACIO);
  const [cargando, setCargando] = useState(true);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState("");

  const recargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [apiarios, colmenas, inspecciones, tratamientos, transferencias] = await Promise.all([
        apiariosService.listar(),
        colmenasService.listar(),
        inspeccionesService.listar(),
        tratamientosService.listar(),
        transferenciasService.listar(),
      ]);
      // La lista de usuarios solo está disponible para el administrador.
      const usuarios = esAdmin ? await usuariosService.listar().catch(() => []) : [];
      setDatos({ apiarios, colmenas, inspecciones, tratamientos, transferencias, usuarios });
      setCargado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [esAdmin]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const indices = useMemo(() => {
    const porId = (lista) => new Map(lista.map((item) => [item.id, item]));
    return {
      apiarios: porId(datos.apiarios),
      colmenas: porId(datos.colmenas),
      usuarios: porId(datos.usuarios),
    };
  }, [datos]);

  const nombreApiario = useCallback(
    (id) => indices.apiarios.get(id)?.nombre ?? "Apiario dado de baja",
    [indices]
  );

  const codigoColmena = useCallback(
    (id) => indices.colmenas.get(id)?.codigo ?? `Colmena dada de baja (#${id})`,
    [indices]
  );

  const nombreUsuario = useCallback(
    (id) => {
      if (id === null || id === undefined) return "Sin registrar";
      const encontrado = indices.usuarios.get(id);
      if (encontrado) return nombreCompleto(encontrado);
      if (usuario && id === usuario.id) return `${usuario.nombre} (tú)`;
      return `Usuario #${id}`;
    },
    [indices, usuario]
  );

  const valor = useMemo(
    () => ({
      datos,
      cargando,
      cargado,
      error,
      recargar,
      indices,
      nombreApiario,
      codigoColmena,
      nombreUsuario,
    }),
    [datos, cargando, cargado, error, recargar, indices, nombreApiario, codigoColmena, nombreUsuario]
  );

  return <DatosContext.Provider value={valor}>{children}</DatosContext.Provider>;
}
