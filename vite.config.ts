import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react()],
    base: command === "build"
      ? (env.VITE_BASE_PATH || "/packingListExcel/")
      : "/",
    build: {
      target: "es2022",
      chunkSizeWarningLimit: 1800,
    },
  };
});
