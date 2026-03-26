import { describe, expect, it } from "vitest";
import { buildCandidateRenderModel, mapTablePointToPercent } from "../../../miniprogram/pages/index/table-view";

const mockRequest = {
  mode: "mode1_contact_paths",
  table: { width: 2.84, height: 1.42, pocketR: 0.06 },
  balls: [],
  constraints: {},
  input: {}
} as const;

const mockResponse = {
  solver: "local-geo",
  elapsedMs: 3,
  candidates: [
    {
      id: "candidate-a",
      score: 1,
      cushions: 2,
      blocked: false,
      segments: [{ from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, event: "start" }],
      metrics: { travelDistance: 1, minClearance: 0.5, estError: 0 }
    },
    {
      id: "candidate-b",
      score: 2,
      cushions: 3,
      blocked: false,
      segments: [
        { from: { x: 0, y: 0 }, to: { x: 0.5, y: 0.2 }, event: "start" },
        { from: { x: 0.5, y: 0.2 }, to: { x: 0.7, y: 0.5 }, event: "cushion" },
        { from: { x: 0.7, y: 0.5 }, to: { x: 0.8, y: 0.6 }, event: "contact" }
      ],
      metrics: { travelDistance: 2, minClearance: 0.4, estError: 0 }
    }
  ]
} as const;

describe("table-view helpers", () => {
  it("maps normalized table points into percentage positions", () => {
    expect(mapTablePointToPercent({ x: 0.18, y: 0.24 })).toEqual({ left: "18%", top: "24%" });
  });

  it("selects the requested candidate and exposes route segments", () => {
    const model = buildCandidateRenderModel(mockRequest, mockResponse, "candidate-b");
    expect(model.selectedCandidate?.id).toBe("candidate-b");
    expect(model.selectedCandidate?.segments).toHaveLength(3);
  });
});

