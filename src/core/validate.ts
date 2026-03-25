import type { Ball, SolveRequest } from "./types";

const DEFAULT_CUSHION_MIN = 2;
const DEFAULT_CUSHION_MAX = 5;
const DEFAULT_AVOID_OBSTACLE = true;
const DEFAULT_TIMEOUT_MS = 2000;

export function validateRequest(req: SolveRequest): SolveRequest {
  const normalized: SolveRequest = {
    ...req,
    constraints: {
      cushionMin:
        req.constraints.cushionMin ?? (req.mode === "mode1_contact_paths" ? DEFAULT_CUSHION_MIN : undefined),
      cushionMax:
        req.constraints.cushionMax ?? (req.mode === "mode1_contact_paths" ? DEFAULT_CUSHION_MAX : undefined),
      avoidObstacle: req.constraints.avoidObstacle ?? DEFAULT_AVOID_OBSTACLE,
      timeoutMs: req.constraints.timeoutMs ?? DEFAULT_TIMEOUT_MS
    },
    input: {
      ...req.input
    },
    balls: req.balls.map((ball) => ({ ...ball }))
  };

  if (!hasCue(normalized.balls)) {
    throw new Error("cue ball is required");
  }

  if (normalized.mode === "mode1_contact_paths" && !hasTarget(normalized.balls)) {
    throw new Error("mode1 requires target ball");
  }

  if (
    normalized.constraints.cushionMin != null &&
    normalized.constraints.cushionMax != null &&
    normalized.constraints.cushionMin > normalized.constraints.cushionMax
  ) {
    throw new Error("cushionMin must be <= cushionMax");
  }

  if (normalized.mode === "mode1_contact_paths") {
    if (normalized.constraints.cushionMin == null || normalized.constraints.cushionMax == null) {
      throw new Error("mode1 requires cushion range");
    }
  }

  if (normalized.mode === "mode2_cue_direction" && normalized.input.cueDirection) {
    const { x, y } = normalized.input.cueDirection;
    if (x === 0 && y === 0) {
      throw new Error("cueDirection must not be zero");
    }
  }

  validateBallBounds(normalized.balls);
  validateBallOverlap(normalized.balls);

  return normalized;
}

function hasCue(balls: Ball[]): boolean {
  return balls.some((ball) => ball.kind === "cue");
}

function hasTarget(balls: Ball[]): boolean {
  return balls.some((ball) => ball.kind === "target");
}

function validateBallBounds(balls: Ball[]): void {
  for (const ball of balls) {
    if (ball.x < ball.radius || ball.x > 1 - ball.radius || ball.y < ball.radius || ball.y > 1 - ball.radius) {
      throw new Error("ball out of bounds");
    }
  }
}

function validateBallOverlap(balls: Ball[]): void {
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const minDistance = a.radius + b.radius;
      if (dx * dx + dy * dy < minDistance * minDistance) {
        throw new Error("balls overlap");
      }
    }
  }
}
