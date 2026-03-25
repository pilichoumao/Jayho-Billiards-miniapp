import { describe, expect, it } from "vitest";
import { validateRequest } from "../validate";
import type { Ball, SolveRequest } from "../types";

function makeBall(overrides: Partial<Ball> = {}): Ball {
  const { pos, ...rest } = overrides;

  return {
    id: "cue",
    role: "cue",
    pos: {
      x: pos?.x ?? 0.2,
      y: pos?.y ?? 0.2
    },
    radius: 0.028,
    ...rest
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
        balls: [makeBall(), makeBall({ id: "target", role: "target", pos: { x: 0.6, y: 0.6 } })],
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

  it("ignores cushion range fields in mode2", () => {
    const result = validateRequest(
      makeRequest({
        mode: "mode2_cue_direction",
        balls: [makeBall()],
        constraints: {
          cushionMin: 5,
          cushionMax: 2,
          timeoutMs: 2000
        },
        input: {
          cueDirection: { x: 1, y: 0 }
        }
      })
    );

    expect(result.constraints.cushionMin).toBe(5);
    expect(result.constraints.cushionMax).toBe(2);
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
          balls: [makeBall(), makeBall({ id: "target", role: "target", pos: { x: 0.2, y: 0.2 } })]
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
            makeBall({ id: "target", role: "target", pos: { x: 0.98, y: 0.6 }, radius: 0.03 })
          ]
        })
      )
    ).toThrow(/bound/i);
  });
});
