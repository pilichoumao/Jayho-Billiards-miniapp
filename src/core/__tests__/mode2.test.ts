import { describe, expect, it } from "vitest";
import { solveMode2 } from "../solvers/mode2";
import type { SolveRequest } from "../types";
import { validateRequest } from "../validate";

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

function makePocketedRequest(): SolveRequest {
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
      timeoutMs: 2000
    },
    input: {
      cueDirection: { x: 0.8, y: 0.6 }
    }
  });
}

function makeFourBounceRequest(): SolveRequest {
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
        pos: { x: 0.5, y: 0.5 },
        radius: 0.49
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
  it("truncates at a pocket boundary and marks the candidate pocketed", () => {
    const scene = makePocketedRequest();

    const result = solveMode2(scene);

    expect(result.solver).toBe("local-geo");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].blocked).toBe(true);
    expect(result.candidates[0].rejectReason).toBe("pocketed");
    expect(result.candidates[0].cushions).toBe(0);
    expect(result.candidates[0].segments).toHaveLength(1);
    expect(result.candidates[0].segments[0].event).toBe("end");
    expect(result.candidates[0].segments[0].to.x).toBeLessThan(0.972);
    expect(result.candidates[0].segments[0].to.y).toBeLessThan(0.972);
  });

  it("returns only the first four cushions and stays usable", () => {
    const scene = makeFourBounceRequest();

    const result = solveMode2(scene);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].blocked).toBe(false);
    expect(result.candidates[0].rejectReason).toBeUndefined();
    expect(result.candidates[0].cushions).toBe(4);
    expect(result.candidates[0].segments).toHaveLength(4);
    expect(result.candidates[0].segments[0].event).toBe("start");
    expect(result.candidates[0].segments.at(-1)?.event).toBe("cushion");
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
