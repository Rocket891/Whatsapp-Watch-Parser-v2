/* ------------------------------------------------------------------
   SMART HYBRID POLLING SERVICE - Auto-fallback when webhooks fail
   ------------------------------------------------------------------ */
import { storage } from "./storage";
import { callMBSecure } from "./routes/whatsapp-secure";
import type { UserWhatsappConfig } from "@shared/schema";

interface PollingState {
  isActive: boolean;
  lastWebhookTime: Date | null;
  lastPollTime: Date | null;
  messagesFetched: number;
  mode: 'webhook' | 'polling' | 'hybrid';
}

// Per-user polling state
const userPollingStates = new Map<string, PollingState>();
const pollingIntervals = new Map<string, NodeJS.Timeout>();

// Configuration
const WEBHOOK_SILENCE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const POLLING_INTERVAL = 60 * 1000; // 60 seconds
const WEBHOOK_RESUME_CHECK_INTERVAL = 30 * 1000; // 30 seconds

/* ----------------------------------------------------------------
   Initialize Polling Service for All Active Users
   ---------------------------------------------------------------- */
export async function initializePollingService() {
  console.log("🔄 Initializing Smart Hybrid Polling Service...");
  
  try {
    // Get all users with active WhatsApp configs
    const activeUsers = await storage.getAllUsersWithActiveWhatsapp();
    
    for (const user of activeUsers) {
      try {
        await startMonitoringUser(user.userId, user);
      } catch (userError) {
        console.error(`⚠️ Failed to start monitoring for user ${user.userId}:`, userError);
      }
    }
    
    console.log(`✅ Polling service initialized for ${activeUsers.length} users`);
  } catch (error) {
    console.error("❌ Failed to initialize polling service:", error);
    // Don't crash the server - polling is optional functionality
  }
}

/* ----------------------------------------------------------------
   Start Monitoring a User (checks for webhook silence)
   ---------------------------------------------------------------- */
async function startMonitoringUser(userId: string, userConfig: UserWhatsappConfig) {
  // Initialize state with error handling
  let lastMessage: Date | null = null;
  try {
    lastMessage = await storage.getLastMessageTime(userId);
  } catch (error) {
    console.error(`⚠️ [User ${userId}] Failed to get last message time:`, error);
  }
  
  userPollingStates.set(userId, {
    isActive: false,
    lastWebhookTime: lastMessage,
    lastPollTime: null,
    messagesFetched: 0,
    mode: 'webhook'
  });

  console.log(`👀 [User ${userId}] Monitoring started - Last webhook: ${lastMessage?.toISOString() || 'never'}`);
  
  // Check every 30 seconds if we need to start polling
  const checkInterval = setInterval(async () => {
    try {
      await checkWebhookHealth(userId, userConfig);
    } catch (error) {
      console.error(`⚠️ [User ${userId}] Webhook health check failed:`, error);
    }
  }, WEBHOOK_RESUME_CHECK_INTERVAL);
  
  pollingIntervals.set(`monitor_${userId}`, checkInterval);
}

/* ----------------------------------------------------------------
   Check Webhook Health and Auto-Start Polling if Needed
   ---------------------------------------------------------------- */
async function checkWebhookHealth(userId: string, userConfig: UserWhatsappConfig) {
  const state = userPollingStates.get(userId);
  if (!state) return;

  // Get latest message time from database
  const lastMessage = await storage.getLastMessageTime(userId);
  
  // Update last webhook time if we got new messages
  if (lastMessage && (!state.lastWebhookTime || lastMessage > state.lastWebhookTime)) {
    state.lastWebhookTime = lastMessage;
    
    // Webhooks are working! Stop polling if active
    if (state.isActive) {
      console.log(`✅ [User ${userId}] Webhooks resumed! Stopping polling.`);
      await stopPolling(userId);
      state.mode = 'webhook';
    }
    return;
  }

  // Check if webhooks have been silent too long
  const now = new Date();
  const timeSinceLastWebhook = state.lastWebhookTime 
    ? now.getTime() - state.lastWebhookTime.getTime()
    : Infinity;

  if (timeSinceLastWebhook > WEBHOOK_SILENCE_THRESHOLD && !state.isActive) {
    console.log(`🚨 [User ${userId}] Webhook silence detected (${Math.round(timeSinceLastWebhook / 60000)} min). Starting polling...`);
    await startPolling(userId, userConfig);
    state.mode = 'polling';
  }
}

/* ----------------------------------------------------------------
   Start Polling for a User
   ---------------------------------------------------------------- */
async function startPolling(userId: string, userConfig: UserWhatsappConfig) {
  const state = userPollingStates.get(userId);
  if (!state || state.isActive) return;

  state.isActive = true;
  console.log(`🔄 [User ${userId}] Polling activated (interval: ${POLLING_INTERVAL / 1000}s)`);

  // Initial poll
  await pollMessages(userId, userConfig);

  // Set up recurring polling
  const pollInterval = setInterval(async () => {
    await pollMessages(userId, userConfig);
  }, POLLING_INTERVAL);

  pollingIntervals.set(`poll_${userId}`, pollInterval);
}

/* ----------------------------------------------------------------
   Stop Polling for a User
   ---------------------------------------------------------------- */
async function stopPolling(userId: string) {
  const state = userPollingStates.get(userId);
  if (!state || !state.isActive) return;

  state.isActive = false;
  
  const pollInterval = pollingIntervals.get(`poll_${userId}`);
  if (pollInterval) {
    clearInterval(pollInterval);
    pollingIntervals.delete(`poll_${userId}`);
  }

  console.log(`⏸️ [User ${userId}] Polling stopped - Webhooks active`);
}

/* ----------------------------------------------------------------
   Poll Messages from WhatsApp API API
   ---------------------------------------------------------------- */
async function pollMessages(userId: string, userConfig: UserWhatsappConfig) {
  const state = userPollingStates.get(userId);
  if (!state) return;

  try {
    console.log(`📡 [User ${userId}] Polling WhatsApp API for new messages...`);
    
    // Validate config has required fields
    if (!userConfig.instanceId || !userConfig.accessToken) {
      console.log(`⚠️ [User ${userId}] Missing instance ID or access token`);
      return;
    }

    // NOTE: WhatsApp API API is webhook-based only - no message fetching endpoint exists
    // Polling is disabled as per WhatsApp API API documentation
    // All messages come through webhooks: WhatsApp API → Cloudflare Worker → Replit App
    console.log(`ℹ️ [User ${userId}] WhatsApp API uses webhook-only architecture - polling not available`);
    state.lastPollTime = new Date();
    return;

  } catch (error: any) {
    console.error(`❌ [User ${userId}] Polling error:`, error.message);
  }
}

/* ----------------------------------------------------------------
   Process a Polled Message (deduplicate and process)
   ---------------------------------------------------------------- */
async function processPolledMessage(message: any, userId: string, userConfig: UserWhatsappConfig): Promise<boolean> {
  try {
    // Extract message ID for deduplication
    const messageId = message?.key?.id || message?.id;
    if (!messageId) return false;

    // Check if already processed
    const exists = await storage.messageExists(userId, messageId);
    if (exists) {
      return false; // Skip duplicates
    }

    // Convert polled message to webhook format
    const webhookPayload = convertToWebhookFormat(message, userConfig.instanceId);

    // Import webhook processor dynamically to avoid circular dependency
    const { processWebhookWithUserContext } = await import("./routes/webhook-secure");
    
    // Process through normal webhook handler
    await processWebhookWithUserContext(webhookPayload, userId, userConfig);

    return true;

  } catch (error) {
    console.error(`❌ [User ${userId}] Error processing polled message:`, error);
    return false;
  }
}

/* ----------------------------------------------------------------
   Convert WhatsApp API API Message to Webhook Format
   ---------------------------------------------------------------- */
function convertToWebhookFormat(message: any, instanceId: string | null): any {
  return {
    instance_id: instanceId || "",
    data: {
      event: "messages.upsert",
      data: {
        messages: [message]
      }
    }
  };
}

/* ----------------------------------------------------------------
   Get Polling Status for User
   ---------------------------------------------------------------- */
export function getPollingStatus(userId: string): PollingState | null {
  return userPollingStates.get(userId) || null;
}

/* ----------------------------------------------------------------
   Get All Polling States (for admin dashboard)
   ---------------------------------------------------------------- */
export function getAllPollingStates(): Map<string, PollingState> {
  return userPollingStates;
}

/* ----------------------------------------------------------------
   Manually Trigger Polling for User (for testing)
   ---------------------------------------------------------------- */
export async function manualPoll(userId: string) {
  const config = await storage.getUserWhatsappConfig(userId);
  if (!config) {
    throw new Error("User WhatsApp config not found");
  }
  
  await pollMessages(userId, config);
}

/* ----------------------------------------------------------------
   Stop Polling Service (cleanup on shutdown)
   ---------------------------------------------------------------- */
export function stopPollingService() {
  console.log("🛑 Stopping polling service...");
  
  pollingIntervals.forEach((interval, key) => {
    clearInterval(interval);
  });
  
  pollingIntervals.clear();
  userPollingStates.clear();
  
  console.log("✅ Polling service stopped");
}
