// Colores por estado de la colmena (S4-T03). Paleta validada con el validador
// de la guía de visualización: separación suficiente para daltonismo con apoyo
// de etiquetas visibles, que la leyenda y las filas siempre muestran.
// La escala anterior y «sin inspección» van en gris: no son un estado actual.
export const ESTADOS_GRAFICO = [
  { clave: "COMPLETA", texto: "Completa", color: "#059669" },
  { clave: "EN_DESARROLLO", texto: "En desarrollo", color: "#0284c7" },
  { clave: "DONANTE", texto: "Donante", color: "#8b5cf6" },
  { clave: "DEBIL", texto: "Débil", color: "#f59e0b" },
  { clave: "REQUIERE_REVISION", texto: "Requiere revisión", color: "#dc2626" },
  { clave: "ANTERIOR", texto: "Escala anterior", color: "#64748b", soloSiHay: true },
  { clave: "SIN", texto: "Sin inspección", color: "#cbd5e1" },
];
