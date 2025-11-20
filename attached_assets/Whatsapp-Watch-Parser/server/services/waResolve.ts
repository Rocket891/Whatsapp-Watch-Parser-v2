// server/services/waResolve.ts

// Helpers
const digits = (s?: string | null) => (s ? String(s).replace(/[^\d]/g, "") : "");
const isNumJid = (jid?: string) => !!jid && /@s\.whatsapp\.net$/.test(jid);
const isCUs = (jid?: string) => !!jid && /@c\.us$/.test(jid);
const isLid = (jid?: string) => !!jid && /@lid$/.test(jid);

// Parse numbers from a vCard block (contactMessage)
export function numbersFromVcard(vcard?: string): string[] {
  if (!vcard) return [];
  const out = new Set<string>();
  // WhatsApp adds waid=XXXXXXXXX in the TEL line; also capture plain numbers
  // TEL;TYPE=CELL;waid=919821822960:+91 98218 22960
  const waidRe = /waid=(\d{6,20})/gi;
  const waidMatches = Array.from(vcard.matchAll(waidRe));
  for (const m of waidMatches) out.add(m[1]);
  
  const telRe = /TEL[^:]*:([\+\d][\d\s\-\(\)]{5,})/gi;
  const telMatches = Array.from(vcard.matchAll(telRe));
  for (const m of telMatches) out.add(digits(m[1]));
  
  return Array.from(out).filter(Boolean);
}

// Try to extract a real phone number from the webhook payload
export function resolveSenderNumber(payload: any): { number?: string; source: string } {
  console.log('🔍 PHONE RESOLVER: Starting comprehensive phone number extraction...');
  
  // 1) Direct JIDs (best case) - excluding from_contact to avoid group IDs
  const jids: (string | undefined)[] = [
    payload?.data?.message?.message_key?.participant,  // Priority: New webhook format
    payload?.message?.key?.participant,
    payload?.key?.participant,
    payload?.participant,
    payload?.sender,               // some providers
    payload?.from,                 // some providers
    payload?.user,                 // some providers
    payload?.message_key?.participant,
    payload?.message?.participant,
    payload?.message?.message?.contextInfo?.participant, // quoted participant
    payload?.data?.message?.key?.participant,
  ];

  console.log('🔍 PHONE RESOLVER: Checking JIDs:', jids.filter(Boolean));

  for (const j of jids) {
    if (!j) continue;
    
    // Handle @lid JIDs (WhatsApp privacy)
    if (isLid(j)) {
      const number = digits(j);
      if (number && number.length >= 8) {
        console.log(`✅ PHONE RESOLVER: Found real number from @lid JID: ${number} (source: ${j})`);
        return { number, source: "participant_lid" };
      }
    }
    
    // Handle regular numeric JIDs
    if (isNumJid(j) || isCUs(j)) {
      const number = digits(j);
      if (number && number.length >= 8) {
        console.log(`✅ PHONE RESOLVER: Found real number from JID: ${number} (source: ${j})`);
        return { number, source: "participant_jid" };
      }
    }
  }

  // 2) Check if the whole message is a direct chat (remoteJid ends with s.whatsapp.net)
  const remote = payload?.message?.key?.remoteJid || payload?.key?.remoteJid || payload?.remoteJid || payload?.data?.message?.message_key?.remoteJid;
  console.log('🔍 PHONE RESOLVER: Checking remote JID:', remote);
  
  if (isNumJid(remote) || isCUs(remote)) {
    const number = digits(remote);
    console.log(`✅ PHONE RESOLVER: Found number from remote JID: ${number}`);
    return { number, source: "remote_jid" };
  }

  // 3) vCard in contactMessage
  const vcard =
    payload?.message?.contactMessage?.vcard ||
    payload?.message?.contactsArrayMessage?.contacts?.[0]?.vcard ||
    payload?.message?.message?.contactMessage?.vcard ||
    payload?.message?.message?.contactsArrayMessage?.contacts?.[0]?.vcard ||
    payload?.data?.message?.body_message?.contactMessage?.vcard;
    
  console.log('🔍 PHONE RESOLVER: Checking vCard:', vcard ? 'Found vCard data' : 'No vCard');
  
  const vcNums = numbersFromVcard(vcard);
  if (vcNums.length) {
    console.log(`✅ PHONE RESOLVER: Found number from vCard: ${vcNums[0]}`);
    return { number: vcNums[0], source: "vcard" };
  }

  // 4) Any explicit wa_id fields
  const waid =
    payload?.wa_id ||
    payload?.message?.wa_id ||
    payload?.message?.message?.wa_id ||
    payload?.senderNumber ||
    payload?.fromNumber ||
    payload?.data?.message?.wa_id ||
    payload?.data?.wa_id;
    
  console.log('🔍 PHONE RESOLVER: Checking wa_id fields:', waid);
  
  if (waid && /^\d{6,20}$/.test(String(waid))) {
    console.log(`✅ PHONE RESOLVER: Found number from wa_id: ${waid}`);
    return { number: String(waid), source: "wa_id" };
  }

  // 5) Try from_contact field (ONLY if not a group ID)
  const fromContact = payload?.from_contact || payload?.data?.message?.from_contact;
  if (fromContact) {
    const contactDigits = digits(fromContact);
    // Exclude group IDs (typically start with 1203634 and are very long)
    if (contactDigits && contactDigits.length >= 8 && contactDigits.length <= 15 && !contactDigits.startsWith('1203634')) {
      console.log(`✅ PHONE RESOLVER: Found number from from_contact: ${contactDigits}`);
      return { number: contactDigits, source: "from_contact" };
    } else if (contactDigits) {
      console.log(`🚫 PHONE RESOLVER: Skipping group ID from from_contact: ${contactDigits}`);
    }
  }

  // 6) If participant is @lid, mark as hidden due to WhatsApp number privacy
  const anyJid = jids.find(Boolean) || remote;
  if (isLid(anyJid)) {
    console.log(`⚠️  PHONE RESOLVER: WhatsApp privacy - participant is @lid: ${anyJid}`);
    return { number: undefined, source: "hidden_by_whatsapp_number_privacy" };
  }

  // Fallback: unknown
  console.log('❌ PHONE RESOLVER: No phone number found in any field');
  return { number: undefined, source: "unknown" };
}