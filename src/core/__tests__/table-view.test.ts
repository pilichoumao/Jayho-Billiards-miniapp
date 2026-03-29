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

  it("exposes six pocket anchors at the standard table locations", () => {
    const model = buildCandidateRenderModel(mockRequest, mockResponse, "candidate-a");

    expect(model.pocketAnchors).toHaveLength(6);
    expect(model.pocketAnchors.map((anchor) => anchor.point)).toEqual([
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 0.5, y: 1 },
      { x: 1, y: 1 }
    ]);
  });

  it("selects the requested candidate and exposes route line geometry", () => {
    const model = buildCandidateRenderModel(mockRequest, mockResponse, "candidate-b");

    expect(model.selectedCandidate?.id).toBe("candidate-b");
    expect(model.selectedCandidate?.segments).toHaveLength(3);
    expect(model.routeSegments).toHaveLength(3);
    expect(model.routeSegments[0]).toMatchObject({
      kind: "start",
      left: "0%",
      top: "0%",
      width: "50.99%"
    });
    expect(model.routeSegments[0].angleDeg).toBeCloseTo(11.31, 3);
    expect(model.routeSegments[2]).toMatchObject({
      kind: "contact",
      left: "70%",
      top: "50%",
      width: "11.18%"
    });
    expect(model.routeArrow?.angleDeg).toBeCloseTo(26.565, 3);
  });

  it("falls back to the first feasible candidate when the requested one is unusable", () => {
    const blockedResponse = {
      ...mockResponse,
      candidates: [
        {
          ...mockResponse.candidates[0],
          blocked: true,
          rejectReason: "blocked by obstacle"
        },
        mockResponse.candidates[1]
      ]
    } as const;

    const model = buildCandidateRenderModel(mockRequest, blockedResponse, "candidate-a");

    expect(model.selectedCandidate?.id).toBe("candidate-b");
    expect(model.routeSegments).toHaveLength(3);
  });

  it("returns no selected candidate when all candidates are unusable", () => {
    const blockedResponse = {
      ...mockResponse,
      candidates: mockResponse.candidates.map((candidate) => ({
        ...candidate,
        blocked: true,
        rejectReason: "blocked by obstacle"
      }))
    } as const;

    const model = buildCandidateRenderModel(mockRequest, blockedResponse, "candidate-a");

    expect(model.selectedCandidate).toBeUndefined();
    expect(model.routePoints).toHaveLength(0);
    expect(model.markers).toHaveLength(0);
    expect(model.routeSegments).toHaveLength(0);
    expect(model.pocketAnchors).toHaveLength(6);
  });
});
