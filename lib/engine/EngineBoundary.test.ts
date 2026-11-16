import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/** The lint rule that keeps the engine free of React (eslint.config.mjs) is still there and still bites. */
describe("engine boundary", () => {
  const lint = async (filePath: string, code: string) => {
    const [result] = await new ESLint({ cwd: process.cwd() }).lintText(code, { filePath });
    return result.messages.filter((message) => message.ruleId === "no-restricted-imports").map((message) => message.message.split(".")[0]);
  };

  it("refuses React, Next.js, zustand's React entry and components in lib", async () => {
    const messages = await lint("lib/engine/probe.ts", [
      'import { useState } from "react";',
      'import Link from "next/link";',
      'import { useStore } from "zustand";',
      'import WorldLayer from "@/components/world/WorldLayer";',
      'import { useWorldBridge } from "@/lib/bridge/use-world-bridge";',
      "export const all = [useState, Link, useStore, WorldLayer, useWorldBridge];",
    ].join("\n"));
    expect(messages).toHaveLength(5);
  }, 30_000);

  it("allows the vanilla store and lib's own modules", async () => {
    expect(await lint("lib/engine/probe.ts", 'import { createStore } from "zustand/vanilla";\nimport { Wind } from "./wind";\nexport const all = [createStore, Wind];\n')).toEqual([]);
  }, 30_000);

  it("leaves the hooks that connect lib to React alone", async () => {
    expect(await lint("lib/perf/ui-work.ts", 'import { useLayoutEffect } from "react";\nexport const hook = useLayoutEffect;\n')).toEqual([]);
  }, 30_000);
});
