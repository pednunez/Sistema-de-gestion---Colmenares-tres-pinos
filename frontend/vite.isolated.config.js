// Validación local sin leer archivos .env ni contactar una API real.
import { mergeConfig } from "vite";
import config from "./vite.config.js";

export default mergeConfig(config, {
  envDir: false,
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("http://127.0.0.1:9") },
  server: { host: "127.0.0.1", port: 5179, strictPort: true },
});
