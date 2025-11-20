// Contact resolution system based on ChatGPT recommendations
// Handles LID-to-phone mapping and proper sender identification

type SenderView = {
  senderDisplay: string;   // name or short id for UI
  senderNumber: string | null; // +E164 or null
  senderKind: 'phone' | 'lid';
  rawJid: string;
};

// User-scoped mapping cache for LID to phone number resolution - prevents cross-tenant data leakage
const userScopedLidToPhone = new Map<string, string>(); // '${userId}:${lidJid}' -> '919925210000@s.whatsapp.net'

// Enhanced LID resolution using contacts database with user scoping for security
async function resolveLidFromDatabase(lidJid: string, pushName: string, userId: string, groupJid?: string): Promise<string | null> {
  if (!pushName || pushName === 'Unknown') {
    return null;
  }
  
  try {
    // Import database modules dynamically
    const { db } = await import('./db');
    const { contacts } = await import('@shared/schema');
    const { ilike, desc, sql, eq, and } = await import('drizzle-orm');
    
    // **SECURITY FIX**: Search for contacts by name WITHIN USER'S DATA ONLY
    let query = db.select().from(contacts).where(
      and(
        eq(contacts.userId, userId), // **CRITICAL**: User data isolation
        ilike(contacts.pushName, `%${pushName}%`)
      )
    );
    
    // Prioritize matches from the same group if groupJid provided
    if (groupJid) {
      query = query.orderBy(
        sql`CASE WHEN group_jid = ${groupJid} THEN 0 ELSE 1 END`,
        desc(contacts.uploadedAt)
      ) as any;
    } else {
      query = query.orderBy(desc(contacts.uploadedAt)) as any;
    }
    
    const results = await query.limit(1);
    
    if (results.length > 0) {
      const contact = results[0];
      // **SECURITY FIX**: Only process if phoneNumber contains actual E164 phone number, not LID
      if (!contact.phoneNumber.startsWith('+') || contact.phoneNumber.includes('@')) {
        console.warn(`⚠️ [User ${userId}] Contact ${contact.pushName} has invalid phone number format: ${contact.phoneNumber}`);
        return null;
      }
      
      // Convert phone number to WhatsApp JID format
      const cleanPhone = contact.phoneNumber.replace(/^\+/, ''); // Remove + prefix
      const phoneJid = `${cleanPhone}@s.whatsapp.net`;
      
      // **SECURITY FIX**: Cache with user-scoped key
      const cacheKey = `${userId}:${lidJid}`;
      userScopedLidToPhone.set(cacheKey, phoneJid);
      console.log(`📞 [User ${userId}] Resolved LID from database: ${lidJid} (${pushName}) → ${phoneJid}`);
      
      return phoneJid;
    }
    
    return null;
    
  } catch (error) {
    console.error(`❌ Error resolving LID ${lidJid} (${pushName}) from database:`, error);
    return null;
  }
}

function splitJid(jid?: string) {
  if (!jid) return { user: '', server: '' };
  const [user, server] = jid.split('@', 2);
  return { user, server };
}

function e164FromJid(jid: string | undefined) {
  if (!jid) return null;
  const [user, server] = jid.split("@");
  if ((server === "s.whatsapp.net" || server === "c.us") && /^\d+$/.test(user)) {
    return `+${user}`;
  }
  return null;
}

function resolveNumber(jid: string | undefined, userId?: string) {
  if (!jid) return { number: null, source: 'none' as const };
  const [user, server] = jid.split('@');
  if (server === 's.whatsapp.net' || server === 'c.us') {
    return { number: `+${user}`, source: 'phoneJid' as const };
  }
  if (server === 'lid' && userId) {
    // **SECURITY FIX**: Use user-scoped cache lookup
    const cacheKey = `${userId}:${jid}`;
    const phoneJid = userScopedLidToPhone.get(cacheKey);
    if (phoneJid) return { number: e164FromJid(phoneJid), source: 'lidMap' as const };
    return { number: null, source: 'lidOnly' as const };
  }
  return { number: null, source: 'unknown' as const };
}

// Enhanced version with database lookup for formatSender - **SECURITY**: Now requires userId
export async function formatSenderWithDbLookup(
  participantJid: string | undefined, 
  pushName: string | undefined, 
  verifiedBizName: string | undefined,
  userId: string, // **SECURITY**: Required for user-scoped operations
  groupJid?: string
): Promise<SenderView> {
  const { user, server } = splitJid(participantJid);
  const name = verifiedBizName || pushName || undefined;

  if (server === 's.whatsapp.net' || server === 'c.us') {
    return {
      senderDisplay: name ?? `+${user}`,
      senderNumber: `+${user}`,
      senderKind: 'phone',
      rawJid: participantJid!,
    };
  }

  // LID: try user-scoped cache first, then user-scoped database lookup
  let number = resolveNumber(participantJid, userId).number;
  
  // If not in cache and we have a name, try user-scoped database lookup
  if (!number && participantJid && name && name !== 'Unknown') {
    const phoneJid = await resolveLidFromDatabase(participantJid, name, userId, groupJid);
    if (phoneJid) {
      number = e164FromJid(phoneJid);
    }
  }

  return {
    senderDisplay: name ?? `LID:${user}`,
    senderNumber: number, // may still be null if we don't have a mapping
    senderKind: 'lid',
    rawJid: participantJid!,
  };
}

export function formatSender(participantJid: string | undefined, pushName?: string, verifiedBizName?: string, userId?: string): SenderView {
  const { user, server } = splitJid(participantJid);
  const name = verifiedBizName || pushName || undefined;

  if (server === 's.whatsapp.net' || server === 'c.us') {
    return {
      senderDisplay: name ?? `+${user}`,
      senderNumber: `+${user}`,
      senderKind: 'phone',
      rawJid: participantJid!,
    };
  }

  // LID: do NOT fabricate a number - use user-scoped cache if userId provided
  const number = resolveNumber(participantJid, userId).number; // from the mapping code above
  return {
    senderDisplay: name ?? `LID:${user}`,
    senderNumber: number, // may still be null if we don't have a mapping
    senderKind: 'lid',
    rawJid: participantJid!,
  };
}

// Cache LID-to-phone mappings when we learn them - **SECURITY**: Now user-scoped
export function cacheLidMapping(lidJid: string, phoneJid: string, userId: string) {
  if (lidJid.endsWith('@lid') && phoneJid.endsWith('@s.whatsapp.net')) {
    const cacheKey = `${userId}:${lidJid}`;
    userScopedLidToPhone.set(cacheKey, phoneJid);
    console.log(`📞 [User ${userId}] Cached LID mapping: ${lidJid} → ${phoneJid}`);
  }
}

// Process contact updates to build LID mappings - **SECURITY**: Now user-scoped
export function processContactUpdates(contacts: any[], userId: string) {
  for (const c of contacts) {
    // Different formats: some have c.id and c.lid, others have variations
    const phoneJid = c.id?.endsWith('@s.whatsapp.net') ? c.id : null;
    const lidJid = c.lid?.endsWith('@lid') ? c.lid : (c.id?.endsWith('@lid') ? c.id : null);
    
    if (phoneJid && lidJid) {
      cacheLidMapping(lidJid, phoneJid, userId);
    }
  }
}

// Helper to get current LID mappings for debugging - **SECURITY**: Now user-scoped
export function getLidMappings(userId?: string) {
  if (userId) {
    const userMappings = new Map<string, string>();
    for (const [key, value] of userScopedLidToPhone.entries()) {
      if (key.startsWith(`${userId}:`)) {
        const lidJid = key.substring(userId.length + 1); // Remove "userId:" prefix
        userMappings.set(lidJid, value);
      }
    }
    return Object.fromEntries(userMappings);
  }
  // For debugging - return all mappings grouped by user
  return Object.fromEntries(userScopedLidToPhone);
}

export { userScopedLidToPhone as lidToPhone };