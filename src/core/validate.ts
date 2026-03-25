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
        req.mode === "mode1_contact_paths"
          ? req.constraints.cushionMin ?? DEFAULT_CUSHION_MIN
          : req.constraints.cushionMin,
      cushionMax:
        req.mode === "mode1_contact_paths"
          ? req.constraints.cushionMax ?? DEFAULT_CUSHION_MAX
          : req.constraints.cushionMax,
      avoidObstacle: req.constraints.avoidObstacle ?? DEFAULT_AVOID_OBSTACLE,
      timeoutMs: req.constraints.timeoutMs ?? DEFAULT_TIMEOUT_MS
    },
    input: {
      ...req.input
    },
    balls: req.balls.map((ball) => ({
      ...ball,
      pos: { ...ball.pos }
    }))
  };

  if (!hasCue(normalized.balls)) {
    throw new Error("cue ball is required");
  }

  if (normalized.mode === "mode1_contact_paths" && !hasTarget(normalized.balls)) {
    throw new Error("mode1 requires target ball");
  }

  if (
    normalized.mode === "mode1_contact_paths" &&
    normalized.constraints.cushionMin != null &&
    normalized.constraints.cushionMax != null &&
    normalized.constraints.cushionMin > normalized.constraints.cushionMax
  ) {
    throw new Error("cushionMin must be <= cushionMax");
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
  return balls.some((ball) => ball.role === "cue");
}

function hasTarget(balls: Ball[]): boolean {
  return balls.some((ball) => ball.role === "target");
}

function validateBallBounds(balls: Ball[]): void {
  for (const ball of balls) {
    if (
      ball.pos.x < ball.radius ||
      ball.pos.x > 1 - ball.radius ||
      ball.pos.y < ball.radius ||
      ball.pos.y > 1 - ball.radius
    ) {
      throw new Error("ball out of bounds");
    }
  }
}

function validateBallOverlap(balls: Ball[]): void {
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      const dx = a.pos.x - b.pos.x;
      const dy = a.pos.y - b.pos.y;
      const minDistance = a.radius + b.radius;
      if (dx * dx + dy * dy < minDistance * minDistance) {
        throw new Error("balls overlap");
      }
    }
  }
}
