import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { solveMode1 } from "../solvers/mode1";
import type { CandidatePath, SolveRequest } from "../types";
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
    segments: candidate.segments,
    metrics: candidate.metrics
  };
}

describe("solveMode1", () => {
  it("returns deterministically ordered non-blocked candidates across cushions 2 through 5", () => {
    const scene = loadScene("mode1-basic");

    const first = solveMode1(scene);
    const second = solveMode1(scene);

    expect(first.solver).toBe("local-geo");
    expect(first.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(first.candidates.length).toBeGreaterThan(0);
    expect(first.candidates.some((candidate) => candidate.blocked)).toBe(false);
    expect([...new Set(first.candidates.map((candidate) => candidate.cushions))]).toEqual([
      2,
      3,
      4,
      5
    ]);
    expect(first.candidates.map(summarizeCandidate)).toEqual(second.candidates.map(summarizeCandidate));
    expect(first.candidates[0]).toMatchObject({
      id: expect.any(String),
      score: expect.any(Number),
      cushions: 2,
      blocked: false,
      segments: expect.any(Array),
      metrics: {
        travelDistance: expect.any(Number),
        minClearance: expect.any(Number)
      }
    });
  });

  it("respects explicit cushion range constraints", () => {
    const scene = loadScene("mode1-basic");
    scene.constraints.cushionMin = 3;
    scene.constraints.cushionMax = 4;

    const result = solveMode1(scene);

    expect([...new Set(result.candidates.map((candidate) => candidate.cushions))]).toEqual([3, 4]);
  });

  it("keeps blocked candidates when every route intersects an obstacle", () => {
    const scene = loadScene("mode1-obstacle-blocked");

    const result = solveMode1(scene);

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((candidate) => candidate.blocked)).toBe(true);
    expect(result.candidates.every((candidate) => candidate.rejectReason?.includes("obstacle"))).toBe(true);
  });
});
