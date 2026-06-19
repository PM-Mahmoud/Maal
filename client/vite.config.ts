import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsConfigPaths(),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/login": "http://localhost:3000",
      "/signup": "http://localhost:3000",
      "/logout": "http://localhost:3000",
      "/auth": "http://localhost:3000",
      "/dashboard": "http://localhost:3000",
      "/score": "http://localhost:3000",
      "/billing": "http://localhost:3000",
      "/basiq": "http://localhost:3000",
    },
  },
  build: {
    outDir: "../public/app",
    emptyOutDir: true,
  },
});
