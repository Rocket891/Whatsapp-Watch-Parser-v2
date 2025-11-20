/**
 * Message normalizer for WhatsApp webhook payloads
 * Handles both Baileys-style and received_message wrapper formats
 */

export type NormalizedMsg = {
  id: string;
  remoteJid: string;
  participant?: string;
  isGroup: boolean;
  isStatus: boolean;
  isBroadcast: boolean;
  timestamp?: number;
  senderName?: string;
  senderJid: string;       // canonical JID (remote for DMs; participant for groups)
  senderE164?: string|null;// "+<digits>" or null if not resolvable (LID)
  senderLid?: string|null; // "<digits>" when server === 'lid'
  text?: string;
  kind: "text" | "image" | "video" | "document" | "audio" | "sticker" | "reaction" | "unknown";
  media?: {
    url?: string;
    mimetype?: string;
    bytes?: number;
    sha256?: string;
    seconds?: number;
    width?: number;
    height?: number;
    caption?: string;
  };
};

export function splitJid(jid?: string) {
  if (!jid || !jid.includes("@")) return { user: "", server: "" as const };
  const [user, server] = jid.split("@", 2);
  return { user, server: server as "s.whatsapp.net" | "c.us" | "g.us" | "lid" | string };
}

function extractTextFromMessage(m: any): string | undefined {
  if (m?.conversation?.trim()) return m.conversation.trim();
  const ext = m?.extendedTextMessage?.text;
  if (ext && ext.trim()) return ext.trim();
  const cap = m?.imageMessage?.caption ?? m?.videoMessage?.caption ?? m?.documentMessage?.caption ?? m?.audioMessage?.caption;
  if (cap && cap.trim()) return cap.trim();
  const btn = m?.buttonsResponseMessage?.selectedButtonId || m?.templateButtonReplyMessage?.selectedId;
  if (btn && btn.trim()) return btn.trim();
  const list = m?.listResponseMessage?.singleSelectReply?.selectedRowId;
  if (list && list.trim()) return list.trim();
  return undefined;
}

function inferKind(m: any) {
  if (m?.imageMessage) return "image";
  if (m?.videoMessage) return "video";
  if (m?.documentMessage) return "document";
  if (m?.audioMessage) return "audio";
  if (m?.stickerMessage) return "sticker";
  if (m?.reactionMessage) return "reaction";
  if (m?.conversation || m?.extendedTextMessage) return "text";
  return "unknown";
}

function extractMedia(m: any) {
  const media = m?.imageMessage || m?.videoMessage || m?.documentMessage || m?.audioMessage;
  if (!media) return undefined;
  return {
    url: media.url,
    mimetype: media.mimetype,
    bytes: media.fileLength ? Number(media.fileLength) : undefined,
    sha256: media.fileSha256,
    seconds: media.seconds,
    width: media.width,
    height: media.height,
    caption: media.caption,
  };
}

export function normalizeBaileys(raw: any): NormalizedMsg {
  const key = raw?.key ?? {};
  const m = raw?.message ?? {};
  const remoteJid = key.remoteJid as string;
  const isStatus = remoteJid === "status@broadcast";
  const isGroup = remoteJid?.endsWith("@g.us") || false;
  const isBroadcast = !!raw?.broadcast;

  const text = extractTextFromMessage(m);
  const kind = inferKind(m);
  const media = extractMedia(m);

  // Who actually sent it:
  const senderJid = isGroup ? key.participant : key.remoteJid;
  const { user, server } = splitJid(senderJid);
  const senderE164 = (server === "s.whatsapp.net" || server === "c.us") && /^\d+$/.test(user) ? `+${user}` : null;
  const senderLid = server === "lid" ? user : null;

  const senderName = raw?.verifiedBizName || raw?.pushName || undefined;

  return {
    id: key.id,
    remoteJid,
    participant: key.participant,
    isGroup,
    isStatus,
    isBroadcast,
    timestamp: raw?.messageTimestamp ? Number(raw.messageTimestamp) : undefined,
    senderName,
    senderJid,
    senderE164,
    senderLid,
    text,
    kind,
    media,
  };
}

// Wrapper normalizer (for your received_message shape)
export function normalizeReceivedWrapper(ev: any): NormalizedMsg | null {
  const m = ev?.message;
  if (!m) return null;

  const key = m.message_key ?? {};
  const bm = m.body_message ?? {};
  const content = typeof bm.content === "string" ? bm.content.trim() : undefined;

  const remoteJid = key.remoteJid as string;
  const isGroup = remoteJid?.endsWith("@g.us") || false;
  const isStatus = remoteJid === "status@broadcast";

  const senderJid = isGroup ? key.participant : key.remoteJid;
  const { user, server } = splitJid(senderJid);
  const senderE164 = (server === "s.whatsapp.net" || server === "c.us") && /^\d+$/.test(user) ? `+${user}` : null;
  const senderLid = server === "lid" ? user : null;

  const kind =
    bm.type === "textMessage" ? "text" :
    bm.type === "imageMessage" ? "image" :
    bm.type === "videoMessage" ? "video" : "unknown";

  return {
    id: key.id,
    remoteJid,
    participant: key.participant,
    isGroup,
    isStatus,
    isBroadcast: false,
    timestamp: Date.now(),
    senderName: m?.push_name,
    senderJid,
    senderE164,
    senderLid,
    text: content || undefined,
    kind,
    media: kind !== "text" ? { caption: content } : undefined,
  };
}

// Enhanced message processing with database contact resolution
export async function enhanceMessageWithContactResolution(
  normalizedMsg: NormalizedMsg, 
  groupJid?: string
): Promise<NormalizedMsg> {
  // Only enhance LID contacts that don't have phone numbers
  if (normalizedMsg.senderLid && !normalizedMsg.senderE164 && normalizedMsg.senderName) {
    try {
      const { formatSenderWithDbLookup } = await import('./contactResolver');
      const enhancedSender = await formatSenderWithDbLookup(
        normalizedMsg.senderJid,
        normalizedMsg.senderName,
        undefined,
        groupJid
      );
      
      // Update the message with resolved phone number if found
      if (enhancedSender.senderNumber) {
        return {
          ...normalizedMsg,
          senderE164: enhancedSender.senderNumber
        };
      }
    } catch (error) {
      console.error(`❌ Error enhancing message with contact resolution:`, error);
    }
  }
  
  return normalizedMsg;
}