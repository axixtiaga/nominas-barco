import { ok } from "@/lib/http";
import { COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  const res = ok({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
