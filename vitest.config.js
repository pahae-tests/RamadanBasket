const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    setupFiles: ["tests/setup.js"],
    testTimeout: 60000,
    hookTimeout: 60000,
    include: ["tests/**/*.test.js"]
  }
});
