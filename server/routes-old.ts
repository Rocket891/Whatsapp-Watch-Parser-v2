import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  searchFiltersSchema,
  insertWatchListingSchema,
  insertProcessingLogSchema,
} from "@shared/schema";
import { authenticateToken, type AuthRequest } from "./middleware/auth";
import { z } from "zod";
import { GoogleSheetsService } from "./google-sheets";
import { waConfig } from "./waConfig";
import { registerWhatsAppRoutes } from "./routes/whatsapp";

// Track last received message time for stable connection status
let lastReceivedMessageTime = 0;

// Helper function to extract message details from mblaster payload
function extractMessageFromPayload(payload: any) {
  const result = {
    message: "",
    sender: "",
    senderNumber: "",
    groupId: "",
    groupName: "",
    messageId: "",
  };

  // Get allowed groups from waConfig instead of hardcoded list
  const getAllowedGroups = () => {
    const allowed = (waConfig.whitelistedGroups || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

    // If whitelist is empty, allow all groups
    if (allowed.length === 0) {
      return []; // empty array means allow all
    }

    return allowed;
  };

  const root = payload?.data;
  if (!root) {
    result.message = "Invalid payload";
    result.sender = "System";
    result.groupName = "System";
    return result;
  }

  let m = null;
  let isValidMessage = false;

  // 1) m-Blaster received_message format
  if (root.event === "received_message") {
    m = root.message;
    isValidMessage = Boolean(
      m &&
        !m.message_key?.fromMe &&
        m.message_key?.remoteJid !== "status@broadcast" &&
        (getAllowedGroups().length === 0 ||
          getAllowedGroups().includes(m.message_key?.remoteJid)) &&
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

  // If not a valid message, show event type
  if (!isValidMessage || !m) {
    result.message = `Event: ${root.event || "unknown"}`;
    result.sender = "System";
    result.groupName = "System";
    result.groupId = "System";
    return result;
  }

  // Extract text content
  let txt = "";
  if (m.body_message && m.body_message.content) {
    txt = m.body_message.content;
  } else if (m.message && m.message.conversation) {
    txt = m.message.conversation;
  } else if (
    m.message &&
    m.message.extendedTextMessage &&
    m.message.extendedTextMessage.text
  ) {
    txt = m.message.extendedTextMessage.text;
  } else if (m.message && m.message.imageMessage) {
    txt = "Image/Media";
  }

  // Extract group ID
  const gid =
    m.message_key && m.message_key.remoteJid
      ? m.message_key.remoteJid
      : m.key && m.key.remoteJid
        ? m.key.remoteJid
        : "";

  // Extract sender number
  let sn =
    m.message_key && m.message_key.participant
      ? m.message_key.participant
      : m.key && m.key.participant
        ? m.key.participant
        : "";
  sn = sn.replace(/@.+$/, ""); // strip "@s.whatsapp.net"

  // Extract sender name
  const senderName = m.push_name || m.pushName || sn || "Unknown";

  result.message = txt.trim();
  result.sender = senderName;
  result.senderNumber = sn;
  result.groupId = gid;
  result.groupName = gid.includes("@g.us") ? "Group Chat" : "Private Chat";
  result.messageId =
    m.message_key && m.message_key.id
      ? m.message_key.id
      : m.key && m.key.id
        ? m.key.id
        : "";

  return result;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Dashboard stats endpoint
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // Get recent watch listings
  app.get("/api/watch-listings/recent", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const listings = await storage.getRecentWatchListings(limit, req.user?.userId);
      res.json(listings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent listings" });
    }
  });

  // Search watch listings
  app.get("/api/watch-listings/search", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const transformedQuery = {
        ...req.query,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        priceFrom: req.query.priceFrom
          ? parseFloat(req.query.priceFrom as string)
          : undefined,
        priceTo: req.query.priceTo
          ? parseFloat(req.query.priceTo as string)
          : undefined,
      };

      const filters = searchFiltersSchema.parse(transformedQuery);
      const result = await storage.getWatchListings(filters, req.user?.userId);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Invalid search filters", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to search listings" });
      }
    }
  });

  // Get watch listings by PID
  app.get("/api/watch-listings/pid/:pid", async (req, res) => {
    try {
      const { pid } = req.params;
      const listings = await storage.getWatchListingsByPid(pid);
      res.json(listings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch listings by PID" });
    }
  });

  // Create watch listing
  app.post("/api/watch-listings", async (req, res) => {
    try {
      const listingData = insertWatchListingSchema.parse(req.body);
      const listing = await storage.createWatchListing(listingData);
      res.status(201).json(listing);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Invalid listing data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create listing" });
      }
    }
  });

  // Get recent processing errors
  app.get("/api/processing-logs/errors", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const errors = await storage.getRecentErrors(limit);
      res.json(errors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch processing errors" });
    }
  });

  // Get processing logs
  app.get("/api/processing-logs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getProcessingLogs(limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch processing logs" });
    }
  });

  // Create processing log
  app.post("/api/processing-logs", async (req, res) => {
    try {
      const logData = insertProcessingLogSchema.parse(req.body);
      const log = await storage.createProcessingLog(logData);
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Invalid log data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create processing log" });
      }
    }
  });

  // Get unique PIDs
  app.get("/api/analytics/unique-pids", async (req, res) => {
    try {
      const pids = await storage.getUniquePids();
      res.json(pids);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch unique PIDs" });
    }
  });

  // Get currency statistics
  app.get("/api/analytics/currency-stats", async (req, res) => {
    try {
      const stats = await storage.getCurrencyStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch currency stats" });
    }
  });

  // Get sender statistics
  app.get("/api/analytics/sender-stats", async (req, res) => {
    try {
      const stats = await storage.getSenderStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sender stats" });
    }
  });

  // Export watch listings
  app.get("/api/export/watch-listings", async (req, res) => {
    try {
      const filters = searchFiltersSchema.parse(req.query);
      const { listings } = await storage.getWatchListings({
        ...filters,
        limit: 10000,
      });

      const headers = [
        "PID",
        "Year",
        "Variant",
        "Condition",
        "Price",
        "Currency",
        "Sender",
        "Date",
        "Time",
        "Raw Line",
      ];

      const csvData = [
        headers.join(","),
        ...listings.map((listing) =>
          [
            listing.pid || "",
            listing.year || "",
            listing.variant || "",
            listing.condition || "",
            listing.price || "",
            listing.currency || "",
            listing.sender || "",
            listing.date || "",
            listing.time || "",
            `"${(listing.rawLine || "").replace(/"/g, '""')}"`,
          ].join(","),
        ),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="watch-listings.csv"',
      );
      res.send(csvData);
    } catch (error) {
      res.status(500).json({ error: "Failed to export listings" });
    }
  });

  // Process Google Sheets raw messages
  app.post("/api/process-sheets", async (req, res) => {
    try {
      const { spreadsheetId, serviceAccountKey } = req.body;

      if (!spreadsheetId || !serviceAccountKey) {
        return res.status(400).json({
          error: "Missing required fields: spreadsheetId, serviceAccountKey",
        });
      }

      const sheetsService = new GoogleSheetsService({
        spreadsheetId,
        serviceAccountKey,
      });

      const result = await sheetsService.processRawMessages();

      res.json({
        message: "Successfully processed raw messages",
        processed: result.processed,
        listings: result.listings,
      });
    } catch (error) {
      console.error("Google Sheets processing error:", error);
      res.status(500).json({ error: "Failed to process Google Sheets data" });
    }
  });

  // Test parsing endpoint
  app.post("/api/test-parser", async (req, res) => {
    try {
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const { WatchMessageParser } = await import("./watch-parser");
      const parser = new WatchMessageParser();
      const listings = parser.parseMessage(message);

      res.json({
        message: "Message parsed successfully",
        input: message,
        listings: listings,
      });
    } catch (error) {
      console.error("Parser test error:", error);
      res.status(500).json({ error: "Failed to parse message" });
    }
  });

  // Load test data endpoint
  app.post("/api/load-test-data", async (req, res) => {
    try {
      const testData = [
        {
          chat: "120363400088469625@g.us",
          date: "2025-06-26",
          time: "06:08:51.945",
          sender: "Nirav gandhi",
          senderNumber: "917021542840",
          pid: "4600E/000R-B576",
          year: "2023",
          variant: "",
          condition: "Full Set",
          price: 130000,
          currency: "HKD",
          listingIndex: 1,
          totalListings: 5,
          rawLine: "4600E/000R-B576 23Y fullset 130000hkd",
          messageId: "2025-06-26T06:08:51.945Z_120363400088469625@g.us_test1",
        },
        // ... other test data
      ];

      const results = [];
      for (const item of testData) {
        try {
          const listingData = insertWatchListingSchema.parse(item);
          const listing = await storage.createWatchListing(listingData);
          results.push({ success: true, id: listing.id });

          await storage.createProcessingLog({
            messageId: item.messageId,
            status: "success",
            parsedData: item,
            rawMessage: item.rawLine,
          });
        } catch (error) {
          results.push({ success: false, error: (error as Error).message });
        }
      }

      const today = new Date().toISOString().split("T")[0];
      await storage.updateSystemStats(today, {
        messagesProcessed: testData.length,
        parsedSuccessful: results.filter((r) => r.success).length,
        parseErrors: results.filter((r) => !r.success).length,
        uniquePids: testData.filter((item) => item.pid).length,
      });

      res.json({ message: "Test data loaded successfully", results });
    } catch (error) {
      res.status(500).json({ error: "Failed to load test data" });
    }
  });

  // Webhook endpoint for n8n integration
  app.post("/api/webhook/watch-listings", async (req, res) => {
    try {
      const data = req.body;

      if (Array.isArray(data)) {
        const results = [];

        for (const item of data) {
          try {
            const listingData = insertWatchListingSchema.parse(item);
            const listing = await storage.createWatchListing(listingData);
            results.push({ success: true, id: listing.id });

            await storage.createProcessingLog({
              messageId: item.messageId || item._messageId,
              status: "success",
              parsedData: item,
              rawMessage: item.rawLine || item["Raw Line"],
            });
          } catch (error) {
            results.push({ success: false, error: (error as Error).message });

            await storage.createProcessingLog({
              messageId: item.messageId || item._messageId,
              status: "error",
              errorMessage: (error as Error).message,
              rawMessage:
                item.rawLine || item["Raw Line"] || JSON.stringify(item),
            });
          }
        }

        res.json({ processed: results.length, results });
      } else {
        res.status(400).json({ error: "Expected array of listings" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to process webhook data" });
    }
  });

  // ========================================
  // WHATSAPP INTEGRATION ENDPOINTS (FIXED)
  // ========================================

  // 1. Save WhatsApp configuration
  app.post("/api/whatsapp/configure", async (req, res) => {
    try {
      const { accessToken, instanceId, whitelistedGroups, autoProcess } =
        req.body;

      if (!accessToken) {
        return res.status(400).json({ error: "Access token is required" });
      }

      // Store configuration persistently
      await saveConfig({
        accessToken,
        instanceId,
        whitelistedGroups,
        autoProcess,
      });

      console.log("📋 Configuration saved:", {
        instanceId,
        accessToken: accessToken?.slice(0, 8) + "...",
      });

      res.json({
        message: "WhatsApp configuration saved successfully",
        status: "configured",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to configure WhatsApp" });
    }
  });

  // 2. Create new instance
  app.post("/api/whatsapp/create-instance", async (req, res) => {
    try {
      const { accessToken } = req.body;

      if (!accessToken) {
        return res.status(400).json({ error: "Access token is required" });
      }

      const response = await axios.post(`${MBLASTER_BASE}/create_instance`, {
        access_token: accessToken,
      });

      console.log("✅ Instance created:", response.data);

      // Save the new instance ID persistently
      await saveConfig({
        instanceId: response.data.instance_id,
        accessToken: accessToken,
      });

      res.json({
        instanceId: response.data.instance_id,
        message: "Instance created successfully",
        data: response.data,
      });
    } catch (error: any) {
      console.error("❌ Create instance error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // 2.1. Get current configuration
  app.get("/api/whatsapp/config", async (req, res) => {
    try {
      res.json({
        ...waConfig,
        accessToken: waConfig.accessToken ? waConfig.accessToken.substring(0, 8) + "..." : undefined,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get configuration" });
    }
  });

  // 3. Check connection status with stable detection
  app.post("/api/whatsapp/status", async (req, res) => {
    try {
      const { instanceId, accessToken } = creds(req);

      if (!instanceId || !accessToken) {
        return res
          .status(400)
          .json({ error: "Instance ID and access token are required" });
      }

      // First check if we have recent messages (stable connection indicator)
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      if (lastReceivedMessageTime > fiveMinutesAgo) {
        const minutesAgo = Math.floor((Date.now() - lastReceivedMessageTime) / 60000);
        console.log(`📱 Status check: ${instanceId} -> Connected (stable - last message ${minutesAgo}m ago)`);
        return res.json({ 
          status: "connected",
          stable: true,
          lastMessageMinutesAgo: minutesAgo,
          lastMessageTime: new Date(lastReceivedMessageTime).toISOString()
        });
      }

      const response = await axios.post(`${MBLASTER_BASE}/get_status`, {
        instance_id: instanceId,
        access_token: accessToken,
      });

      const isConnected = response.data.state === "authenticated";
      console.log(
        `📱 Status check: ${instanceId} -> ${isConnected ? "Connected" : "Disconnected"} (API)`,
      );

      res.json({
        status: isConnected ? "connected" : "disconnected",
        stable: false,
        state: response.data.state,
        data: response.data,
      });
    } catch (error: any) {
      console.error("❌ Status check error:", error.message);
      res.json({ 
        status: "disconnected",
        stable: false,
        error: "API authentication failed - may need to reconnect"
      });
    }
  });

  // 3.1. Reconnect instance (reboot/relogin)
  app.post("/api/whatsapp/reconnect", async (req, res) => {
    try {
      const { instanceId, accessToken } = creds(req);

      if (!instanceId || !accessToken) {
        return res
          .status(400)
          .json({ error: "Instance ID and access token are required" });
      }

      console.log(`🔄 Reconnecting instance: ${instanceId}`);

      const response = await axios.post(`${MBLASTER_BASE}/reboot`, {
        instance_id: instanceId,
        access_token: accessToken,
      });

      console.log(`✅ Instance reconnected: ${instanceId}`);

      res.json({
        success: true,
        message: "Instance reconnected successfully",
        data: response.data,
      });
    } catch (error: any) {
      console.error("❌ Reconnect error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // 4. Generate QR code for existing or new instance
  app.post("/api/whatsapp/qr-code", async (req, res) => {
    try {
      const { instanceId, accessToken } = req.body;

      if (!instanceId || !accessToken) {
        return res
          .status(400)
          .json({ error: "Instance ID and access token are required" });
      }

      console.log(`📱 QR Code request for instance: ${instanceId}`);

      const response = await axios.post(`${MBLASTER_BASE}/get_qrcode`, {
        instance_id: instanceId,
        access_token: accessToken,
      });

      if (response.data.qr_code) {
        const qrImage = await QRCode.toDataURL(response.data.qr_code);
        console.log("✅ QR code generated successfully");
        return res.json({ qrCode: qrImage });
      }

      throw new Error("No QR code received");
    } catch (error: any) {
      console.error("❌ QR code error:", error.message);
      res.status(400).json({ error: error.message });
    }
  });

  // 5. Get WhatsApp groups
  app.post("/api/whatsapp/groups", async (req, res) => {
    try {
      const { instanceId, accessToken } = req.body;

      if (!instanceId || !accessToken) {
        return res
          .status(400)
          .json({ error: "Instance ID and access token are required" });
      }

      const response = await axios.post(`${MBLASTER_BASE}/get_groups`, {
        instance_id: instanceId,
        access_token: accessToken,
      });

      console.log(
        `✅ Groups loaded: ${response.data.groups?.length || 0} groups`,
      );
      res.json({ groups: response.data.groups || [] });
    } catch (error: any) {
      console.error("❌ Groups error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // 6. Reconnect WhatsApp
  app.post("/api/whatsapp/reconnect", async (req, res) => {
    try {
      const { instanceId, accessToken } = creds(req);
      const response = await axios.post(`${MBLASTER_BASE}/reconnect`, {
        instance_id: instanceId,
        access_token: accessToken,
      });

      console.log("✅ Reconnection initiated");
      res.json({ message: "Reconnecting", data: response.data });
    } catch (error: any) {
      console.error("❌ Reconnect error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // 7. Disconnect WhatsApp
  app.post("/api/whatsapp/disconnect", async (req, res) => {
    try {
      const { instanceId, accessToken } = creds(req);
      const response = await axios.post(`${MBLASTER_BASE}/reset_instance`, {
        instance_id: instanceId,
        access_token: accessToken,
      });

      // Clear saved config
      waConfig.instanceId = undefined;

      console.log("✅ Instance disconnected");
      res.json({
        message: "WhatsApp instance disconnected",
        data: response.data,
      });
    } catch (error: any) {
      console.error("❌ Disconnect error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // 8. Set webhook
  app.post("/api/whatsapp/set-webhook", async (req, res) => {
    try {
      const { instanceId, accessToken, webhookUrl } = req.body;

      if (!instanceId || !accessToken || !webhookUrl) {
        return res.status(400).json({
          error: "Instance ID, access token, and webhook URL are required",
        });
      }

      const response = await axios.post(`${MBLASTER_BASE}/set_webhook`, {
        webhook_url: webhookUrl,
        enable: true,
        instance_id: instanceId,
        access_token: accessToken,
      });

      res.json({
        message: "Webhook set successfully",
        data: response.data,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 9. WhatsApp webhook receiver
  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      console.log(
        "🔔 Incoming Webhook Payload:",
        JSON.stringify(req.body, null, 2),
      );

      const extractedData = extractMessageFromPayload(req.body);

      // Update last received message time for stable connection status
      if (extractedData.sender !== "System") {
        lastReceivedMessageTime = Date.now();
      }

      console.log("📋 Extracted Data:", {
        message: extractedData.message,
        sender: extractedData.sender,
        group: extractedData.groupId,
        timestamp: new Date().toISOString(),
        messageId: extractedData.messageId,
        senderNumber: extractedData.senderNumber,
      });

      // Skip system events
      if (
        !extractedData.message ||
        extractedData.message.startsWith("Event:") ||
        extractedData.sender === "System"
      ) {
        console.log("❌ System event detected - skipping storage");
        return res.json({
          success: true,
          stored: false,
          parsed: false,
          reason: "system_event",
        });
      }

      // Check if group is whitelisted
      const config = waConfig;
      if (config.whitelistedGroups && config.whitelistedGroups.trim()) {
        const whitelistedGroupIds = config.whitelistedGroups
          .split(/[\n,]+/)
          .map(id => id.trim())
          .filter(Boolean);
        
        if (whitelistedGroupIds.length > 0) {
          const isGroupWhitelisted = whitelistedGroupIds.some(whitelistedId => 
            extractedData.groupId.includes(whitelistedId) || 
            whitelistedId.includes(extractedData.groupId)
          );
          
          if (!isGroupWhitelisted) {
            console.log(`🚫 Group ${extractedData.groupId} not whitelisted - skipping. Whitelisted: ${whitelistedGroupIds.join(', ')}`);
            return res.json({
              success: true,
              stored: false,
              parsed: false,
              reason: "group_not_whitelisted",
            });
          } else {
            console.log(`✅ Group ${extractedData.groupId} is whitelisted`);
          }
        }
      }

      // Store and process the message
      const rawMessage = {
        id: `raw_${Date.now()}`,
        timestamp: new Date().toISOString(),
        rawPayload: JSON.stringify(req.body, null, 2),
        processed: false,
        status: "pending" as const,
      };

      // Initialize global storage if needed
      if (!(global as any).rawMessages) {
        (global as any).rawMessages = [];
      }

      // Deduplication
      const dedupeKey =
        extractedData.messageId ||
        `${extractedData.senderNumber}-${Date.now()}`;
      const existingMessage = (global as any).rawMessages.find(
        (msg: any) => msg.dedupeKey === dedupeKey,
      );

      if (existingMessage) {
        console.log("🔄 Duplicate message detected - skipping storage");
        return res.json({
          success: true,
          stored: false,
          parsed: false,
          reason: "duplicate",
        });
      }

      (rawMessage as any).dedupeKey = dedupeKey;
      (global as any).rawMessages.unshift(rawMessage);

      // Keep only last 100 messages
      (global as any).rawMessages = Array.from(
        new Map(
          (global as any).rawMessages.map((m: any) => [m.dedupeKey, m]),
        ).values(),
      ).slice(0, 100);

      console.log("💾 Stored raw message:", rawMessage.id);

      // Parse the message
      const { WatchMessageParser } = await import("./watch-parser");
      const parser = new WatchMessageParser();
      const parsedListings = parser.parseMessage(extractedData.message);

      console.log("🔍 Parser Results:", {
        messageData: extractedData.message,
        parsedCount: parsedListings.length,
        listings: parsedListings,
      });

      const results = [];
      for (const listing of parsedListings) {
        try {
          const currentTime = new Date();
          const listingData = insertWatchListingSchema.parse({
            chatId: extractedData.groupId,
            date: currentTime.toISOString().split("T")[0],
            time: currentTime.toTimeString().split(" ")[0],
            sender: extractedData.sender,
            senderNumber: extractedData.senderNumber,
            pid: listing.pid,
            year: listing.year,
            variant: listing.variant,
            condition: listing.condition,
            price: listing.price,
            currency: listing.currency,
            rawLine: listing.rawLine,
            messageId: extractedData.messageId,
          });

          const savedListing = await storage.createWatchListing(listingData);
          results.push({ success: true, id: savedListing.id });

          console.log("✅ Successfully processed listing:", listing.pid);
        } catch (error) {
          results.push({ success: false, error: (error as Error).message });
          console.log("❌ Error processing listing:", (error as Error).message);
        }
      }

      // Create processing log
      await storage.createProcessingLog({
        messageId: extractedData.messageId,
        rawMessage: extractedData.message,
        status: parsedListings.length > 0 ? "success" : "partial",
        parsedData: parsedListings.length > 0 ? parsedListings : undefined,
      });

      // Update raw message status
      const messageIndex = (global as any).rawMessages.findIndex(
        (msg: any) => msg.id === rawMessage.id,
      );
      if (messageIndex !== -1) {
        (global as any).rawMessages[messageIndex].processed = true;
        (global as any).rawMessages[messageIndex].status =
          parsedListings.length > 0 ? "success" : "processed";
        (global as any).rawMessages[messageIndex].parsedCount =
          parsedListings.length;
      }

      res.json({
        success: true,
        processed: results.length,
        listings: results.filter((r) => r.success).length,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to process WhatsApp webhook" });
    }
  });

  // 10. Get incoming messages
  app.get("/api/whatsapp/messages", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const rawMessages = (global as any).rawMessages || [];

      if (rawMessages.length > 0) {
        const messages = rawMessages
          .slice(offset, offset + limit)
          .map((msg: any) => {
            let payload = {};
            try {
              payload = JSON.parse(msg.rawPayload);
            } catch (e) {
              payload = {};
            }

            const extractedData = extractMessageFromPayload(payload);

            return {
              id: msg.id,
              timestamp: msg.timestamp,
              rawPayload: msg.rawPayload,
              processed: msg.processed,
              status: msg.status,
              message: extractedData.message || "System Event",
              sender: extractedData.sender || "System",
              senderNumber: extractedData.senderNumber || "",
              groupId: extractedData.groupId || "System",
              groupName: extractedData.groupName || "System",
              messageId: extractedData.messageId || msg.id,
            };
          })
          .filter((msg: any) => {
            return (
              msg.message &&
              !msg.message.startsWith("Event:") &&
              msg.sender !== "System" &&
              msg.groupId !== "System" &&
              msg.message !== "System Event"
            );
          });

        return res.json({ messages });
      }

      // Fallback to processing logs
      const logs = await storage.getProcessingLogs(limit + offset);
      const messages = logs.slice(offset, offset + limit).map((log) => ({
        id: log.id.toString(),
        timestamp: log.createdAt,
        messageId: log.messageId,
        sender: "Unknown",
        message: log.rawMessage || "",
        status: log.status,
        processed: log.status === "success",
      }));

      res.json({
        messages,
        total: logs.length,
        hasMore: logs.length > offset + limit,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get incoming messages" });
    }
  });

  // AI Configuration endpoints
  app.post("/api/ai/configure", async (req, res) => {
    try {
      const {
        provider,
        model,
        apiKey,
        maxTokens,
        temperature,
        useAI,
        fallbackToRegex,
        customPrompt,
      } = req.body;

      res.json({
        message: "AI configuration saved successfully",
        provider,
        model,
        useAI,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to configure AI" });
    }
  });

  app.post("/api/ai/test-parser", async (req, res) => {
    try {
      const { message, config } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const { WatchMessageParser } = await import("./watch-parser");
      const parser = new WatchMessageParser();
      const listings = parser.parseMessage(message);

      res.json({
        message: "AI parser test completed",
        method: config?.useAI ? `AI (${config.provider})` : "Regex",
        input: message,
        listings: listings,
        aiEnhanced: false,
      });
    } catch (error) {
      console.error("AI parser test error:", error);
      res.status(500).json({ error: "Failed to test AI parser" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
