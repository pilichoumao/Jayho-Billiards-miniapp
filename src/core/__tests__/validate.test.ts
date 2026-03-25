import { describe, expect, it } from "vitest";
import { validateRequest } from "../validate";
import type { Ball, SolveRequest } from "../types";

function makeBall(overrides: Partial<Ball> = {}): Ball {
  return {
    id: "cue",
    kind: "cue",
    x: 0.2,
    y: 0.2,
    radius: 0.028,
    ...overrides
  };
}

function makeRequest(overrides: Partial<SolveRequest> = {}): SolveRequest {
  return {
    mode: "mode1_contact_paths",
    table: {
      width: 2.84,
      height: 1.42,
      pocketR: 0.06
    },
    balls: [makeBall()],
    constraints: {
      avoidObstacle: true,
      timeoutMs: 2000,
      cushionMin: 2,
      cushionMax: 5
    },
    input: {},
    ...overrides
  };
}

describe("validateRequest", () => {
  it("rejects mode1 request without target", () => {
    expect(() =>
      validateRequest(
        makeRequest({
          balls: [makeBall()]
        })
      )
    ).toThrow(/target/i);
  });

  it("applies mode1 defaults for cushion range and obstacle avoidance", () => {
    const result = validateRequest(
      makeRequest({
        balls: [makeBall(), makeBall({ id: "target", kind: "target", x: 0.6, y: 0.6 })],
        constraints: {
          timeoutMs: 2000
        } as SolveRequest["constraints"]
      })
    );

    expect(result.constraints.cushionMin).toBe(2);
    expect(result.constraints.cushionMax).toBe(5);
    expect(result.constraints.avoidObstacle).toBe(true);
    expect(result.constraints.timeoutMs).toBe(2000);
  });

  it("rejects mode2 cue direction with zero magnitude", () => {
    expect(() =>
      validateRequest(
        makeRequest({
          mode: "mode2_cue_direction",
          input: {
            cueDirection: { x: 0, y: 0 }
          }
        })
      )
    ).toThrow(/cueDirection/i);
  });

  it("rejects overlapping balls", () => {
    expect(() =>
      validateRequest(
        makeRequest({
          balls: [
            makeBall(),
            makeBall({ id: "target", kind: "target", x: 0.2, y: 0.2 })
          ]
        })
      )
    ).toThrow(/overlap/i);
  });

  it("rejects balls outside normalized bounds respecting radius", () => {
    expect(() =>
      validateRequest(
        makeRequest({
          balls: [
            makeBall(),
            makeBall({ id: "target", kind: "target", x: 0.98, y: 0.6, radius: 0.03 })
          ]
        })
      )
    ).toThrow(/bound/i);
  });
});
