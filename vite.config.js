import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// PWA is handled manually via public/manifest.webmanifest + public/sw.js
// (registered in src/main.tsx) to avoid the workbox build dependency.
export default defineConfig({
    plugins: [react()],
    server: { host: true },
    // Allow Render (and other *.onrender.com) hosts to reach `vite preview`.
    preview: {
        host: true,
        allowedHosts: [".onrender.com"],
    },
});
