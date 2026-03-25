import { describe, expect, it } from "vitest";
import {
  distancePointToSegment,
  reflectDirection,
  segment,
  segmentLength
} from "../geometry";

describe("geometry primitives", () => {
  it("reflects a direction on a vertical cushion", () => {
    expect(reflectDirection({ x: 2, y: -1 }, "vertical")).toEqual({
      x: -2,
      y: -1
    });
  });

  it("reflects a direction on a horizontal cushion", () => {
    expect(reflectDirection({ x: 2, y: -1 }, "horizontal")).toEqual({
      x: 2,
      y: 1
    });
  });

  it("measures segment length and point distance", () => {
    const s = segment({ x: 0, y: 0 }, { x: 3, y: 4 });

    expect(segmentLength(s)).toBe(5);
    expect(distancePointToSegment({ x: 3, y: 0 }, s)).toBeCloseTo(2.4, 10);
  });
});
