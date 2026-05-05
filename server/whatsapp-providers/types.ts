/* ------------------------------------------------------------------
   WhatsApp provider abstraction.
   Each provider adapter normalizes its native webhook payload shape
   into the "canonical" shape that the existing
   processWebhookWithUserContext() function understands (which is
   wapi24's shape, since that's what it was originally built for).
   ------------------------------------------------------------------*/

export interface NormalizedEvent {
  /** Which provider this event came from. */
  provider: string;
  /** Instance identifier extracted from the payload (e.g. wapi24's
   *  instance_id, Evolution's instance). */
  instanceId: string | undefined;
  /** Event type name as reported by the provider. */
  eventType: string | undefined;
  /** The payload reshaped to match wapi24's structure so the existing
   *  downstream parser works unchanged. */
  canonicalPayload: any;
}

export interface WhatsAppProvider {
  /** Provider name, e.g. 'wapi24', 'evolution'. */
  readonly name: string;
  /** Convert an incoming raw webhook body into a NormalizedEvent.
   *  Return null if the payload is unrecognizable for this provider. */
  normalize(rawBody: any): NormalizedEvent | null;
}
