import type { Vec2 } from "./types";
import { distancePointToSegment, type Segment } from "./geometry";

export function channelHitsBall(segment: Segment, center: Vec2, radius: number): boolean {
  return distancePointToSegment(center, segment) <= radius;
}
