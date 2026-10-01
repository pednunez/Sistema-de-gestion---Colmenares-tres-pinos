import { useMemo, useState } from "react";
import { Archive, Pencil, Plus, Users } from "lucide-react";
import Boton from "../components/ui/Boton";
import Confirmar from "../components/ui/Confirmar";
import Insignia, { InsigniaDe } from "../components/ui/Insignia";
import { Cargando, EstadoVacio } from "../components/ui/Estados";
import { Buscador, EncabezadoModulo } from "../components/ui/Estructura";
import FormularioUsuario from "../components/usuarios/FormularioUsuario";
import { useAuth } from "../hooks/useAuth";
import { useAvisos } from "../hooks/useAvisos";
import { useDatos } from "../hooks/useDatos";
import { usuariosService } from "../services/usuariosService";
import { ROL } from "../utils/etiquetas";
import { formatearFecha, nombreCompleto } from "../utils/formato";

export default function UsuariosPage() {
  const { usuario: sesion } = useAuth();
  const { datos, cargado, recargar } = useDatos();
  const avisos = useAvisos();
  const [busqueda, setBusqueda] = useState("");
  const [formulario, setFormulario] = useState(null);
  const [aDarDeBaja, setADarDeBaja] = useState(null);

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return datos.usuarios.filter((u) => `${nombreCompleto(u)} ${u.email}`.toLowerCase().includes(termino));
  }, [datos.usuarios, busqueda]);

  const guardar = async (valores) => {
    if (formulario?.id) {
      await usuariosService.actualizar(formulario.id, valores);
      avisos.exito("Usuario actualizado.");
    } else {
      await usuariosService.crear(valores);
      avisos.exito(`Usuario creado. Entrégale a ${valores.nombre} su correo y contraseña inicial.`);
    }
    await recargar();
    setFormulario(null);
  };

  const darDeBaja = async () => {
    await usuariosService.darDeBaja(aDarDeBaja.id);
    await recargar();
    avisos.exito(`${nombreCompleto(aDarDeBaja)} ya no puede ingresar. Sus registros se conservan.`);
  };

  if (!cargado) return <Cargando texto="Cargando usuarios..." />;

  return (
    <>
      <EncabezadoModulo descripcion="Personas con acceso al sistema y su rol.">
        <Boton icono={Plus} onClick={() => setFormulario({})}>
          Nuevo usuario
        </Boton>
      </EncabezadoModulo>

      <div className="mb-5 max-w-sm">
        <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar por nombre o correo" etiqueta="Buscar usuario" />
      </div>

      {filtrados.length === 0 ? (
        <EstadoVacio icono={Users} titulo="No hay usuarios con esa búsqueda" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-4 font-medium">Nombre</th>
                <th className="p-4 font-medium">Correo</th>
                <th className="p-4 font-medium">Rol</th>
                <th className="p-4 font-medium">Creado</th>
                <th className="p-4">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((u) => {
                const esPropio = u.id === sesion.id;
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="p-4 font-semibold">
                      {nombreCompleto(u)}
                      {esPropio && (
                        <span className="ml-2">
                          <Insignia tono="gris">Tú</Insignia>
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-slate-600">{u.email}</td>
                    <td className="p-4">
                      <InsigniaDe mapa={ROL} valor={u.rol} />
                    </td>
                    <td className="p-4 text-slate-600">{formatearFecha(u.fecha_creacion)}</td>
                    <td className="p-4">
                      <div className="flex justify-end gap-1">
                        <Boton variante="fantasma" tamano="icono" icono={Pencil} aria-label={`Editar a ${nombreCompleto(u)}`} title="Editar" onClick={() => setFormulario(u)} />
                        {!esPropio && (
                          <Boton variante="fantasma" tamano="icono" icono={Archive} aria-label={`Dar de baja a ${nombreCompleto(u)}`} title="Dar de baja" onClick={() => setADarDeBaja(u)} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {formulario && (
        <FormularioUsuario usuario={formulario.id ? formulario : null} onGuardar={guardar} onCerrar={() => setFormulario(null)} />
      )}

      {aDarDeBaja && (
        <Confirmar
          titulo={`¿Dar de baja a ${nombreCompleto(aDarDeBaja)}?`}
          textoConfirmar="Dar de baja"
          onConfirmar={darDeBaja}
          onCerrar={() => setADarDeBaja(null)}
        >
          <p>No podrá volver a iniciar sesión. Las inspecciones y registros que hizo se conservan.</p>
        </Confirmar>
      )}
    </>
  );
}
