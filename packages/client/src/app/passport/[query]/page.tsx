import { PassportPermalink } from "@/components/PassportPermalink";

// One shell page for every `/passport/<name>`, like `/check/<name>`.
export function generateStaticParams(): Array<{ query: string }> {
  return [{ query: "_" }];
}

export const metadata = {
  title: "Brand passport",
  description: "Reserve a name across GitHub, npm, and Bluesky in one flow.",
};

export default function PassportPage(): React.ReactElement {
  return <PassportPermalink />;
}
