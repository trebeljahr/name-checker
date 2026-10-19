import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = {
  title: "Privacy",
  description: "What name-check does with the names you check, your account and error reports.",
};

const CONTACT_EMAIL = "rico@trebeljahr.com";

// Each statement below matches the code it describes. The error report
// lists are the allowlist in lib/error-reporting/scrub.ts plus
// lib/error-reporting/redact-names.ts: change them together.
const REPORT_CONTAINS = [
  "the error message and where in the code it happened",
  "the address of the page, without anything after the question mark and without the name you checked",
  "the addresses, methods and status codes of the last requests the app made",
  "the names of the browser and the operating system",
  "the version of the app that reported the error",
  "the platform the build is for",
];

const REPORT_NEVER_CONTAINS = [
  "the names you check",
  "your name or your email address",
  "your session token or your cookies",
  "anything you typed, and the fields you typed it into",
  "what the app wrote to the browser console",
  "the contents of any request the app made",
  "anything after the question mark in an address",
  "a recording or a picture of the screen",
];

export default function PrivacyPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-6">
        <Link href="/" className="font-mono text-sm font-semibold text-foreground">
          name-check
        </Link>
        <ThemeToggle />
      </div>

      <article
        data-testid="privacy-page"
        className="mx-auto max-w-3xl space-y-10 px-6 py-12 text-sm leading-relaxed text-muted-foreground"
      >
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-wide">Last updated 19 October 2026</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy</h1>
          <p>
            This page lists what names.trebeljahr.com does with your data. Rico Trebeljahr runs
            the site and decides what happens to that data.
          </p>
          <address className="not-italic">
            Rico Trebeljahr, c/o Block Services, Stuttgarter Str. 106, 70736 Fellbach, Germany
            <br />
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-foreground">
              {CONTACT_EMAIL}
            </a>
          </address>
        </header>

        <Section title="Checking a name">
          <p>
            Your browser sends the name to our server. Our server then asks the sources on the{" "}
            <Link href="/#sources" className="underline hover:text-foreground">
              home page
            </Link>{" "}
            whether the name is taken: domain registries, trademark offices, app stores, package
            registries and social sites. Those sites see the name and our server. They do not see
            you.
          </p>
          <p>
            Our server keeps the names and the results of a check for 7 days, then clears them. It
            keeps a hash of each request, so the same request never counts twice against your
            limit. It holds results in memory for 10 minutes, so a second check of the same name
            is faster.
          </p>
          <p>
            Our server uses your IP address to limit how many checks one address can run per hour.
            It keeps the address in memory and stores a hash of it to count the checks.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You sign in with a link that we send to your email address. We store your email
            address and when you created the account. For each sign-in we store the IP address and
            the browser identifier, with the session.
          </p>
          <p>
            A session cookie keeps you signed in for 30 days. The site sets no tracking cookies.
            Amazon Web Services (Amazon SES) delivers our emails.
          </p>
          <p>
            We count your bulk runs per day, to apply the limits of the free plan. To delete your
            account and its data, email {CONTACT_EMAIL}.
          </p>
        </Section>

        <Section title="Payments">
          <p>
            Stripe handles payment for the Pro plan, on its own pages. We send Stripe your email
            address and your account id. We store your Stripe customer id, your plan and the end of
            your billing period. We never see your card details.
          </p>
        </Section>

        <Section title="Watches">
          <p>
            A watch stores the name, the sources to check and the last result, with your account.
            When a result changes, we email you. We keep each run, with the email we sent, for 7
            days after it finishes. You can delete a watch on the{" "}
            <Link href="/watch" className="underline hover:text-foreground">
              watch page
            </Link>
            .
          </p>
        </Section>

        <Section title="Reserving a name">
          <p>
            When you reserve a name on Bluesky, npm or GitHub with Passport, our server passes the
            email address, password or token for that site on to it. It stores none of them. We
            store which name you reserved where, and the outcome.
          </p>
        </Section>

        <Section title="In your browser">
          <p>
            Your browser keeps your last 8 searches, your colour theme and whether you dismissed
            the trademark notice. A check in progress is kept for the browser tab, so a reload
            does not lose it. None of this leaves your browser.
          </p>
        </Section>

        <Section title="Analytics">
          <p>
            We count page views with Plausible Analytics, on a server we run. It sets no cookies
            and stores no IP address.
          </p>
        </Section>

        <Section title="Error reports">
          <p>
            When the site hits an error it did not expect, your browser sends a report to GlitchTip,
            an error tracker on a server we run. With no error, nothing is sent.
          </p>
          <p>A report contains:</p>
          <List items={REPORT_CONTAINS} />
          <p>A report never contains:</p>
          <List items={REPORT_NEVER_CONTAINS} />
          <p>
            Like every request, a report arrives with your IP address. The report itself does not
            name it.
          </p>
        </Section>

        <Section title="Who else handles your data">
          <p>
            Cloudflare carries every request to this site, to our error tracker and to our
            analytics server. Amazon Web Services delivers our emails. Stripe handles payments.
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function List({ items }: { items: readonly string[] }): React.ReactElement {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
