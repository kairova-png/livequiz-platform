import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* В разработке клиент живёт на 5173, игра — на 8787. Прокси нужен, чтобы
 * адрес был один и в dev, и в собранном виде: телефоны в зале открывают
 * ровно тот же путь, что и на ноутбуке разработчика. */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
      '/media': { target: 'http://localhost:8787' },
      '/api': { target: 'http://localhost:8787' },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
