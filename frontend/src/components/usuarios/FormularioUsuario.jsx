import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import { Entrada, Segmentado } from "../ui/Campo";
import { useFormulario } from "../../hooks/useFormulario";
import { useDatos } from "../../hooks/useDatos";
import { ROL, opciones } from "../../utils/etiquetas";
import { esCorreoValido, textoONulo } from "../../utils/validacion";

export default function FormularioUsuario({ usuario, onGuardar, onCerrar }) {
  const esEdicion = Boolean(usuario?.id);
  const idFormulario = useId();
  const { datos } = useDatos();
  const [verClave, setVerClave] = useState(false);

  const formulario = useFormulario({
    nombre: usuario?.nombre ?? "",
    apellido: usuario?.apellido ?? "",
    email: usuario?.email ?? "",
    rol: usuario?.rol ?? "APICULTOR",
    password: "",
    confirmacion: "",
  });
  const { valores, cambiar, errores } = formulario;

  const validar = (v) => {
    const correo = v.email.trim().toLowerCase();
    const repetido = datos.usuarios.some((u) => u.id !== usuario?.id && u.email.toLowerCase() === correo);
    return {
      nombre: v.nombre.trim().length < 2 && "Ingresa un nombre de al menos 2 caracteres.",
      email: !esCorreoValido(correo)
        ? "Ingresa un correo válido, por ejemplo nombre@empresa.cl."
        : repetido && "Ya existe un usuario con ese correo.",
      password: !esEdicion && v.password.length < 8 && "La contraseña debe tener al menos 8 caracteres.",
      confirmacion: !esEdicion && v.confirmacion !== v.password && "Las contraseñas no coinciden.",
    };
  };

  const enviar = (evento) => {
    evento.preventDefault();
    formulario.enviar(validar, (v) => {
      const datosUsuario = {
        nombre: v.nombre.trim(),
        apellido: textoONulo(v.apellido),
        email: v.email.trim().toLowerCase(),
        rol: v.rol,
      };
      return onGuardar(esEdicion ? datosUsuario : { ...datosUsuario, password: v.password });
    });
  };

  const BotonVer = (
    <button
      type="button"
      onClick={() => setVerClave(!verClave)}
      className="justify-self-start text-sm font-medium text-slate-600 hover:text-slate-900"
    >
      <span className="flex items-center gap-1.5">
        {verClave ? <EyeOff size={16} /> : <Eye size={16} />}
        {verClave ? "Ocultar contraseñas" : "Mostrar contraseñas"}
      </span>
    </button>
  );

  return (
    <Modal
      titulo={esEdicion ? "Editar usuario" : "Nuevo usuario"}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form={idFormulario} cargando={formulario.enviando}>
            {esEdicion ? "Guardar cambios" : "Crear usuario"}
          </Boton>
        </>
      }
    >
      <form id={idFormulario} onSubmit={enviar} noValidate className="grid gap-4">
        {formulario.errorGeneral && <Alerta>{formulario.errorGeneral}</Alerta>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Entrada etiqueta="Nombre" requerido value={valores.nombre} onChange={(e) => cambiar("nombre", e.target.value)} error={errores.nombre} maxLength={100} autoFocus={!esEdicion} />
          <Entrada etiqueta="Apellido" value={valores.apellido} onChange={(e) => cambiar("apellido", e.target.value)} maxLength={100} />
        </div>

        <Entrada
          etiqueta="Correo electrónico"
          requerido
          type="email"
          inputMode="email"
          autoComplete="off"
          value={valores.email}
          onChange={(e) => cambiar("email", e.target.value)}
          error={errores.email}
          maxLength={150}
        />

        <Segmentado
          etiqueta="Rol"
          opciones={opciones(ROL)}
          valor={valores.rol}
          onCambiar={(valor) => cambiar("rol", valor)}
        />
        <p className="-mt-2 text-sm text-slate-500">
          {valores.rol === "ADMIN"
            ? "Acceso completo: usuarios, apiarios, colmenas y auditoría."
            : "Registra inspecciones, tratamientos y transferencias en terreno."}
        </p>

        {!esEdicion && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Entrada
                etiqueta="Contraseña inicial"
                requerido
                type={verClave ? "text" : "password"}
                autoComplete="new-password"
                value={valores.password}
                onChange={(e) => cambiar("password", e.target.value)}
                error={errores.password}
                ayuda={!errores.password ? "Mínimo 8 caracteres." : undefined}
              />
              <Entrada
                etiqueta="Repetir contraseña"
                requerido
                type={verClave ? "text" : "password"}
                autoComplete="new-password"
                value={valores.confirmacion}
                onChange={(e) => cambiar("confirmacion", e.target.value)}
                error={errores.confirmacion}
              />
            </div>
            {BotonVer}
          </>
        )}
      </form>
    </Modal>
  );
}
