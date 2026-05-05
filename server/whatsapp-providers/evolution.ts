/* ------------------------------------------------------------------
   Evolution API provider adapter.

   Evolution's native payload shape (Baileys-style):
   {
     "event": "messages.upsert",
     "instance": "watchbot1",
     "data": {
       "key": { "remoteJid": "...", "fromMe": false, "id": "..." },
       "pushName": "Dealer Name",
       "messageTimestamp": 1714928765,
       "message": { "conversation": "..." }
     }
   }

   wapi24's canonical shape (what downstream code expects):
   {
     "instance_id": "ABC123",
     "event": "message",
     "data": {
       "messages": [
         { "key": {...}, "pushName": "...", "messageTimestamp": ..., "message": {...} }
       ]
     }
   }

   This adapter rewrites Evolution payloads into wapi24's shape so the
   existing processWebhookWithUserContext() works unchanged.

   IMPORTANT: confirmed payload shape during Phase 3.5 sandbox test
   (webhook.site). If Evolution emits a different shape than expected,
   this is the file to update.
   ------------------------------------------------------------------*/
import type { WhatsAppProvider, NormalizedEvent } from "./types";

// Evolution emits multiple event types. Map relevant ones to wapi24's
// "message" event so downstream code recognizes them.
const EVOLUTION_MESSAGE_EVENTS = new Set([
  "messages.upsert",
  "MESSAGES_UPSERT",
  "messages.update",
  "MESSAGES_UPDATE",
]);

export const evolutionProvider: WhatsAppProvider = {
  name: "evolution",

  normalize(rawBody: any): NormalizedEvent | null {
    if (!rawBody || typeof rawBody !== "object") return null;

    const evolutionEvent = String(rawBody.event || "").trim();
    const instanceId = String(rawBody.instance || rawBody.instanceName || "").trim() || undefined;

    // Evolution's `data` for a message event is a single Baileys-shaped
    // message object. Wrap it in a `data.messages = [...]` array to match
    // wapi24's shape that downstream code expects.
    const data = rawBody.data;

    // For non-message events (presence, contact updates, etc.), pass through
    // a minimal canonical envelope. The downstream parser will likely no-op.
    if (!EVOLUTION_MESSAGE_EVENTS.has(evolutionEvent)) {
      return {
        provider: "evolution",
        instanceId,
        eventType: evolutionEvent || undefined,
        canonicalPayload: {
          instance_id: instanceId,
          event: evolutionEvent || "unknown",
          data: data ?? {},
        },
      };
    }

    // For message events, wrap into wapi24's expected array form.
    // Evolution can deliver a single message object OR an array depending on
    // version — handle both.
    const messages = Array.isArray(data)
      ? data
      : Array.isArray(data?.messages)
        ? data.messages
        : data
          ? [data]
          : [];

    const canonicalPayload = {
      instance_id: instanceId,
      event: "message",                    // Map to wapi24's event name
      _original_event: evolutionEvent,     // Preserve for debugging
      data: {
        messages,
      },
    };

    return {
      provider: "evolution",
      instanceId,
      eventType: "message",
      canonicalPayload,
    };
  },
};
