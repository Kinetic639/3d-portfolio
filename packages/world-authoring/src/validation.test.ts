import { expect, test } from "vitest";
import { isSourceWorld } from "./validation.js";
test("accepts a versioned source envelope", () => {
  expect(isSourceWorld({ schemaVersion: 1, id: "entry", revision: "r1" })).toBe(
    true,
  );
});
test.each([
  null,
  [],
  {},
  { schemaVersion: 2, id: "entry", revision: "r1" },
  { schemaVersion: 1, id: " ", revision: "r1" },
  { schemaVersion: 1, id: "entry", revision: "" },
])("rejects malformed or incompatible source envelopes: %j", (value) => {
  expect(isSourceWorld(value)).toBe(false);
});
