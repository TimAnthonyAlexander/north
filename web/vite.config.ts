import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    root: ".",
    server: {
        port: 3000,
        host: true,
        proxy: {
            "/ws": {
                target: process.env.NORTH_WEB_ENGINE_ORIGIN ?? "http://127.0.0.1:7331",
                ws: true,
            },
        },
    },
});
