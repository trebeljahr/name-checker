"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";

const ORDER: Theme[] = ["system", "light", "dark"];
const NEXT_LABEL: Record<Theme, string> = {
  system: "Switch to light theme",
  light: "Switch to dark theme",
  dark: "Switch to system theme",
};
const ICON: Record<Theme, React.ComponentType<{ className?: string }>> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export function ThemeToggle(): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const Icon = ICON[theme];
  function cycle(): void {
    const i = ORDER.indexOf(theme);
    const next = ORDER[(i + 1) % ORDER.length];
    if (next) setTheme(next);
  }
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={NEXT_LABEL[theme]}
      title={NEXT_LABEL[theme]}
      data-testid="theme-toggle"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-accent"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
