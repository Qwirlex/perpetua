import { describe, it, expect } from "vitest";
import { decide } from "../src/controller/controller.js";

describe("controller", () => {
  it("researches when solvent above the buffer", () => {
    const d = decide(40_000n, 5_000n, 10_000n);
    expect(d.action).toBe("research");
  });
  it("waits when below the research plus price buffer", () => {
    const d = decide(8_000n, 5_000n, 10_000n);
    expect(d.action).toBe("wait");
    expect(d.reason).toMatch(/runway/i);
  });
});
