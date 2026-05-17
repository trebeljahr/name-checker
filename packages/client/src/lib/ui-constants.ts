import type {
  CheckStatus,
  ProviderCategory,
  Subverdict,
  Verdict,
} from "@starter/shared/types";
import {
  CATEGORIES,
  STATUS_LONG_LABEL,
  SUBVERDICT_LABEL,
  VERDICT_LONG_LABEL,
  VERDICT_SHORT_LABEL,
} from "@starter/shared/constants";

export const CATEGORY_ORDER: readonly ProviderCategory[] = CATEGORIES;

export const CATEGORY_LABEL_SHORT: Record<ProviderCategory, string> = {
  trademark: "Trademarks",
  domain: "Domains",
  social: "Social",
  appstore: "App stores",
  package: "Packages",
  code: "Code",
};

export const CATEGORY_LABEL_LONG: Record<ProviderCategory, string> = {
  trademark: "Trademarks",
  domain: "Domains",
  social: "Social handles",
  appstore: "App stores",
  package: "Package registries",
  code: "Code hosts",
};

export const SUBVERDICT_STYLE: Record<Subverdict, { label: string; cls: string }> = {
  clear: {
    label: SUBVERDICT_LABEL.clear,
    cls: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  },
  caution: {
    label: SUBVERDICT_LABEL.caution,
    cls: "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  },
  blocked: {
    label: SUBVERDICT_LABEL.blocked,
    cls: "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-300",
  },
};

export const STATUS_STYLE: Record<CheckStatus, { label: string; cls: string }> = {
  available: {
    label: STATUS_LONG_LABEL.available,
    cls: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  },
  taken: {
    label: STATUS_LONG_LABEL.taken,
    cls: "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-300",
  },
  partial: {
    label: STATUS_LONG_LABEL.partial,
    cls: "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  },
  manual_verify: {
    label: STATUS_LONG_LABEL.manual_verify,
    cls: "bg-sky-500/10 text-sky-700 ring-sky-500/30 dark:text-sky-300",
  },
  unknown: {
    label: STATUS_LONG_LABEL.unknown,
    cls: "bg-zinc-500/10 text-zinc-600 ring-zinc-500/30 dark:text-zinc-400",
  },
  error: {
    label: STATUS_LONG_LABEL.error,
    cls: "bg-fuchsia-500/10 text-fuchsia-700 ring-fuchsia-500/30 dark:text-fuchsia-300",
  },
};

export const VERDICT_STYLE_LONG: Record<Verdict, { label: string; cls: string }> = {
  likely_available: {
    label: VERDICT_LONG_LABEL.likely_available,
    cls: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/40 dark:text-emerald-300",
  },
  likely_taken: {
    label: VERDICT_LONG_LABEL.likely_taken,
    cls: "bg-rose-500/15 text-rose-700 ring-rose-500/40 dark:text-rose-300",
  },
  mixed: {
    label: VERDICT_LONG_LABEL.mixed,
    cls: "bg-amber-500/15 text-amber-700 ring-amber-500/40 dark:text-amber-300",
  },
};

export const VERDICT_STYLE_SHORT: Record<Verdict, { label: string; cls: string }> = {
  likely_available: {
    label: VERDICT_SHORT_LABEL.likely_available,
    cls: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/40 dark:text-emerald-300",
  },
  likely_taken: {
    label: VERDICT_SHORT_LABEL.likely_taken,
    cls: "bg-rose-500/15 text-rose-700 ring-rose-500/40 dark:text-rose-300",
  },
  mixed: {
    label: VERDICT_SHORT_LABEL.mixed,
    cls: "bg-amber-500/15 text-amber-700 ring-amber-500/40 dark:text-amber-300",
  },
};

export const STATUS_DOT: Record<
  CheckStatus,
  { glyph: string; cls: string; label: string }
> = {
  taken: { glyph: "●", cls: "text-rose-600 dark:text-rose-400", label: "taken" },
  partial: { glyph: "●", cls: "text-amber-600 dark:text-amber-400", label: "partial" },
  manual_verify: { glyph: "●", cls: "text-sky-600 dark:text-sky-400", label: "verify" },
  unknown: { glyph: "●", cls: "text-zinc-500 dark:text-zinc-500", label: "unknown" },
  available: { glyph: "●", cls: "text-emerald-600 dark:text-emerald-400", label: "available" },
  error: { glyph: "●", cls: "text-fuchsia-600 dark:text-fuchsia-400", label: "error" },
};
