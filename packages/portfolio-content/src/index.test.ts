import { expect, test } from "vitest";
import { portfolioIdentity } from "./index.js";
test("portfolio identity is immutable and usable without runtime initialization", () => {
  expect(Object.isFrozen(portfolioIdentity)).toBe(true);
  expect(portfolioIdentity.name.trim().length).toBeGreaterThan(0);
  expect(portfolioIdentity.description).toContain("independently");
});
