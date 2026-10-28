// Funciones del frontend que dependen de un cambio del backend que todavía no
// está en main. Se activan con una variable en frontend/.env.local.

// Retiro de marcos a bodega desde la inspección (ver PENDIENTES_BACKEND.md, sección 8).
// Mientras el backend no acepte `retirar_a_bodega` en marcos[], queda apagado
// para no perder el retiro sin aviso.
export const RETIRO_A_BODEGA = import.meta.env?.VITE_RETIRO_A_BODEGA === "true";
