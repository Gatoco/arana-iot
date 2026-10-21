import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// DESKTOP=1 builds for Electron: relative asset paths for file://, no service worker,
// and the Content-Security-Policy as a <meta> tag (file:// responses have no headers).
const desktop = process.env.DESKTOP === "1";
const { CSP_META } = createRequire(import.meta.url)("./electron/window.cjs") as { CSP_META: string };

function desktopCsp(): Plugin {
  return {
    name: "arana-desktop-csp",
    apply: "build",
    transformIndexHtml(html) {
      if (!desktop) return html;
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP_META}" />`);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: desktop ? "./" : "/",
  build: { outDir: desktop ? "dist-desktop" : "dist" },
  plugins: [
    react(),
    tailwindcss(),
    desktopCsp(),
    VitePWA({
      disable: desktop,
      registerType: "autoUpdate",
      manifest: {
        name: "Arana IoT",
        short_name: "Arana",
        description: "Digital twin and test bench for the LAFVIN LA072 spider robot",
        theme_color: "#05070a",
        background_color: "#05070a",
        display: "standalone",
        orientation: "any",
        icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    }),
  ],
});
