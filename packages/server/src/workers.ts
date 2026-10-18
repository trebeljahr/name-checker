import { startWatchRecovery } from "./lib/watch-job-runtime";

type Recovery = { stop: () => Promise<void> };

/**
 * Background work that starts with the server: watch recovery resumes
 * receipts an earlier process left behind (lib/WATCH_JOBS.md). It never
 * schedules fresh checks; only an authorized `/api/cron/watch` call does.
 *
 * Production only. A development server or a test process must not open
 * the account database for this or send mail.
 */
export function startBackgroundWorkers(env: NodeJS.ProcessEnv = process.env): Recovery | null {
  if (env.NODE_ENV !== "production") return null;
  return startWatchRecovery();
}
