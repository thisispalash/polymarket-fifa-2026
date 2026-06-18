/**
 * YES/NO arbitrage — thin wrapper over dutchArb for the binary (2-outcome) case.
 */
import { detect, computeStakes } from "./dutchArb";

export function detect2(
  yes: number,
  no: number,
  margin: number,
): ReturnType<typeof detect> {
  return detect([yes, no], margin);
}

export function computeStakes2(
  yes: number,
  no: number,
  budget: number,
): ReturnType<typeof computeStakes> {
  return computeStakes([yes, no], budget);
}
