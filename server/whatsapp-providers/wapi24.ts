/* ------------------------------------------------------------------
   wapi24 provider adapter.
   wapi24 IS the canonical shape — this adapter is essentially a
   pass-through that extracts identifying fields. The existing
   processWebhookWithUserContext() was built around this format.
   ------------------------------------------------------------------*/
import type { WhatsAppProvider, NormalizedEvent } from "./types";

export const wapi24Provider: WhatsAppProvider = {
  name: "wapi24",

  normalize(rawBody: any): NormalizedEvent | null {
    if (!rawBody || typeof rawBody !== "object") return null;

    const instanceId =
      (rawBody.instance_id || rawBody.data?.instance_id || "")
        .toString()
        .trim() || undefined;

    const eventType = rawBody.event || rawBody.data?.event;

    return {
      provider: "wapi24",
      instanceId,
      eventType: eventType ? String(eventType) : undefined,
      // wapi24 is canonical — pass through unchanged.
      canonicalPayload: rawBody,
    };
  },
};
