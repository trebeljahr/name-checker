export async function register(): Promise<void> {
  // Runtime workers must not open the app database or send mail during a build,
  // in Edge isolates, or inside test/development tool processes.
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NODE_ENV !== "production"
  )
    return;
  const { startWatchRecovery } = await import("./lib/watch-job-runtime");
  startWatchRecovery();
}
