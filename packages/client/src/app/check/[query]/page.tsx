import { CheckPermalink } from "@/components/CheckPermalink";

// One shell page for every `/check/<name>`: the export writes
// `/check/_/index.html` and `public/_redirects` serves it for any name.
// `next dev` renders the route on demand, the same component either way.
export function generateStaticParams(): Array<{ query: string }> {
  return [{ query: "_" }];
}

export const metadata = {
  title: "Name check",
  description:
    "Name availability check across trademarks, domains, socials, app stores, package registries, and code hosts.",
};

export default function CheckPermalinkPage(): React.ReactElement {
  return <CheckPermalink />;
}
