// Fair-use limits. Everyone gets the same ones: name-check has no paid plan.
// They keep one person from using up the sources' own rate limits for
// everyone else. Change them here; the server enforces them and the pages
// show them.

/** Names one bulk run can check. */
export const BULK_NAMES_PER_RUN = 25;
/** Bulk runs one account can start per day (UTC). */
export const BULK_RUNS_PER_DAY = 20;
/** Passport reservations one account can start per day (UTC). */
export const PASSPORT_STARTS_PER_DAY = 20;
