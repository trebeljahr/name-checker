import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = {
  title: "Imprint",
  description: "Who runs names.trebeljahr.com, how to contact them, and the legal notices.",
};

const CONTACT_EMAIL = "imprint+names@trebeljahr.com";

export default function ImprintPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-6">
        <Link href="/" className="font-mono text-sm font-semibold text-foreground">
          name-check
        </Link>
        <ThemeToggle />
      </div>

      <article
        data-testid="imprint-page"
        className="mx-auto max-w-3xl space-y-10 px-6 py-12 text-sm leading-relaxed text-muted-foreground"
      >
        <header className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Imprint</h1>
          <p>
            Information pursuant to § 5 DDG (German Digital Services Act) and § 18 (2) MStV
            (Interstate Media Treaty).
          </p>
          <p>
            See also the{" "}
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy
            </Link>{" "}
            page.
          </p>
        </header>

        <Section title="Service Provider">
          <ProviderAddress />
        </Section>

        <Section title="Contact">
          <p>
            Email:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-foreground">
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>

        <Section title="Person Responsible for Content (§ 18 (2) MStV)">
          <ProviderAddress />
        </Section>

        <Section title="Liability for Content">
          <p>
            As a service provider, I am responsible for my own content on these pages in
            accordance with § 7 (1) DDG and general laws. However, pursuant to §§ 8 to 10 DDG, I
            am not obligated as a service provider to monitor transmitted or stored third-party
            information or to investigate circumstances that indicate illegal activity.
          </p>
          <p>
            Obligations to remove or block the use of information under general laws remain
            unaffected. However, liability in this regard is only possible from the point in time
            at which a specific legal violation becomes known. Upon becoming aware of such
            violations, I will remove this content immediately.
          </p>
        </Section>

        <Section title="Liability for Links">
          <p>
            This site contains links to external websites of third parties over whose content I
            have no influence. Therefore, I cannot assume any liability for these third-party
            contents. The respective provider or operator of the pages is always responsible for
            the content of the linked pages.
          </p>
        </Section>

        <Section title="Copyright">
          <p>
            The content and works created by the site operator on these pages are subject to
            German copyright law. Duplication, processing, distribution, and any kind of use
            outside the limits of copyright require the written consent of the respective author
            or creator.
          </p>
        </Section>
      </article>
    </main>
  );
}

function ProviderAddress(): React.ReactElement {
  return (
    <address className="not-italic">
      Rico Trebeljahr
      <br />
      c/o Block Services
      <br />
      Stuttgarter Str. 106
      <br />
      70736 Fellbach
      <br />
      Germany
    </address>
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
