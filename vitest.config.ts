import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Several tests start the CLI and a fake agent CLI as child processes.
    testTimeout: 30_000,
  },
})
