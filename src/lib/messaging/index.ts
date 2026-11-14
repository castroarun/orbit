import { createMetaAdapter } from "./meta";
import type { MessagingAdapter, MessagingMode } from "./types";
import { wameAdapter } from "./wame";

export * from "./types";
export { waMeLink } from "./wame";

const providerAdapter: MessagingAdapter = {
  mode: "provider",
  async send() {
    return { status: "failed", mode: "provider", error: "Backup provider not set up (only needed if Meta's review stalls)" };
  },
};

/** Pick the adapter for a business's current mode. Switching mode changes nothing else in Orbit. */
export function getAdapter(mode: MessagingMode): MessagingAdapter {
  switch (mode) {
    case "meta":
      return createMetaAdapter();
    case "provider":
      return providerAdapter;
    case "wame":
    default:
      return wameAdapter;
  }
}
