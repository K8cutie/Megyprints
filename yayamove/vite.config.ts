import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["maid-silhouette.svg"],
      manifest: {
        name: "Yayamove — Trusted Local Help",
        short_name: "Yayamove",
        description:
          "Find verified maids, carpenters, plumbers, computer technicians and aircon pros near you.",
        theme_color: "#1d4ed8",
        background_color: "#0b1220",
        display: "standalone",
        start_url: "/",
        icons: [
          // Scalable SVG covers all sizes — no missing PNG assets to ship.
          {
            src: "/maid-silhouette.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors so first paint isn't one giant chunk
        // (Megyprints audit lesson: avoid a single un-split bundle).
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
