import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: Number(env.FRONTEND_PORT || 5173),
      proxy: {
        // the SPA always calls /api; in dev it is proxied to the Spring Boot backend
        '/api': env.VITE_API_TARGET || 'http://localhost:8080',
      },
    },
  };
});
