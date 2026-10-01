import {
  LayoutDashboard,
  MapPinned,
  Boxes,
  ClipboardCheck,
  Pill,
  ArrowRightLeft,
  QrCode,
  ShieldCheck,
  Users,
} from "lucide-react";

const TODOS = ["ADMIN", "APICULTOR"];
const SOLO_ADMIN = ["ADMIN"];

// Cada vista declara qué roles pueden verla (RF-09).
export const MENU = [
  { id: "dashboard", nombre: "Dashboard", icono: LayoutDashboard, roles: SOLO_ADMIN },
  { id: "apiarios", nombre: "Apiarios", icono: MapPinned, roles: SOLO_ADMIN },
  { id: "colmenas", nombre: "Colmenas", icono: Boxes, roles: TODOS },
  { id: "inspecciones", nombre: "Inspecciones", icono: ClipboardCheck, roles: TODOS },
  { id: "tratamientos", nombre: "Tratamientos", icono: Pill, roles: TODOS },
  { id: "transferencias", nombre: "Transferencias", icono: ArrowRightLeft, roles: TODOS },
  { id: "qr", nombre: "Códigos QR", icono: QrCode, roles: TODOS },
  { id: "auditoria", nombre: "Auditoría", icono: ShieldCheck, roles: SOLO_ADMIN },
  { id: "usuarios", nombre: "Usuarios", icono: Users, roles: SOLO_ADMIN },
];

export function menuParaRol(rol) {
  return MENU.filter((item) => item.roles.includes(rol));
}

export function vistaInicial(rol) {
  return rol === "ADMIN" ? "dashboard" : "colmenas";
}
