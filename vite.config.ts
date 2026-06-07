import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, run the API with `npm run server` (port 3001) and `npm run dev`;
// Vite proxies /api to it. In production the Express server serves dist + /api.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { "/api": "http://localhost:3001" },
  },
  preview: {
    host: true,
    allowedHosts: [".onrender.com"],
  },
});
