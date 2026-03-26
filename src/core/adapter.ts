import { solveMode1 } from "./solvers/mode1";
import { solveMode2 } from "./solvers/mode2";
import type { SolveRequest, SolveResponse } from "./types";
import { validateRequest } from "./validate";

export function solveShot(req: SolveRequest): SolveResponse {
  const validated = validateRequest(req);

  return validated.mode === "mode1_contact_paths" ? solveMode1(validated) : solveMode2(validated);
}
