/* ------------------------------------------------------------------
   WhatsApp provider dispatcher.

   Evolution API is the sole active provider. The abstraction layer
   is preserved so a future provider (Whapi.cloud / WAHA / Maytapi)
   can be added by:
     1. Creating a new adapter file in this directory
     2. Importing it here
     3. Adding it to the `providers` map
     4. Setting WHATSAPP_PROVIDER=<new-name> in env

   Note: legacy wapi24/mblaster historical webhook payloads stored in
   raw_webhook_events with provider='wapi24' will be replayed via the
   evolution adapter as a fallback — the canonical shape is similar
   enough that the parser still extracts watch listings correctly.
   ------------------------------------------------------------------*/
import type { WhatsAppProvider } from "./types";
import { evolutionProvider } from "./evolution";

export type { WhatsAppProvider, NormalizedEvent } from "./types";

const providers: Record<string, WhatsAppProvider> = {
  evolution: evolutionProvider,
};

/** Resolve the active provider based on WHATSAPP_PROVIDER env var. */
export function getActiveProvider(): WhatsAppProvider {
  const name = (process.env.WHATSAPP_PROVIDER || "evolution").toLowerCase().trim();
  const provider = providers[name];
  if (!provider) {
    if (name !== "evolution") {
      console.warn(
        `⚠️ Unknown WHATSAPP_PROVIDER='${name}'. Falling back to 'evolution'. ` +
          `Valid values: ${Object.keys(providers).join(", ")}`,
      );
    }
    return evolutionProvider;
  }
  return provider;
}

/** Get a provider adapter by name (used for replay where the provider
 *  was recorded at insert time). Falls back to evolution for unknown
 *  names — including legacy 'wapi24' records, whose shape is close
 *  enough that the parser still works. */
export function getProviderByName(name: string): WhatsAppProvider {
  return providers[(name || "").toLowerCase().trim()] || evolutionProvider;
}
