import { describe, expect, it } from "vitest";
import { channelHitsBall } from "../collision";
import { segment } from "../geometry";

describe("collision primitives", () => {
  it("detects when a ball intersects a segment channel", () => {
    const s = segment({ x: 0, y: 0 }, { x: 1, y: 0 });

    expect(channelHitsBall(s, { x: 0.5, y: 0.04 }, 0.05)).toBe(true);
    expect(channelHitsBall(s, { x: 0.5, y: 0.06 }, 0.05)).toBe(false);
  });
});
