// Funciones del frontend que dependen de un cambio del backend que todavía no
// está en main. Se activan con una variable en frontend/.env.local.

// Retiro de marcos a bodega desde la inspección (ver PENDIENTES_BACKEND.md, sección 8).
// El frontend siempre envía `retirar_a_bodega`; mientras el backend no sume esos
// marcos al stock, el formulario avisa que hay que registrarlos también en Stock.
// Cuando el backend esté listo, se activa para quitar el aviso.
export const RETIRO_A_BODEGA = import.meta.env?.VITE_RETIRO_A_BODEGA === "true";
