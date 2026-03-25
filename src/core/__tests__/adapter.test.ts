import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { solveShot } from "../adapter";
import type { SolveRequest } from "../types";

function loadScene(name: string): SolveRequest {
  const raw = readFileSync(new URL(`../../../fixtures/scenes/${name}.json`, import.meta.url), "utf8");

  return JSON.parse(raw) as SolveRequest;
}

describe("solveShot", () => {
  it("routes mode1 requests to the contact-path solver", () => {
    const result = solveShot(loadScene("mode1-basic"));

    expect(result.solver).toBe("local-geo");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].cushions).toBe(2);
  });

  it("routes mode2 requests to the cue-direction solver", () => {
    const result = solveShot(loadScene("mode2-direction"));

    expect(result.solver).toBe("local-geo");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].segments[result.candidates[0].segments.length - 1]?.event).toBe("contact");
  });

  it("validates the request before routing", () => {
    const request = loadScene("mode1-basic");
    request.balls = request.balls.filter((ball) => ball.role !== "target");

    expect(() => solveShot(request)).toThrow(/target/i);
  });

  it("keeps mini program runtime imports inside the miniprogram package root", () => {
    const pageSource = readFileSync(new URL("../../../miniprogram/pages/index/index.ts", import.meta.url), "utf8");

    expect(pageSource).toContain('from "../../core/adapter"');
    expect(pageSource).toContain('from "../../core/types"');

    expect(existsSync(new URL("../../../miniprogram/core/adapter.ts", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../../miniprogram/core/types.ts", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../../miniprogram/core/validate.ts", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../../miniprogram/core/geometry.ts", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../../miniprogram/core/collision.ts", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../../miniprogram/core/solvers/mode1.ts", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../../miniprogram/core/solvers/mode2.ts", import.meta.url))).toBe(true);
  });
});
