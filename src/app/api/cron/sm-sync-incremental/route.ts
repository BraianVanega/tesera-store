import { runCron } from "@/lib/cron-route";
import { runProductSync } from "@/lib/sm/jobs";

/** Cron: ver vercel.json y .github/workflows/sm-cron.yml. Protegido con CRON_SECRET. */
export const maxDuration = 300;

export function GET(request: Request) {
  return runCron(request, "sm-sync-incremental", () => runProductSync("incremental"));
}
