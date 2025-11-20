/* ------------------------------------------------------------------
   SECURE USER-AWARE WEBHOOK PROCESSING - MULTI-TENANT SECURITY FIX
   ------------------------------------------------------------------ */
import type { Express } from "express";
import { storage } from "../storage";
import type { UserWhatsappConfig } from "@shared/schema";
import { processContactUpdates, formatSenderWithDbLookup } from "../contactResolver";

// Per-user group name cache
const groupNameCache = new Map<string, string>(); // "${userId}:${groupJid}" -> "Group Name"

// CRITICAL: User-aware webhook processing instead of global waConfig
export function registerSecureWebhookRoutes(app: Express) {
  /* ----------------------------------------------------------------
     SECURE WEBHOOK ENDPOINT - Maps instanceId to userId
     ---------------------------------------------------------------- */
  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      const payload = req.body;
      const instanceId = payload?.instance_id;

      console.log(`🔔 Incoming Webhook Payload:`, JSON.stringify(payload, null, 2));
      console.log("[WEBHOOK-SECURE v1] event=", payload?.data?.event);

      if (!instanceId) {
        console.error("❌ No instance_id in webhook payload");
        return res.status(400).json({ error: "Missing instance_id" });
      }

      // **SECURITY FIX**: Map instanceId to userId for proper multi-tenancy
      const userId = await storage.getUserIdByInstanceId(instanceId);
      if (!userId) {
        console.error(`❌ No user found for instance ID: ${instanceId} - potential security breach attempt`);
        return res.status(403).json({ error: "Unauthorized instance" });
      }

      // Get user's WhatsApp configuration for validation
      const userConfig = await storage.getUserWhatsappConfig(userId);
      if (!userConfig || !userConfig.isActive) {
        console.error(`❌ User ${userId} has inactive/missing WhatsApp config for instance ${instanceId}`);
        return res.status(403).json({ error: "Inactive WhatsApp configuration" });
      }

      console.log(`🔐 [User ${userId}] Processing webhook for instance: ${instanceId}`);

      // **SECURITY**: All processing now includes user context
      const result = await processWebhookWithUserContext(payload, userId, userConfig);
      
      return res.json(result);

    } catch (error) {
      console.error("❌ Webhook processing error:", error);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  });
}

/* ----------------------------------------------------------------
   SECURE WEBHOOK PROCESSING WITH USER CONTEXT
   ---------------------------------------------------------------- */
async function processWebhookWithUserContext(payload: any, userId: string, userConfig: UserWhatsappConfig) {
  const { instanceId } = userConfig;
  
  try {
    // Handle different event types with user context
    const eventType = payload?.data?.event;

    switch (eventType) {
      case "messages.upsert":
        return await processMessagesUpsert(payload, userId, userConfig);
      
      case "received_message": 
        return await processReceivedMessage(payload, userId, userConfig);
      
      case "contacts.update":
        return await processContactsUpdate(payload, userId, userConfig);
      
      case "new subscriber":
        return await processNewSubscriber(payload, userId, userConfig);
        
      default:
        console.log(`📋 [User ${userId}] Unhandled event type: ${eventType}`);
        return { success: true, handled: false, eventType };
    }

  } catch (error) {
    console.error(`❌ [User ${userId}] Error processing webhook:`, error);
    throw error;
  }
}

/* ----------------------------------------------------------------
   USER-AWARE MESSAGE PROCESSING FUNCTIONS
   ---------------------------------------------------------------- */
async function processMessagesUpsert(payload: any, userId: string, userConfig: UserWhatsappConfig) {
  const messages = payload?.data?.data?.messages || [];
  
  if (!Array.isArray(messages) || messages.length === 0) {
    return { success: true, processed: false, reason: "No messages in upsert" };
  }

  let processedCount = 0;
  let skippedCount = 0;

  for (const message of messages) {
    try {
      // Extract message details with user context
      const messageData = await extractMessageWithUserContext(message, userId, userConfig);
      
      if (messageData.shouldProcess) {
        // Process the message with full user context for PID alerts, storage, etc.
        await processMessageWithUserContext(messageData, userId, userConfig);
        processedCount++;
      } else {
        skippedCount++;
        console.log(`🚫 [User ${userId}] Skipped message: ${messageData.reason}`);
      }

    } catch (error) {
      console.error(`❌ [User ${userId}] Error processing message:`, error);
    }
  }

  return {
    success: true,
    processed: processedCount,
    skipped: skippedCount,
    userId: userId,
    instanceId: userConfig.instanceId
  };
}

async function processReceivedMessage(payload: any, userId: string, userConfig: UserWhatsappConfig) {
  try {
    const message = payload?.data?.message;
    if (!message) {
      return { error: "No message content in payload" };
    }

    // Extract and process with user context
    const messageData = await extractMessageWithUserContext(message, userId, userConfig);
    
    if (messageData.shouldProcess) {
      await processMessageWithUserContext(messageData, userId, userConfig);
      return {
        success: true,
        stored: true,
        parsed: 0, // Will be updated after processing
        userId: userId
      };
    } else {
      return {
        success: true,
        stored: true,
        skipped: true,
        reason: messageData.reason,
        userId: userId
      };
    }

  } catch (error) {
    console.error(`❌ [User ${userId}] Error processing received_message:`, error);
    throw error;
  }
}

async function processContactsUpdate(payload: any, userId: string, userConfig: UserWhatsappConfig) {
  const contacts = payload?.data?.data || [];
  
  if (!Array.isArray(contacts)) {
    return { success: true, processed: false, reason: "No contacts data" };
  }

  console.log(`📞 [User ${userId}] Processing ${contacts.length} contact updates for LID mapping`);
  
  // **SECURITY FIX**: Process contacts with user scoping to prevent cross-tenant contamination
  try {
    processContactUpdates(contacts, userId); // **SECURITY**: Pass userId for user-scoped caching
    console.log(`✅ [User ${userId}] Successfully processed ${contacts.length} contact updates`);
  } catch (error) {
    console.error(`❌ [User ${userId}] Error processing contact updates:`, error);
  }
  
  return {
    success: true,
    stored: true, // Now storing contacts for LID resolution
    parsed: contacts.length,
    userId: userId
  };
}

async function processNewSubscriber(payload: any, userId: string, userConfig: UserWhatsappConfig) {
  // Handle new subscriber events with user context
  const subscriberData = payload?.data?.data;
  
  console.log(`📋 [User ${userId}] New subscriber event:`, subscriberData);
  
  return {
    success: true,
    handled: true,
    userId: userId
  };
}

/* ----------------------------------------------------------------
   EXTRACT MESSAGE WITH USER CONTEXT
   ---------------------------------------------------------------- */
async function extractMessageWithUserContext(message: any, userId: string, userConfig: UserWhatsappConfig) {
  console.log("[EXTRACT-ENTER] userId=", userId);
  // Determine message source and type
  const remoteJid = message?.key?.remoteJid || message?.message_key?.remoteJid;
  const fromMe = message?.key?.fromMe || message?.message_key?.fromMe;
  
  // Skip non-group messages (only process @g.us groups)
  if (!remoteJid?.includes('@g.us')) {
    return {
      shouldProcess: false,
      reason: `Skipped non-group message from: ${remoteJid}`
    };
  }

  // Skip own messages 
  if (fromMe) {
    return {
      shouldProcess: false,
      reason: "Skipped own message"
    };
  }

  // **SECURITY**: Check user's whitelist configuration
  const whitelistedGroups = userConfig.whitelistedGroups ? 
    userConfig.whitelistedGroups.split(',').map(g => g.trim()).filter(Boolean) : 
    [];

  // If user has whitelist, check if this group is allowed
  if (whitelistedGroups.length > 0 && !whitelistedGroups.includes(remoteJid)) {
    return {
      shouldProcess: false,
      reason: `Group not in user's whitelist: ${remoteJid}`
    };
  }

  // Extract message content
  const messageContent = extractMessageContent(message);
  if (!messageContent) {
    return {
      shouldProcess: false,
      reason: "No message content found"
    };
  }

  // Extract additional context with robust timestamp handling
  const pushName = message?.pushName || message?.push_name || "Unknown";
  const participantId = message?.key?.participant || message?.message_key?.participant;
  const messageId = message?.key?.id || message?.message_key?.id || `msg_${Date.now()}`;
  
  // **CRITICAL FIX**: Ensure timestamp is always valid
  let messageTimestamp = message?.messageTimestamp;
  if (!messageTimestamp || isNaN(messageTimestamp) || messageTimestamp <= 0) {
    messageTimestamp = Math.floor(Date.now() / 1000);
    console.log(`⚠️ [User ${userId}] Invalid messageTimestamp, using current time: ${messageTimestamp}`);
  }

  // 📋 ORGANIC CONTACT CAPTURE - Store contact information automatically (including LID contacts)
  const senderJid = participantId;
  const senderE164 = senderJid?.endsWith('@s.whatsapp.net') ? senderJid.split('@')[0] : undefined;
  const isLid = senderJid?.endsWith('@lid');
  
  console.log(`👤 Capture gate (webhook): [User ${userId}]`, { senderE164, senderJid, isLid, senderName: pushName, groupJid: remoteJid });
  
  if ((senderE164 || isLid) && pushName && pushName !== "Unknown") {
    try {
      const { contacts } = await import('@shared/schema');
      const { db } = await import('../db');
      const { eq, and } = await import('drizzle-orm');

      // Check if contact already exists for this user
      const existingContact = await db.select()
        .from(contacts)
        .where(and(
          eq(contacts.userId, userId), // **SECURITY**: User-scoped lookup
          eq(contacts.phoneNumber, senderE164 ? `+${senderE164}` : '') // **SECURITY**: Only match E164 phone numbers
        ))
        .limit(1);

      if (existingContact.length === 0) {
        // **SECURITY FIX**: Only store E164 phone numbers in contacts table
        if (senderE164) { // Only store if we have a real phone number
          await db.insert(contacts).values({
            userId: userId, // **SECURITY**: Include userId for multi-tenancy
            pushName: pushName,
            phoneNumber: `+${senderE164}`, // **DATA MODEL FIX**: Store proper E164 format
            groupJid: remoteJid,
            groupName: remoteJid, // Use remoteJid as group name for now
            isAdmin: false,
            notes: "Organically captured",
            uploadBatch: `organic_${Date.now()}`
          });
          
          console.log(`📋 [User ${userId}] Organically captured contact: ${pushName} (+${senderE164}) from ${remoteJid}`);
        } else if (isLid) {
          // For LID contacts, we don't store them in contacts table since we can't resolve the phone number yet
          console.log(`🔒 [User ${userId}] Skipping LID contact storage (no phone resolution): ${pushName} (${senderJid}) from ${remoteJid}`);
        }
      }
    } catch (error) {
      console.error(`❌ [User ${userId}] Error capturing organic contact:`, error);
    }
  }

  return {
    shouldProcess: true,
    messageContent,
    remoteJid,
    pushName,
    participantId,
    messageId,
    messageTimestamp,
    userId,
    userConfig
  };
}

function extractMessageContent(message: any): string | null {
  // Handle various message formats
  const conversation = message?.message?.conversation || 
                      message?.message?.extendedTextMessage?.text ||
                      message?.body_message?.content ||
                      message?.body_message?.messages?.conversation;
  
  return typeof conversation === 'string' ? conversation : null;
}

/* ----------------------------------------------------------------
   PROCESS MESSAGE WITH USER CONTEXT (Parse PIDs, Store, Alerts)
   ---------------------------------------------------------------- */
async function getGroupName(userId: string, groupJid: string): Promise<string> {
  const cacheKey = `${userId}:${groupJid}`;
  
  // Check cache first
  if (groupNameCache.has(cacheKey)) {
    return groupNameCache.get(cacheKey)!;
  }
  
  try {
    // **CRITICAL FIX**: Query whatsapp_groups table for resolved group name
    const { db } = await import('../db');
    const { whatsappGroups } = await import('@shared/schema');
    const { eq, and } = await import('drizzle-orm');
    
    const groupRecord = await db.select()
      .from(whatsappGroups)
      .where(and(
        eq(whatsappGroups.userId, userId), // **SECURITY**: User-scoped lookup
        eq(whatsappGroups.groupId, groupJid)
      ))
      .limit(1);
    
    let resolvedName: string;
    if (groupRecord.length > 0 && groupRecord[0].groupName) {
      resolvedName = groupRecord[0].groupName;
      console.log(`✅ [User ${userId}] Resolved group name from DB: ${groupJid} → ${resolvedName}`);
    } else {
      // Fallback to simplified JID display
      resolvedName = groupJid.split('@')[0]; // Show just the numeric part
      console.log(`⚠️ [User ${userId}] No group name found in DB for ${groupJid}, using fallback: ${resolvedName}`);
    }
    
    // Cache the result
    groupNameCache.set(cacheKey, resolvedName);
    return resolvedName;
    
  } catch (error) {
    console.error(`❌ [User ${userId}] Error resolving group name for ${groupJid}:`, error);
    
    // Fallback to simplified JID display on error
    const fallbackName = groupJid.split('@')[0];
    groupNameCache.set(cacheKey, fallbackName);
    return fallbackName;
  }
}

async function processMessageWithUserContext(messageData: any, userId: string, userConfig: UserWhatsappConfig) {
  const { messageContent, remoteJid, pushName, participantId, messageId, messageTimestamp } = messageData;
  
  try {
    // **SECURITY FIX**: Use formatSenderWithDbLookup with user scoping for proper sender resolution
    const senderInfo = await formatSenderWithDbLookup(participantId, pushName, undefined, userId, remoteJid);
    
    // **CRITICAL FIX**: Get group name with caching
    const groupName = await getGroupName(userId, remoteJid);
    
    // Store message with proper user context - match schema field names
    // **CRITICAL FIX**: Validate timestamp before creating Date object
    const validTimestamp = messageTimestamp && !isNaN(messageTimestamp) && messageTimestamp > 0 ? 
      messageTimestamp : Math.floor(Date.now() / 1000);
    
    const messageLogEntry = {
      userId: userId, // **SECURITY FIX**: Always include userId
      messageId: messageId,
      timestamp: new Date(validTimestamp * 1000), // **FIXED**: Always ensure valid timestamp
      groupId: remoteJid,
      groupName: groupName, // **FIXED**: Use resolved group name
      sender: senderInfo.senderDisplay, // **FIXED**: Use resolved sender display name
      senderNumber: senderInfo.senderNumber || '', // **FIXED**: Only store resolved numbers, never raw LIDs
      message: messageContent,
      status: 'received',
      instanceId: userConfig.instanceId
    };
    
    console.log(`📝 [User ${userId}] Creating message log with timestamp: ${new Date(validTimestamp * 1000).toISOString()}`);

    // Store message in database with user context
    const storedMessage = await storage.createMessageLog(messageLogEntry);
    console.log(`📝 [User ${userId}] Message stored in database with ID ${storedMessage.id}`);

    // **CRITICAL**: Parse watch listings with USER CONTEXT for PID alerts
    if (messageContent && shouldParseForWatches(messageContent)) {
      console.log(`🔍 [User ${userId}] Parsing message for watch listings...`);
      
      // Import parser with dynamic import to avoid circular dependencies
      const { parseWatchMessage } = await import('../watch-parser');
      const parseResults = await parseWatchMessage(messageContent, {
        userId: userId, // **SECURITY**: Include userId for PID alerts
        source: remoteJid,
        sender: pushName,
        messageId: messageId
      });

      console.log(`🔍 [User ${userId}] Parser Results:`, {
        messageLength: messageContent.length,
        messageLines: messageContent.split('\n').length,
        parsedCount: parseResults?.length || 0,
        firstFewPIDs: parseResults?.slice(0, 5).map(p => p.pid) || []
      });

      // **CRITICAL FIX**: Save parsed listings to database
      if (parseResults && parseResults.length > 0) {
        console.log(`💾 [User ${userId}] Saving ${parseResults.length} parsed listings to database...`);
        
        for (const parsed of parseResults) {
          try {
            const listingData = {
              userId: userId,
              pid: parsed.pid,
              brand: parsed.brand,
              family: parsed.family,
              year: parsed.year,
              variant: parsed.variant,
              condition: parsed.condition,
              price: parsed.price,
              currency: parsed.currency,
              chatId: remoteJid, // **FIX**: Use chatId not groupId
              groupName: groupName,
              sender: senderInfo.senderDisplay,
              senderNumber: senderInfo.senderNumber || '',
              rawLine: parsed.rawLine,
              month: parsed.month,
              date: new Date(validTimestamp * 1000).toISOString().split('T')[0],
              time: new Date(validTimestamp * 1000).toTimeString().split(' ')[0]
            };
            
            await storage.createWatchListing(listingData);
          } catch (saveError) {
            console.error(`❌ [User ${userId}] Failed to save listing ${parsed.pid}:`, saveError);
          }
        }
        
        console.log(`✅ [User ${userId}] Successfully saved ${parseResults.length} listings to database`);
      }

      // Update message log with parse results
      await storage.updateMessageLogStatus(
        messageId,
        parseResults && parseResults.length > 0 ? 'processed' : 'ignored',
        parseResults?.length || 0,
        0, // requirement count
        undefined, // no error
        userId // **SECURITY**: Include userId for proper data isolation
      );

      console.log(`📊 [User ${userId}] Updated message log ${storedMessage.id} with status: ${parseResults && parseResults.length > 0 ? 'processed' : 'ignored'}`);
    }

  } catch (error) {
    console.error(`❌ [User ${userId}] Error processing message with user context:`, error);
    
    // Update message log with error
    try {
      await storage.updateMessageLogStatus(
        messageId,
        'error',
        0,
        0,
        error instanceof Error ? error.message : 'Unknown error',
        userId
      );
    } catch (updateError) {
      console.error(`❌ [User ${userId}] Failed to update message log with error:`, updateError);
    }
    
    throw error;
  }
}

function shouldParseForWatches(messageContent: string): boolean {
  const content = messageContent.toLowerCase();
  
  // Look for watch-related indicators
  const watchKeywords = [
    'rolex', 'patek', 'audemars', 'cartier', 'omega', 'Tudor', 'breitling',
    'panerai', 'iwc', 'zenith', 'tag heuer', 'longines', 'hamilton', 'seiko',
    'citizen', 'casio', 'tissot', 'mido', 'oris', 'bell', 'ross', 'hublot',
    'richard mille', 'vacheron', 'jaeger', 'a.lange', 'glashutte', 'chopard',
    'bvlgari', 'montblanc', 'frederique', 'ulysse nardin', 'girard perregaux',
    'piaget', 'blancpain', 'maurice lacroix', 'nomos', 'sinn', 'tudor',
    'hkd', 'usd', 'eur', 'sgd', 'cny', 'jpy',
    'price', 'sell', 'buy', 'trade', 'exchange', 'offer',
    'condition', 'mint', 'used', 'vintage', 'rare', 'limited',
    'box', 'papers', 'warranty', 'service', 'polished',
    'size', 'mm', 'dial', 'bezel', 'crown', 'movement',
    'automatic', 'manual', 'quartz', 'chronograph', 'gmt', 'worldtimer'
  ];

  // Check for number patterns that could be PIDs
  const hasNumberPatterns = /\d{4,}/.test(content);
  
  // Check for currency patterns
  const hasCurrency = /(hkd|usd|eur|sgd|cny|jpy|\$|€|£|¥)\s*[\d,]+/i.test(content);
  
  // Check for watch keywords
  const hasWatchKeywords = watchKeywords.some(keyword => content.includes(keyword));

  return hasNumberPatterns && (hasCurrency || hasWatchKeywords);
}

export { processWebhookWithUserContext };