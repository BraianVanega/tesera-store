import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` tira error fuera del bundle de Next; en tests es un no-op.
      "server-only": fileURLToPath(new URL("./tests/mocks/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/lib/domain/**", "src/lib/orders/transitions.ts", "src/lib/shop/**"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      exclude: ["**/*.test.ts", "src/lib/shop/data.ts", "src/lib/shop/constants.ts"],
    },
  },
});
