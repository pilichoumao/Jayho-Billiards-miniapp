import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { solveMode2 } from "../solvers/mode2";
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

describe("solveMode2", () => {
  it("reflects off cushions and stops on the first non-cue-ball collision", () => {
    const scene = loadScene("mode2-direction");

    const first = solveMode2(scene);
    const second = solveMode2(scene);

    expect(first.solver).toBe("local-geo");
    expect(first.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(first.candidates.length).toBe(1);
    expect(first.candidates[0].blocked).toBe(false);
    expect(first.candidates[0].cushions).toBe(1);
    expect(first.candidates[0].segments).toHaveLength(2);
    expect(first.candidates[0].segments[0].to.x).toBeCloseTo(1);
    expect(first.candidates[0].segments.at(-1)?.event).toBe("contact");
    expect(first.candidates[0].segments.map((segment) => segment.event)).toEqual([
      "start",
      "contact"
    ]);
    expect(summarizeCandidate(first.candidates[0])).toEqual(summarizeCandidate(second.candidates[0]));
  });
});
