/* ------------------------------------------------------------------
   Evolution API v2 client.
   Central typed HTTP client used by all server code that needs to
   talk to Evolution (https://github.com/EvolutionAPI/evolution-api).
   Replaces the old wapi24-specific `callWhatsAppAPI` / `callMB` helpers.

   Configuration (env vars):
     EVOLUTION_API_URL   base URL (default http://185.193.19.117:8080)
     EVOLUTION_AUTH_KEY  master API key (used when no per-instance key is supplied)

   Per-request override: every method accepts an optional `apiKey` arg
   that takes precedence over the env-var master key.
   ------------------------------------------------------------------*/

const DEFAULT_BASE_URL = "http://185.193.19.117:8080";
const REQUEST_TIMEOUT_MS = 30_000;

export interface EvolutionRequestOptions {
  /** Override base URL for this single call (rare; defaults to env). */
  baseUrl?: string;
  /** Override apikey header for this single call (per-instance key). */
  apiKey?: string;
  /** Override request timeout (ms). Defaults to REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
}

export class EvolutionApiError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = "EvolutionApiError";
    this.status = status;
    this.body = body;
  }
}

function resolveBaseUrl(opts?: EvolutionRequestOptions): string {
  return (opts?.baseUrl || process.env.EVOLUTION_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function resolveApiKey(opts?: EvolutionRequestOptions): string {
  const key = opts?.apiKey || process.env.EVOLUTION_AUTH_KEY || "";
  if (!key) {
    throw new EvolutionApiError(
      "Evolution API key not configured (set EVOLUTION_AUTH_KEY env var or pass per-request apiKey)",
      0,
      null,
    );
  }
  return key;
}

async function evolutionRequest<T = any>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: any,
  opts?: EvolutionRequestOptions,
): Promise<T> {
  const url = `${resolveBaseUrl(opts)}${path.startsWith("/") ? path : "/" + path}`;
  const apiKey = resolveApiKey(opts);
  const timeoutMs = opts?.timeoutMs ?? REQUEST_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      apikey: apiKey,
      Accept: "application/json",
    };
    let payload: BodyInit | undefined;

    if (body instanceof FormData) {
      payload = body;
      // do NOT set Content-Type — let fetch include the multipart boundary
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const resp = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    });

    const text = await resp.text();
    let parsed: any = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!resp.ok) {
      throw new EvolutionApiError(
        `Evolution ${method} ${path} → ${resp.status}: ${
          typeof parsed === "string" ? parsed : JSON.stringify(parsed)
        }`.slice(0, 1000),
        resp.status,
        parsed,
      );
    }

    return parsed as T;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// Instance lifecycle
// ============================================================

export interface CreateInstanceParams {
  instanceName: string;
  /** WHATSAPP-BAILEYS is the only viable choice for our use case. */
  integration?: "WHATSAPP-BAILEYS";
  /** Returns QR in the response when true. */
  qrcode?: boolean;
  /** Optional webhook URL to set on creation. */
  webhook?: {
    url: string;
    events?: string[];
    webhookByEvents?: boolean;
  };
}

export async function createInstance(
  params: CreateInstanceParams,
  opts?: EvolutionRequestOptions,
): Promise<any> {
  return evolutionRequest("POST", "/instance/create", {
    instanceName: params.instanceName,
    qrcode: params.qrcode ?? true,
    integration: params.integration ?? "WHATSAPP-BAILEYS",
    ...(params.webhook && { webhook: params.webhook }),
  }, opts);
}

export async function fetchInstances(
  opts?: EvolutionRequestOptions,
): Promise<any[]> {
  const r = await evolutionRequest<any>("GET", "/instance/fetchInstances", undefined, opts);
  if (Array.isArray(r)) return r;
  if (r && Array.isArray(r.instances)) return r.instances;
  return [];
}

export async function getQrCode(
  instanceName: string,
  opts?: EvolutionRequestOptions,
): Promise<{ base64?: string; code?: string; count?: number; pairingCode?: string }> {
  return evolutionRequest("GET", `/instance/connect/${encodeURIComponent(instanceName)}`, undefined, opts);
}

export interface ConnectionState {
  instance?: { instanceName: string; state: "open" | "close" | "connecting" | string };
  state?: "open" | "close" | "connecting" | string;
}

export async function connectionState(
  instanceName: string,
  opts?: EvolutionRequestOptions,
): Promise<ConnectionState> {
  return evolutionRequest("GET", `/instance/connectionState/${encodeURIComponent(instanceName)}`, undefined, opts);
}

export async function deleteInstance(
  instanceName: string,
  opts?: EvolutionRequestOptions,
): Promise<any> {
  return evolutionRequest("DELETE", `/instance/delete/${encodeURIComponent(instanceName)}`, undefined, opts);
}

export async function logoutInstance(
  instanceName: string,
  opts?: EvolutionRequestOptions,
): Promise<any> {
  return evolutionRequest("POST", `/instance/logout/${encodeURIComponent(instanceName)}`, undefined, opts);
}

// ============================================================
// Webhook configuration
// ============================================================

export interface SetWebhookParams {
  url: string;
  enabled?: boolean;
  events?: string[];
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
}

/**
 * Set per-instance webhook. Tries nested body shape first, then flat —
 * different Evolution v2 builds accept different shapes (parallel-session
 * Gotcha #3 from EVOLUTION_API_VPS notes).
 */
export async function setWebhook(
  instanceName: string,
  params: SetWebhookParams,
  opts?: EvolutionRequestOptions,
): Promise<any> {
  const body = {
    enabled: params.enabled ?? true,
    url: params.url,
    webhookByEvents: params.webhookByEvents ?? false,
    webhookBase64: params.webhookBase64 ?? false,
    events: params.events ?? ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
  };

  try {
    return await evolutionRequest(
      "POST",
      `/webhook/set/${encodeURIComponent(instanceName)}`,
      { webhook: body },
      opts,
    );
  } catch (err) {
    if (err instanceof EvolutionApiError && (err.status === 400 || err.status === 500)) {
      // Retry with the flat shape variant
      return evolutionRequest(
        "POST",
        `/webhook/set/${encodeURIComponent(instanceName)}`,
        body,
        opts,
      );
    }
    throw err;
  }
}

export async function findWebhook(
  instanceName: string,
  opts?: EvolutionRequestOptions,
): Promise<any> {
  return evolutionRequest("GET", `/webhook/find/${encodeURIComponent(instanceName)}`, undefined, opts);
}

// ============================================================
// Messaging
// ============================================================

export interface SendTextParams {
  number: string;       // digits only, e.g. 919XXXXXXXXX (no +), or full JID
  text: string;
  delay?: number;       // ms before sending (Evolution prevents flooding)
  linkPreview?: boolean;
}

export async function sendText(
  instanceName: string,
  params: SendTextParams,
  opts?: EvolutionRequestOptions,
): Promise<any> {
  return evolutionRequest(
    "POST",
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      number: params.number,
      text: params.text,
      delay: params.delay ?? 0,
      linkPreview: params.linkPreview ?? false,
    },
    opts,
  );
}

export interface SendMediaJsonParams {
  number: string;
  mediatype: "image" | "video" | "audio" | "document";
  mimetype: string;
  media: string;        // public URL or base64 data URL
  fileName?: string;
  caption?: string;
  delay?: number;
}

export async function sendMediaJson(
  instanceName: string,
  params: SendMediaJsonParams,
  opts?: EvolutionRequestOptions,
): Promise<any> {
  return evolutionRequest(
    "POST",
    `/message/sendMedia/${encodeURIComponent(instanceName)}`,
    params,
    opts,
  );
}

// ============================================================
// Groups
// ============================================================

export async function fetchAllGroups(
  instanceName: string,
  getParticipants = false,
  opts?: EvolutionRequestOptions,
): Promise<any[]> {
  const qs = getParticipants ? "?getParticipants=true" : "?getParticipants=false";
  const r = await evolutionRequest<any>(
    "GET",
    `/group/fetchAllGroups/${encodeURIComponent(instanceName)}${qs}`,
    undefined,
    opts,
  );
  if (Array.isArray(r)) return r;
  if (r && Array.isArray(r.groups)) return r.groups;
  if (r && Array.isArray(r.data)) return r.data;
  return [];
}

export async function findGroupInfo(
  instanceName: string,
  groupJid: string,
  opts?: EvolutionRequestOptions,
): Promise<any> {
  return evolutionRequest(
    "GET",
    `/group/findGroupInfos/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
    undefined,
    opts,
  );
}

// ============================================================
// Contacts (NEW — wapi24 had no equivalent endpoint)
// ============================================================

export async function fetchAllContacts(
  instanceName: string,
  opts?: EvolutionRequestOptions,
): Promise<any[]> {
  const r = await evolutionRequest<any>(
    "GET",
    `/contact/fetchAllContacts/${encodeURIComponent(instanceName)}`,
    undefined,
    opts,
  );
  if (Array.isArray(r)) return r;
  if (r && Array.isArray(r.contacts)) return r.contacts;
  if (r && Array.isArray(r.data)) return r.data;
  return [];
}

// ============================================================
// Convenience aggregator (for diagnostic endpoints)
// ============================================================

export const evolutionClient = {
  createInstance,
  fetchInstances,
  getQrCode,
  connectionState,
  deleteInstance,
  logoutInstance,
  setWebhook,
  findWebhook,
  sendText,
  sendMediaJson,
  fetchAllGroups,
  findGroupInfo,
  fetchAllContacts,
};

export default evolutionClient;
