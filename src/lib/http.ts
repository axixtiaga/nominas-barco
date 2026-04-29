import { NextResponse } from "next/server";
import { HttpError } from "./session";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: number | ResponseInit) {
  return NextResponse.json({ ok: true, data }, typeof init === "number" ? { status: init } : init);
}
export function fail(status: number, message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}
export function handle(err: unknown) {
  if (err instanceof HttpError) return fail(err.status, err.message);
  if (err instanceof ZodError) return fail(400, "Validación fallida", err.flatten());
  console.error(err);
  return fail(500, err instanceof Error ? err.message : "Error interno");
}
