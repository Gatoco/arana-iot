import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// DESKTOP=1 builds for Electron: relative asset paths for file://, no service worker.
const desktop = process.env.DESKTOP === "1";

// https://vite.dev/config/
export default defineConfig({
  base: desktop ? "./" : "/",
  build: { outDir: desktop ? "dist-desktop" : "dist" },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: desktop,
      registerType: "autoUpdate",
      manifest: {
        name: "Arana IoT",
        short_name: "Arana",
        description: "Digital twin + controller for the IoT spider robot",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
    }),
  ],
});
