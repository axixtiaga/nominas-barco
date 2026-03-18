/** Safe conversion helpers for Prisma Decimal <-> number */

export function d(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function sumDecimals(values: unknown[]): number {
  return round2(values.reduce((acc: number, v: unknown) => acc + d(v), 0));
}
