import type { Metadata } from "next";
import "@/styles/globals.css";
import { BUILD_COMMIT } from "@/lib/build-identity";
import { ErrorReporting } from "@/components/ErrorReporting";

export const metadata: Metadata = {
  title: {
    default: "Name Checker",
    template: "%s | Name Checker",
  },
  description:
    "Check name availability across domains, trademarks, app stores, and company registries.",
  manifest: "/manifest.json",
  // <meta name="build-commit">: which commit rendered this page.
  other: { "build-commit": BUILD_COMMIT },
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

/*
 * CI sets this to "" when the repo variable is unset. A ternary, never
 * `domain && <script/>`: as the only child of <head> that renders "" as a
 * text node, the exported HTML has none, hydration fails (React #418), and
 * React's recovery drops every <link> in <head> — the stylesheet included.
 */
const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {plausibleDomain ? (
          <script
            defer
            data-domain={plausibleDomain}
            src={
              process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL ||
              "https://plausible.io/js/script.js"
            }
          />
        ) : null}
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ErrorReporting />
        {children}
      </body>
    </html>
  );
}
