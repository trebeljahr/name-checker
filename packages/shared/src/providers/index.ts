import type { Provider } from "../types.js";
import { trademarkProviders } from "./trademark.js";
import { domainProviders } from "./domain.js";
import { socialProviders } from "./social.js";
import { appstoreProviders } from "./appstore.js";
import { packageProviders } from "./registry.js";
import { codeProviders } from "./code.js";

export const allProviders: Provider[] = [
  ...trademarkProviders,
  ...domainProviders,
  ...socialProviders,
  ...appstoreProviders,
  ...packageProviders,
  ...codeProviders,
];

export {
  trademarkProviders,
  domainProviders,
  socialProviders,
  appstoreProviders,
  packageProviders,
  codeProviders,
};
