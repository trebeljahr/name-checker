export async function register(): Promise<void> {
  // Next compiles this file for the Edge runtime too. The import must sit
  // inside a positive NEXT_RUNTIME check: only then does the bundler leave
  // better-sqlite3 out of the Edge build. An early return does not do that
  // in `next dev`, where every page then answers 500.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Runtime workers must not open the app database or send mail during a
    // build or inside test/development tool processes.
    if (
      process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.NODE_ENV !== "production"
    )
      return;
    const { startWatchRecovery } = await import("./lib/watch-job-runtime");
    startWatchRecovery();
  }
}
