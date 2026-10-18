import { AccountView } from "@/components/AccountView";

export const metadata = {
  title: "Account",
};

// Static page: the account data comes from /api/me in the browser.
export default function AccountPage(): React.ReactElement {
  return <AccountView />;
}
