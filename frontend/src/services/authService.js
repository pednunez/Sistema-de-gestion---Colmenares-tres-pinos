import { api } from "./api";

export const authService = {
  // Devuelve { usuario, csrf_token } y deja la cookie de sesión en el navegador.
  login: (email, password) => api.post("/auth/login", { email, password }),
  // Cierra todas las sesiones de la cuenta, no solo la de este equipo.
  logout: () => api.post("/auth/logout"),
  usuarioActual: () => api.get("/auth/me"),
  csrf: () => api.get("/auth/csrf"),
  // RF-03. El backend responde lo mismo exista o no el correo.
  solicitarRecuperacion: (email) => api.post("/auth/recuperar-password", { email }),
  restablecerPassword: (token, nuevaPassword, confirmarPassword) =>
    api.post("/auth/restablecer-password", {
      token,
      nueva_password: nuevaPassword,
      confirmar_password: confirmarPassword,
    }),
};
