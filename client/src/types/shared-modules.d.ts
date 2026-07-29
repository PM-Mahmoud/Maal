declare module "*super-contrib.mjs" {
  export function remainingConcessionalCap(
    sgContribution: number,
    concessionalCap: number,
  ): number;

  export function cappedTotalContribution(
    sgContribution: number,
    extraContribution: number,
    concessionalCap: number,
  ): number;
}
