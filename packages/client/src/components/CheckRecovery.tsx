"use client";

export function CheckRecovery({
  pending,
  running,
  error,
  resume,
  dismiss,
}: {
  pending: boolean;
  running: boolean;
  error: string | null;
  resume: () => void;
  dismiss: () => void;
}): React.ReactElement | null {
  if (running) return null;
  return (
    <div className="my-3 space-y-2 text-sm">
      {error && <p role="alert">{error}</p>}
      {pending && (
        <>
          <p>
            An unfinished check is saved in this tab. Resume it without using
            another run.
          </p>
          <button type="button" className="mr-4 underline" onClick={resume}>
            Resume check
          </button>
        </>
      )}
      {(pending || error) && (
        <button type="button" className="underline" onClick={dismiss}>
          Dismiss saved check
        </button>
      )}
    </div>
  );
}
