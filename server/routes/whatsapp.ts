/* ------------------------------------------------------------------
   Legacy module — kept only for the in-memory name-cache exports
   that server/routes.ts continues to consume in several places.

   The wapi24 HTTP plumbing (callMB) and the registerWhatsAppRoutes()
   handlers were removed in the Evolution migration. All real
   WhatsApp integration lives in server/routes/whatsapp-secure.ts
   and server/evolution-client.ts now.
   ------------------------------------------------------------------*/

// In-memory name caches consumed by server/routes.ts to enrich
// outgoing webhook / dashboard responses with friendlier group +
// sender names. Populated by the webhook handler.
export const groupNameMap = new Map<string, string>();
export const contactNameMap = new Map<string, string>();

// Legacy aliases (older call sites use the singular form)
export const groupNameCache = groupNameMap;
export const contactNameCache = contactNameMap;
