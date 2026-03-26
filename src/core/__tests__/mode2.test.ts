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

function makeTimeoutRequest(timeoutMs: number): SolveRequest {
  return validateRequest({
    mode: "mode2_cue_direction",
    table: {
      width: 2.84,
      height: 1.42,
      pocketR: 0.06
    },
    balls: [
      {
        id: "cue",
        role: "cue",
        pos: { x: 0.2, y: 0.4 },
        radius: 0.028
      }
    ],
    constraints: {
      avoidObstacle: true,
      timeoutMs
    },
    input: {
      cueDirection: { x: 1, y: 0.1 }
    }
  });
}

function makeObstacleBeforeTargetRequest(): SolveRequest {
  return validateRequest({
    mode: "mode2_cue_direction",
    table: {
      width: 2.84,
      height: 1.42,
      pocketR: 0.06
    },
    balls: [
      {
        id: "cue",
        role: "cue",
        pos: { x: 0.2, y: 0.4 },
        radius: 0.028
      },
      {
        id: "obstacle-1",
        role: "obstacle",
        pos: { x: 0.45, y: 0.425 },
        radius: 0.028
      },
      {
        id: "target",
        role: "target",
        pos: { x: 0.7, y: 0.45 },
        radius: 0.028
      }
    ],
    constraints: {
      avoidObstacle: true,
      timeoutMs: 2000
    },
    input: {
      cueDirection: { x: 1, y: 0.1 }
    }
  });
}

describe("solveMode2", () => {
  it("reflects off cue-center bounds before contacting the target", () => {
    const scene = loadScene("mode2-direction");

    const first = solveMode2(scene);
    const second = solveMode2(scene);

    expect(first.solver).toBe("local-geo");
    expect(first.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(first.candidates.length).toBe(1);
    expect(first.candidates[0].blocked).toBe(false);
    expect(first.candidates[0].rejectReason).toBeUndefined();
    expect(first.candidates[0].cushions).toBe(1);
    expect(first.candidates[0].segments).toHaveLength(2);
    expect(first.candidates[0].segments[0].to.x).toBeCloseTo(0.972, 6);
    expect(first.candidates[0].segments[0].to.y).toBeGreaterThan(0.028);
    expect(first.candidates[0].segments[0].to.y).toBeLessThan(0.972);
    expect(first.candidates[0].segments[first.candidates[0].segments.length - 1]?.event).toBe("contact");
    expect(first.candidates[0].segments.map((segment) => segment.event)).toEqual([
      "start",
      "contact"
    ]);
    expect(summarizeCandidate(first.candidates[0])).toEqual(summarizeCandidate(second.candidates[0]));
  });

  it("terminates on the travel-distance threshold when no contact occurs", () => {
    const scene = makeTimeoutRequest(2000);

    const result = solveMode2(scene);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].rejectReason).toBe("travel-distance-threshold");
    expect(result.candidates[0].metrics.travelDistance).toBeLessThanOrEqual(2.5);
    expect(result.candidates[0].segments.some((segment) => segment.event === "contact")).toBe(false);
  });

  it("terminates immediately when timeoutMs is zero", () => {
    const scene = makeTimeoutRequest(0);

    const result = solveMode2(scene);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].rejectReason).toBe("timeout");
  });

  it("marks the candidate unusable when an obstacle is hit before the target", () => {
    const scene = makeObstacleBeforeTargetRequest();

    const result = solveMode2(scene);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].blocked).toBe(true);
    expect(result.candidates[0].rejectReason).toBe("blocked by obstacle");
    expect(result.candidates[0].segments).toHaveLength(1);
    expect(result.candidates[0].segments[0].event).toBe("start");
  });

  it("throws a clear error when cueDirection is missing at the solver level", () => {
    expect(() =>
      solveMode2(
        {
          mode: "mode2_cue_direction",
          table: {
            width: 2.84,
            height: 1.42,
            pocketR: 0.06
          },
          balls: [
            {
              id: "cue",
              role: "cue",
              pos: { x: 0.2, y: 0.4 },
              radius: 0.028
            }
          ],
          constraints: {
            avoidObstacle: true,
            timeoutMs: 2000
          },
          input: {}
        } as SolveRequest
      )
    ).toThrow(/cueDirection/i);
  });
});
