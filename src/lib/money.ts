import { Prisma } from "@prisma/client";

export const D = (v: number | string | Prisma.Decimal | null | undefined) =>
  v == null || v === "" ? new Prisma.Decimal(0) : new Prisma.Decimal(v as any);

/** Parser de número con formato español (1.234,56) o inglés (1,234.56). */
export function parseNumberES(input: string | null | undefined): number {
  if (!input) return 0;
  let s = String(input).trim();
  if (!s) return 0;
  s = s.replace(/\s+/g, "");
  // Si hay coma y punto, la coma es decimal y el punto es miles
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
