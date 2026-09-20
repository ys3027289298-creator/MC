import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { open: true, port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts']
  }
});
