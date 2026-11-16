import { describe, expect, it } from "vitest";
import { FrameRecorder } from "./frame-recorder";
import { uiWork } from "./ui-work";

describe("frame recorder", () => {
  it("reads idle when nothing was drawn in the window", () => {
    const recorder = new FrameRecorder();
    recorder.record(100, 0, 1);
    const window = recorder.window(5000);
    expect(window.frames).toBe(0);
    expect(window.fps).toBe(0);
    expect(window.intervalP50).toBeNull();
    expect(window.cpuMean).toBeNull();
  });

  it("counts frames per second and percentiles of continuous intervals", () => {
    const recorder = new FrameRecorder();
    let at = 1000;
    recorder.record(at, 0, 1); // first frame after idle: no interval
    for (let index = 0; index < 59; index += 1) {
      const interval = index === 30 ? 50 : 16.7;
      at += interval;
      recorder.record(at, interval, 2);
    }
    const window = recorder.window(at, 1000 + 50);
    expect(window.frames).toBe(60);
    expect(window.intervalP50).toBeCloseTo(16.7, 3);
    expect(window.intervalMax).toBe(50);
    expect(window.cpuMax).toBe(2);
    expect(window.cpuMean).toBeCloseTo((1 + 59 * 2) / 60, 5);
  });

  it("forgets frames outside the window and wraps its buffer", () => {
    const recorder = new FrameRecorder();
    for (let index = 0; index < 2000; index += 1) recorder.record(index * 10, 10, 0.5);
    const window = recorder.window(19_990, 1000);
    expect(window.frames).toBe(101);
    expect(window.fps).toBe(101);
    recorder.clear();
    expect(recorder.window(19_990).frames).toBe(0);
  });
});

describe("UI work meter", () => {
  it("sums updates and their time inside the window", () => {
    uiWork.clear();
    uiWork.record(1000, 2);
    uiWork.record(4000, 3);
    uiWork.record(9000, 1);
    expect(uiWork.window(9000, 5000)).toEqual({ updates: 2, totalMs: 4, maxMs: 3 });
    expect(uiWork.total).toBe(3);
    uiWork.clear();
  });
});

describe("perf badge formatting", () => {
  it("groups thousands without the browser's locale data", async () => {
    const { thousands } = await import("@/components/world/PerfHud");
    expect(thousands(0)).toBe("0");
    expect(thousands(999)).toBe("999");
    expect(thousands(47052)).toBe("47,052");
    expect(thousands(1234567.4)).toBe("1,234,567");
  });
});
