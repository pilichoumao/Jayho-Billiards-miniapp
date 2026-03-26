import type { Vec2 } from "./types";

export type Segment = {
  from: Vec2;
  to: Vec2;
};

export type CushionAxis = "vertical" | "horizontal";

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, factor: number): Vec2 {
  return { x: v.x * factor, y: v.y * factor };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function segment(from: Vec2, to: Vec2): Segment {
  return { from, to };
}

export function segmentLength(value: Segment): number {
  return length(subtract(value.to, value.from));
}

export function distancePointToSegment(point: Vec2, value: Segment): number {
  const ab = subtract(value.to, value.from);
  const ap = subtract(point, value.from);
  const abLengthSquared = dot(ab, ab);

  if (abLengthSquared === 0) {
    return length(ap);
  }

  const t = Math.max(0, Math.min(1, dot(ap, ab) / abLengthSquared));
  const closest = add(value.from, scale(ab, t));

  return length(subtract(point, closest));
}

export function reflectDirection(direction: Vec2, cushion: CushionAxis): Vec2 {
  return cushion === "vertical"
    ? { x: -direction.x, y: direction.y }
    : { x: direction.x, y: -direction.y };
}
