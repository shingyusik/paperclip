import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@paperclipai/adapter-hermes-profile",
    include: ["src/**/*.test.ts"],
  },
});
