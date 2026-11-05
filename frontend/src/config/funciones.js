// Funciones del frontend que dependen de un cambio del backend que todavía no
// está en main. Se activan con una variable en frontend/.env.local.

// Retiro de marcos a bodega desde la inspección (ver PENDIENTES_BACKEND.md, sección 8).
// El frontend siempre envía `retirar_a_bodega`; mientras el backend no sume esos
// marcos al stock, el formulario avisa que hay que registrarlos también en Stock.
// Cuando el backend esté listo, se activa para quitar el aviso.
export const RETIRO_A_BODEGA = import.meta.env?.VITE_RETIRO_A_BODEGA === "true";

// Grupos de colmenas y revisión por grupo (PB-06 y PB-18). Decisión del Product
// Owner (02-11): no se usarán por ahora, así que no aparecen en el menú. El código
// y el backend se conservan; se vuelven a mostrar con VITE_GRUPOS=true.
export const gruposActivos = () => import.meta.env?.VITE_GRUPOS === "true";
