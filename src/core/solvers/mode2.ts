import { distancePointToSegment, segment, segmentLength } from "../geometry";
import type { Ball, CandidatePath, PathSegment, SolveRequest, SolveResponse, Vec2 } from "../types";

type CushionSide = "left" | "right" | "top" | "bottom";

type RayHit =
  | {
      kind: "ball";
      t: number;
      point: Vec2;
    }
  | {
      kind: "cushion";
      t: number;
      point: Vec2;
      side: CushionSide;
    };

const EPSILON = 1e-9;
const MAX_BOUNCES = 16;
const DEFAULT_MIN_CLEARANCE = 1;

export function solveMode2(req: SolveRequest): SolveResponse {
  if (req.mode !== "mode2_cue_direction") {
    throw new Error("solveMode2 requires mode2_cue_direction request");
  }

  const startedAt = Date.now();
  const cue = getBall(req.balls, "cue");
  const direction = normalize(req.input.cueDirection as Vec2);
  const candidate = simulateTrajectory(cue, direction, req.balls.filter((ball) => ball.role !== "cue"));

  return {
    solver: "local-geo",
    elapsedMs: Date.now() - startedAt,
    candidates: [candidate]
  };
}

function simulateTrajectory(cue: Ball, initialDirection: Vec2, balls: Ball[]): CandidatePath {
  const segments: PathSegment[] = [];
  let current = { ...cue.pos };
  let direction = { ...initialDirection };
  let cushions = 0;
  let travelDistance = 0;
  let minClearance = Number.POSITIVE_INFINITY;

  for (let bounce = 0; bounce < MAX_BOUNCES; bounce += 1) {
    const hit = findNextHit(current, direction, cue.radius, balls);

    if (!hit) {
      const endPoint = advanceToTableEdge(current, direction);
      appendSegment(segments, current, endPoint, segments.length === 0 ? "start" : "end");
      travelDistance += segmentLength(segment(current, endPoint));
      break;
    }

    const event: PathSegment["event"] = segments.length === 0 ? "start" : hit.kind === "cushion" ? "cushion" : "contact";
    appendSegment(segments, current, hit.point, event);
    travelDistance += segmentLength(segment(current, hit.point));
    minClearance = Math.min(minClearance, computeMinClearance(segments[segments.length - 1], cue.radius, balls));

    if (hit.kind === "ball") {
      break;
    }

    cushions += 1;
    current = hit.point;
    direction = reflect(direction, hit.side);
  }

  if (!Number.isFinite(minClearance)) {
    minClearance = DEFAULT_MIN_CLEARANCE;
  }

  return {
    id: `mode2-${cushions}-${segments.length}`,
    score: rankScore(cushions, travelDistance, minClearance),
    cushions,
    blocked: false,
    segments,
    metrics: {
      travelDistance,
      minClearance,
      estError: 0
    }
  };
}

function findNextHit(current: Vec2, direction: Vec2, cueRadius: number, balls: Ball[]): RayHit | null {
  let bestBall: RayHit | null = null;

  for (const ball of balls) {
    const hit = intersectRayCircle(current, direction, ball, cueRadius);

    if (!hit) {
      continue;
    }

    if (!bestBall || hit.t < bestBall.t - EPSILON) {
      bestBall = {
        kind: "ball",
        t: hit.t,
        point: hit.point
      };
    }
  }

  const cushionHit = intersectRayWithTable(current, direction);

  if (bestBall && (!cushionHit || bestBall.t <= cushionHit.t + EPSILON)) {
    return bestBall;
  }

  return cushionHit;
}

function intersectRayCircle(origin: Vec2, direction: Vec2, ball: Ball, cueRadius: number): { t: number; point: Vec2 } | null {
  const dx = origin.x - ball.pos.x;
  const dy = origin.y - ball.pos.y;
  const radius = cueRadius + ball.radius;
  const b = 2 * (dx * direction.x + dy * direction.y);
  const c = dx * dx + dy * dy - radius * radius;
  const discriminant = b * b - 4 * c;

  if (discriminant < 0) {
    return null;
  }

  const root = Math.sqrt(discriminant);
  const t1 = (-b - root) / 2;
  const t2 = (-b + root) / 2;
  const t = smallestPositiveT(t1, t2);

  if (t == null) {
    return null;
  }

  return {
    t,
    point: advancePoint(origin, direction, t)
  };
}

function intersectRayWithTable(origin: Vec2, direction: Vec2): RayHit | null {
  const candidates: RayHit[] = [];

  if (direction.x > EPSILON) {
    const t = (1 - origin.x) / direction.x;
    if (t > EPSILON) {
      candidates.push({ kind: "cushion", t, point: { x: 1, y: origin.y + direction.y * t }, side: "right" });
    }
  } else if (direction.x < -EPSILON) {
    const t = (0 - origin.x) / direction.x;
    if (t > EPSILON) {
      candidates.push({ kind: "cushion", t, point: { x: 0, y: origin.y + direction.y * t }, side: "left" });
    }
  }

  if (direction.y > EPSILON) {
    const t = (1 - origin.y) / direction.y;
    if (t > EPSILON) {
      candidates.push({ kind: "cushion", t, point: { x: origin.x + direction.x * t, y: 1 }, side: "bottom" });
    }
  } else if (direction.y < -EPSILON) {
    const t = (0 - origin.y) / direction.y;
    if (t > EPSILON) {
      candidates.push({ kind: "cushion", t, point: { x: origin.x + direction.x * t, y: 0 }, side: "top" });
    }
  }

  let best: RayHit | null = null;

  for (const candidate of candidates) {
    if (!isInsideTable(candidate.point)) {
      continue;
    }

    if (!best || candidate.t < best.t - EPSILON) {
      best = candidate;
    }
  }

  return best;
}

function advanceToTableEdge(origin: Vec2, direction: Vec2): Vec2 {
  const hit = intersectRayWithTable(origin, direction);

  return hit ? hit.point : { ...origin };
}

function appendSegment(segments: PathSegment[], from: Vec2, to: Vec2, event: PathSegment["event"]): void {
  segments.push({ from, to, event });
}

function computeMinClearance(currentSegment: PathSegment, cueRadius: number, balls: Ball[]): number {
  let minClearance = Number.POSITIVE_INFINITY;

  for (const ball of balls) {
    const clearance = distancePointToSegment(ball.pos, segment(currentSegment.from, currentSegment.to)) - (cueRadius + ball.radius);
    minClearance = Math.min(minClearance, clearance);
  }

  return minClearance;
}

function smallestPositiveT(t1: number, t2: number): number | null {
  let best = Number.POSITIVE_INFINITY;

  for (const t of [t1, t2]) {
    if (t > EPSILON && t < best) {
      best = t;
    }
  }

  return Number.isFinite(best) ? best : null;
}

function normalize(value: Vec2): Vec2 {
  const length = Math.hypot(value.x, value.y);

  if (length <= EPSILON) {
    throw new Error("cueDirection must not be zero");
  }

  return {
    x: value.x / length,
    y: value.y / length
  };
}

function isInsideTable(point: Vec2): boolean {
  return point.x >= -EPSILON && point.x <= 1 + EPSILON && point.y >= -EPSILON && point.y <= 1 + EPSILON;
}

function reflect(direction: Vec2, side: CushionSide): Vec2 {
  switch (side) {
    case "left":
    case "right":
      return { x: -direction.x, y: direction.y };
    case "top":
    case "bottom":
      return { x: direction.x, y: -direction.y };
  }
}

function rankScore(cushions: number, travelDistance: number, minClearance: number): number {
  return 1_000_000 - cushions * 1_000 - travelDistance * 100 + minClearance * 10;
}

function getBall(balls: Ball[], role: Ball["role"]): Ball {
  const ball = balls.find((candidate) => candidate.role === role);

  if (!ball) {
    throw new Error(`${role} ball is required`);
  }

  return ball;
}

function advancePoint(point: Vec2, direction: Vec2, t: number): Vec2 {
  return {
    x: point.x + direction.x * t,
    y: point.y + direction.y * t
  };
}
