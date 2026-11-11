import { defineConfig } from 'vitest/config';

// Isolated from the frontend's root vite.config.ts (which Vitest would otherwise
// discover by walking up the tree). Backend tests run in a node environment.

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    root: import.meta.dirname,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
