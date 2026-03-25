import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { solveMode1 } from "../solvers/mode1";
import { solveMode2 } from "../solvers/mode2";
import type { CandidatePath, SolveRequest, SolveResponse } from "../types";
import { validateRequest } from "../validate";

function loadScene(name: string): SolveRequest {
  const raw = readFileSync(new URL(`../../../fixtures/scenes/${name}.json`, import.meta.url), "utf8");

  return validateRequest(JSON.parse(raw) as SolveRequest);
}

function summarizeCandidate(candidate: CandidatePath) {
  return {
    id: candidate.id,
    score: candidate.score,
    cushions: candidate.cushions,
    blocked: candidate.blocked,
    rejectReason: candidate.rejectReason,
    segments: candidate.segments.map((segment) => ({
      event: segment.event,
      from: segment.from,
      to: segment.to
    })),
    metrics: candidate.metrics
  };
}

function summarizeResponse(response: SolveResponse) {
  return {
    solver: response.solver,
    candidates: response.candidates.map(summarizeCandidate)
  };
}

describe("fixture regression suite", () => {
  it("keeps mode1 fixture ordering stable and covers the expected cushion range", () => {
    const scene = loadScene("mode1-basic");

    const first = solveMode1(scene);
    const second = solveMode1(scene);

    expect(summarizeResponse(first)).toEqual(summarizeResponse(second));
    expect(first.solver).toBe("local-geo");
    expect(first.candidates.length).toBeGreaterThan(0);
    expect(first.candidates.some((candidate) => candidate.blocked)).toBe(false);
    expect([...new Set(first.candidates.map((candidate) => candidate.cushions))]).toEqual([2, 3, 4, 5]);
    expect(first.candidates.every((candidate) => candidate.cushions >= 2 && candidate.cushions <= 5)).toBe(true);
    expect(first.candidates[0]).toMatchObject({
      cushions: 2,
      blocked: false,
      rejectReason: undefined
    });
    expect(first.candidates[0].metrics.travelDistance).toBeGreaterThan(0);
    expect(first.candidates[0].metrics.travelDistance).toBeLessThan(10);
    expect(first.candidates[0].metrics.minClearance).toBeGreaterThanOrEqual(0);
    expect(first.candidates[0].segments.at(-1)?.event).toBe("contact");
    expect(first.candidates[0].segments.some((segment) => segment.event === "cushion")).toBe(true);
  });

  it("keeps mode1 blocked fixture deterministic and preserves reject reasons", () => {
    const scene = loadScene("mode1-obstacle-blocked");

    const first = solveMode1(scene);
    const second = solveMode1(scene);

    expect(summarizeResponse(first)).toEqual(summarizeResponse(second));
    expect(first.candidates.length).toBeGreaterThan(0);
    expect(first.candidates.every((candidate) => candidate.blocked)).toBe(true);
    expect(first.candidates.every((candidate) => candidate.rejectReason === "blocked by obstacle")).toBe(true);
    expect(first.candidates.every((candidate) => candidate.cushions >= 2 && candidate.cushions <= 5)).toBe(true);
    expect(first.candidates[0].metrics.travelDistance).toBeGreaterThan(0);
    expect(first.candidates[0].metrics.minClearance).toBeLessThanOrEqual(0);
  });

  it("keeps mode2 contact behavior deterministic for the fixture pack", () => {
    const scene = loadScene("mode2-direction");

    const first = solveMode2(scene);
    const second = solveMode2(scene);

    expect(summarizeResponse(first)).toEqual(summarizeResponse(second));
    expect(first.solver).toBe("local-geo");
    expect(first.candidates).toHaveLength(1);
    expect(first.candidates[0].blocked).toBe(false);
    expect(first.candidates[0].rejectReason).toBeUndefined();
    expect(first.candidates[0].cushions).toBe(1);
    expect(first.candidates[0].segments).toHaveLength(2);
    expect(first.candidates[0].segments[0].event).toBe("start");
    expect(first.candidates[0].segments[1].event).toBe("contact");
    expect(first.candidates[0].segments[0].to.x).toBeCloseTo(0.972, 6);
    expect(first.candidates[0].segments[0].to.y).toBeGreaterThan(0.028);
    expect(first.candidates[0].segments[0].to.y).toBeLessThan(0.972);
    expect(first.candidates[0].metrics.travelDistance).toBeGreaterThan(0);
    expect(first.candidates[0].metrics.travelDistance).toBeGreaterThan(1);
    expect(first.candidates[0].metrics.travelDistance).toBeLessThan(2);
  });

  it("keeps mode2 timeout and threshold semantics stable", () => {
    const scene = loadScene("mode2-direction");
    const thresholdScene = {
      ...scene,
      balls: scene.balls.filter((ball) => ball.role === "cue")
    };

    const thresholdResult = solveMode2(thresholdScene);
    const timeoutResult = solveMode2({
      ...scene,
      constraints: {
        ...scene.constraints,
        timeoutMs: 0
      }
    });

    expect(thresholdResult.candidates).toHaveLength(1);
    expect(thresholdResult.candidates[0].rejectReason).toBe("travel-distance-threshold");
    expect(thresholdResult.candidates[0].segments.some((segment) => segment.event === "contact")).toBe(false);
    expect(thresholdResult.candidates[0].metrics.travelDistance).toBeCloseTo(2.5, 6);

    expect(timeoutResult.candidates).toHaveLength(1);
    expect(timeoutResult.candidates[0].rejectReason).toBe("timeout");
    expect(timeoutResult.candidates[0].segments).toHaveLength(1);
    expect(timeoutResult.candidates[0].segments[0].event).toBe("start");
    expect(timeoutResult.candidates[0].metrics.travelDistance).toBe(0);
  });
});

describe("index page error mapping", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("shows a friendly error when the solver returns no candidates", async () => {
    const pageOptions: Array<Record<string, unknown>> = [];
    const solveShot = vi.fn().mockReturnValue({
      solver: "local-geo",
      elapsedMs: 4,
      candidates: []
    });

    (globalThis as typeof globalThis & { Page?: (_options: Record<string, unknown>) => void }).Page = (
      options: Record<string, unknown>
    ) => {
      pageOptions.push(options);
    };

    vi.doMock("../../../miniprogram/core/adapter", () => ({
      solveShot
    }));

    await import("../../../miniprogram/pages/index/index.ts");

    const page = {
      data: {
        mode: "mode1_contact_paths"
      },
      setData: vi.fn()
    };

    const options = pageOptions[0];
    expect(options).toBeDefined();

    const handleCalculate = (options as { handleCalculate: () => void }).handleCalculate;
    handleCalculate.call(page);

    expect(solveShot).toHaveBeenCalledTimes(1);
    expect(page.setData).toHaveBeenCalledWith(
      expect.objectContaining({
        resultTitle: "",
        resultLines: [],
        errorText: expect.stringMatching(/无可用结果|暂无可用结果|未找到/)
      })
    );
  });
});
