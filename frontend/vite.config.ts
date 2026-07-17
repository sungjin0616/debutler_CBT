import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite와 React 앱이 함께 동작하도록 플러그인을 연결한다.
export default defineConfig({
  plugins: [react()],
});
