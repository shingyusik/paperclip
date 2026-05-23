import { describe, expect, it } from "vitest";
import * as shared from "../index.js";
import * as validators from "./index.js";

const allowedKeys = [
  "roadmap",
  "spec",
  "decisions",
  "risks",
  "metrics",
  "launch-plan",
  "retrospective",
] as const;

describe("projectDocumentKeySchema", () => {
  it("accepts the canonical project document keys", () => {
    expect(validators.projectDocumentKeySchema, "projectDocumentKeySchema should be exported from validators").toBeDefined();
    expect(shared.projectDocumentKeySchema, "projectDocumentKeySchema should be exported from the shared root").toBeDefined();

    for (const key of allowedKeys) {
      expect(validators.projectDocumentKeySchema.parse(key)).toBe(key);
      expect(shared.projectDocumentKeySchema.parse(key)).toBe(key);
    }
  });

  it("rejects unknown or malformed project document keys", () => {
    expect(validators.projectDocumentKeySchema.safeParse("notes").success).toBe(false);
    expect(validators.projectDocumentKeySchema.safeParse("Launch-Plan").success).toBe(false);
    expect(validators.projectDocumentKeySchema.safeParse("").success).toBe(false);
  });
});
