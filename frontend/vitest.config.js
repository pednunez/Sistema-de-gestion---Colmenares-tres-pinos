// Pruebas de interfaz (S1-T26). Se ejecutan con: npm run test:ui
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["tests/ui/**/*.test.jsx"],
      restoreMocks: true,
    },
  })
);
