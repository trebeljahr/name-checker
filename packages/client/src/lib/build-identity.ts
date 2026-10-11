/**
 * Commit this build was made from. The image build passes it as
 * NEXT_PUBLIC_BUILD_COMMIT, so Next inlines it into server and browser
 * code alike; a local build reports "unknown".
 */
export const BUILD_COMMIT: string =
  process.env.NEXT_PUBLIC_BUILD_COMMIT || "unknown";
