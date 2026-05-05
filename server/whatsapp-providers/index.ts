/* ------------------------------------------------------------------
   WhatsApp provider dispatcher.
   Reads WHATSAPP_PROVIDER env var, returns the matching adapter.
   Default: 'wapi24' for backward compatibility.

   Add new providers (whapi, maytapi, waha) by:
     1. Creating a new adapter file in this directory
     2. Importing it here
     3. Adding a case to getProvider()
   ------------------------------------------------------------------*/
import type { WhatsAppProvider } from "./types";
import { wapi24Provider } from "./wapi24";
import { evolutionProvider } from "./evolution";

export type { WhatsAppProvider, NormalizedEvent } from "./types";

const providers: Record<string, WhatsAppProvider> = {
  wapi24: wapi24Provider,
  evolution: evolutionProvider,
};

/** Resolve the active provider based on WHATSAPP_PROVIDER env var. */
export function getActiveProvider(): WhatsAppProvider {
  const name = (process.env.WHATSAPP_PROVIDER || "wapi24").toLowerCase().trim();
  const provider = providers[name];
  if (!provider) {
    console.warn(
      `⚠️ Unknown WHATSAPP_PROVIDER='${name}'. Falling back to 'wapi24'. ` +
        `Valid values: ${Object.keys(providers).join(", ")}`
    );
    return wapi24Provider;
  }
  return provider;
}

/** Get a provider adapter by name (used for replay where the provider was
 *  recorded at insert time). */
export function getProviderByName(name: string): WhatsAppProvider {
  return providers[(name || "").toLowerCase().trim()] || wapi24Provider;
}
