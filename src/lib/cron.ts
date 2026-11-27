import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron (y el workflow de GitHub) mandan `Authorization: Bearer $CRON_SECRET`.
 * Sin secreto configurado, nadie pasa.
 */
export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
