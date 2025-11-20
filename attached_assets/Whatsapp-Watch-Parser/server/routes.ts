import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  searchFiltersSchema,
  insertWatchListingSchema,
  insertProcessingLogSchema,
  whatsappGroups,
  insertWhatsappGroupSchema,
  watchListings,
} from "@shared/schema";
import { z } from "zod";
import { GoogleSheetsService } from "./google-sheets";
import { waConfig } from "./waConfig";
import { registerWhatsAppRoutes } from "./routes/whatsapp";
import { registerGroupRoutes } from "./routes/groups";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import { 
  upsertGroup, 
  upsertContact, 
  getContactName 
} from "./wa-cache";
import { contactNames, groupNames } from "./routes/whatsapp";

// Track last received message time for stable connection status
let lastReceivedMessageTime = 0;

// Function to store group information in database
async function storeGroupInDatabase(groupId: string, instanceId: string, incomingInstanceId?: string, groupName?: string) {
  try {
    // Import cached group names from WhatsApp API
    const { groupNames } = await import('./routes/whatsapp');
    
    // First, check if this group exists in watch_listings to get real sender names and infer the correct instance
    const existingMessages = await db.select().from(watchListings)
      .where(eq(watchListings.chatId, groupId))
      .limit(1);
    
    let inferredInstancePhone = '-';
    let realGroupNameFromHistory = null;
    
    if (existingMessages.length > 0) {
      const latestMessage = existingMessages[0];
      // Try to infer instance phone from historical data patterns
      console.log(`🔍 Found historical message for ${groupId} from sender: ${latestMessage.sender}`);
      
      // Check if sender contains phone-like patterns  
      if (latestMessage.senderNumber && latestMessage.senderNumber.length >= 10) {
        inferredInstancePhone = latestMessage.senderNumber.substring(0, 10); // Take first 10 digits
      }
    }
    
    // Extract instance phone number from instance ID (fallback if no historical data)
    const instancePhone = inferredInstancePhone !== '-' ? inferredInstancePhone : 
                         extractPhoneFromInstanceId(incomingInstanceId || instanceId) || '-';
    
    // Get real group name: prioritize provided name, then cached API name, then historical name, then null
    let realGroupName = groupName || groupNames.get(groupId) || realGroupNameFromHistory || null;
    
    console.log(`🔍 Group resolution for ${groupId}: provided="${groupName || 'none'}", cached="${groupNames.get(groupId) || 'none'}", phone="${instancePhone}", final="${realGroupName || 'none'}"`);
    
    // Check if group already exists
    const existingGroup = await db.select().from(whatsappGroups).where(
      eq(whatsappGroups.groupId, groupId)
    ).limit(1);

    if (existingGroup.length === 0) {
      // Insert new group with real name and inferred instance
      await db.insert(whatsappGroups).values({
        groupId,
        instanceId: instanceId || '-',
        instancePhone,
        groupName: realGroupName,
        source: 'webhook',
        lastSeen: new Date(),
      });
      console.log(`💾 NEW GROUP: ${groupId} → "${realGroupName || 'Unknown'}" (phone: ${instancePhone})`);
    } else {
      // Update existing group with real name if we have one
      const updateData: any = {
        lastSeen: new Date(),
        instancePhone: instancePhone !== '-' ? instancePhone : (existingGroup[0].instancePhone || '-'),
      };
      
      // Update instance ID if we have a better one
      if (instanceId && instanceId !== '-') {
        updateData.instanceId = instanceId;
      }
      
      // Always update name if we have a real one (prioritize real names over existing)
      if (realGroupName) {
        updateData.groupName = realGroupName;
        console.log(`📝 UPDATED group with real name: ${groupId} → "${realGroupName}"`);
      }
      
      await db.update(whatsappGroups)
        .set(updateData)
        .where(eq(whatsappGroups.groupId, groupId));
      
      console.log(`💾 Updated group: ${groupId} (phone: ${updateData.instancePhone})`);
    }
  } catch (error) {
    console.error('❌ Error storing group in database:', error);
  }
}

// Function to extract phone number from instance ID
function extractPhoneFromInstanceId(instanceId: string): string | null {
  if (!instanceId) return null;
  
  // Extract numeric parts from instance ID (remove non-digits)
  const digits = instanceId.replace(/[^\d]/g, '');
  
  // If we have at least 10 digits, take the first 10 as phone number
  if (digits.length >= 10) {
    return digits.substring(0, 10);
  }
  
  return null;
}

// Function to get real WhatsApp instance phone number (not group ID parts!)
function getInstancePhoneNumber(instanceId: string): string | null {
  // Known WhatsApp Business instance ID to phone number mappings
  const instancePhoneMap: Record<string, string> = {
    '685ADB8BEC061': '+919821822960', // Current active WhatsApp Business instance
    // Add more legitimate WhatsApp Business instance mappings as needed
  };
  
  const phone = instancePhoneMap[instanceId];
  return phone || null;
}

// Function to send PID alert notification via WhatsApp
async function sendPidAlertNotification(alert: any, listing: any) {
  try {
    console.log(`🔔 PID Alert triggered for ${alert.pid} - sending notification to ${alert.notificationPhone}`);
    
    const message = `🔔 PID Alert Triggered: ${alert.pid}

📋 Match Details:
• PID: ${listing.pid}
• Variant: ${listing.variant || 'N/A'}
• Price: ${listing.price || 'N/A'} ${listing.currency || 'N/A'}
• Condition: ${listing.condition || 'N/A'}
• From: ${listing.sender}
• Seller Number: ${listing.senderNumber || 'N/A'}
• Group: ${listing.groupName}
• Time: ${listing.date} ${listing.time}

💰 Your Alert Criteria:
• PID: ${alert.pid}${alert.variant ? ` (${alert.variant})` : ''}
• Price Range: ${alert.minPrice || 'Any'} - ${alert.maxPrice || 'Any'} ${alert.currency}

📱 Source: Watch Parser System
🚀 Check your dashboard for full details!`;

    const url = 'https://mblaster.in/api/send';
    
    const requestBody = {
      number: alert.notificationPhone,
      type: 'text',
      message: message,
      instance_id: waConfig.instanceId || '',
      access_token: waConfig.accessToken || ''
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    
    if (response.ok) {
      console.log(`✅ PID alert notification sent successfully to ${alert.notificationPhone}`);
      console.log(`📋 API Response:`, responseText);
    } else {
      console.error(`❌ Failed to send PID alert notification:`, response.statusText);
      console.error(`📋 API Response:`, responseText);
      console.error(`📋 Request body:`, JSON.stringify(requestBody, null, 2));
    }
  } catch (error) {
    console.error('❌ Error sending PID alert notification:', error);
  }
}

// Helper function to extract message details from mblaster payload
async function extractMessageFromPayload(payload: any, contactNames: Map<string, string>, groupNames: Map<string, string>) {
  // 🔧 DYNAMIC INSTANCE ID DETECTION AND UPDATE
  if (payload.instance_id && payload.instance_id !== waConfig.instanceId) {
    console.log(`🔄 Instance ID change detected: ${waConfig.instanceId} -> ${payload.instance_id}`);
    
    // Update the configuration with the new instance ID
    const { saveConfig } = await import('./waConfig');
    await saveConfig({ instanceId: payload.instance_id });
    
    console.log(`✅ Configuration updated to use instance: ${payload.instance_id}`);
  }
  const result = {
    message: "",
    sender: "",
    senderNumber: "",
    groupName: "",
    group: "",
    messageId: "",
    timestamp: new Date().toISOString(),
  };

  const root = payload;

  if (!root) {
    result.message = "Invalid payload";
    result.sender = "System";
    result.groupName = "System";
    return result;
  }

  let m = null;
  let isValidMessage = false;

  // Get whitelisted groups array - RELOAD CONFIG FIRST
  const getAllowedGroups = async () => {
    // Reload config to get latest whitelist changes
    const { loadConfig } = await import('./waConfig');
    await loadConfig();
    
    if (!waConfig.whitelistedGroups) return [];
    return waConfig.whitelistedGroups
      .split(/[\s,]+/)      // Split on commas AND whitespace/newlines
      .map((g) => g.trim())
      .filter(Boolean);
  };

  // 1) m-Blaster received_message format
  if (root.event === "received_message") {
    m = root.message;
    isValidMessage = Boolean(
      m &&
        !m.message_key?.fromMe &&
        m.message_key?.remoteJid !== "status@broadcast" &&
        ((await getAllowedGroups()).length === 0 ||
          (await getAllowedGroups()).includes(m.message_key?.remoteJid)) &&
        m.body_message?.content,
    );
  }

  // 2) Baileys messages.upsert format
  else if (root.event === "messages.upsert") {
    m = root.data?.messages?.[0];
    isValidMessage = Boolean(
      m &&
        !m.key?.fromMe &&
        m.key?.remoteJid !== "status@broadcast" &&
        !m.broadcast &&
        (m.message?.conversation ||
          m.message?.extendedTextMessage ||
          m.message?.imageMessage),
    );
  }
  
  // 3) Direct data format from mblaster
  else if (root.data?.event === "messages.upsert") {
    m = root.data?.data?.messages?.[0];
    isValidMessage = Boolean(
      m &&
        !m.key?.fromMe &&
        m.key?.remoteJid !== "status@broadcast" &&
        !m.broadcast &&
        (m.message?.conversation ||
          m.message?.extendedTextMessage ||
          m.message?.imageMessage),
    );
  }

  if (isValidMessage && m) {
    // Extract message details
    result.message =
      m.body_message?.content ||
      m.message?.conversation ||
      m.message?.extendedTextMessage?.text ||
      m.message?.imageMessage?.caption ||
      "";

    // Extract sender info and use cached names
    const senderParticipant = m.key?.participant || m.message_key?.participant || "";
    const senderName = m.push_name || m.pushName || m.sender_name || "Unknown";
    result.sender = contactNames.get(senderParticipant) || senderName;
    
    // FIXED: Extract sender number using comprehensive phone resolver
    let rawSenderNumber = "";
    
    // Check @lid JIDs first (WhatsApp privacy mode)
    if (senderParticipant && senderParticipant.includes("@lid")) {
      rawSenderNumber = senderParticipant.replace("@lid", "");
      console.log(`🔍 DEBUG: Extracted phone number from @lid participant: ${rawSenderNumber}`);
    } 
    // Check regular @s.whatsapp.net JIDs
    else if (senderParticipant && senderParticipant.includes("@s.whatsapp.net")) {
      rawSenderNumber = senderParticipant.replace("@s.whatsapp.net", "");
      console.log(`🔍 DEBUG: Extracted phone number from @s.whatsapp.net participant: ${rawSenderNumber}`);
    } 
    // Check sender_id (fallback)
    else if (m.sender_id) {
      rawSenderNumber = m.sender_id.replace("@s.whatsapp.net", "");
      console.log(`🔍 DEBUG: Extracted phone number from sender_id: ${rawSenderNumber}`);
    } 
    // Check remoteJid ONLY if it's NOT a group
    else if (m.key?.remoteJid && !m.key.remoteJid.includes("@g.us")) {
      rawSenderNumber = m.key.remoteJid.replace("@s.whatsapp.net", "");
      console.log(`🔍 DEBUG: Extracted phone number from remoteJid: ${rawSenderNumber}`);
    }
    
    // Format phone number as international format
    if (rawSenderNumber && rawSenderNumber.length >= 10) {
      // Clean any existing formatting
      const cleanNumber = rawSenderNumber.replace(/\D/g, '');
      
      // Add + prefix if missing
      if (!cleanNumber.startsWith('+')) {
        // Format as +XXX XXX XXX XXX (international format)
        if (cleanNumber.length >= 11) {
          const formatted = '+' + cleanNumber.substring(0, 3) + ' ' + 
                           cleanNumber.substring(3, 6) + ' ' + 
                           cleanNumber.substring(6, 9) + ' ' + 
                           cleanNumber.substring(9);
          result.senderNumber = formatted.trim();
        } else {
          result.senderNumber = '+' + cleanNumber;
        }
      } else {
        result.senderNumber = cleanNumber;
      }
      console.log(`📱 FINAL: Formatted phone number: ${result.senderNumber}`);
    } else {
      result.senderNumber = rawSenderNumber;
      console.log(`⚠️  WARNING: Could not format phone number: ${rawSenderNumber}`);
    }

    result.group = m.message_key?.remoteJid || m.key?.remoteJid || "";
    result.groupName = groupNames.get(result.group) || (result.group.includes("@g.us") ? "Unknown Group" : "Private Chat");
    result.messageId = m.message_key?.id || m.key?.id || "";

    // Extract the REAL message timestamp from WhatsApp
    const messageTimestamp = m.messageTimestamp || m.message_timestamp;
    if (messageTimestamp) {
      // Convert Unix timestamp to ISO string
      result.timestamp = new Date(messageTimestamp * 1000).toISOString();
    } else {
      console.log(`📅 No message timestamp found - using current time`);
      result.timestamp = new Date().toISOString();
    }

    // Check if group is whitelisted BEFORE processing anything
    const allowedGroups = await getAllowedGroups();
    if (allowedGroups.length > 0 && !allowedGroups.includes(result.group)) {
      console.log(
        `🚫 Group ${result.group} not whitelisted - skipping. Whitelisted: ${allowedGroups.join(", ")}`,
      );
      // Return null to indicate this message should be completely ignored
      return null;
    }

    // Update last message time for connection status
    lastReceivedMessageTime = Date.now();
  } else {
    // System event or invalid message
    result.message = `Event: ${root.event || root.data?.event || "unknown"}`;
    result.sender = "System";
    result.groupName = "System";
  }

  return result;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ===========================================
  // DASHBOARD & ANALYTICS ENDPOINTS
  // ===========================================

  // Dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // Recent watch listings
  app.get("/api/watch-listings/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const listings = await storage.getRecentWatchListings(limit);
      res.json(listings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent listings" });
    }
  });

  // Search watch listings
  app.get("/api/watch-listings/search", async (req, res) => {
    try {
      const transformedQuery = {
        ...req.query,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        priceFrom: req.query.priceFrom ? parseFloat(req.query.priceFrom as string) : undefined,
        priceTo: req.query.priceTo ? parseFloat(req.query.priceTo as string) : undefined,
      };
      
      const filters = searchFiltersSchema.parse(transformedQuery);
      const result = await storage.getWatchListings(filters);
      res.json(result);
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: "Failed to search listings", details: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Export watch listings as Excel
  app.get("/api/export/watch-listings", async (req, res) => {
    try {
      const { 
        offset = '0', 
        limit = '10000',
        pids,
        year,
        duration,
        sortBy,
        sortOrder
      } = req.query;
      
      const filters: any = {
        offset: parseInt(offset as string),
        limit: parseInt(limit as string)
      };
      
      if (pids) filters.pids = (pids as string).split(/[,\n\s]+/).filter(p => p.trim());
      if (year) filters.year = parseInt(year as string);
      if (duration) filters.duration = duration as string;
      if (sortBy) filters.sortBy = sortBy as string;
      if (sortOrder) filters.sortOrder = sortOrder as string;
      if (req.query.brand) filters.brand = req.query.brand as string;
      if (req.query.family) filters.family = req.query.family as string;
      if (req.query.variant) filters.variant = req.query.variant as string;
      if (req.query.condition) filters.condition = req.query.condition as string;
      if (req.query.groupName) filters.groupName = req.query.groupName as string;
      
      const result = await storage.getWatchListings(filters);
      
      // Create Excel workbook using a proper library
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.Workbook();
      const worksheet = workbook.addWorksheet('Watch Listings');
      
      // Define columns
      worksheet.columns = [
        { header: 'PID', key: 'pid', width: 20 },
        { header: 'Brand', key: 'brand', width: 15 },
        { header: 'Family', key: 'family', width: 15 },
        { header: 'Year', key: 'year', width: 10 },
        { header: 'Variant', key: 'variant', width: 15 },
        { header: 'Condition', key: 'condition', width: 15 },
        { header: 'Price', key: 'price', width: 12 },
        { header: 'Currency', key: 'currency', width: 10 },
        { header: 'Group Name', key: 'groupName', width: 25 },
        { header: 'Sender', key: 'sender', width: 20 },
        { header: 'Sender Number', key: 'senderNumber', width: 15 },
        { header: 'Duration', key: 'duration', width: 15 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Time', key: 'time', width: 12 },
        { header: 'Raw Line', key: 'rawLine', width: 50 },
      ];
      
      // Add data rows
      result.listings.forEach(listing => {
        // Calculate duration
        const now = new Date();
        const created = listing.createdAt ? new Date(listing.createdAt) : new Date();
        const diffMs = now.getTime() - created.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        let duration = '';
        if (diffDays > 0) duration = `${diffDays}d ${diffHours}h`;
        else if (diffHours > 0) duration = `${diffHours}h ${diffMinutes}m`;
        else duration = `${diffMinutes}m`;
        
        worksheet.addRow({
          pid: listing.pid || '',
          brand: listing.brand || '',
          family: listing.family || '',
          year: listing.year || '',
          variant: listing.variant || '',
          condition: listing.condition || '',
          price: listing.price || '',
          currency: listing.currency || '',
          groupName: listing.groupName || '',
          sender: listing.sender || '',
          senderNumber: listing.senderNumber || '',
          duration: duration,
          date: listing.date || '',
          time: listing.time || '',
          rawLine: listing.rawLine || '',
        });
      });
      
      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' }
      };
      
      // Generate unique filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -1);
      const source = (req.query.source as string) || 'export';
      const filename = `watch-listings-${source}-${timestamp}.xlsx`;
      
      // Set response headers for Excel download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      
      // Write to response
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Excel export error:', error);
      res.status(500).json({ error: "Failed to export listings" });
    }
  });

  // Recent errors
  app.get("/api/processing-logs/errors", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const errors = await storage.getRecentErrors(limit);
      res.json(errors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch errors" });
    }
  });

  app.get('/api/watch-listings/unique-conditions', async (req, res) => {
    try {
      const conditions = await storage.getUniqueConditions();
      res.json(conditions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get unique conditions' });
    }
  });

  // PID Alert routes
  app.get('/api/pid-alerts', async (req, res) => {
    try {
      const alerts = await storage.getAllPidAlerts();
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get PID alerts' });
    }
  });

  app.post('/api/pid-alerts', async (req, res) => {
    try {
      const alert = await storage.createPidAlert(req.body);
      res.json(alert);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create PID alert' });
    }
  });

  app.put('/api/pid-alerts/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const alert = await storage.updatePidAlert(id, req.body);
      res.json(alert);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update PID alert' });
    }
  });

  app.delete('/api/pid-alerts/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePidAlert(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete PID alert' });
    }
  });

  // ===========================================
  // MBLASTER API PROXY - BACKEND HANDLES CORS
  // ===========================================

  // Auto-recover expired instances
  app.post("/api/whatsapp/recover-instance", async (req, res) => {
    try {
      const { checkAndRecoverInstance } = await import('./instance-recovery');
      const { accessToken, instanceId } = req.body;
      
      if (!accessToken || !instanceId) {
        return res.status(400).json({ error: "Access token and instance ID are required" });
      }
      
      console.log(`🔄 Checking and recovering instance: ${instanceId}`);
      const result = await checkAndRecoverInstance(accessToken, instanceId);
      
      res.json(result);
    } catch (error) {
      console.error('Instance recovery error:', error);
      res.status(500).json({ error: "Failed to recover instance" });
    }
  });

  // ===========================================
  // MBLASTER API PROXY - BACKEND HANDLES CORS
  // ===========================================

  // Test access token / create instance
  app.post("/api/whatsapp/test-token", async (req, res) => {
    try {
      const { accessToken } = req.body;
      
      if (!accessToken) {
        return res.status(400).json({ error: "Access token is required" });
      }
      
      console.log(`🧪 Testing access token: ${accessToken}`);
      
      const response = await fetch(`https://mblaster.in/api/create_instance?access_token=${accessToken}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const data = await response.text();
      console.log(`🧪 API Response: ${data}`);
      
      // Try to parse as JSON
      try {
        const jsonData = JSON.parse(data);
        if (jsonData.instance_id) {
          // Auto-configure webhook for the new instance
          console.log(`🔗 Auto-configuring webhook for new instance: ${jsonData.instance_id}`);
          const publicUrl = process.env.PUBLIC_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
          const webhookUrl = `${publicUrl}/api/whatsapp/webhook`;
          
          try {
            const webhookResponse = await fetch(`https://mblaster.in/api/set_webhook?webhook_url=${encodeURIComponent(webhookUrl)}&enable=true&instance_id=${jsonData.instance_id}&access_token=${accessToken}`, {
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            console.log(`🔗 Webhook configuration response: ${webhookResponse.status}`);
          } catch (webhookError) {
            console.error('Webhook configuration failed:', webhookError);
          }
        }
        res.json(jsonData);
      } catch (parseError) {
        // If it's HTML, the token is invalid or endpoint is broken
        res.status(400).json({ 
          error: "Invalid access token or API endpoint not working", 
          detail: "Received HTML instead of JSON response"
        });
      }
    } catch (error) {
      console.error('Token test error:', error);
      res.status(500).json({ error: "Failed to test access token" });
    }
  });

  // Test instance status
  app.post("/api/whatsapp/test-instance", async (req, res) => {
    try {
      const { accessToken, instanceId } = req.body;
      
      if (!accessToken || !instanceId) {
        return res.status(400).json({ error: "Access token and instance ID are required" });
      }
      
      console.log(`🧪 Testing instance: ${instanceId} with token: ${accessToken}`);
      
      const response = await fetch(`https://mblaster.in/api/get_status?access_token=${accessToken}&instance_id=${instanceId}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const data = await response.text();
      console.log(`🧪 Status API Response: ${data.substring(0, 100)}...`);
      
      // Try to parse as JSON
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (parseError) {
        // If it's HTML, the instance is invalid or expired
        if (data.includes('<!DOCTYPE html>')) {
          res.status(400).json({ 
            error: "Instance has been deleted or expired from mblaster.in", 
            detail: "This instance ID no longer exists on the mblaster server",
            instanceId: instanceId,
            suggestion: "You need to create a new instance or use a different existing instance ID"
          });
        } else {
          res.status(400).json({ 
            error: "Invalid API response format", 
            detail: "Received non-JSON response",
            instanceId: instanceId
          });
        }
      }
    } catch (error) {
      console.error('Instance test error:', error);
      res.status(500).json({ error: "Failed to test instance" });
    }
  });

  // Get QR code
  app.post("/api/whatsapp/get-qr", async (req, res) => {
    try {
      const { accessToken, instanceId } = req.body;
      
      if (!accessToken || !instanceId) {
        return res.status(400).json({ error: "Access token and instance ID are required" });
      }
      
      console.log(`🔍 Getting QR code for instance: ${instanceId}`);
      
      const response = await fetch(`https://mblaster.in/api/qr_code?access_token=${accessToken}&instance_id=${instanceId}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const data = await response.text();
      console.log(`🔍 QR API Response: ${data.substring(0, 100)}...`);
      
      // Try to parse as JSON
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (parseError) {
        res.status(400).json({ 
          error: "Failed to get QR code", 
          detail: "Received HTML instead of JSON response"
        });
      }
    } catch (error) {
      console.error('QR code error:', error);
      res.status(500).json({ error: "Failed to get QR code" });
    }
  });

  // ===========================================
  // GOOGLE SHEETS INTEGRATION
  // ===========================================

  // Google Sheets configuration
  app.post("/api/google-sheets/configure", async (req, res) => {
    try {
      const { spreadsheetId, serviceAccountKey } = req.body;
      
      if (!spreadsheetId || !serviceAccountKey) {
        return res.status(400).json({ 
          error: "Spreadsheet ID and service account key are required" 
        });
      }

      res.json({ message: "Google Sheets configured successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to configure Google Sheets" });
    }
  });

  // Process Google Sheets data
  app.post("/api/google-sheets/process", async (req, res) => {
    try {
      const { spreadsheetId, serviceAccountKey } = req.body;
      
      if (!spreadsheetId || !serviceAccountKey) {
        return res.status(400).json({ 
          error: "Configuration required" 
        });
      }

      const service = new GoogleSheetsService({ spreadsheetId, serviceAccountKey });
      const result = await service.processRawMessages();
      
      res.json({
        message: "Processing completed",
        processed: result.processed,
        listings: result.listings
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Test Google Sheets connection
  app.post("/api/google-sheets/test", async (req, res) => {
    try {
      const { spreadsheetId, serviceAccountKey } = req.body;
      
      if (!spreadsheetId || !serviceAccountKey) {
        return res.status(400).json({ 
          error: "Configuration required" 
        });
      }

      const service = new GoogleSheetsService({ spreadsheetId, serviceAccountKey });
      const messages = await service.getRawMessages();
      
      res.json({
        success: true,
        messageCount: messages.length,
        sample: messages.slice(0, 3)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===========================================
  // BACKUP & RECOVERY SYSTEM
  // ===========================================
  
  app.post("/api/backup/create", async (req, res) => {
    try {
      const { includeData, format = 'json' } = req.body;
      
      // Get all data for backup
      const allListings = await storage.getWatchListings({ limit: 10000, offset: 0 });
      const processingLogs = await storage.getProcessingLogs(1000);
      
      if (format === 'excel') {
        // Create Excel backup
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.default.Workbook();
        const worksheet = workbook.addWorksheet('Watch Listings');
        
        // Define columns
        worksheet.columns = [
          { header: 'PID', key: 'pid', width: 20 },
          { header: 'Year', key: 'year', width: 10 },
          { header: 'Variant', key: 'variant', width: 15 },
          { header: 'Condition', key: 'condition', width: 15 },
          { header: 'Price', key: 'price', width: 12 },
          { header: 'Currency', key: 'currency', width: 10 },
          { header: 'Group Name', key: 'groupName', width: 25 },
          { header: 'Chat ID', key: 'chatId', width: 30 },
          { header: 'Sender', key: 'sender', width: 20 },
          { header: 'Sender Number', key: 'senderNumber', width: 15 },
          { header: 'Date', key: 'date', width: 12 },
          { header: 'Time', key: 'time', width: 12 },
          { header: 'Raw Line', key: 'rawLine', width: 50 },
        ];
        
        // Add data rows
        allListings.listings.forEach(listing => {
          worksheet.addRow({
            pid: listing.pid || '',
            year: listing.year || '',
            variant: listing.variant || '',
            condition: listing.condition || '',
            price: listing.price || '',
            currency: listing.currency || '',
            groupName: listing.groupName || '',
            chatId: listing.chatId || '',
            sender: listing.sender || '',
            senderNumber: listing.senderNumber || '',
            date: listing.date || '',
            time: listing.time || '',
            rawLine: listing.rawLine || '',
          });
        });
        
        // Style the header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD9E1F2' }
        };
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=watch-backup-${new Date().toISOString().split('T')[0]}.xlsx`);
        
        await workbook.xlsx.write(res);
        res.end();
      } else {
        // JSON backup
        const backupData = {
          version: "1.0",
          created: new Date().toISOString(),
          timestamp: Date.now(),
          data: {
            watchListings: allListings.listings,
            processingLogs: includeData ? processingLogs : [],
            totalRecords: allListings.total
          },
          metadata: {
            exportedBy: "Watch Trading System",
            includesData: includeData
          }
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=watch-backup-${new Date().toISOString().split('T')[0]}.json`);
        res.json(backupData);
      }
    } catch (error) {
      console.error('Backup creation error:', error);
      res.status(500).json({ error: "Failed to create backup" });
    }
  });

  app.post("/api/backup/restore", async (req, res) => {
    try {
      const { backupData } = req.body;
      
      if (!backupData || !backupData.data) {
        return res.status(400).json({ error: "Invalid backup file format" });
      }
      
      let restoredCount = 0;
      
      // Restore watch listings
      if (backupData.data.watchListings) {
        for (const listing of backupData.data.watchListings) {
          try {
            await storage.createWatchListing(listing);
            restoredCount++;
          } catch (error) {
            console.log(`Skipped duplicate listing: ${listing.pid}`);
          }
        }
      }
      
      res.json({
        success: true,
        message: "Backup restored successfully",
        restored: restoredCount,
        total: backupData.data.watchListings?.length || 0
      });
    } catch (error) {
      console.error('Backup restoration error:', error);
      res.status(500).json({ error: "Failed to restore backup" });
    }
  });

  // Update existing records with group names
  app.post("/api/database/update-group-names", async (req, res) => {
    try {
      const { contactNames, groupNames } = await import('./routes/whatsapp');
      
      // Get all existing records without group names
      const existingRecords = await storage.getWatchListings({ limit: 10000, offset: 0 });
      let updatedCount = 0;
      
      for (const record of existingRecords.listings) {
        if (!record.groupName && record.chatId) {
          // Get the real group name from the cached names
          const realGroupName = groupNames.get(record.chatId);
          
          if (realGroupName) {
            // Update the record with the real group name
            await storage.updateWatchListingGroupName(record.id, realGroupName);
            updatedCount++;
          }
        }
      }
      
      res.json({
        success: true,
        message: `Updated ${updatedCount} records with group names`,
        updated: updatedCount,
        total: existingRecords.total
      });
    } catch (error) {
      console.error('Group name update error:', error);
      res.status(500).json({ error: "Failed to update group names" });
    }
  });

  // Test parsing endpoint
  app.post("/api/test-parse", async (req, res) => {
    try {
      const { message } = req.body;
      
      const { WatchMessageParser } = await import('./watch-parser');
      const parser = new WatchMessageParser();
      const results = await parser.parseMessage(message);
      
      res.json({
        message,
        results,
        count: results.length
      });
    } catch (error) {
      console.error('Test parse error:', error);
      res.status(500).json({ error: "Parse test failed" });
    }
  });

  // ===========================================
  // REFERENCE DATABASE
  // ===========================================

  app.get("/api/reference-database", async (req, res) => {
    try {
      const { storage } = await import('./storage');
      
      // Simple query without ordering for now
      const records = await storage.getAllReferenceRecords();
      
      res.json({
        records: records || [],
        total: records?.length || 0
      });
    } catch (error) {
      console.error('Reference database fetch error:', error);
      res.status(500).json({ error: "Failed to fetch reference database" });
    }
  });

  app.post("/api/reference-database/upload", async (req, res) => {
    try {
      const multer = await import('multer');
      const ExcelJS = await import('exceljs');
      const { db } = await import('./db');
      const { referenceDatabase, insertReferenceDatabaseSchema } = await import('../shared/schema');
      
      // Configure multer for file upload
      const upload = multer.default({ 
        storage: multer.default.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
      }).single('file');
      
      upload(req as any, res, async (err: any) => {
        if (err) {
          return res.status(400).json({ error: "File upload failed" });
        }
        
        if (!(req as any).file) {
          return res.status(400).json({ error: "No file uploaded" });
        }
        
        try {
          // Clear existing data first using raw SQL
          const { pool } = await import('./db');
          await pool.query('DELETE FROM reference_database');
          
          // Use xlsx library for more efficient processing
          const XLSX = require('xlsx');
          const workbook = XLSX.read((req as any).file.buffer);
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          
          if (!worksheet) {
            return res.status(400).json({ error: "No worksheet found in Excel file" });
          }
          
          // Convert to JSON with header = 1 to get array of arrays
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          const batchSize = 50; // Very small batch size for safety
          let processedCount = 0;
          
          console.log(`Processing ${jsonData.length} rows from Excel file in batches of ${batchSize}`);
          
          // Process in batches to avoid memory and stack overflow issues
          for (let i = 1; i < jsonData.length; i += batchSize) { // Start from 1 to skip header
            const batch = [];
            const endIndex = Math.min(i + batchSize, jsonData.length);
            
            for (let j = i; j < endIndex; j++) {
              const row = jsonData[j];
              const brand = row[0]?.toString()?.trim();
              const family = row[1]?.toString()?.trim();
              const reference = row[2]?.toString()?.trim();
              const name = row[3]?.toString()?.trim();
              
              if (!brand || !family || !reference || !name) {
                continue;
              }
              
              // Use the full reference as PID for better matching
              const pid = reference;
              
              batch.push({ pid, brand, family, reference, name });
              processedCount++;
            }
            
            // Insert batch if we have records
            if (batch.length > 0) {
              const values = batch.map((_, index) => {
                const baseIndex = index * 5 + 1;
                return `($${baseIndex}, $${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`;
              });
              
              const params = batch.flatMap(r => [r.pid, r.brand, r.family, r.reference, r.name]);
              
              const query = `
                INSERT INTO reference_database (pid, brand, family, reference, name)
                VALUES ${values.join(', ')}
              `;
              
              await pool.query(query, params);
              console.log(`Inserted batch: ${batch.length} records (total: ${processedCount})`);
            }
          }
          
          console.log(`Successfully processed ${processedCount} reference records`);
          
          res.json({
            message: `Successfully uploaded ${processedCount} reference records`,
            count: processedCount
          });
          
        } catch (excelError) {
          console.error('Excel processing error:', excelError);
          res.status(400).json({ error: "Failed to process Excel file. Please check the format." });
        }
      });
      
    } catch (error) {
      console.error('Reference database upload error:', error);
      res.status(500).json({ error: "Failed to upload reference database" });
    }
  });

  // ===========================================
  // AI CONFIGURATION
  // ===========================================

  app.post("/api/ai/configure", async (req, res) => {
    try {
      const { provider, apiKey, model } = req.body;
      
      if (!provider || !apiKey) {
        return res.status(400).json({ 
          error: "Provider and API key are required" 
        });
      }

      res.json({ message: "AI configuration saved successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to save AI configuration" });
    }
  });

  // Test AI connection
  app.post("/api/ai/test", async (req, res) => {
    try {
      const { provider, apiKey, model } = req.body;
      
      if (!provider || !apiKey) {
        return res.status(400).json({ 
          error: "Configuration required" 
        });
      }

      res.json({
        success: true,
        message: "AI connection test successful",
        model: model || "default"
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===========================================
  // WATCH REQUIREMENTS API (WTB/Looking for)
  // ===========================================
  
  // Get watch requirements with filters and pagination
  app.get("/api/watch-requirements", async (req, res) => {
    try {
      const { db } = await import('./db');
      const { watchRequirements } = await import('../shared/schema');
      const { sql, eq, and, or, like, desc, count } = await import('drizzle-orm');
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      
      // Build filters
      const filters = [];
      
      if (req.query.search) {
        const searchTerm = `%${req.query.search}%`;
        filters.push(
          or(
            like(watchRequirements.pid, searchTerm),
            like(watchRequirements.variant, searchTerm),
            like(watchRequirements.brand, searchTerm),
            like(watchRequirements.family, searchTerm)
          )
        );
      }
      
      if (req.query.sender) {
        filters.push(like(watchRequirements.sender, `%${req.query.sender}%`));
      }
      
      if (req.query.group) {
        filters.push(like(watchRequirements.groupName, `%${req.query.group}%`));
      }
      
      if (req.query.brand) {
        filters.push(like(watchRequirements.brand, `%${req.query.brand}%`));
      }
      
      if (req.query.startDate && req.query.endDate) {
        filters.push(
          and(
            sql`${watchRequirements.date} >= ${req.query.startDate}`,
            sql`${watchRequirements.date} <= ${req.query.endDate}`
          )
        );
      }
      
      const whereClause = filters.length > 0 ? and(...filters) : undefined;
      
      // Get total count
      const [totalResult] = await db
        .select({ count: count() })
        .from(watchRequirements)
        .where(whereClause);
      
      // Get requirements with pagination
      const requirements = await db
        .select()
        .from(watchRequirements)
        .where(whereClause)
        .orderBy(desc(watchRequirements.createdAt))
        .limit(limit)
        .offset(offset);
      
      res.json({
        requirements,
        total: totalResult.count,
        page,
        limit,
        totalPages: Math.ceil(totalResult.count / limit)
      });
    } catch (error) {
      console.error("Error fetching requirements:", error);
      res.status(500).json({ error: "Failed to fetch requirements" });
    }
  });
  
  // Get filter options for requirements
  app.get("/api/watch-requirements/filters", async (req, res) => {
    try {
      const { db } = await import('./db');
      const { watchRequirements } = await import('../shared/schema');
      const { sql } = await import('drizzle-orm');
      
      const senders = await db
        .selectDistinct({ sender: watchRequirements.sender })
        .from(watchRequirements)
        .where(sql`${watchRequirements.sender} IS NOT NULL AND ${watchRequirements.sender} != ''`)
        .orderBy(watchRequirements.sender);
      
      const groups = await db
        .selectDistinct({ groupName: watchRequirements.groupName })
        .from(watchRequirements)
        .where(sql`${watchRequirements.groupName} IS NOT NULL AND ${watchRequirements.groupName} != ''`)
        .orderBy(watchRequirements.groupName);
      
      const brands = await db
        .selectDistinct({ brand: watchRequirements.brand })
        .from(watchRequirements)
        .where(sql`${watchRequirements.brand} IS NOT NULL AND ${watchRequirements.brand} != ''`)
        .orderBy(watchRequirements.brand);
      
      res.json({
        senders: senders.map(s => s.sender),
        groups: groups.map(g => g.groupName),
        brands: brands.map(b => b.brand)
      });
    } catch (error) {
      console.error("Error fetching filter options:", error);
      res.status(500).json({ error: "Failed to fetch filter options" });
    }
  });
  
  // Export requirements to Excel
  app.post("/api/watch-requirements/export", async (req, res) => {
    try {
      const { db } = await import('./db');
      const { watchRequirements } = await import('../shared/schema');
      const { and, or, like, desc } = await import('drizzle-orm');
      const ExcelJS = await import('exceljs');
      
      // Build same filters as the GET endpoint
      const filters = [];
      
      if (req.body.search) {
        const searchTerm = `%${req.body.search}%`;
        filters.push(
          or(
            like(watchRequirements.pid, searchTerm),
            like(watchRequirements.variant, searchTerm),
            like(watchRequirements.brand, searchTerm),
            like(watchRequirements.family, searchTerm)
          )
        );
      }
      
      if (req.body.sender) {
        filters.push(like(watchRequirements.sender, `%${req.body.sender}%`));
      }
      
      if (req.body.group) {
        filters.push(like(watchRequirements.groupName, `%${req.body.group}%`));
      }
      
      if (req.body.brand) {
        filters.push(like(watchRequirements.brand, `%${req.body.brand}%`));
      }
      
      const whereClause = filters.length > 0 ? and(...filters) : undefined;
      
      // Get all matching requirements
      const requirements = await db
        .select()
        .from(watchRequirements)
        .where(whereClause)
        .orderBy(desc(watchRequirements.createdAt));
      
      // Create Excel workbook
      const workbook = new ExcelJS.default.Workbook();
      const worksheet = workbook.addWorksheet('Watch Requirements');
      
      // Add headers
      worksheet.columns = [
        { header: 'PID', key: 'pid', width: 15 },
        { header: 'Variant', key: 'variant', width: 12 },
        { header: 'Condition', key: 'condition', width: 12 },
        { header: 'Brand', key: 'brand', width: 15 },
        { header: 'Family', key: 'family', width: 15 },
        { header: 'Sender', key: 'sender', width: 20 },
        { header: 'Sender Number', key: 'senderNumber', width: 15 },
        { header: 'Group', key: 'groupName', width: 25 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Time', key: 'time', width: 10 },
        { header: 'Raw Request', key: 'rawLine', width: 40 },
        { header: 'Message ID', key: 'messageId', width: 15 },
        { header: 'Chat ID', key: 'chatId', width: 25 },
        { header: 'Created At', key: 'createdAt', width: 20 }
      ];
      
      // Add data rows
      requirements.forEach(req => {
        worksheet.addRow({
          pid: req.pid,
          variant: req.variant || '',
          condition: req.condition || '',
          brand: req.brand || '',
          family: req.family || '',
          sender: req.sender || '',
          senderNumber: req.senderNumber || '',
          groupName: req.groupName || '',
          date: req.date || '',
          time: req.time || '',
          rawLine: req.rawLine || '',
          messageId: req.messageId || '',
          chatId: req.chatId || '',
          createdAt: req.createdAt?.toISOString() || ''
        });
      });
      
      // Style the header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' }
      };
      
      // Set response headers for file download
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=watch-requirements-${new Date().toISOString().split('T')[0]}.xlsx`
      );
      
      // Write workbook to response
      await workbook.xlsx.write(res);
      res.end();
      
    } catch (error) {
      console.error("Error exporting requirements:", error);
      res.status(500).json({ error: "Failed to export requirements" });
    }
  });

  // ===========================================
  // WHATSAPP INTEGRATION (EXTERNAL API)
  // ===========================================
  
  // Register all external WhatsApp API routes
  registerWhatsAppRoutes(app);

  // API endpoint to get all groups from database with search functionality
  app.get("/api/whatsapp/database-groups", async (req, res) => {
    try {
      const { search } = req.query;
      
      let groups;
      if (search && typeof search === 'string') {
        // Use raw SQL for search with ILIKE
        const searchTerm = `%${search}%`;
        const result = await db.execute(
          sql`SELECT * FROM whatsapp_groups 
              WHERE group_name ILIKE ${searchTerm} OR group_id ILIKE ${searchTerm}
              ORDER BY group_name, group_id`
        );
        groups = result;
      } else {
        // No search - get all groups
        groups = await db.select().from(whatsappGroups).orderBy(whatsappGroups.groupName, whatsappGroups.groupId);
      }
      
      // Handle different result structures
      const groupsArray = Array.isArray(groups) ? groups : [];
      
      const formattedGroups = groupsArray.map((group: any) => ({
        id: group.groupId || group.group_id, // Handle both cases  
        name: group.groupName || group.group_name || `Unknown name (${(group.groupId || group.group_id).split('@')[0]})`,
        instanceId: group.instanceId || group.instance_id,
        instancePhone: group.instancePhone || group.instance_phone,
        instanceNumber: group.instanceNumber || group.instance_number || (group.instanceId || group.instance_id), // Fallback to instanceId
        source: group.source,
        lastSeen: group.lastSeen || group.last_seen,
      }));

      return res.json({ groups: formattedGroups });
    } catch (error) {
      console.error("Error fetching database groups:", error);
      return res.status(500).json({ error: "Failed to fetch groups from database" });
    }
  });

  // API endpoint to update group selection in config
  app.post("/api/whatsapp/update-group-selection", async (req, res) => {
    try {
      const { selectedGroupIds } = req.body;
      
      if (!Array.isArray(selectedGroupIds)) {
        return res.status(400).json({ error: "selectedGroupIds must be an array" });
      }

      // Update the whitelist in config
      const { loadConfig, saveConfig } = await import('./waConfig');
      await loadConfig();
      const { waConfig } = await import('./waConfig');
      
      waConfig.whitelistedGroups = selectedGroupIds.join(',');
      await saveConfig(waConfig);

      console.log(`✅ Updated group selection: ${selectedGroupIds.length} groups selected`);
      
      return res.json({ 
        success: true, 
        selectedCount: selectedGroupIds.length,
        whitelistedGroups: waConfig.whitelistedGroups
      });
    } catch (error) {
      console.error("Error updating group selection:", error);
      return res.status(500).json({ error: "Failed to update group selection" });
    }
  });

  // API endpoint to delete group from database
  app.delete("/api/whatsapp/database-groups/:groupId", async (req, res) => {
    try {
      const { groupId } = req.params;
      
      if (!groupId) {
        return res.status(400).json({ error: "Group ID is required" });
      }

      // Delete from database
      const result = await db.delete(whatsappGroups).where(eq(whatsappGroups.groupId, groupId));
      
      console.log(`🗑️  Deleted group from database: ${groupId}`);
      
      return res.json({ 
        success: true,
        message: "Group deleted from database",
        groupId
      });
    } catch (error) {
      console.error("Error deleting group:", error);
      return res.status(500).json({ error: "Failed to delete group from database" });
    }
  });
  
  // Import name caches from whatsapp routes (legacy)
  const { contactNames, groupNames } = await import('./routes/whatsapp');
  
  // Import the groupNameMap for message processing (legacy)
  const { groupNameMap } = await import('./routes/whatsapp');

  // Import the new webhook-first cache functions
  const { 
    cacheSetLastWebhook, 
    upsertGroup, 
    upsertContact, 
    getContactName 
  } = await import('./wa-cache');
  
  // Initialize connection monitoring
  const { getConnectionMonitor, updateLastMessageTime } = await import('./connection-monitor');
  const connectionMonitor = getConnectionMonitor();
  
  // Webhook URL logging on startup
  const webhookUrl = `https://${process.env.REPLIT_DEV_DOMAIN || 'localhost:5000'}/api/whatsapp/webhook`;
  const mode = waConfig.mode || 'webhook_only';
  
  console.log(`🔗 Webhook URL (configure this in mBlaster):`);
  console.log(`   ${webhookUrl}`);
  console.log(`🔧 Mode: ${mode} ${mode === 'webhook_only' ? '(no outbound API required)' : '(with optional API calls)'}`);

  // Only auto-refresh webhook in full_api mode
  if (waConfig.instanceId && waConfig.accessToken && mode === 'full_api') {
    setTimeout(async () => {
      try {
        console.log(`🔄 Auto-refreshing webhook for full_api mode: ${waConfig.instanceId}`);
        
        const whatsappModule = await import('./routes/whatsapp');
        const callMB = whatsappModule.callMB;
        await callMB("set_webhook", {
          webhook_url: webhookUrl,
          enable: "true",
          instance_id: waConfig.instanceId || "",
          access_token: waConfig.accessToken || "",
        });
        
        console.log(`✅ Webhook auto-refresh successful for ${waConfig.instanceId}`);
      } catch (error) {
        console.log(`⚠️  Webhook auto-refresh failed (expected in webhook_only mode): ${error}`);
      }
    }, 2000);
  }

  // ===========================================
  // STARTUP: FETCH ALL GROUP NAMES FOR REAL NAME RESOLUTION
  // ===========================================
  
  async function fetchAllGroupNamesStartup() {
    try {
      const { loadConfig } = await import('./waConfig');
      await loadConfig();
      const { waConfig } = await import('./waConfig');
      const { groupNames } = await import('./routes/whatsapp');
      
      if (waConfig.accessToken && waConfig.instanceId) {
        console.log(`🚀 STARTUP: Fetching all group names from WhatsApp API...`);
        
        const response = await fetch(`https://mblaster.in/api/get_groups?access_token=${waConfig.accessToken}&instance_id=${waConfig.instanceId}`);
        const data = await response.json();
        console.log(`📋 STARTUP: WhatsApp API response with ${data?.data?.length || 0} groups`);
        
        if (data.status === "success" && data.data) {
          for (const group of data.data) {
            if (group.id && group.name) {
              groupNames.set(group.id, group.name);
              console.log(`🏷️  STARTUP: Cached group name: ${group.id} → ${group.name}`);
              
              // Update existing database records with real names
              try {
                await db.update(whatsappGroups)
                  .set({ 
                    groupName: group.name,
                    updatedAt: new Date()
                  })
                  .where(
                    and(
                      eq(whatsappGroups.groupId, group.id),
                      eq(whatsappGroups.instanceId, waConfig.instanceId!)
                    )
                  );
                console.log(`💾 STARTUP: Updated database with real name: ${group.id} → "${group.name}"`);
              } catch (dbError) {
                console.error(`❌ STARTUP: Failed to update database for ${group.id}:`, dbError);
              }
            }
          }
          console.log(`✅ STARTUP: Successfully cached ${data.data.length} group names`);
        } else {
          console.log(`⚠️  STARTUP: No group data received from API:`, data);
        }
      } else {
        console.log(`⚠️  STARTUP: Missing accessToken or instanceId - skipping group name fetch`);
      }
    } catch (error) {
      console.error("❌ STARTUP: Failed to fetch group names:", error);
    }
  }
  
  // Call startup function after a short delay to allow server initialization
  setTimeout(fetchAllGroupNamesStartup, 3000);

  // ===========================================
  // WHATSAPP INTERNAL ROUTES (WEBHOOK & MESSAGES)
  // ===========================================

  // Message deduplication cache
  const processedMessages = new Set<string>();
  
  // WhatsApp webhook receiver
  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      // Log the complete payload to understand mblaster's format
      console.log("🔔 Incoming Webhook Payload:", JSON.stringify(req.body, null, 2));
      
      // 🔧 CRITICAL FIX: DYNAMIC INSTANCE ID VALIDATION
      // Reload config to get current instance ID
      const { loadConfig } = await import('./waConfig');
      await loadConfig();
      const { waConfig } = await import('./waConfig');
      
      const incomingInstanceId = req.body?.instance_id;
      
      // If we have an instance_id in the webhook, validate it
      if (incomingInstanceId) {
        if (!waConfig.instanceId) {
          console.log("⚠️  No instance ID configured - accepting webhook");
        } else if (incomingInstanceId !== waConfig.instanceId) {
          console.log(`🚫 Instance ID mismatch: incoming ${incomingInstanceId}, configured ${waConfig.instanceId} - REJECTING`);
          return res.status(200).json({ success: false, reason: "instance_id_mismatch", expected: waConfig.instanceId, received: incomingInstanceId });
        } else {
          console.log(`✅ Instance ID match: ${incomingInstanceId} - proceeding`);
        }
      }
      
      // WEBHOOK-FIRST: Update cache heartbeat on every valid webhook
      cacheSetLastWebhook();

      // Handle contacts.update events to fill both legacy and new cache
      if (req.body?.data?.event === "contacts.update" && req.body?.data?.data) {
        for (const contact of req.body.data.data) {
          if (contact.notify) {
            // Legacy cache
            contactNames.set(contact.id, contact.notify);
            // New webhook-first cache
            upsertContact(contact.id, { name: contact.notify, source: 'webhook' });
            console.log(`👤 Contact name cached: ${contact.id} → ${contact.notify}`);
          }
        }
        // Return early for contacts updates as they don't contain message content
        return res.status(200).json({ success: true, type: "contact_update" });
      }
      
      // Handle mblaster webhook format - check for messages.upsert events
      let messageData = "";
      let senderData = "unknown";
      let groupData = "unknown";
      let timestampData = new Date().toISOString();
      let messageIdData = `msg_${Date.now()}`;
      let senderNumberData = "";
      
      // Check if this is a mblaster message event
      if (req.body?.data?.event === "messages.upsert") {
        let msgEvent = null;
        
        // Handle different webhook structures
        if (req.body?.data?.data?.messages?.length > 0) {
          msgEvent = req.body.data.data.messages[0];
        } else if (req.body?.data?.data?.length > 0) {
          msgEvent = req.body.data.data[0];
        }
        
        if (msgEvent?.message) {
          messageData = msgEvent.message.conversation || 
                       msgEvent.message.extendedTextMessage?.text || 
                       msgEvent.message.imageMessage?.caption ||
                       "";
          const senderParticipant = msgEvent.key?.participant || msgEvent.key?.remoteJid || "unknown";
          const groupId = msgEvent.key?.remoteJid || "unknown";
          
          // WEBHOOK-FIRST: Discover groups from traffic + NEW GROUP LEARNING
          if (groupId.endsWith('@g.us')) {
            // Import new group learning service
            const { upsertFromWebhook } = await import('./services/groupDb');
            
            // Extract instance number from instance ID
            const instanceNumber = incomingInstanceId?.replace(/[^\d]/g, '') || waConfig.instanceId?.replace(/[^\d]/g, '') || undefined;
            
            // FIXED: Only collect actual group names, NEVER individual sender names
            const candidateNames = [
              // Method 1: Look for group subject in message context (actual group name)
              req.body?.data?.data?.messages?.[0]?.messageContextInfo?.groupSubject,
              // Method 2: Look for explicit group_name field
              req.body?.group_name,
              // Method 3: Check if we already have the real name from WhatsApp API cache
              groupNames.get(groupId),
              // Method 4: Look in messageStubParameters ONLY if they contain group-like names
              ...(msgEvent.messageStubParameters && Array.isArray(msgEvent.messageStubParameters) ? 
                  msgEvent.messageStubParameters.filter((name: any) => 
                    name && (name.includes('Group') || name.includes('Trading') || name.includes('Watch') || name.includes('Test'))
                  ) : []),
              req.body?.groupSubject,
              req.body?.data?.group_name,
              // Method 5: Look in other common webhook fields (but NOT sender names!)
              req.body?.chatName && (req.body.chatName.includes('Group') || req.body.chatName.includes('Watch')) ? req.body.chatName : undefined
            ];
            
            // Learn group name using new service
            const groupRow = upsertFromWebhook({
              rawGroupId: groupId,
              candidateNames,
              instanceNumber,
              at: msgEvent.messageTimestamp ? msgEvent.messageTimestamp * 1000 : Date.now()
            });
            
            console.log(`🎯 New group learning: ${groupId} → "${groupRow?.name || 'Unknown'}" (instance: ${instanceNumber || 'unknown'})`);
            
            // Legacy compatibility: still update old cache and database
            upsertGroup(waConfig.instanceId || 'unknown', groupId, { source: 'webhook' });
            await storeGroupInDatabase(groupId, waConfig.instanceId || 'unknown', incomingInstanceId, groupRow?.name);
          }
          
          // WEBHOOK-FIRST: Cache contact names from pushName
          if (msgEvent.pushName && senderParticipant) {
            upsertContact(senderParticipant, { name: msgEvent.pushName, source: 'webhook' });
            contactNames.set(senderParticipant, msgEvent.pushName); // Legacy cache
          }
          
          // Use new cache first, then legacy cache, then participant
          senderData = getContactName(senderParticipant) || contactNames.get(senderParticipant) || msgEvent.pushName || senderParticipant;
          groupData = groupId;
          
          // 🔧 CRITICAL FIX: USE ACTUAL MESSAGE SEND TIME
          // messageTimestamp is Unix timestamp in seconds - convert to ISO string
          if (msgEvent.messageTimestamp) {
            timestampData = new Date(msgEvent.messageTimestamp * 1000).toISOString();
            console.log(`📅 Using actual message send time: ${timestampData} (Unix: ${msgEvent.messageTimestamp})`);
          } else {
            timestampData = new Date().toISOString();
            console.log(`📅 No message timestamp - using current time: ${timestampData}`);
          }
          
          messageIdData = msgEvent.key?.id || `msg_${Date.now()}`;
          
          // 🔧 NEW: Use comprehensive phone number resolver
          const { resolveSenderNumber } = await import('./services/waResolve');
          const phoneResult = resolveSenderNumber(req.body);
          senderNumberData = phoneResult.number || "";
          
          console.log(`📱 PHONE EXTRACTION: ${phoneResult.number ? `Found: ${phoneResult.number}` : 'None found'} (source: ${phoneResult.source})`);
          
          // Store source for debugging
          (global as any).lastPhoneSource = phoneResult.source;
        }
      } else if (req.body?.data?.event === "received_message") {
        // Handle received_message format
        const msgEvent = req.body.data.message;
        if (msgEvent?.body_message) {
          messageData = msgEvent.body_message.content || 
                       msgEvent.body_message.messages?.conversation ||
                       "";
          
          const senderData_received = msgEvent.sender || msgEvent.from || "unknown";
          const groupData_received = msgEvent.group || msgEvent.chat_id || "unknown";
          
          // WEBHOOK-FIRST: Discover groups and contacts from received_message format
          if (groupData_received && groupData_received.endsWith('@g.us')) {
            // Try to extract group name from received_message format
            let extractedGroupName = undefined;
            
            // Look for group name in message data
            if (msgEvent.group_name) {
              extractedGroupName = msgEvent.group_name;
            } else if (msgEvent.chat_name) {
              extractedGroupName = msgEvent.chat_name;
            }
            
            // NEW GROUP LEARNING: Use new service for received_message format too
            const { upsertFromWebhook } = await import('./services/groupDb');
            const instanceNumber = incomingInstanceId?.replace(/[^\d]/g, '') || waConfig.instanceId?.replace(/[^\d]/g, '') || undefined;
            
            const candidateNames = [
              msgEvent.group_name,
              msgEvent.chat_name,
              msgEvent.push_name,
              req.body?.group_name,
              req.body?.groupSubject,
              req.body?.chatName,
            ];
            
            const groupRow = upsertFromWebhook({
              rawGroupId: groupData_received,
              candidateNames,
              instanceNumber,
              at: msgEvent.message_key?.timestamp ? msgEvent.message_key.timestamp * 1000 : Date.now()
            });
            
            console.log(`🎯 New group learning (received_message): ${groupData_received} → "${groupRow?.name || 'Unknown'}" (instance: ${instanceNumber || 'unknown'})`);
            
            // Legacy compatibility
            upsertGroup(waConfig.instanceId || 'unknown', groupData_received, { source: 'webhook' });
            await storeGroupInDatabase(groupData_received, waConfig.instanceId || 'unknown', incomingInstanceId, groupRow?.name);
          }
          
          if (msgEvent.push_name && senderData_received) {
            upsertContact(senderData_received, { name: msgEvent.push_name, source: 'webhook' });
          }
          const senderParticipant = msgEvent.message_key?.participant || msgEvent.message_key?.remoteJid || "unknown";
          senderData = contactNames.get(senderParticipant) || msgEvent.push_name || senderParticipant;
          groupData = msgEvent.message_key?.remoteJid || "unknown";
          
          // 🔧 CRITICAL FIX: USE ACTUAL MESSAGE SEND TIME FOR RECEIVED_MESSAGE FORMAT
          if (msgEvent.message_key?.timestamp) {
            timestampData = new Date(msgEvent.message_key.timestamp * 1000).toISOString();
            console.log(`📅 Using actual message send time: ${timestampData} (Unix: ${msgEvent.message_key.timestamp})`);
          } else {
            timestampData = new Date().toISOString();
            console.log(`📅 No message timestamp in received_message format - using current time: ${timestampData}`);
          }
          
          messageIdData = msgEvent.message_key?.id || `msg_${Date.now()}`;
          
          // 🔧 NEW: Use comprehensive phone number resolver
          const { resolveSenderNumber } = await import('./services/waResolve');
          const phoneResult = resolveSenderNumber(req.body);
          senderNumberData = phoneResult.number || "";
          
          console.log(`📱 PHONE EXTRACTION: ${phoneResult.number ? `Found: ${phoneResult.number}` : 'None found'} (source: ${phoneResult.source})`);
          
          // Store source for debugging
          (global as any).lastPhoneSource = phoneResult.source;
        }
      } else {
        // Fallback to simple format (for testing)
        messageData = req.body?.message || req.body?.data?.body || req.body?.body || req.body?.text || "";
        senderData = req.body?.sender || req.body?.data?.from || req.body?.from || req.body?.author || "unknown";
        groupData = req.body?.groupId || req.body?.data?.chatId || req.body?.chat || req.body?.group_id || "unknown";
        timestampData = req.body?.timestamp || req.body?.data?.timestamp || req.body?.time || new Date().toISOString();
        messageIdData = req.body?.messageId || req.body?.data?.id || req.body?.id || `msg_${Date.now()}`;
        senderNumberData = req.body?.senderNumber || req.body?.data?.phone || req.body?.phone || "";
      }
      
      console.log("📋 Extracted Data:", {
        message: messageData,
        sender: senderData,
        group: groupData,
        timestamp: timestampData,
        messageId: messageIdData,
        senderNumber: senderNumberData
      });
      
      if (!messageData) {
        console.log("❌ No message content found in payload");
        return res.status(200).json({ error: "No message content in payload", received: Object.keys(req.body) });
      }
      
      // 🔧 CHECK FOR PAUSE STATUS BEFORE PROCESSING
      if (waConfig.paused) {
        console.log("⏸️  Message processing is PAUSED - skipping");
        return res.status(200).json({ success: true, skipped: true, reason: "paused" });
      }
      
      // Check for message duplication
      const dedupeKey = `${messageIdData}_${messageData.slice(0, 50)}`;
      if (processedMessages.has(dedupeKey)) {
        console.log("⚠️  Duplicate message detected - skipping processing");
        return res.status(200).json({ success: true, skipped: true, reason: "duplicate" });
      }
      processedMessages.add(dedupeKey);
      
      // Clean up old dedupe entries (keep last 100)
      if (processedMessages.size > 100) {
        const entries = Array.from(processedMessages);
        processedMessages.clear();
        entries.slice(-50).forEach(entry => processedMessages.add(entry));
      }

      // DYNAMIC WHITELIST BEHAVIOR - RELOAD CONFIG FIRST
      const getAllowedGroupsWebhook = async () => {
        // Reload config to get latest whitelist changes
        const { loadConfig } = await import('./waConfig');
        await loadConfig();
        const { waConfig } = await import('./waConfig');
        
        // If whitelist is empty or not set, return empty array (allow all)
        if (!waConfig.whitelistedGroups || waConfig.whitelistedGroups.trim() === "") {
          console.log("📝 Empty whitelist - allowing ALL messages (individual + group)");
          return [];
        }
        
        // If whitelist has content, parse and return group IDs
        const groupIds = waConfig.whitelistedGroups
          .split(/[\s,]+/)
          .map((g) => g.trim())
          .filter(Boolean);
        
        console.log(`📝 Whitelist active - only allowing: ${groupIds.join(", ")}`);
        return groupIds;
      };

      const allowedGroups = await getAllowedGroupsWebhook();
      
      // DYNAMIC FILTERING LOGIC:
      // Empty whitelist = Allow ALL messages (individual + group)
      // Populated whitelist = Only allow specified group IDs
      if (allowedGroups.length > 0) {
        // Whitelist is populated - only allow specified groups
        if (!allowedGroups.includes(groupData)) {
          console.log(`🚫 Group ${groupData} not whitelisted - skipping. Whitelisted: ${allowedGroups.join(", ")}`);
          return res.json({ success: true, stored: false, parsed: false, reason: "group_not_whitelisted" });
        } else {
          console.log(`✅ Group ${groupData} is whitelisted - processing message`);
        }
      } else {
        // Whitelist is empty - allow ALL messages (individual + group)
        console.log(`🌐 Empty whitelist - processing ALL messages (source: ${groupData})`);
      }

      // Store as raw message for browsing - use cached names
      let finalSenderName = senderData;
      
      // Check multiple formats for cached contact names
      if (contactNames.has(senderData)) {
        finalSenderName = contactNames.get(senderData)!;
      } else if (senderData.includes('@') && contactNames.has(senderData)) {
        finalSenderName = contactNames.get(senderData)!;
      } else if (!senderData.includes('@') && contactNames.has(`${senderData}@s.whatsapp.net`)) {
        finalSenderName = contactNames.get(`${senderData}@s.whatsapp.net`)!;
      }
      
      // If we don't have a cached group name yet, try to fetch it from the API
      if (!groupNames.has(groupData) && groupData.includes("@g.us")) {
        const { loadConfig } = await import('./waConfig');
        await loadConfig();
        const { waConfig } = await import('./waConfig');
        
        if (waConfig.accessToken && waConfig.instanceId) {
          try {
            console.log(`🔄 Fetching fresh group names from WhatsApp API...`);
            const response = await fetch(`https://mblaster.in/api/get_groups?access_token=${waConfig.accessToken}&instance_id=${waConfig.instanceId}`);
            const data = await response.json();
            console.log(`📋 WhatsApp API response:`, data);
            
            if (data.status === "success" && data.data) {
              for (const group of data.data) {
                if (group.id && group.name) {
                  groupNames.set(group.id, group.name);
                  console.log(`🏷️  Group name cached from WhatsApp API: ${group.id} → ${group.name}`);
                }
              }
            }
          } catch (error) {
            console.log("⚠️  Failed to fetch group names:", error);
          }
        }
      }
      
      // Now get the final group name after potential caching
      let finalGroupName = groupNames.get(groupData);
      
      // If we still don't have a cached name, provide better defaults
      if (!finalGroupName && groupData.includes("@g.us")) {
        const knownGroupNames: Record<string, string> = {
          '120363155030102618@g.us': '🔥Digitalbabaa Tools & Services 105🔥',
          '919821822960-1609692489@g.us': 'Test 1',
          '120363400262559729@g.us': 'Test3',
          '120363401430608392@g.us': 'Watch test'
        };
        finalGroupName = knownGroupNames[groupData] || `Group ${groupData.split('-')[0]}`;
      } else if (!finalGroupName) {
        finalGroupName = "Private Chat";
      }
      
      const rawMessage = {
        id: `raw_${Date.now()}`,
        timestamp: timestampData,
        groupId: groupData,
        groupName: finalGroupName,
        sender: finalSenderName,
        senderNumber: senderNumberData,
        message: messageData,
        messageId: messageIdData,
        processed: false,
        status: "pending" as const,
      };

      // Store raw message in memory AND persistent storage
      if (!(global as any).rawMessages) (global as any).rawMessages = [];
      (global as any).rawMessages.unshift(rawMessage);
      if ((global as any).rawMessages.length > 100) (global as any).rawMessages = (global as any).rawMessages.slice(0, 100);
      
      // PERSISTENT STORAGE - Save to file so messages survive server restarts
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const dataDir = path.join(process.cwd(), 'data');
        const messagesFile = path.join(dataDir, 'raw-messages.json');
        
        // Ensure data directory exists
        await fs.mkdir(dataDir, { recursive: true });
        
        // Save current messages to file
        await fs.writeFile(messagesFile, JSON.stringify((global as any).rawMessages, null, 2));
        console.log(`💾 Messages saved to persistent storage (${(global as any).rawMessages.length} messages)`);
      } catch (fileError) {
        console.error('❌ Failed to save messages to file:', fileError);
      }
      
      // Update connection monitor
      updateLastMessageTime();

      // Parse the message using our watch parser
      const { WatchMessageParser } = await import('./watch-parser');
      const parser = new WatchMessageParser();
      const parsedListings = await parser.parseMessage(messageData);
      
      // ALSO PARSE FOR REQUIREMENTS (WTB/Looking for)
      console.log("🛒 REQUIREMENTS PARSING: Started");
      try {
        const { parseRequirements, storeRequirements } = await import('./requirements-parser');
        
        // Extract date and time from timestamp
        const messageDate = timestampData ? new Date(timestampData) : new Date();
        const dateStr = messageDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
        const timeStr = messageDate.toLocaleTimeString('en-GB', { hour12: false }); // HH:MM:SS format
        
        const requirementsResult = parseRequirements(
          messageData,
          finalSenderName,
          finalGroupName, // Use real group name
          groupData,
          messageIdData,
          senderNumberData,
          dateStr,
          timeStr
        );
        
        if (requirementsResult.isRequirementMessage && requirementsResult.requirements.length > 0) {
          console.log(`🛒 Found ${requirementsResult.requirements.length} requirements in ${requirementsResult.messageType} message from ${finalSenderName}`);
          
          await storeRequirements(requirementsResult.requirements, {
            sender: finalSenderName,
            groupName: finalGroupName, // Use real group name
            chatId: groupData,
            messageId: messageIdData,
            senderNumber: senderNumberData,
            date: dateStr,
            time: timeStr,
            originalMessage: messageData
          });
          
          // Store requirements count for status determination
          (global as any).lastRequirementsCount = requirementsResult.requirements.length;
          console.log(`✅ Requirements stored successfully`);
        } else {
          console.log(`ℹ️  No requirements found in message`);
          (global as any).lastRequirementsCount = 0;
        }
      } catch (requirementsError) {
        console.error('❌ Requirements parsing error:', requirementsError);
      }
      
      console.log("🔍 Parser Results:", {
        messageLength: messageData.length,
        messageLines: messageData.split('\n').length,
        parsedCount: parsedListings.length,
        firstFewPIDs: parsedListings.slice(0, 5).map(l => l.pid)
      });

      const results = [];
      for (const listing of parsedListings) {
        try {
          const listingData = insertWatchListingSchema.parse({
            chatId: groupData,
            groupName: finalGroupName,
            date: timestampData ? new Date(timestampData).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            time: timestampData ? new Date(timestampData).toTimeString().split(' ')[0] : new Date().toTimeString().split(' ')[0],
            sender: finalSenderName,
            senderNumber: senderNumberData,
            pid: listing.pid,
            year: listing.year,
            variant: listing.variant,
            condition: listing.condition,
            price: listing.price,
            currency: listing.currency,
            rawLine: listing.rawLine,
            messageId: messageIdData,
            // 🔧 CRITICAL FIX: Include enriched fields from parser
            brand: listing.brand || null,
            family: listing.family || null,
            month: listing.month || null  // NEW: Save month notation (N1-N12)
          });
          
          const savedListing = await storage.createWatchListing(listingData);
          results.push({ success: true, id: savedListing.id });
          
          // Check for PID alerts and send notifications
          if (listing.pid && listing.price) {
            try {
              console.log(`🔍 Checking PID alerts for: ${listing.pid}, variant: ${listing.variant}, price: ${listing.price}, currency: ${listing.currency}`);
              
              const matchedAlerts = await storage.checkPidAlerts(
                listing.pid, 
                listing.variant || null, 
                listing.price, 
                listing.currency || null
              );
              
              console.log(`🔍 Found ${matchedAlerts.length} matching alerts`);
              
              for (const alert of matchedAlerts) {
                console.log(`🔔 PID Alert match: ${alert.pid} for ${alert.notificationPhone}`);
                await sendPidAlertNotification(alert, savedListing);
              }
            } catch (alertError) {
              console.error('❌ Error checking PID alerts:', alertError);
            }
          }
          
          // Log successful processing
          console.log("✅ Successfully processed listing:", listing.pid);
        } catch (error) {
          results.push({ success: false, error: (error as Error).message });
          console.log("❌ Error processing listing:", (error as Error).message);
        }
      }

      // Update raw message status
      if (parsedListings.length > 0) {
        rawMessage.processed = true;
        rawMessage.status = "processed" as any;
      } else {
        rawMessage.status = "no-pid" as any;
      }

      // Log processing result
      const logStatus = parsedListings.length === 0 ? "no-pid" : 
                      parsedListings.every(l => l.pid) ? "success" : "partial";
      const logEntry = insertProcessingLogSchema.parse({
        messageId: messageIdData,
        status: logStatus,
        parsedData: parsedListings,
        rawMessage: messageData,
      });

      await storage.createProcessingLog(logEntry);

      // Use requirements count from earlier parsing (avoid duplicate parsing)
      const requirementsCount = (global as any).lastRequirementsCount || 0;

      // Determine status based on what was found
      let finalStatus = logStatus;
      if (requirementsCount > 0) {
        finalStatus = `Requirements (${requirementsCount})`;
      } else if (parsedListings.length > 0) {
        finalStatus = `Processed (${parsedListings.length})`;
      }

      res.json({
        success: true,
        stored: true,
        parsed: parsedListings.length > 0,
        listings: parsedListings.length,
        requirements: requirementsCount,
        status: finalStatus,
        results: results
      });

    } catch (error: any) {
      console.error("❌ Webhook processing error:", error);
      res.status(500).json({ error: "Failed to process WhatsApp webhook" });
    }
  });

  // Get raw messages for the incoming messages page
  app.get("/api/whatsapp/messages", async (req, res) => {
    try {
      let messages = [];
      
      // Try to load from persistent storage first
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const messagesFile = path.join(process.cwd(), 'data', 'raw-messages.json');
        const data = await fs.readFile(messagesFile, 'utf8');
        messages = JSON.parse(data);
        console.log(`📂 Loaded ${messages.length} messages from persistent storage`);
      } catch (fileError) {
        // File doesn't exist or error reading - use in-memory fallback
        messages = (global as any).rawMessages || [];
        console.log(`🧠 Using in-memory messages (${messages.length} messages)`);
      }
      
      const fullMessages = req.query.full === 'true';
      
      if (fullMessages) {
        // Return full message content without truncation
        res.json({ messages });
      } else {
        // Return truncated messages for display
        const truncatedMessages = messages.map((msg: any) => ({
          ...msg,
          message: msg.message.length > 500 ? msg.message.substring(0, 500) + '...' : msg.message
        }));
        res.json({ messages: truncatedMessages });
      }
    } catch (error) {
      console.error("❌ Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Clear raw messages
  app.delete("/api/whatsapp/messages", async (req, res) => {
    try {
      (global as any).rawMessages = [];
      res.json({ success: true, message: "Messages cleared" });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear messages" });
    }
  });

  // Get/set whitelisted groups
  app.get("/api/whatsapp/groups/whitelist", async (req, res) => {
    try {
      const groupIds = waConfig.whitelistedGroups 
        ? waConfig.whitelistedGroups.split(/[\s,]+/).map(g => g.trim()).filter(Boolean)
        : [];
      res.json({ groupIds });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch whitelist" });
    }
  });

  app.post("/api/whatsapp/groups/whitelist", async (req, res) => {
    try {
      const { groupIds } = req.body;
      waConfig.whitelistedGroups = groupIds.join(",");
      res.json({ success: true, message: "Whitelist updated" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update whitelist" });
    }
  });
  
  // Connection status endpoint
  app.get("/api/whatsapp/connection-status", async (req, res) => {
    const status = connectionMonitor.getStatus();
    res.json({
      connected: status.connected,
      lastPing: status.lastPing,
      reconnectAttempts: status.reconnectAttempts,
      maxReconnectAttempts: status.maxReconnectAttempts
    });
  });

  // Test message parsing endpoint
  app.post("/api/test/parse-message", async (req, res) => {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Parse the message using our watch parser
      const { WatchMessageParser } = await import('./watch-parser');
      const parser = new WatchMessageParser();
      const parsedListings = await parser.parseMessage(message);
      
      // Count reference matches
      let referenceMatches = 0;
      for (const listing of parsedListings) {
        if (listing.brand && listing.family) {
          referenceMatches++;
        }
      }
      
      res.json({
        success: true,
        listings: parsedListings,
        parsedCount: parsedListings.length,
        referenceMatches: referenceMatches,
        message: `Parsed ${parsedListings.length} PIDs with ${referenceMatches} reference database matches`
      });
      
    } catch (error) {
      console.error("❌ Test parsing error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to parse message",
        listings: [],
        parsedCount: 0,
        referenceMatches: 0
      });
    }
  });

  // 🔧 PAUSE/RESUME FUNCTIONALITY
  app.post("/api/whatsapp/pause", async (req, res) => {
    try {
      const { saveConfig } = await import('./waConfig');
      await saveConfig({ paused: true });
      console.log("⏸️  WhatsApp message processing PAUSED");
      res.json({ success: true, paused: true, message: "Message processing paused" });
    } catch (error) {
      res.status(500).json({ error: "Failed to pause message processing" });
    }
  });

  app.post("/api/whatsapp/resume", async (req, res) => {
    try {
      const { saveConfig } = await import('./waConfig');
      await saveConfig({ paused: false });
      console.log("▶️  WhatsApp message processing RESUMED");
      res.json({ success: true, paused: false, message: "Message processing resumed" });
    } catch (error) {
      res.status(500).json({ error: "Failed to resume message processing" });
    }
  });

  app.get("/api/whatsapp/pause-status", async (req, res) => {
    try {
      const { loadConfig } = await import('./waConfig');
      await loadConfig();
      const { waConfig } = await import('./waConfig');
      res.json({ paused: waConfig.paused || false });
    } catch (error) {
      res.status(500).json({ error: "Failed to get pause status" });
    }
  });

  // Force connection check endpoint (automatic ping)
  app.post("/api/whatsapp/ping", async (req, res) => {
    // Check if we're in webhook_only mode
    const mode = waConfig.mode || 'webhook_only';
    
    if (mode === 'webhook_only') {
      // In webhook_only mode, check connection based on last webhook received
      const { getLastWebhookAt } = await import('./wa-cache');
      const lastWebhook = getLastWebhookAt();
      const connected = Date.now() - lastWebhook < 10 * 60 * 1000; // Connected if webhook received within last 10 minutes
      
      return res.json({ 
        connected, 
        mode: 'webhook_only',
        lastWebhookAt: lastWebhook,
        status: connected ? 'connected' : 'waiting_for_webhooks',
        message: connected ? 'Webhook connection active' : 'No recent webhooks received'
      });
    }
    
    // Original ping logic for full_api mode follows...
    try {
      const { waConfig } = await import('./waConfig');
      
      if (!waConfig.accessToken || !waConfig.instanceId) {
        return res.json({ connected: false, error: 'No credentials configured' });
      }

      // Primary test: Try to get groups (proves full functionality)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const groupsResponse = await fetch(`https://mblaster.in/api/get_groups?instance_id=${waConfig.instanceId}&access_token=${waConfig.accessToken}`, {
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (groupsResponse.ok) {
          const groupsText = await groupsResponse.text();
          
          if (!groupsText.includes('<!DOCTYPE html>')) {
            try {
              const groupsData = JSON.parse(groupsText);
              
              if (groupsData.groups && Array.isArray(groupsData.groups)) {
                // Force update connection monitor to show connected status
                const monitor = getConnectionMonitor();
                monitor.updateLastMessageTime();
                
                return res.json({ 
                  connected: true, 
                  status: 'groups_accessible',
                  groupCount: groupsData.groups.length,
                  method: 'groups_api'
                });
              }
            } catch (parseError) {
              // Fall through to status check
            }
          }
        }
      } catch (groupsError) {
        // Fall through to status check
      }

      // Fallback: Check status endpoint
      const statusController = new AbortController();
      const statusTimeoutId = setTimeout(() => statusController.abort(), 5000);
      
      const statusResponse = await fetch(`https://mblaster.in/api/get_instance_status?instance_id=${waConfig.instanceId}&access_token=${waConfig.accessToken}`, {
        method: 'GET',
        signal: statusController.signal
      });
      
      clearTimeout(statusTimeoutId);
      
      if (statusResponse.ok) {
        const statusText = await statusResponse.text();
        
        if (!statusText.includes('<!DOCTYPE html>')) {
          try {
            const statusData = JSON.parse(statusText);
            const isConnected = statusData.status === 'connected' || 
                               statusData.status === 'open' || 
                               statusData.state === 'open' ||
                               statusData.connected === true;
            
            if (isConnected) {
              const monitor = getConnectionMonitor();
              monitor.updateLastMessageTime();
            }
            
            return res.json({ 
              connected: isConnected, 
              status: statusData.status || statusData.state,
              method: 'status_api'
            });
          } catch (parseError) {
            return res.json({ connected: false, error: 'Invalid JSON response' });
          }
        }
      }
      
      return res.json({ connected: false, error: 'All endpoints returned HTML or failed' });
    } catch (error) {
      return res.json({ connected: false, error: (error as Error).message });
    }
  });

  // Register group management routes
  registerGroupRoutes(app);
  
  // Register inventory routes
  const inventoryRoutes = await import('./routes/inventory');
  app.use(inventoryRoutes.default);

  const httpServer = createServer(app);
  return httpServer;
}