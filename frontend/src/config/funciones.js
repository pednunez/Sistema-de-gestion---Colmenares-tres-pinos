// Funciones del frontend que se activan o desactivan con una variable en
// frontend/.env.local.

// Grupos de colmenas y revisión por grupo (PB-06 y PB-18). Decisión del Product
// Owner (02-11): no se usarán por ahora, así que no aparecen en el menú. El código
// y el backend se conservan; se vuelven a mostrar con VITE_GRUPOS=true.
export const gruposActivos = () => import.meta.env?.VITE_GRUPOS === "true";
