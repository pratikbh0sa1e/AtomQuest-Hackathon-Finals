import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl(), // Enables HTTPS so mobile browsers allow camera/mic access
  ],
  server: {
    https: true,
    host: true,
    proxy: {
      "/socket.io": {
        target: "http://127.0.0.1:3001",
        ws: true,
        changeOrigin: true,
      },
      "/auth": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/sessions": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/admin/": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/metrics": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.js"],
  },
});
