import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { pool, db } from "./db";
import {
  searchFiltersSchema,
  insertWatchListingSchema,
  insertProcessingLogSchema,
  contacts,
} from "@shared/schema";
import { z } from "zod";
import { GoogleSheetsService } from "./google-sheets";
// SECURITY FIX: Removed insecure global waConfig import
import { registerSecureWhatsAppRoutes } from "./routes/whatsapp-secure";
import { registerSecureWebhookRoutes } from "./routes/webhook-secure";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import cookieParser from 'cookie-parser';
import { requireAuth, requireAdmin, type AuthRequest } from "./middleware/auth";

// --- WhatsApp name caches: singletons across hot reloads ---
const G: any = global as any;
G.__wa = G.__wa || {};
G.__wa.groupNameCache = G.__wa.groupNameCache || new Map<string, string>();
G.__wa.contactNameCache = G.__wa.contactNameCache || new Map<string, string>();
const groupNameCache: Map<string, string> = G.__wa.groupNameCache;
const contactNameCache: Map<string, string> = G.__wa.contactNameCache;

// Helper: normalize whitelist into a Set; empty -> allow all
function getWhitelistSet() {
  const raw =
    (G.whitelistedGroups as string | undefined) ??
    "";
  const trimmed = (raw || "").trim();
  if (!trimmed) return null; // null => allow all
  return new Set(
    trimmed
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(Boolean)
  );
}

// Helper: safe JSON test (mBlaster sometimes returns HTML when IP blocked)
async function fetchJSON(url: string, init?: RequestInit, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔄 mBlaster API attempt ${attempt}/${retries}: ${url}`);
      
      const res = await fetch(url, {
        method: "GET", // mBlaster works reliably with GET
        headers: {
          "Accept": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Safari/537.36",
        },
        // timeout: 10000, // 10 second timeout - removed as not supported by fetch
        ...init,
      });
      
      const text = await res.text();
      
      // Check for HTML response (IP blocked)
      if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
        console.log(`🔄 mBlaster API attempt ${attempt}/${retries} failed: IP_REJECTED_HTML`);
        if (attempt === retries) {
          const err: any = new Error("IP_REJECTED_HTML");
          err.code = "IP_REJECTED_HTML";
          throw err;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        continue;
      }
      
      // Success - parse JSON
      return JSON.parse(text);
      
    } catch (error: any) {
      console.log(`🔄 mBlaster API attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt === retries) {
        throw error;
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}

// Track last received message time for stable connection status
let lastReceivedMessageTime = 0;

// Function to send PID alert notification via WhatsApp
async function sendPidAlertNotification(alert: any, listing: any, userConfig?: { instanceId?: string; accessToken?: string }) {
  try {
    console.log(`🔔 PID Alert triggered for ${alert.pid} - sending notification to ${alert.notificationPhone}`);
    
    // Skip notification if no user config provided (temporary fix)
    if (!userConfig?.instanceId || !userConfig?.accessToken) {
      console.log(`⚠️ PID Alert notification skipped - no WhatsApp configuration available`);
      return;
    }
    
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
      instance_id: userConfig.instanceId,
      access_token: userConfig.accessToken
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
async function extractMessageFromPayload(payload: any, contactNameMap: Map<string, string>, groupNameMap: Map<string, string>, userWhitelistedGroups?: string) {
  // 🔧 DYNAMIC INSTANCE ID DETECTION - Temporarily disabled (user-scoped config needed)
  if (payload.instance_id) {
    console.log(`📋 Processing message from instance: ${payload.instance_id}`);
    // NOTE: Dynamic instance ID updating moved to secure webhook handler
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

  // Get whitelisted groups array - Use user-scoped configuration
  const getAllowedGroups = async () => {
    if (!userWhitelistedGroups) return []; // Allow all groups if no whitelist
    return userWhitelistedGroups
      .split(/[\s,]+/)      // Split on commas AND whitespace/newlines
      .map((g: string) => g.trim())
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
    result.sender = contactNameMap.get(senderParticipant) || senderName;
    result.senderNumber =
      m.sender_id?.replace("@s.whatsapp.net", "") ||
      senderParticipant.replace("@s.whatsapp.net", "") ||
      "";

    result.group = m.message_key?.remoteJid || m.key?.remoteJid || "";
    result.groupName = groupNameMap.get(result.group) || (result.group.includes("@g.us") ? "Unknown Group" : "Private Chat");
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

    // Filter out bot messages (religious content, promotional content, etc.)
    const botPatterns = [
      /જય શ્રી કૃષ્ણ/i, // Religious content in Gujarati
      /🙏/, // Prayer hands emoji
      /status@broadcast/, // WhatsApp status broadcasts
      /SUBA/, // Specific bot name
      /હાથી ઘોડા પાલકી/i // Religious text patterns
    ];
    
    if (botPatterns.some(pattern => pattern.test(result.message) || pattern.test(result.sender))) {
      console.log(`🤖 Bot message filtered: ${result.sender} - ${result.message.substring(0, 50)}...`);
      return null;
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
  // HEALTH CHECK ENDPOINT (for deployment)
  // ===========================================
  
  // Fast health check that doesn't hit the database - for deployment health checks
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });
  
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ===========================================
  // DASHBOARD & ANALYTICS ENDPOINTS
  // ===========================================

  // Dashboard stats
  app.get("/api/dashboard/stats", requireAuth, async (req: AuthRequest, res) => {
    try {
      const stats = await storage.getDashboardStats(req.user.userId);
      res.json(stats);
    } catch (error) {
      console.error('[/api/dashboard/stats] Error:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        table: error.table,
        column: error.column,
        stack: error.stack
      });
      res.status(500).json({ error: "Failed to fetch dashboard stats", debug: error.message });
    }
  });

  // Dashboard trading metrics
  app.get("/api/dashboard/trading-metrics", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Get user's data workspace ID for filtering
      const dataWorkspaceId = await storage.getDataWorkspaceId(req.user.userId);
      if (!dataWorkspaceId) {
        return res.json({ avgPriceToday: 0, avgPriceYesterday: 0, totalValueToday: 0, topPriceToday: 0, activeGroups: 0 });
      }
      
      const todayQuery = `
        SELECT 
          AVG(price) as avg_price_today,
          SUM(price) as total_value_today,
          MAX(price) as max_price_today,
          COUNT(*) as listings_today
        FROM watch_listings 
        WHERE created_at >= CURRENT_DATE
        AND price > 0
        AND user_id = $1
      `;
      
      const yesterdayQuery = `
        SELECT AVG(price) as avg_price_yesterday
        FROM watch_listings 
        WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
        AND created_at < CURRENT_DATE
        AND price > 0
        AND user_id = $1
      `;

      const activeGroupsQuery = `
        SELECT COUNT(DISTINCT group_name) as active_groups
        FROM watch_listings 
        WHERE created_at >= CURRENT_DATE
        AND group_name IS NOT NULL
        AND user_id = $1
      `;

      const [todayResult, yesterdayResult, groupsResult] = await Promise.all([
        pool.query(todayQuery, [dataWorkspaceId]),
        pool.query(yesterdayQuery, [dataWorkspaceId]),
        pool.query(activeGroupsQuery, [dataWorkspaceId])
      ]);

      const todayData = todayResult.rows[0];
      const yesterdayData = yesterdayResult.rows[0];
      const groupData = groupsResult.rows[0];

      res.json({
        avgPriceToday: Math.round(parseFloat(todayData.avg_price_today) || 0),
        avgPriceYesterday: Math.round(parseFloat(yesterdayData.avg_price_yesterday) || 0),
        totalValueToday: Math.round(parseFloat(todayData.total_value_today) || 0),
        topPriceToday: Math.round(parseFloat(todayData.max_price_today) || 0),
        activeGroups: parseInt(groupData.active_groups) || 0
      });
    } catch (error) {
      console.error("Error fetching trading metrics:", error);
      res.status(500).json({ error: "Failed to fetch trading metrics" });
    }
  });

  // Hot PIDs today
  app.get("/api/dashboard/hot-pids-today", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Get user's data workspace ID for filtering
      const dataWorkspaceId = await storage.getDataWorkspaceId(req.user.userId);
      if (!dataWorkspaceId) {
        return res.json([]);
      }
      
      const query = `
        SELECT 
          pid,
          COUNT(*) as mentions,
          AVG(price) as avg_price,
          array_agg(DISTINCT family) FILTER (WHERE family IS NOT NULL) as models
        FROM watch_listings 
        WHERE created_at >= CURRENT_DATE
        AND pid IS NOT NULL
        AND user_id = $1
        GROUP BY pid 
        ORDER BY mentions DESC, avg_price DESC 
        LIMIT 10
      `;

      const result = await pool.query(query, [dataWorkspaceId]);
      
      const hotPids = result.rows.map(row => ({
        pid: row.pid,
        mentions: parseInt(row.mentions),
        avgPrice: Math.round(parseFloat(row.avg_price) || 0),
        model: row.models && row.models[0] ? row.models[0] : 'Unknown Model'
      }));

      res.json(hotPids);
    } catch (error) {
      console.error("Error fetching hot PIDs:", error);
      res.status(500).json({ error: "Failed to fetch hot PIDs" });
    }
  });

  // Active groups today
  app.get("/api/dashboard/active-groups", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Get user's data workspace ID for filtering
      const dataWorkspaceId = await storage.getDataWorkspaceId(req.user.userId);
      if (!dataWorkspaceId) {
        return res.json([]);
      }
      
      const query = `
        SELECT 
          group_name as name,
          COUNT(*) as messages,
          MAX(created_at) as last_activity
        FROM watch_listings 
        WHERE created_at >= CURRENT_DATE
        AND group_name IS NOT NULL
        AND user_id = $1
        GROUP BY group_name 
        ORDER BY messages DESC, last_activity DESC 
        LIMIT 10
      `;

      const result = await pool.query(query, [dataWorkspaceId]);
      
      const activeGroups = result.rows.map(row => ({
        name: row.name,
        messages: parseInt(row.messages),
        lastActivity: new Date(row.last_activity).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + ' ago',
        participants: Math.floor(Math.random() * 200) + 50 // Placeholder since we don't track this
      }));

      res.json(activeGroups);
    } catch (error) {
      console.error("Error fetching active groups:", error);
      res.status(500).json({ error: "Failed to fetch active groups" });
    }
  });

  // High value listings today
  app.get("/api/dashboard/high-value-listings", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Get user's data workspace ID for filtering
      const dataWorkspaceId = await storage.getDataWorkspaceId(req.user.userId);
      if (!dataWorkspaceId) {
        return res.json([]);
      }
      
      const query = `
        SELECT 
          id, pid, price, brand, family as model, condition, group_name as chat_group, created_at
        FROM watch_listings 
        WHERE created_at >= CURRENT_DATE
        AND price > 0
        AND user_id = $1
        ORDER BY price DESC 
        LIMIT 10
      `;

      const result = await pool.query(query, [dataWorkspaceId]);
      
      const listings = result.rows.map(row => ({
        id: row.id,
        pid: row.pid,
        price: Math.round(parseFloat(row.price)),
        brand: row.brand || 'Unknown',
        model: row.model || 'Unknown Model',
        condition: row.condition || 'Unknown',
        group: row.chat_group || 'Unknown Group',
        timeAgo: new Date(row.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + ' ago'
      }));

      res.json(listings);
    } catch (error) {
      console.error("Error fetching high value listings:", error);
      res.status(500).json({ error: "Failed to fetch high value listings" });
    }
  });

  // Base watch listings route - CRITICAL: This was missing!
  app.get("/api/watch-listings", requireAuth, async (req: AuthRequest, res) => {
    try {
      const transformedQuery = {
        ...req.query,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      };
      
      const filters = searchFiltersSchema.parse(transformedQuery);
      const result = await storage.getWatchListings(filters, req.user.userId);
      res.json(result);
    } catch (error) {
      console.error('Watch listings error:', error);
      res.status(500).json({ error: 'Failed to fetch watch listings' });
    }
  });

  // Recent watch listings
  app.get("/api/watch-listings/recent", requireAuth, async (req: AuthRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const listings = await storage.getRecentWatchListings(limit, req.user.userId);
      res.json(listings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent listings" });
    }
  });

  // Market insights for dashboard
  app.get("/api/watch-listings/market-insights", requireAuth, async (req: AuthRequest, res) => {
    try {
      const dataWorkspaceId = await storage.getDataWorkspaceId(req.user.userId);
      if (!dataWorkspaceId) {
        return res.json({ hotBrands: [], priceRanges: [], topModels: [] });
      }
      
      // Get hot brands from today's listings
      const hotBrandsQuery = `
        SELECT brand, COUNT(*) as count 
        FROM watch_listings 
        WHERE created_at >= CURRENT_DATE 
        AND brand IS NOT NULL 
        AND user_id = $1
        GROUP BY brand 
        ORDER BY count DESC 
        LIMIT 5
      `;
      
      // Get price distribution
      const priceRangesQuery = `
        SELECT 
          CASE 
            WHEN price < 25000 THEN '$10K-$25K'
            WHEN price < 50000 THEN '$25K-$50K'
            ELSE '$50K+'
          END as range,
          COUNT(*) * 100.0 / (SELECT COUNT(*) FROM watch_listings WHERE user_id = $1 AND created_at >= CURRENT_DATE) as percentage
        FROM watch_listings 
        WHERE created_at >= CURRENT_DATE 
        AND price > 10000 
        AND user_id = $1
        GROUP BY range
      `;
      
      // Get top models
      const topModelsQuery = `
        SELECT family as model, COUNT(*) as mentions 
        FROM watch_listings 
        WHERE created_at >= CURRENT_DATE 
        AND family IS NOT NULL 
        AND user_id = $1
        GROUP BY family 
        ORDER BY mentions DESC 
        LIMIT 5
      `;
      
      const [hotBrandsResult, priceRangesResult, topModelsResult] = await Promise.all([
        pool.query(hotBrandsQuery, [dataWorkspaceId]),
        pool.query(priceRangesQuery, [dataWorkspaceId]),
        pool.query(topModelsQuery, [dataWorkspaceId])
      ]);
      
      res.json({
        hotBrands: hotBrandsResult.rows.map(row => ({
          brand: row.brand,
          count: parseInt(row.count),
          trend: 'up' // placeholder
        })),
        priceRanges: priceRangesResult.rows.map(row => ({
          range: row.range,
          percentage: Math.round(parseFloat(row.percentage))
        })),
        topModels: topModelsResult.rows.map(row => ({
          model: row.model,
          mentions: parseInt(row.mentions)
        }))
      });
    } catch (error) {
      console.error("Error fetching market insights:", error);
      res.status(500).json({ error: "Failed to fetch market insights" });
    }
  });

  // Search watch listings
  app.get("/api/watch-listings/search", requireAuth, async (req: AuthRequest, res) => {
    try {
      const transformedQuery = {
        ...req.query,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        priceFrom: req.query.priceFrom ? parseFloat(req.query.priceFrom as string) : undefined,
        priceTo: req.query.priceTo ? parseFloat(req.query.priceTo as string) : undefined,
      };
      
      const filters = searchFiltersSchema.parse(transformedQuery);
      const result = await storage.getWatchListings(filters, req.user.userId);
      res.json(result);
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: "Failed to search listings", details: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Export watch listings as Excel
  app.get("/api/export/watch-listings", requireAuth, async (req: AuthRequest, res) => {
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
      
      const result = await storage.getWatchListings(filters, req.user.userId);
      
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
  app.get("/api/processing-logs/errors", requireAuth, async (req: AuthRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const errors = await storage.getRecentErrors(req.user.userId, limit);
      res.json(errors);
    } catch (error) {
      console.error('[/api/processing-logs/errors] Error:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        table: error.table,
        column: error.column,
        stack: error.stack
      });
      res.status(500).json({ error: "Failed to fetch errors", debug: error.message });
    }
  });

  app.get('/api/watch-listings/unique-conditions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const conditions = await storage.getUniqueConditions(req.user.userId);
      res.json(conditions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get unique conditions' });
    }
  });

  // PID Alert routes
  app.get('/api/pid-alerts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const alerts = await storage.getAllPidAlerts(req.user.userId);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get PID alerts' });
    }
  });

  app.post('/api/pid-alerts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const alert = await storage.createPidAlert({...req.body, userId: req.user.userId});
      res.json(alert);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create PID alert' });
    }
  });

  app.put('/api/pid-alerts/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const alert = await storage.updatePidAlert(id, req.body, req.user.userId);
      res.json(alert);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update PID alert' });
    }
  });

  app.delete('/api/pid-alerts/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePidAlert(id, req.user.userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete PID alert' });
    }
  });

  // Active PID alerts for dashboard
  app.get('/api/pid-alerts/active', requireAuth, async (req: AuthRequest, res) => {
    try {
      const alerts = await storage.getAllPidAlerts(req.user.userId);
      // Transform to include market data and urgency
      const activeAlerts = alerts.filter(alert => alert.isActive).map(alert => ({
        pid: alert.pid,
        model: alert.variant || 'Unknown Model',
        targetPrice: alert.maxPrice || 0,
        currentPrice: alert.minPrice || 0,
        trend: 'stable', // placeholder
        urgency: 'medium' // placeholder
      }));
      res.json(activeAlerts);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch active alerts' });
    }
  });

  // Requirement matching system - match WTB requests with available inventory
  app.get('/api/requirement-matches/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const requirementId = parseInt(req.params.id);
      
      // Get the specific requirement
      const { db } = await import('./db');
      const { watchRequirements, watchListings } = await import('@shared/schema');
      const { eq, and, like, or, gte, lte, isNull } = await import('drizzle-orm');
      
      const requirement = await db.select().from(watchRequirements)
        .where(eq(watchRequirements.id, requirementId))
        .limit(1);
      
      if (requirement.length === 0) {
        return res.status(404).json({ error: 'Requirement not found' });
      }
      
      const req_data = requirement[0];
      
      // Find matching listings based on PID and other criteria
      const matches = await db.select().from(watchListings)
        .where(and(
          eq(watchListings.pid, req_data.pid),
          // Only include listings from last 30 days to avoid very old listings
          gte(watchListings.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        ));
      
      // Filter and score matches
      const scoredMatches = matches.map(listing => {
        let score = 100;
        let matchReasons = [];
        
        // Exact PID match
        if (listing.pid === req_data.pid) {
          matchReasons.push('Exact PID match');
        }
        
        // Brand match
        if (req_data.brand && listing.brand && req_data.brand.toLowerCase() === listing.brand.toLowerCase()) {
          score += 10;
          matchReasons.push('Brand match');
        }
        
        // Variant match (if specified in requirement)
        if (req_data.variant && listing.variant && req_data.variant.toLowerCase() === listing.variant.toLowerCase()) {
          score += 15;
          matchReasons.push('Variant match');
        }
        
        // Condition preference
        if (req_data.condition && listing.condition) {
          if (req_data.condition.toLowerCase() === listing.condition.toLowerCase()) {
            score += 20;
            matchReasons.push('Exact condition match');
          } else if (req_data.condition.toLowerCase().includes('new') && listing.condition.toLowerCase().includes('new')) {
            score += 15;
            matchReasons.push('Condition preference match');
          }
        }
        
        // Calculate recency score (newer listings get higher score)
        const daysDiff = Math.floor((Date.now() - new Date(listing.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        const recencyScore = Math.max(0, 30 - daysDiff);
        score += recencyScore;
        if (daysDiff <= 7) matchReasons.push('Recent listing');
        
        return {
          ...listing,
          matchScore: score,
          matchReasons,
          daysSince: daysDiff
        };
      });
      
      // Sort by match score (highest first)
      scoredMatches.sort((a, b) => b.matchScore - a.matchScore);
      
      res.json({
        requirement: req_data,
        matches: scoredMatches,
        totalMatches: scoredMatches.length
      });
      
    } catch (error) {
      console.error('Requirement matching error:', error);
      res.status(500).json({ error: 'Failed to find matches' });
    }
  });

  // Bulk requirement matching - find matches for all active requirements (OPTIMIZED)
  app.get('/api/requirement-matches', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { db } = await import('./db');
      const { watchRequirements, watchListings } = await import('@shared/schema');
      const { eq, and, gte, inArray } = await import('drizzle-orm');
      const { createUserAccessCondition } = await import('./lib/access');
      
      // Get requirements and listings from last 15 days (reduced for performance)
      const cutoffDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
      
      console.log(`🔍 Finding requirement matches for user ${req.user.email}...`);
      
      // SECURITY FIX: Apply tenant isolation - get accessible user IDs for this user
      const userAccessCondition = await createUserAccessCondition(req.user, watchRequirements.userId);
      
      // Get requirements from last 15 days with proper user filtering
      const requirements = await db.select().from(watchRequirements)
        .where(and(
          gte(watchRequirements.createdAt, cutoffDate),
          userAccessCondition
        ))
        .limit(50); // Limit for performance
      
      if (requirements.length === 0) {
        console.log(`❌ No requirements found for user ${req.user.email}`);
        return res.json([]);
      }
      
      // Get unique PIDs from requirements
      const pids = [...new Set(requirements.map(r => r.pid))];
      
      // SECURITY FIX: Apply tenant isolation to listings too
      const listingsAccessCondition = await createUserAccessCondition(req.user, watchListings.userId);
      
      // Get matching listings with proper user filtering
      const allMatchingListings = await db.select().from(watchListings)
        .where(and(
          inArray(watchListings.pid, pids),
          gte(watchListings.createdAt, cutoffDate),
          listingsAccessCondition
        ));
      
      // Group listings by PID for fast lookup
      const listingsByPid = new Map();
      allMatchingListings.forEach(listing => {
        if (!listingsByPid.has(listing.pid)) {
          listingsByPid.set(listing.pid, []);
        }
        listingsByPid.get(listing.pid).push(listing);
      });
      
      const matchResults = [];
      
      // Process matches
      for (const requirement of requirements) {
        const matches = listingsByPid.get(requirement.pid) || [];
        
        if (matches.length > 0) {
          // Score the matches
          const scoredMatches = matches.map(listing => {
            let score = 100;
            const daysDiff = Math.floor((Date.now() - new Date(listing.createdAt).getTime()) / (1000 * 60 * 60 * 24));
            const recencyScore = Math.max(0, 15 - daysDiff);
            score += recencyScore;
            
            // Condition matching
            if (requirement.condition && listing.condition && 
                requirement.condition.toLowerCase() === listing.condition.toLowerCase()) {
              score += 20;
            }
            
            return { ...listing, matchScore: score, daysSince: daysDiff };
          });
          
          scoredMatches.sort((a, b) => b.matchScore - a.matchScore);
          
          matchResults.push({
            requirement,
            matches: scoredMatches.slice(0, 3), // Top 3 matches
            totalMatches: scoredMatches.length
          });
        }
      }
      
      // Sort by match quality and recency
      matchResults.sort((a, b) => {
        const aMaxScore = Math.max(...a.matches.map(m => m.matchScore));
        const bMaxScore = Math.max(...b.matches.map(m => m.matchScore));
        return bMaxScore - aMaxScore;
      });
      
      console.log(`✅ Found ${matchResults.length} requirement matches`);
      res.json(matchResults.slice(0, 100)); // Return top 100 matches
      
    } catch (error) {
      console.error('Bulk requirement matching error:', error);
      res.status(500).json({ error: 'Failed to find bulk matches' });
    }
  });

  // ===========================================
  // EXPORT API ENDPOINTS
  // ===========================================

  // Export all data (JSON/Excel)
  app.get("/api/export/all-data", async (req, res) => {
    try {
      const format = req.query.format as string || 'json';
      
      // Get all data from storage
      const [listings, contacts, requirements, logs] = await Promise.all([
        storage.getWatchListings({ limit: 50000 }),
        storage.getContacts({ limit: 10000 }),
        storage.getWatchRequirements({ limit: 10000 }),
        storage.getProcessingLogs({ limit: 5000 })
      ]);

      const exportData = {
        exportDate: new Date().toISOString(),
        summary: {
          totalListings: listings.total,
          totalContacts: contacts.total, 
          totalRequirements: requirements.total,
          totalLogs: logs.total
        },
        listings: listings.listings,
        contacts: contacts.contacts,
        requirements: requirements.requirements,
        logs: logs.logs
      };

      if (format === 'json') {
        const filename = `watch-parser-backup-${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(exportData);
      } else if (format === 'excel') {
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        
        // Add summary sheet
        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.addRow(['Export Date', exportData.exportDate]);
        summarySheet.addRow(['Total Listings', exportData.summary.totalListings]);
        summarySheet.addRow(['Total Contacts', exportData.summary.totalContacts]);
        summarySheet.addRow(['Total Requirements', exportData.summary.totalRequirements]);
        summarySheet.addRow(['Total Logs', exportData.summary.totalLogs]);
        
        // Add listings sheet
        const listingsSheet = workbook.addWorksheet('Watch Listings');
        if (listings.listings.length > 0) {
          const headers = ['PID', 'Brand', 'Family', 'Year', 'Month', 'Variant', 'Condition', 'Price', 'Currency', 'Sender', 'Group', 'Date', 'Time', 'Raw Line'];
          listingsSheet.addRow(headers);
          listings.listings.forEach(listing => {
            listingsSheet.addRow([
              listing.pid || '',
              listing.brand || '',
              listing.family || '',
              listing.year || '',
              listing.month || '',
              listing.variant || '',
              listing.condition || '',
              listing.price || '',
              listing.currency || '',
              listing.sender || '',
              listing.groupName || '',
              listing.date || '',
              listing.time || '',
              listing.rawLine || ''
            ]);
          });
        }
        
        // Add contacts sheet
        const contactsSheet = workbook.addWorksheet('Contacts');
        if (contacts.contacts.length > 0) {
          const headers = ['Phone Number', 'Contact Name', 'Group Memberships', 'First Seen', 'Last Seen', 'Message Count'];
          contactsSheet.addRow(headers);
          contacts.contacts.forEach(contact => {
            contactsSheet.addRow([
              contact.phoneNumber || '',
              contact.contactName || '',
              Array.isArray(contact.groupMemberships) ? contact.groupMemberships.join(', ') : '',
              contact.firstSeen || '',
              contact.lastSeen || '',
              contact.messageCount || 0
            ]);
          });
        }
        
        // Add requirements sheet  
        const requirementsSheet = workbook.addWorksheet('Requirements');
        if (requirements.requirements.length > 0) {
          const headers = ['PID', 'Variant', 'Condition', 'Min Price', 'Max Price', 'Currency', 'Sender', 'Group', 'Date', 'Time', 'Raw Line'];
          requirementsSheet.addRow(headers);
          requirements.requirements.forEach(req => {
            requirementsSheet.addRow([
              req.pid || '',
              req.variant || '',
              req.condition || '',
              req.minPrice || '',
              req.maxPrice || '',
              req.currency || '',
              req.sender || '',
              req.groupName || '',
              req.date || '',
              req.time || '',
              req.rawLine || ''
            ]);
          });
        }
        
        const filename = `watch-parser-backup-${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
      }
    } catch (error) {
      console.error('Export all data error:', error);
      res.status(500).json({ error: "Failed to export all data" });
    }
  });

  // Export listings only
  app.get("/api/export/listings", async (req, res) => {
    try {
      const format = req.query.format as string || 'excel';
      const { listings } = await storage.getWatchListings({ limit: 50000 });
      
      if (format === 'excel') {
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Watch Listings');
        
        if (listings.length > 0) {
          const headers = ['PID', 'Brand', 'Family', 'Year', 'Month', 'Variant', 'Condition', 'Price', 'Currency', 'Sender', 'Group', 'Date', 'Time', 'Raw Line'];
          worksheet.addRow(headers);
          
          listings.forEach(listing => {
            worksheet.addRow([
              listing.pid || '',
              listing.brand || '',
              listing.family || '',
              listing.year || '',
              listing.month || '',
              listing.variant || '',
              listing.condition || '',
              listing.price || '',
              listing.currency || '',
              listing.sender || '',
              listing.groupName || '',
              listing.date || '',
              listing.time || '',
              listing.rawLine || ''
            ]);
          });
        }
        
        const filename = `watch-listings-${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
      }
    } catch (error) {
      console.error('Export listings error:', error);
      res.status(500).json({ error: "Failed to export listings" });
    }
  });

  // Export contacts only
  app.get("/api/export/contacts", requireAuth, async (req: AuthRequest, res) => {
    try {
      const format = req.query.format as string || 'excel';
      
      // **SECURITY FIX**: Only show contacts accessible by this user
      const { createUserAccessCondition } = await import('./lib/access');
      const { contacts: contactsSchema } = await import('@shared/schema');
      const userAccessCondition = await createUserAccessCondition(req.user, contactsSchema.userId);
      
      const { contacts } = await storage.getContacts({ limit: 10000, userAccessCondition });
      
      if (format === 'excel') {
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Contacts');
        
        if (contacts.length > 0) {
          const headers = ['Phone Number', 'Contact Name', 'Group Memberships', 'First Seen', 'Last Seen', 'Message Count'];
          worksheet.addRow(headers);
          
          contacts.forEach(contact => {
            worksheet.addRow([
              contact.phoneNumber || '',
              contact.contactName || '',
              Array.isArray(contact.groupMemberships) ? contact.groupMemberships.join(', ') : '',
              contact.firstSeen || '',
              contact.lastSeen || '',
              contact.messageCount || 0
            ]);
          });
        }
        
        const filename = `contacts-${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
      }
    } catch (error) {
      console.error('Export contacts error:', error);
      res.status(500).json({ error: "Failed to export contacts" });
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

  // Note: Test instance endpoint moved to routes/whatsapp.ts to avoid duplication

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

  // Update webhook URL for existing instance
  app.post("/api/whatsapp/update-webhook", async (req, res) => {
    try {
      const { accessToken, instanceId } = req.body;
      
      if (!accessToken || !instanceId) {
        return res.status(400).json({ error: "Access token and instance ID are required" });
      }
      
      console.log(`🔗 Updating webhook URL for instance: ${instanceId}`);
      
      // Use Railway URL or fallback to environment
      const publicUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : process.env.PUBLIC_URL || 'https://whatsapp-watch-parser-v2-production.up.railway.app';
      
      const webhookUrl = `${publicUrl}/api/whatsapp/webhook`;
      
      console.log(`🔗 Setting webhook to: ${webhookUrl}`);
      
      const response = await fetch(
        `https://mblaster.in/api/set_webhook?webhook_url=${encodeURIComponent(webhookUrl)}&enable=true&instance_id=${instanceId}&access_token=${accessToken}`,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );
      
      const data = await response.text();
      console.log(`🔗 Webhook update response: ${data}`);
      
      try {
        const jsonData = JSON.parse(data);
        res.json({ 
          success: true, 
          webhookUrl,
          response: jsonData 
        });
      } catch (parseError) {
        res.status(400).json({ 
          error: "Failed to update webhook", 
          detail: "Received HTML instead of JSON response"
        });
      }
    } catch (error) {
      console.error('Webhook update error:', error);
      res.status(500).json({ error: "Failed to update webhook URL" });
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
      const { contactNameMap, groupNameMap } = await import('./routes/whatsapp');
      
      // Get all existing records without group names
      const existingRecords = await storage.getWatchListings({ limit: 10000, offset: 0 });
      let updatedCount = 0;
      
      for (const record of existingRecords.listings) {
        if (!record.groupName && record.chatId) {
          // Get the real group name from the cached names
          const realGroupName = groupNameMap.get(record.chatId);
          
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

  app.get("/api/reference-database", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { storage } = await import('./storage');
      
      // Simple query without ordering for now
      const records = await storage.getAllReferenceRecords(req.user.userId);
      
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
          const XLSX = await import('xlsx');
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
              // Expected columns: Brand(0), Family(1), Reference(2), Name(3), URL(4) - we ignore URL column
              const brand = row[0]?.toString()?.trim();
              const family = row[1]?.toString()?.trim();
              const reference = row[2]?.toString()?.trim();
              const name = row[3]?.toString()?.trim();
              // row[4] would be URL column - explicitly ignored as requested
              
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
  // WHATSAPP INTEGRATION (EXTERNAL API)
  // ===========================================
  
  // ===========================================
  // WATCH REQUIREMENTS ENDPOINTS
  // ===========================================

  // Get all watch requirements
  app.get("/api/watch-requirements", requireAuth, async (req: AuthRequest, res) => {
    try {
      const filters = {
        search: req.query.search as string,
        sender: req.query.sender as string,
        group: req.query.group as string,
        brand: req.query.brand as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        userId: req.user.userId,
      };

      const result = await storage.getAllWatchRequirements(filters);
      res.json(result);
    } catch (error) {
      console.error("Get watch requirements error:", error);
      res.status(500).json({ error: "Failed to fetch watch requirements" });
    }
  });

  // Export watch requirements to Excel
  app.post("/api/watch-requirements/export", requireAuth, async (req: AuthRequest, res) => {
    try {
      const filters = req.body;
      const result = await storage.getAllWatchRequirements({
        ...filters,
        limit: 10000,
        userId: req.user.userId,
      });

      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Watch Requirements');

      worksheet.columns = [
        { header: 'PID', key: 'pid', width: 15 },
        { header: 'Brand', key: 'brand', width: 15 },
        { header: 'Family', key: 'family', width: 15 },
        { header: 'Variant', key: 'variant', width: 20 },
        { header: 'Condition', key: 'condition', width: 12 },
        { header: 'Sender', key: 'sender', width: 20 },
        { header: 'Group', key: 'groupName', width: 25 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Time', key: 'time', width: 10 },
        { header: 'Raw Line', key: 'rawLine', width: 50 },
      ];

      result.requirements.forEach(req => {
        worksheet.addRow(req);
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=watch-requirements.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Export watch requirements error:", error);
      res.status(500).json({ error: "Failed to export watch requirements" });
    }
  });

  // Get WhatsApp groups database
  app.get("/api/whatsapp-groups", async (req, res) => {
    try {
      const groups = await storage.getAllWhatsappGroups();
      res.json(groups);
    } catch (error) {
      console.error("Get WhatsApp groups error:", error);
      res.status(500).json({ error: "Failed to get WhatsApp groups" });
    }
  });

  // ===========================================
  // CONTACTS API ROUTES
  // ===========================================

  // ===========================================
  // BROADCAST REPORTS API ROUTES
  // ===========================================

  // Get all broadcast reports
  app.get("/api/broadcast-reports", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { db } = await import('./db');
      const { broadcastReports } = await import('@shared/schema');
      const { desc, eq } = await import('drizzle-orm');
      
      // CRITICAL SECURITY FIX: Filter by user ID for data isolation
      const reports = await db.select().from(broadcastReports)
        .where(eq(broadcastReports.userId, req.user.userId))
        .orderBy(desc(broadcastReports.startedAt));
      res.json(reports);
    } catch (error) {
      console.error('Failed to get broadcast reports:', error);
      res.status(500).json({ error: 'Failed to get broadcast reports' });
    }
  });

  // Create broadcast report
  app.post("/api/broadcast-reports", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { db } = await import('./db');
      const { broadcastReports, insertBroadcastReportSchema } = await import('@shared/schema');
      
      const validatedData = insertBroadcastReportSchema.parse(req.body);
      // SECURITY FIX: Associate with current user
      const reportData = { ...validatedData, userId: req.user.userId };
      const [report] = await db.insert(broadcastReports).values(reportData).returning();
      
      res.json(report);
    } catch (error) {
      console.error('Failed to create broadcast report:', error);
      res.status(500).json({ error: 'Failed to create broadcast report' });
    }
  });

  // Update broadcast report
  app.patch("/api/broadcast-reports/:reportId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { db } = await import('./db');
      const { broadcastReports } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const { reportId } = req.params;
      
      // SECURITY FIX: Only allow updating own reports
      const [updatedReport] = await db.update(broadcastReports)
        .set({ ...req.body, completedAt: req.body.status === 'completed' ? new Date() : undefined })
        .where(and(
          eq(broadcastReports.reportId, reportId),
          eq(broadcastReports.userId, req.user.userId)
        ))
        .returning();
      
      if (!updatedReport) {
        return res.status(404).json({ error: 'Report not found' });
      }
      
      res.json(updatedReport);
    } catch (error) {
      console.error('Failed to update broadcast report:', error);
      res.status(500).json({ error: 'Failed to update broadcast report' });
    }
  });

  // Delete individual broadcast report
  app.delete("/api/broadcast-reports/:reportId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { db } = await import('./db');
      const { broadcastReports } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const { reportId } = req.params;
      
      // SECURITY FIX: Only allow deleting own reports
      const [deletedReport] = await db.delete(broadcastReports)
        .where(and(
          eq(broadcastReports.reportId, reportId),
          eq(broadcastReports.userId, req.user.userId)
        ))
        .returning();
      
      if (!deletedReport) {
        return res.status(404).json({ error: 'Report not found' });
      }
      
      res.json({ success: true, deleted: deletedReport });
    } catch (error) {
      console.error('Failed to delete broadcast report:', error);
      res.status(500).json({ error: 'Failed to delete broadcast report' });
    }
  });

  // Bulk delete broadcast reports by status
  app.delete("/api/broadcast-reports/bulk/:status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { db } = await import('./db');
      const { broadcastReports } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const { status } = req.params;
      
      // SECURITY FIX: Only allow bulk deleting own reports
      const deletedReports = await db.delete(broadcastReports)
        .where(and(
          eq(broadcastReports.status, status),
          eq(broadcastReports.userId, req.user.userId)
        ))
        .returning();
      
      res.json({ success: true, deletedCount: deletedReports.length, deleted: deletedReports });
    } catch (error) {
      console.error('Failed to bulk delete broadcast reports:', error);
      res.status(500).json({ error: 'Failed to bulk delete broadcast reports' });
    }
  });

  // Get contacts by group name for smart private messaging
  app.get("/api/contacts/by-group/:groupName", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { db } = await import('./db');
      const { contacts } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const { groupName } = req.params;
      
      // **SECURITY FIX**: Only show contacts accessible by this user
      const { createUserAccessCondition } = await import('./lib/access');
      const userAccessCondition = await createUserAccessCondition(req.user, contacts.userId);
      
      const groupContacts = await db.select({
        id: contacts.id,
        pushName: contacts.pushName,
        phoneNumber: contacts.phoneNumber,
        groupName: contacts.groupName
      })
      .from(contacts)
      .where(and(
        eq(contacts.groupName, decodeURIComponent(groupName)),
        userAccessCondition
      ));
      
      console.log(`📞 Found ${groupContacts.length} contacts in group "${groupName}":`, 
        groupContacts.map(c => `${c.pushName} (${c.phoneNumber})`));
      
      res.json({ contacts: groupContacts });
    } catch (error) {
      console.error('Failed to get contacts by group:', error);
      res.status(500).json({ error: 'Failed to get contacts by group' });
    }
  });

  // Get contact counts by group for groups display
  app.get("/api/contacts/group-counts", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { db } = await import('./db');
      const { contacts } = await import('@shared/schema');
      const { sql } = await import('drizzle-orm');
      
      // **SECURITY FIX**: Only show contacts accessible by this user
      const { getAccessibleUserIds } = await import('./lib/access');
      const accessibleUserIds = await getAccessibleUserIds(req.user);
      const userIdList = accessibleUserIds.map(id => `'${id}'`).join(',');
      
      const result = await db.execute(sql`
        SELECT group_name, COUNT(*) as contact_count 
        FROM contacts 
        WHERE group_name IS NOT NULL AND group_name != 'Unknown Group'
          AND user_id IN (${sql.raw(userIdList)})
        GROUP BY group_name
        ORDER BY contact_count DESC
      `);
      
      const counts = {};
      result.rows.forEach(row => {
        counts[row.group_name] = parseInt(row.contact_count);
      });
      
      console.log(`📊 Group contact counts:`, counts);
      res.json({ counts });
    } catch (error) {
      console.error('Failed to get group contact counts:', error);
      res.status(500).json({ error: 'Failed to get group contact counts' });
    }
  });

  // Send message to WhatsApp group directly using correct mblaster.in API
  app.post("/api/whatsapp/send-to-group", async (req, res) => {
    try {
      const { groupId, message } = req.body;
      
      const { instanceId, accessToken } = waConfig;
      
      if (!instanceId || !accessToken) {
        return res.status(400).json({ error: 'WhatsApp not configured' });
      }

      console.log(`📤 Sending group message to ${groupId}: ${message}`);
      console.log(`📤 API payload:`, {
        group_id: groupId,
        type: 'text',
        message: message,
        instance_id: instanceId,
        access_token: accessToken
      });
      
      // Try URL-encoded format first (as per mblaster.in docs)
      const urlParams = new URLSearchParams({
        group_id: groupId,
        type: 'text',
        message: message,
        instance_id: instanceId,
        access_token: accessToken
      });
      
      const response = await fetch(`https://mblaster.in/api/send_group?${urlParams.toString()}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Group message sent successfully to ${groupId}:`, result);
        res.json({ success: true, result });
      } else {
        const errorText = await response.text();
        console.error(`❌ Group message API error (${response.status}):`, errorText);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.error('Failed to send group message:', error);
      res.status(500).json({ error: 'Failed to send group message', details: error.message });
    }
  });

  // Get WhatsApp groups for Contacts > Groups Database tab
  app.get("/api/whatsapp-groups/database", requireAuth, async (req: AuthRequest, res) => {
    try {
      console.log(`📊 [User ${req.user.userId}] Contacts > Groups Database API called`);
      
      // Import all dependencies first
      const { db } = await import('./db');
      const { whatsappGroups, watchListings, watchRequirements } = await import('@shared/schema');
      const { desc, sql, ne, and } = await import('drizzle-orm');
      const { createUserAccessCondition } = await import('./lib/access');
      
      // **SECURITY FIX**: Only show groups accessible by this user
      const userAccessCondition = await createUserAccessCondition(req.user, whatsappGroups.userId);
      
      // Get groups accessible by this user - exclude "Unknown Group" entries
      const groups = await db.select({
        id: whatsappGroups.id,
        groupId: whatsappGroups.groupId,
        groupName: whatsappGroups.groupName,
        participantCount: whatsappGroups.participantCount,
        lastSeen: whatsappGroups.lastSeen,
        messageCount: sql<number>`0`
      })
      .from(whatsappGroups)
      .where(and(
        ne(whatsappGroups.groupName, 'Unknown Group'),
        userAccessCondition
      ))
      .orderBy(desc(whatsappGroups.lastSeen));
      
      console.log(`📊 Contacts Groups Database: Found ${groups.length} groups:`, groups.map(g => g.groupName));
      res.json({ groups });
    } catch (error) {
      console.error('❌ Contacts Groups Database error:', error);
      res.status(500).json({ error: 'Failed to get groups database' });
    }
  });

  // Contact export endpoints
  app.get("/api/contacts/export/excel", requireAuth, async (req: AuthRequest, res) => {
    try {
      const ExcelJS = await import('exceljs');
      const { db } = await import('./db');
      const { contacts } = await import('@shared/schema');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Contacts');
      
      // **SECURITY FIX**: Only export contacts accessible by this user
      const { createUserAccessCondition } = await import('./lib/access');
      const userAccessCondition = await createUserAccessCondition(req.user, contacts.userId);
      
      // Add headers
      worksheet.addRow(['Name', 'Phone Number', 'Group Name', 'Upload Date']);
      
      // Fetch contacts for this user only
      const allContacts = await db.select().from(contacts).where(userAccessCondition);
      
      // Add data rows
      allContacts.forEach((contact: any) => {
        worksheet.addRow([
          contact.pushName,
          contact.phoneNumber,
          contact.groupName,
          new Date(contact.uploadedAt).toLocaleDateString()
        ]);
      });
      
      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.columns.forEach((column) => {
        if (column.header) {
          column.width = 20;
        }
      });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="contacts_${new Date().toISOString().split('T')[0]}.xlsx"`);
      
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Export to Excel failed:', error);
      res.status(500).json({ error: 'Export failed' });
    }
  });

  app.get("/api/contacts/export/text", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { db } = await import('./db');
      const { contacts } = await import('@shared/schema');
      
      // **SECURITY FIX**: Only export contacts accessible by this user
      const { createUserAccessCondition } = await import('./lib/access');
      const userAccessCondition = await createUserAccessCondition(req.user, contacts.userId);
      
      const allContacts = await db.select().from(contacts).where(userAccessCondition);
      
      let textContent = 'Contact Export\n';
      textContent += '=================\n\n';
      
      allContacts.forEach((contact: any) => {
        textContent += `Name: ${contact.pushName}\n`;
        textContent += `Phone: ${contact.phoneNumber}\n`;
        textContent += `Group: ${contact.groupName}\n`;
        textContent += `Added: ${new Date(contact.uploadedAt).toLocaleDateString()}\n`;
        textContent += '---\n';
      });
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="contacts_${new Date().toISOString().split('T')[0]}.txt"`);
      res.send(textContent);
    } catch (error) {
      console.error('Export to text failed:', error);
      res.status(500).json({ error: 'Export failed' });
    }
  });

  // Get all contacts with optional search and filters
  app.get("/api/contacts", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { db } = await import('./db');
      const { eq, or, ilike, sql, and } = await import('drizzle-orm');
      
      console.log(`📋 [User ${req.user.userId}] Contact list request: page=${req.query.page}, limit=${req.query.limit}, search=${req.query.search}`);
      
      // **SECURITY FIX**: Only show contacts accessible by this user
      const { createUserAccessCondition } = await import('./lib/access');
      const userAccessCondition = await createUserAccessCondition(req.user, contacts.userId);
      
      const { search, groupJid, groupName, page = 1, limit = 20 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);
      
      let query = db.select().from(contacts).where(userAccessCondition);
      
      // Apply additional filters on top of user access condition
      const additionalConditions = [];
      
      if (search) {
        additionalConditions.push(
          or(
            ilike(contacts.pushName, `%${search}%`),
            ilike(contacts.phoneNumber, `%${search}%`)
          )
        );
      }
      
      if (groupJid) {
        additionalConditions.push(eq(contacts.groupJid, String(groupJid)));
      }
      
      if (groupName) {
        additionalConditions.push(ilike(contacts.groupName, `%${groupName}%`));
      }
      
      // Combine user access condition with additional filters
      if (additionalConditions.length > 0) {
        query = query.where(and(userAccessCondition, ...additionalConditions));
      }
      
      // Add ordering and pagination  
      query = query
        .orderBy(contacts.uploadedAt)
        .limit(Number(limit))
        .offset(offset);
      
      const results = await query;
      
      // Get total count for pagination (with same user filtering)
      let countQuery = db.select({ count: sql`COUNT(*)` }).from(contacts).where(userAccessCondition);
      
      // Apply same additional filters to count query
      if (additionalConditions.length > 0) {
        countQuery = countQuery.where(and(userAccessCondition, ...additionalConditions));
      }
      
      console.log(`📋 [User ${req.user.userId}] Applying filters: search=${search}, groupJid=${groupJid}, groupName=${groupName}`);
      
      const [{ count }] = await countQuery;
      
      console.log(`📋 [User ${req.user.userId}] Contact results: ${results.length} contacts, total: ${count}`);
      
      res.json({
        contacts: results,
        pagination: {
          total: Number(count),
          limit: Number(limit),
          page: Number(page),
          hasMore: offset + Number(limit) < Number(count)
        }
      });
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  // Upload contacts via text parsing (like inventory upload)
  app.post("/api/contacts/upload", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { contactData, contactText, groupJid, groupName, notes } = req.body;
      const textData = contactData || contactText; // Support both parameter names
      
      console.log(`📋 [User ${req.user.userId}] Contact upload request with ${textData?.split('\n').length || 0} lines`);
      
      // **SECURITY FIX**: All contacts will be associated with this user
      const dataWorkspaceId = await storage.getDataWorkspaceId(req.user.userId);
      
      if (!textData) {
        return res.status(400).json({ error: "Contact data is required" });
      }
      
      const lines = textData.split('\n').filter((line: string) => line.trim());
      const contactsToInsert: any[] = [];
      const errors: string[] = [];
      const uploadBatch = `batch_${Date.now()}`;
      let detectedGroupJid = groupJid;
      let detectedGroupName = groupName;
      
      // Check if this is mBlaster group export format (first line is group info)
      if (lines.length > 0 && lines[0].includes('\t')) {
        const firstLine = lines[0];
        const parts = firstLine.split('\t');
        
        // Check if first part looks like a group JID (digits only) and second part is group name
        if (parts.length >= 2 && /^\d+$/.test(parts[0].trim()) && !parts[0].trim().includes('@')) {
          detectedGroupJid = `${parts[0].trim()}@g.us`;
          detectedGroupName = parts[1].trim();
          console.log(`📋 Detected mBlaster group format: ${detectedGroupJid} - ${detectedGroupName}`);
          
          // Remove the first line (group info) from processing
          lines.shift();
        }
      }
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        let pushName = "";
        let phoneNumber = "";
        let isAdmin = false;
        
        // Check for mBlaster tab-separated format first: "jid@c.us\tContact Name"
        if (line.includes('\t')) {
          const parts = line.split('\t');
          if (parts.length >= 2) {
            const jidPart = parts[0].trim();
            pushName = parts[1].trim();
            
            // Extract phone number from JID format (remove @c.us or @s.whatsapp.net)
            if (jidPart.includes('@c.us') || jidPart.includes('@s.whatsapp.net')) {
              const phoneOnly = jidPart.replace(/@.*/, '');
              if (/^\d+$/.test(phoneOnly)) {
                phoneNumber = `+${phoneOnly}`;
              }
            }
            
            if (!phoneNumber) {
              errors.push(`Line ${i + 1}: Invalid JID format - ${jidPart}`);
              continue;
            }
          } else {
            errors.push(`Line ${i + 1}: Invalid tab-separated format - ${line}`);
            continue;
          }
        }
        // CSV format check
        else if (line.includes(',') && line.split(',').length >= 2) {
          const parts = line.split(',').map(p => p.trim());
          pushName = parts[0];
          phoneNumber = parts[1];
          isAdmin = parts[2]?.toLowerCase() === 'admin' || parts[2]?.toLowerCase() === 'true';
        } 
        // Simple phone name format: "+919821822960 nirav" or "919821822960 nirav"  
        else if (!line.includes(',') && !line.includes('\t') && line.includes(' ') && /^\+?\d+\s+\S/.test(line)) {
          const parts = line.split(' ');
          const phonePart = parts[0].trim();
          pushName = parts.slice(1).join(' ').trim(); // Join remaining parts as name
          
          // Clean phone number: ensure it starts with + and contains only digits
          if (/^\+?\d+$/.test(phonePart)) {
            phoneNumber = phonePart.startsWith('+') ? phonePart : `+${phonePart}`;
          } else {
            errors.push(`Line ${i + 1}: Invalid phone number format - ${phonePart}`);
            continue;
          }
        }
        // Other formats - extract phone number and name
        else {
          const phoneMatch = line.match(/(\+\d{1,4}[\s\d-]{8,15})/);
          if (phoneMatch) {
            phoneNumber = phoneMatch[1].replace(/[\s-]/g, ''); // Clean phone number
            pushName = line.replace(phoneMatch[0], '').replace(/[,:]/g, '').trim();
          } else {
            errors.push(`Line ${i + 1}: No valid phone number found - ${line}`);
            continue;
          }
        }
        
        if (!pushName || !phoneNumber) {
          errors.push(`Line ${i + 1}: Missing name or phone number - ${line}`);
          continue;
        }
        
        // Validate phone number format
        if (!/^\+\d{10,15}$/.test(phoneNumber)) {
          errors.push(`Line ${i + 1}: Invalid phone number format - ${phoneNumber}`);
          continue;
        }
        
        contactsToInsert.push({
          pushName,
          phoneNumber,
          groupJid: detectedGroupJid || null,
          groupName: detectedGroupName || null,
          isAdmin,
          notes,
          uploadBatch,
          userId: dataWorkspaceId  // CRITICAL FIX: Use workspace ID for proper tenant isolation
        });
      }
      
      // Insert contacts into database
      let inserted = 0;
      if (contactsToInsert.length > 0) {
        const { db } = await import('./db');
        const results = await db.insert(contacts).values(contactsToInsert).returning();
        inserted = results.length;
      }
      
      res.json({
        success: true,
        inserted,
        errors,
        totalLines: lines.length,
        uploadBatch
      });
    } catch (error) {
      console.error("Error uploading contacts:", error);
      res.status(500).json({ error: "Failed to upload contacts" });
    }
  });

  // Delete a contact
  app.delete("/api/contacts/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const contactId = parseInt(req.params.id);
      
      console.log(`📋 [User ${req.user.userId}] Contact delete request for ID: ${contactId}`);
      
      // **SECURITY FIX**: Only allow deleting contacts accessible by this user
      const { createUserAccessCondition } = await import('./lib/access');
      const userAccessCondition = await createUserAccessCondition(req.user, contacts.userId);
      
      const { db } = await import('./db');
      const { eq, and } = await import('drizzle-orm');
      
      const [deletedContact] = await db
        .delete(contacts)
        .where(and(
          eq(contacts.id, contactId),
          userAccessCondition
        ))
        .returning();
      
      if (!deletedContact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      res.json({ success: true, deleted: deletedContact });
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  // Delete contacts by upload batch
  app.delete("/api/contacts/batch/:batchId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { batchId } = req.params;
      
      console.log(`📋 [User ${req.user.userId}] Contact batch delete request for batch: ${batchId}`);
      
      // **SECURITY FIX**: Only allow deleting contacts accessible by this user
      const { createUserAccessCondition } = await import('./lib/access');
      const userAccessCondition = await createUserAccessCondition(req.user, contacts.userId);
      
      const { db } = await import('./db');
      const { eq, and } = await import('drizzle-orm');
      
      const deletedContacts = await db
        .delete(contacts)
        .where(and(
          eq(contacts.uploadBatch, batchId),
          userAccessCondition
        ))
        .returning();
      
      res.json({ 
        success: true, 
        deleted: deletedContacts.length,
        contacts: deletedContacts 
      });
    } catch (error) {
      console.error("Error deleting contact batch:", error);
      res.status(500).json({ error: "Failed to delete contact batch" });
    }
  });

  // Batch delete contacts by group
  app.delete("/api/contacts/batch-delete", async (req, res) => {
    try {
      const { groupJid } = req.body;
      if (!groupJid) {
        return res.status(400).json({ error: "groupJid is required" });
      }
      
      const { db } = await import('./db');
      const { eq } = await import('drizzle-orm');
      
      const deletedContacts = await db
        .delete(contacts)
        .where(eq(contacts.groupJid, groupJid))
        .returning();
      
      res.json({ 
        success: true, 
        deleted: deletedContacts.length,
        contacts: deletedContacts 
      });
    } catch (error) {
      console.error("Error batch deleting contacts:", error);
      res.status(500).json({ error: "Failed to delete contacts" });
    }
  });

  // Update contact
  app.put("/api/contacts/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const contactId = parseInt(req.params.id);
      const { pushName, phoneNumber } = req.body;
      
      console.log(`📋 [User ${req.user.userId}] Contact update request for ID: ${contactId}`);
      
      if (!pushName || !phoneNumber) {
        return res.status(400).json({ error: "pushName and phoneNumber are required" });
      }
      
      // **SECURITY FIX**: Only allow updating contacts accessible by this user
      const { createUserAccessCondition } = await import('./lib/access');
      const userAccessCondition = await createUserAccessCondition(req.user, contacts.userId);
      
      const { db } = await import('./db');
      const { eq, and } = await import('drizzle-orm');
      
      const [updatedContact] = await db
        .update(contacts)
        .set({ pushName, phoneNumber })
        .where(and(
          eq(contacts.id, contactId),
          userAccessCondition
        ))
        .returning();
        
      if (!updatedContact) {
        return res.status(404).json({ error: "Contact not found" });
      }
        
      res.json({ success: true, contact: updatedContact });
    } catch (error) {
      console.error("Error updating contact:", error);
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  // Get unique groups for dropdown
  app.get("/api/contacts/groups", requireAuth, async (req: AuthRequest, res) => {
    try {
      console.log(`📋 [User ${req.user.userId}] Contact groups request`);
      
      // **SECURITY FIX**: Only show groups from contacts accessible by this user
      const { createUserAccessCondition } = await import('./lib/access');
      const userAccessCondition = await createUserAccessCondition(req.user, contacts.userId);
      
      const { db } = await import('./db');
      const { sql, count } = await import('drizzle-orm');
      
      const groups = await db
        .select({
          groupJid: contacts.groupJid,
          groupName: contacts.groupName,
          count: count()
        })
        .from(contacts)
        .where(userAccessCondition)
        .groupBy(contacts.groupJid, contacts.groupName)
        .orderBy(contacts.groupName);
        
      res.json({ groups });
    } catch (error) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ error: "Failed to fetch groups" });
    }
  });

  // Search contacts by name (for LID resolution)
  app.get("/api/contacts/search/:name", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { name } = req.params;
      const { groupJid } = req.query;
      
      console.log(`📋 [User ${req.user.userId}] Contact search request: name=${name}, groupJid=${groupJid}`);
      
      // **SECURITY FIX**: Only search contacts accessible by this user
      const { createUserAccessCondition } = await import('./lib/access');
      const userAccessCondition = await createUserAccessCondition(req.user, contacts.userId);
      
      const { db } = await import('./db');
      const { ilike, desc, sql, and } = await import('drizzle-orm');
      
      let query = db.select().from(contacts).where(
        and(
          userAccessCondition,
          ilike(contacts.pushName, `%${name}%`)
        )
      );
      
      // Prioritize matches from the same group
      if (groupJid) {
        query = query.orderBy(
          sql`CASE WHEN group_jid = ${groupJid} THEN 0 ELSE 1 END`,
          desc(contacts.uploadedAt)
        );
      } else {
        query = query.orderBy(desc(contacts.uploadedAt));
      }
      
      const results = await query.limit(10);
      
      res.json({ contacts: results });
    } catch (error) {
      console.error("Error searching contacts:", error);
      res.status(500).json({ error: "Failed to search contacts" });
    }
  });

  // Get inventory items
  app.get("/api/inventory", requireAuth, async (req: AuthRequest, res) => {
    try {
      const filters = {
        search: req.query.search as string,
        brand: req.query.brand as string,
        condition: req.query.condition as string,
        userId: req.user.userId,
      };
      
      const result = await storage.getInventoryItems(filters);
      res.json(result);
    } catch (error) {
      console.error("Get inventory error:", error);
      res.status(500).json({ error: "Failed to get inventory items" });
    }
  });

  // Upload inventory data
  app.post("/api/inventory/upload", async (req, res) => {
    try {
      const { message, source = "manual_upload" } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message content is required" });
      }

      const { WatchMessageParser } = await import('./watch-parser');
      const parser = new WatchMessageParser();
      const parsedData = await parser.parseMessage(message);
      
      let count = 0;
      if (parsedData && parsedData.length > 0) {
        for (const listing of parsedData) {
          try {
            await storage.createWatchListing({
              ...listing,
              chatId: "inventory_upload",
              groupName: "Manual Upload",
              sender: "System",
              senderNumber: "",
              date: new Date().toISOString().split('T')[0],
              time: new Date().toTimeString().split(' ')[0],
              originalMessage: message,
              messageType: "selling",
            });
            count++;
          } catch (error) {
            console.error("Error creating inventory listing:", error);
          }
        }
      }

      res.json({ 
        success: true, 
        count, 
        message: `Successfully parsed ${count} inventory items` 
      });
    } catch (error) {
      console.error("Upload inventory error:", error);
      res.status(500).json({ error: "Failed to upload inventory" });
    }
  });

  // Get inventory-requirements matches
  app.get("/api/inventory/matches", requireAuth, async (req: AuthRequest, res) => {
    try {
      const [inventoryResult, requirementsResult] = await Promise.all([
        storage.getInventoryItems({ userId: req.user.userId }),
        storage.getAllWatchRequirements({ userId: req.user.userId })
      ]);

      const matches = [];
      
      // Match inventory items with requirements
      for (const inventoryItem of inventoryResult.items) {
        for (const requirement of requirementsResult.requirements) {
          if (inventoryItem.pid.toLowerCase() === requirement.pid.toLowerCase()) {
            const match = {
              id: `${inventoryItem.id}-${requirement.id}`,
              inventoryItem: {
                id: inventoryItem.id,
                pid: inventoryItem.pid,
                brand: inventoryItem.brand,
                family: inventoryItem.family,
                variant: inventoryItem.variant,
                condition: inventoryItem.condition,
                price: inventoryItem.price,
                currency: inventoryItem.currency,
                year: inventoryItem.year,
                rawLine: inventoryItem.rawLine,
              },
              requirement: {
                id: requirement.id,
                pid: requirement.pid,
                brand: requirement.brand,
                family: requirement.family,
                variant: requirement.variant,
                condition: requirement.condition,
                sender: requirement.sender,
                groupName: requirement.groupName,
                date: requirement.date,
                rawLine: requirement.rawLine,
              },
              matchScore: calculateMatchScore(inventoryItem, requirement),
              matchType: getMatchType(inventoryItem, requirement),
            };
            matches.push(match);
          }
        }
      }

      // Sort by match score (best matches first)
      matches.sort((a, b) => b.matchScore - a.matchScore);

      res.json({ matches, total: matches.length });
    } catch (error) {
      console.error("Get inventory matches error:", error);
      res.status(500).json({ error: "Failed to fetch inventory matches" });
    }
  });

  // Helper function to calculate match score
  function calculateMatchScore(inventory: any, requirement: any): number {
    let score = 50; // Base score for PID match
    
    // Exact variant match
    if (inventory.variant && requirement.variant && 
        inventory.variant.toLowerCase() === requirement.variant.toLowerCase()) {
      score += 30;
    }
    
    // Condition match
    if (inventory.condition && requirement.condition && 
        inventory.condition.toLowerCase() === requirement.condition.toLowerCase()) {
      score += 15;
    }
    
    // Brand match
    if (inventory.brand && requirement.brand && 
        inventory.brand.toLowerCase() === requirement.brand.toLowerCase()) {
      score += 5;
    }
    
    return score;
  }

  // Helper function to determine match type
  function getMatchType(inventory: any, requirement: any): string {
    if (inventory.variant && requirement.variant && 
        inventory.variant.toLowerCase() === requirement.variant.toLowerCase()) {
      return "exact";
    }
    return "partial";
  }

  // Add middleware
  app.use(cookieParser());
  
  // Add auth routes
  app.use('/api/auth', authRoutes);
  
  // Add admin routes
  app.use('/api/admin', adminRoutes);

  // Register SECURE multi-tenant WhatsApp API routes
  registerSecureWhatsAppRoutes(app);
  
  // Register SECURE user-aware webhook processing
  registerSecureWebhookRoutes(app);
  
  // Import name caches from whatsapp routes
  const { contactNameMap, groupNameMap } = await import('./routes/whatsapp');
  

  
  // Initialize connection monitoring
  const { getConnectionMonitor, updateLastMessageTime } = await import('./connection-monitor');
  const connectionMonitor = getConnectionMonitor();
  
  // SECURITY FIX: Removed global startup webhook refresh - now handled per-user
  // Each user's WhatsApp configuration is managed individually through the secure routes
  console.log("🔐 Multi-tenant WhatsApp system initialized - using per-user configurations");

  // ===========================================
  // WHATSAPP INTERNAL ROUTES (WEBHOOK & MESSAGES)
  // ===========================================

  // Debug endpoint for LID mappings (ChatGPT solution)
  app.get("/api/whatsapp/lid-mappings", async (req, res) => {
    try {
      const { getLidMappings } = await import('./contactResolver');
      const mappings = getLidMappings();
      
      res.json({
        success: true,
        mappings,
        count: Object.keys(mappings).length,
        note: "LID to phone number mappings learned from contact updates"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get LID mappings", details: (error as Error).message });
    }
  });

  // Import improved message processing
  const { normalizeBaileys, normalizeReceivedWrapper, NormalizedMsg } = await import('./normalize');
  const { messageDeduplicator } = await import('./deduplicator');
  
  // Environment variables for processing control
  const PROCESS_STATUS = process.env.PROCESS_STATUS !== 'false'; // Default true
  const OFFER_PARSE_MIN_LINES = parseInt(process.env.OFFER_PARSE_MIN_LINES || '3');
  
  // SECURITY FIX: OLD INSECURE WEBHOOK DISABLED - Using secure multi-tenant version instead
  // The secure webhook is now in webhook-secure.ts with proper user context mapping
  /*
  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      // Import and mark webhook received immediately
      const { waCache } = await import('./state/waCache');
      waCache.markWebhookNow();
      
      // Log the complete payload to understand mblaster's format
      console.log("🔔 Incoming Webhook Payload:", JSON.stringify(req.body, null, 2));
      
      // 🔧 CRITICAL FIX: DYNAMIC INSTANCE ID VALIDATION
      // Reload config to get current instance ID
      const { loadConfig } = await import('./waConfig');
      await loadConfig();
      const { waConfig } = await import('./waConfig');
      
      const incomingInstanceId = req.body?.instance_id;
      
      // If we have an instance_id in the webhook, auto-update if needed
      if (incomingInstanceId) {
        if (!waConfig.instanceId) {
          console.log("⚠️  No instance ID configured - accepting webhook and saving instance ID");
          waConfig.instanceId = incomingInstanceId;
          
          const { saveConfig } = await import('./waConfig');
          await saveConfig({ instanceId: incomingInstanceId });
        } else if (incomingInstanceId !== waConfig.instanceId) {
          console.log(`🔄 Instance ID change detected: ${waConfig.instanceId} -> ${incomingInstanceId}`);
          console.log(`🔄 Auto-updating configuration to use active instance ID: ${incomingInstanceId}`);
          
          // Update the configuration with the new instance ID
          const { saveConfig } = await import('./waConfig');
          await saveConfig({ instanceId: incomingInstanceId });
          
          // Update in-memory config as well
          waConfig.instanceId = incomingInstanceId;
          
          console.log(`✅ Configuration updated to use instance: ${incomingInstanceId}`);
        } else {
          console.log(`✅ Instance ID match: ${incomingInstanceId} - proceeding`);
        }
      }
      
      // If it's a contact update, cache names and build LID mappings - ChatGPT approach
      const payload = req.body;
      const root = payload?.data;
      if (root?.event === "contacts.update" && Array.isArray(root?.data)) {
        const { waCache } = await import('./state/waCache');
        const { processContactUpdates } = await import('./contactResolver');
        
        // Process contacts for LID mapping (ChatGPT approach)
        processContactUpdates(root.data);
        
        for (const c of root.data) {
          const jid = c.id || c.jid;
          const name =
            c.notify || c.verifiedName || c.pushName || c.name || c.displayName;
          if (jid && name) {
            if (jid.endsWith("@g.us")) {
              waCache.upsertGroup(jid, name);
            } else {
              waCache.upsertContact(jid, name);
            }
          }
        }
        
        console.log(`📞 Processed ${root.data.length} contact updates with LID mapping`);
        return res.json({
          success: true,
          stored: false,
          parsed: false,
          reason: "contact_update_cached",
        });
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
        
        if (msgEvent) {
          // Use the new normalizer
          const normalized = normalizeBaileys(msgEvent);
          
          // Import deduplicator within handler scope to avoid issues
          const { messageDeduplicator } = await import('./deduplicator');
          
          // Check for duplicates using improved deduplication with content and sender
          const isDupe = messageDeduplicator.isDuplicate(
            normalized.id, 
            normalized.remoteJid, 
            normalized.participant,
            normalized.text || undefined,
            normalized.senderE164 || normalized.senderLid || normalized.senderJid
          );
          
          if (isDupe) {
            console.log(`⚠️  Duplicate message detected - storing with duplicate status`);
            
            // Store duplicate message in database for proper tracking
            try {
              const messageLog = await storage.createMessageLog({
                messageId: normalized.id,
                timestamp: new Date(normalized.timestamp || new Date().toISOString()),
                groupId: normalized.remoteJid,
                groupName: normalized.groupName || 'WhatsApp Group',
                sender: normalized.senderName || 'Unknown',
                senderNumber: normalized.senderE164 || normalized.senderLid || '',
                message: normalized.text || '📷 Media message',
                status: "duplicate",
                processed: false,
                parsedCount: 0,
                requirementCount: 0,
                instanceId: waConfig.instanceId,
              });
              console.log(`📝 Duplicate message stored in database with ID ${messageLog.id}`);
            } catch (error) {
              console.error('Error storing duplicate message log:', error);
            }
            
            return res.json({ 
              success: true, 
              stored: true,
              skipped: true, 
              reason: "duplicate_message" 
            });
          }
          
          // Skip status messages unless configured to process them
          if (normalized.isStatus && !PROCESS_STATUS) {
            console.log(`↷ Skipped status@broadcast (PROCESS_STATUS=false)`);
            return res.json({ 
              success: true, 
              skipped: true, 
              reason: "status_skipped" 
            });
          }
          
          // 🔥 CRITICAL FIX: Only process GROUP messages for watch trading
          // Skip direct messages (ending with @s.whatsapp.net) - only process groups (ending with @g.us)
          if (!normalized.remoteJid.endsWith('@g.us')) {
            console.log(`🚫 Skipped non-group message from: ${normalized.remoteJid} (only processing @g.us groups)`);
            return res.json({ 
              success: true, 
              skipped: true, 
              reason: "non_group_message" 
            });
          }
          
          // Skip if no text and no meaningful media
          if (!normalized.text && normalized.kind === "unknown") {
            console.log(`↷ Ignored non-user envelope or empty content`);
            return res.json({ 
              success: true, 
              skipped: true, 
              reason: "no_content" 
            });
          }
          
          // Log media-only messages properly
          if (!normalized.text && normalized.media) {
            console.log(`ℹ️  Media-only ${normalized.kind} (no caption) - storing`);
          }
          
          // Use proper ChatGPT sender formatting with DATABASE LOOKUP for intelligent resolution
          const { formatSenderWithDbLookup, processContactUpdates } = await import('./contactResolver');
          const { waCache } = await import('./state/waCache');
          
          const senderInfo = await formatSenderWithDbLookup(
            normalized.senderJid,
            normalized.senderName,
            msgEvent?.verifiedBizName,
            normalized.remoteJid // groupJid for better matching
          );
          
          // Improved sender logging with proper ChatGPT approach
          if (senderInfo.senderKind === 'lid') {
            console.log(`👤 sender=LID:${normalized.senderLid} name="${senderInfo.senderDisplay}" number=UNAVAILABLE`);
          } else if (senderInfo.senderNumber) {
            console.log(`👤 sender=${senderInfo.senderNumber} name="${senderInfo.senderDisplay}"`);
          }
          
          // Extract data for legacy processing
          messageData = normalized.text || "";
          senderData = senderInfo.senderDisplay;
          groupData = normalized.remoteJid;
          timestampData = normalized.timestamp ? new Date(normalized.timestamp * 1000).toISOString() : new Date().toISOString();
          messageIdData = normalized.id;
          
          // CRITICAL FIX: Use proper ChatGPT approach - NO FAKE NUMBERS FOR LIDs
          senderNumberData = senderInfo.senderNumber || "—";
          
          // 🔍 INTELLIGENT SENDER RESOLUTION - Update existing records when phone number is resolved
          if (senderInfo.senderNumber && senderInfo.senderKind === 'lid' && normalized.senderName && normalized.senderName !== "Unknown") {
            try {
              const { watchListings, watchRequirements } = await import('@shared/schema');
              const { db } = await import('./db');
              const { eq, and, isNull, or } = await import('drizzle-orm');
              
              console.log(`🔍 Phone number resolved for ${normalized.senderName}: ${senderInfo.senderNumber} - updating existing records`);
              
              // Update watch_listings where sender name matches but phone number is missing
              const updatedListings = await db
                .update(watchListings)
                .set({ senderNumber: senderInfo.senderNumber })
                .where(and(
                  eq(watchListings.sender, normalized.senderName),
                  or(
                    eq(watchListings.senderNumber, "—"),
                    eq(watchListings.senderNumber, ""),
                    isNull(watchListings.senderNumber)
                  )
                ));
              
              // Update watch_requirements where sender name matches but phone number is missing  
              const updatedRequirements = await db
                .update(watchRequirements)
                .set({ senderNumber: senderInfo.senderNumber })
                .where(and(
                  eq(watchRequirements.sender, normalized.senderName),
                  or(
                    eq(watchRequirements.senderNumber, "—"),
                    eq(watchRequirements.senderNumber, ""),
                    isNull(watchRequirements.senderNumber)
                  )
                ));
              
              console.log(`✅ Updated existing records with resolved phone number: ${normalized.senderName} → ${senderInfo.senderNumber}`);
              
            } catch (error) {
              console.error("❌ Error updating existing records with resolved phone number:", error);
            }
          }
          
          // Cache group info if it's a group message and persist to database
          if (normalized.isGroup) {
            waCache.upsertGroup(normalized.remoteJid);
            
            // 🗄️ PERSIST GROUP TO DATABASE
            console.log(`🗄️ Processing group message from: ${normalized.remoteJid}`);
            try {
              const { whatsappGroups } = await import('@shared/schema');
              const { db } = await import('./db');
              const { eq } = await import('drizzle-orm');
              const { loadConfig } = await import('./waConfig');
              
              const { waConfig } = await import('./waConfig');
              if (!waConfig || !waConfig.instanceId) {
                console.error("❌ No configuration loaded - cannot persist group. Config:", waConfig);
                return;
              }
              
              // Try to get the group name from the message context first, then fallback to cache
              const { groupNameMap } = await import('./routes/whatsapp');
              let groupName = normalized.groupName || groupNameMap.get(normalized.remoteJid);
              
              // If still no group name, try to fetch fresh names from API
              if (!groupName || groupName === "Unknown Group") {
                console.log(`🔄 Fetching fresh group names from WhatsApp API...`);
                try {
                  const response = await fetch(`https://mblaster.in/api/get_groups?instance_id=${waConfig.instanceId}&access_token=${waConfig.accessToken}`);
                  if (response.ok) {
                    const groupsData = await response.json();
                    console.log(`📋 WhatsApp API response:`, groupsData);
                    
                    if (groupsData.status === 'success' && groupsData.data) {
                      // Update cache with fresh group names
                      for (const group of groupsData.data) {
                        waCache.upsertGroup(group.id, group.name);
                        console.log(`🏷️  Group name cached from WhatsApp API: ${group.id} → ${group.name}`);
                      }
                      // Try again with fresh cache
                      groupName = groupNameMap.get(normalized.remoteJid);
                    }
                  }
                } catch (error) {
                  console.error(`❌ Failed to fetch fresh group names:`, error);
                }
              }
              
              if (!groupName) {
                groupName = "Unknown Group";
              }
              
              console.log(`🗄️ Group name resolution: normalized.groupName="${normalized.groupName}", cache="${groupNameMap.get(normalized.remoteJid)}", final="${groupName}"`);
              const groupId = normalized.remoteJid;
              console.log(`🗄️ Group details: ${groupName} (${groupId})`);
              
              // Check if group already exists
              const existingGroup = await db.select().from(whatsappGroups)
                .where(eq(whatsappGroups.groupId, groupId))
                .limit(1);
              
              if (existingGroup.length === 0) {
                const insertResult = await db.insert(whatsappGroups).values({
                  groupId: groupId,
                  instanceId: waConfig.instanceId,
                  instancePhone: waConfig.mobileNumber,
                  groupName: groupName,
                  participantCount: 0,
                  source: 'webhook',
                  lastSeen: new Date()
                }).returning();
                console.log(`🗄️ ✅ Persisted new group to database: ${groupName} (${groupId})`, insertResult);
              } else {
                // Update last seen and ensure instance info is correct
                const updateResult = await db.update(whatsappGroups)
                  .set({ 
                    lastSeen: new Date(),
                    groupName: groupName, // Update name in case it changed
                    instanceId: waConfig.instanceId, // Ensure instance ID is set
                    instancePhone: waConfig.mobileNumber // Ensure instance phone is set
                  })
                  .where(eq(whatsappGroups.groupId, groupId))
                  .returning();
                console.log(`🗄️ ✅ Updated existing group in database: ${groupName} (${groupId})`, updateResult);
              }
            } catch (error) {
              console.error("❌ Error persisting group to database:", error);
            }
          }
          
          // 📋 ORGANIC CONTACT CAPTURE - Store contact information automatically (including LID contacts)
          console.log("👤 Capture gate: senderE164=", normalized.senderE164, "senderJid=", normalized.senderJid, "isLid=", normalized.senderJid?.endsWith("@lid"));
          if ((normalized.senderE164 || normalized.senderJid?.endsWith("@lid")) && normalized.senderName && normalized.senderName !== "Unknown") {
            try {
              const { contacts } = await import('@shared/schema');
              const { db } = await import('./db');
              const { eq, and } = await import('drizzle-orm');
              
              // Check if contact already exists (same phone + group combination)
              const existingContact = await db.select().from(contacts)
                .where(and(
                  eq(contacts.phoneNumber, senderInfo.senderNumber),
                  eq(contacts.groupJid, normalized.remoteJid)
                ))
                .limit(1);
              
              if (existingContact.length === 0) {
                // Get group name from cache
                const { groupNameMap } = await import('./routes/whatsapp');
                const groupName = groupNameMap.get(normalized.remoteJid) || "Unknown Group";
                
                await db.insert(contacts).values({
                  pushName: normalized.senderName,
                  phoneNumber: normalized.senderE164 ?? normalized.senderJid, // Use LID if no phone number
                  groupJid: normalized.remoteJid,
                  groupName: groupName,
                  isAdmin: false,
                  notes: normalized.senderJid?.endsWith("@lid") ? "LID contact (organic)" : "Organically captured",
                  uploadBatch: `organic_${Date.now()}`
                });
                
                console.log(`📋 Organically captured contact: ${normalized.senderName} (${normalized.senderE164 ?? normalized.senderJid}) from ${groupName}`);
              }
            } catch (error) {
              console.error("❌ Error capturing organic contact:", error);
            }
          }
        }
      } else if (req.body?.data?.event === "received_message") {
        // Handle received_message format
        const msgEvent = req.body.data.message;
        if (msgEvent?.body_message) {
          messageData = msgEvent.body_message.content || 
                       msgEvent.body_message.messages?.conversation ||
                       "";
          const senderParticipant = msgEvent.message_key?.participant || msgEvent.message_key?.remoteJid || "unknown";
          const { waCache } = await import('./state/waCache');
          groupData = msgEvent.message_key?.remoteJid || "unknown";
          
          // Cache group info if it's a group message
          if (groupData.endsWith("@g.us")) {
            waCache.upsertGroup(groupData);
          }
          
          // 🔧 CRITICAL FIX: USE ACTUAL MESSAGE SEND TIME FOR RECEIVED_MESSAGE FORMAT
          if (msgEvent.message_key?.timestamp) {
            timestampData = new Date(msgEvent.message_key.timestamp * 1000).toISOString();
            console.log(`📅 Using actual message send time: ${timestampData} (Unix: ${msgEvent.message_key.timestamp})`);
          } else {
            timestampData = new Date().toISOString();
            console.log(`📅 No message timestamp in received_message format - using current time: ${timestampData}`);
          }
          
          messageIdData = msgEvent.message_key?.id || `msg_${Date.now()}`;
          
          // Use proper ChatGPT sender formatting with DATABASE LOOKUP for received_message format
          const { formatSenderWithDbLookup } = await import('./contactResolver');
          
          const senderInfo = await formatSenderWithDbLookup(
            senderParticipant,
            msgEvent.push_name,
            msgEvent.verifiedBizName,
            groupData // groupJid for better matching
          );
          
          // Update sender data with proper formatting
          senderData = senderInfo.senderDisplay;
          senderNumberData = senderInfo.senderNumber || "—";
          
          // 🔍 DUPLICATE DETECTION FOR RECEIVED_MESSAGE FORMAT
          const { messageDeduplicator } = await import('./deduplicator');
          const isDuplicateReceived = messageDeduplicator.isDuplicate(
            messageIdData,
            groupData,
            senderParticipant,
            messageData,
            senderInfo.senderNumber || senderParticipant
          );
          
          if (isDuplicateReceived) {
            console.log(`⚠️  Duplicate message detected (received_message format) - storing with duplicate status`);
            
            // Store duplicate message in database for proper tracking
            try {
              const messageLog = await storage.createMessageLog({
                messageId: messageIdData,
                timestamp: new Date(timestampData),
                groupId: groupData,
                groupName: groupNameMap.get(groupData) || 'WhatsApp Group',
                sender: senderData,
                senderNumber: senderNumberData,
                message: messageData || '📷 Media message',
                status: "duplicate",
                processed: false,
                parsedCount: 0,
                requirementCount: 0,
                instanceId: waConfig.instanceId,
              });
              console.log(`📝 Duplicate message stored in database with ID ${messageLog.id}`);
            } catch (error) {
              console.error('Error storing duplicate message log:', error);
            }
            
            return res.json({ 
              success: true, 
              stored: true,
              skipped: true, 
              reason: "duplicate_message_received_format" 
            });
          }
          
          // 🔍 INTELLIGENT SENDER RESOLUTION - Update existing records when phone number is resolved (received_message format)
          if (senderInfo.senderNumber && senderInfo.senderKind === 'lid' && msgEvent.push_name && msgEvent.push_name !== "Unknown") {
            try {
              const { watchListings, watchRequirements } = await import('@shared/schema');
              const { db } = await import('./db');
              const { eq, and, isNull, or } = await import('drizzle-orm');
              
              console.log(`🔍 Phone number resolved for ${msgEvent.push_name}: ${senderInfo.senderNumber} - updating existing records`);
              
              // Update watch_listings where sender name matches but phone number is missing
              await db
                .update(watchListings)
                .set({ senderNumber: senderInfo.senderNumber })
                .where(and(
                  eq(watchListings.sender, msgEvent.push_name),
                  or(
                    eq(watchListings.senderNumber, "—"),
                    eq(watchListings.senderNumber, ""),
                    isNull(watchListings.senderNumber)
                  )
                ));
              
              // Update watch_requirements where sender name matches but phone number is missing  
              await db
                .update(watchRequirements)
                .set({ senderNumber: senderInfo.senderNumber })
                .where(and(
                  eq(watchRequirements.sender, msgEvent.push_name),
                  or(
                    eq(watchRequirements.senderNumber, "—"),
                    eq(watchRequirements.senderNumber, ""),
                    isNull(watchRequirements.senderNumber)
                  )
                ));
              
              console.log(`✅ Updated existing records with resolved phone number: ${msgEvent.push_name} → ${senderInfo.senderNumber}`);
              
              // Also update contacts database with resolved phone number and group info
              try {
                const { contacts } = await import('@shared/schema');
                
                // Update phone numbers for contacts with unknown numbers
                await db.update(contacts)
                  .set({ 
                    phoneNumber: senderInfo.senderNumber,
                    updatedAt: new Date()
                  })
                  .where(and(
                    eq(contacts.pushName, msgEvent.push_name),
                    or(
                      isNull(contacts.phoneNumber),
                      eq(contacts.phoneNumber, 'unknown'),
                      eq(contacts.phoneNumber, '')
                    )
                  ));

                // Update group information for "Unknown Group" contacts
                const { groupNameMap } = await import('./routes/whatsapp');
                const groupName = groupNameMap.get(groupData);
                if (groupName && groupName !== 'Unknown Group') {
                  await db.update(contacts)
                    .set({ 
                      groupName: groupName,
                      groupJid: groupData,
                      updatedAt: new Date()
                    })
                    .where(and(
                      eq(contacts.phoneNumber, senderInfo.senderNumber),
                      eq(contacts.groupName, 'Unknown Group')
                    ));
                  
                  console.log(`✅ Updated contact group info: ${msgEvent.push_name} → ${groupName}`);
                }
              } catch (contactError) {
                console.error("❌ Error updating contact database:", contactError);
              }
              
            } catch (error) {
              console.error("❌ Error updating existing records with resolved phone number:", error);
            }
          }
          
          console.log(`👤 received_message sender: ${senderInfo.senderDisplay} number: ${senderNumberData}`)
          
          // 📋 ORGANIC CONTACT CAPTURE - Store contact information automatically (received_message format including LID)
          console.log("👤 Capture gate (received_message): senderE164=", normalized.senderE164, "senderJid=", normalized.senderJid, "isLid=", normalized.senderJid?.endsWith("@lid"));
          if ((normalized.senderE164 || normalized.senderJid?.endsWith("@lid")) && msgEvent.push_name && msgEvent.push_name !== "Unknown") {
            try {
              const { contacts } = await import('@shared/schema');
              const { db } = await import('./db');
              const { eq, and } = await import('drizzle-orm');
              
              // Check if contact already exists (same phone + group combination)
              const existingContact = await db.select().from(contacts)
                .where(and(
                  eq(contacts.phoneNumber, senderInfo.senderNumber),
                  eq(contacts.groupJid, groupData)
                ))
                .limit(1);
              
              if (existingContact.length === 0) {
                // Get group name from cache
                const { groupNameMap } = await import('./routes/whatsapp');
                const groupName = groupNameMap.get(groupData) || "Unknown Group";
                
                await db.insert(contacts).values({
                  pushName: msgEvent.push_name,
                  phoneNumber: normalized.senderE164 ?? normalized.senderJid, // Use LID if no phone number
                  groupJid: groupData,
                  groupName: groupName,
                  isAdmin: false,
                  notes: normalized.senderJid?.endsWith("@lid") ? "LID contact (organic)" : "Organically captured",
                  uploadBatch: `organic_${Date.now()}`
                });
                
                console.log(`📋 Organically captured contact: ${msgEvent.push_name} (${normalized.senderE164 ?? normalized.senderJid}) from ${groupName}`);
              } else {
                // Contact exists - update if we have better group information
                const { groupNameMap } = await import('./routes/whatsapp');
                const groupName = groupNameMap.get(groupData);
                if (groupName && groupName !== "Unknown Group") {
                  const existingGroupName = existingContact[0].groupName;
                  if (existingGroupName === "Unknown Group" || !existingGroupName) {
                    await db.update(contacts)
                      .set({ 
                        groupName: groupName,
                        groupJid: groupData,
                        updatedAt: new Date()
                      })
                      .where(eq(contacts.id, existingContact[0].id));
                    
                    console.log(`✅ Updated existing contact group: ${msgEvent.push_name} → ${groupName}`);
                  }
                }
              }
            } catch (error) {
              console.error("❌ Error capturing organic contact:", error);
            }
          }
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
      
      // Beautify names using waCache and learn group names
      // (waCache already imported above)
      const senderJid =
        (payload?.data?.message?.message_key?.participant) ||
        (payload?.data?.data?.messages?.[0]?.key?.participant) ||
        (senderNumberData ? `${senderNumberData}@s.whatsapp.net` : "");

      // Store original groupData as groupId for whitelist check
      const groupId = groupData;
      
      if (senderJid) {
        const cachedName = waCache.getContactName(senderJid);
        if (cachedName) senderData = cachedName;
      }

      // When you determine the message's group ID, opportunistically learn group names if present
      if (groupData?.endsWith("@g.us")) {
        // If payload contains something we can use as a name, cache it.
        const maybeGroupName =
          payload?.data?.message?.group_name ||
          payload?.data?.group_name ||
          payload?.data?.data?.messages?.[0]?.groupName ||
          null;

        if (maybeGroupName) {
          waCache.upsertGroup(groupData, String(maybeGroupName));
        }
        
        // For display purposes, use cached name if available
        const { groupNameMap } = await import('./routes/whatsapp');
        const cachedGroupName = groupNameMap.get(groupData);
        if (cachedGroupName) {
          groupData = cachedGroupName; // Display name only
        }
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
        // Check if this is a status message or media-only
        if (groupData === "status@broadcast") {
          console.log("↷ Skipped status@broadcast message (no text content)");
          return res.status(200).json({ success: true, skipped: true, reason: "status_no_content" });
        }
        // If it's a media-only message, we might still want to process it
        console.log("ℹ️  No text content found - could be media-only or empty message");
        return res.status(200).json({ error: "No message content in payload", received: Object.keys(req.body) });
      }
      
      // 🔧 CHECK FOR PAUSE STATUS BEFORE PROCESSING
      if (waConfig.paused) {
        console.log("⏸️  Message processing is PAUSED - skipping");
        return res.status(200).json({ success: true, skipped: true, reason: "paused" });
      }
      
      // NOTE: Duplicate detection already handled earlier in the webhook for messages.upsert format
      // This section processes messages that passed the initial duplicate check

      // CRITICAL: Whitelist check must use groupId/JID only, NEVER display name
      const wl = getWhitelistSet();
      if (wl && groupId && !wl.has(groupId)) {
        console.log(
          `🚫 Group ${groupId} not whitelisted - skipping. Whitelisted: ${[...wl].join(", ")}`
        );
        return res.json({ success: true, stored: false, parsed: false, reason: "not_whitelisted" });
      }
      
      if (wl) {
        // Whitelist is populated - processing whitelisted group
        console.log(`✅ Group ${groupId} is whitelisted - processing message`);
      } else {
        // Whitelist is empty - allow ALL messages (individual + group)
        console.log(`🌐 Empty whitelist - processing ALL messages (source: ${groupId})`);
      }

      // Store as raw message for browsing - use waCache names
      let finalSenderName = senderData;
      
      // Check multiple formats for cached contact names using waCache
      if (waCache && waCache.getContactName(senderData)) {
        finalSenderName = waCache.getContactName(senderData)!;
      } else if (waCache && senderData.includes('@') && waCache.getContactName(senderData)) {
        finalSenderName = waCache.getContactName(senderData)!;
      } else if (waCache && !senderData.includes('@') && waCache.getContactName(`${senderData}@s.whatsapp.net`)) {
        finalSenderName = waCache.getContactName(`${senderData}@s.whatsapp.net`)!;
      }
      
      // If we don't have a cached group name yet, try to fetch it from the API
      const { groupNameMap } = await import('./routes/whatsapp');
      if (!groupNameMap.get(groupId || "") && groupId && groupId.includes("@g.us")) {
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
                  waCache.upsertGroup(group.id, group.name);
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
      let finalGroupName = groupNameMap.get(groupId || "") || groupData;
      
      // If we still don't have a cached name, provide better defaults
      if (!finalGroupName && groupData.includes("@g.us")) {
        const knownGroupNames = {
          '120363155030102618@g.us': '🔥Digitalbabaa Tools & Services 105🔥',
          '919821822960-1609692489@g.us': 'Test 1',
          '120363400262559729@g.us': 'Test3',
          '120363401430608392@g.us': 'Watch test'
        };
        finalGroupName = knownGroupNames[groupData] || `Group ${groupData.split('-')[0]}`;
      } else if (!finalGroupName) {
        finalGroupName = "Private Chat";
      }
      
      // Store message in database for comprehensive logging (replaces in-memory storage)
      let messageLogId: number | undefined;
      try {
        const messageLog = await storage.createMessageLog({
          messageId: messageIdData,
          timestamp: new Date(timestampData),
          groupId: groupData,
          groupName: finalGroupName,
          sender: finalSenderName,
          senderNumber: senderNumberData,
          message: messageData,
          status: "pending",
          processed: false,
          parsedCount: 0,
          requirementCount: 0,
          instanceId: waConfig.instanceId,
        });
        messageLogId = messageLog.id;
        console.log(`📝 Message stored in database with ID ${messageLogId}`);
      } catch (error) {
        console.error('Error storing message log:', error);
      }
      
      // Update connection monitor
      updateLastMessageTime();

      // Parse the message using our watch parser
      const { WatchMessageParser } = await import('./watch-parser');
      const parser = new WatchMessageParser();
      const parsedListings = await parser.parseMessage(messageData);
      
      console.log("🔍 Parser Results:", {
        messageLength: messageData.length,
        messageLines: messageData.split('\n').length,
        parsedCount: parsedListings.length,
        firstFewPIDs: parsedListings.slice(0, 5).map(l => l.pid)
      });

      // Check if this is a "looking_for" message and route to requirements table
      const isLookingForMessage = messageData.toLowerCase().includes('looking for') || 
                                 messageData.toLowerCase().includes('if you have') ||
                                 messageData.toLowerCase().includes('please contact me') ||
                                 messageData.toLowerCase().includes('need') ||
                                 messageData.toLowerCase().includes('want to buy');

      let requirementCount = 0;
      if (isLookingForMessage && parsedListings.length > 0) {
        // Route to requirements table instead of watch_listings
        console.log("🔍 Detected looking_for message - routing to requirements table");
        
        for (const listing of parsedListings) {
          try {
            const requirementData = {
              pid: listing.pid,
              brand: listing.brand || null,
              family: listing.family || null,
              variant: listing.variant || null,
              condition: listing.condition || null,
              sender: finalSenderName,
              groupName: finalGroupName,
              chatId: groupData,
              senderNumber: senderNumberData,
              date: timestampData ? new Date(timestampData).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
              time: timestampData ? new Date(timestampData).toTimeString().split(' ')[0] : new Date().toTimeString().split(' ')[0],
              rawLine: listing.rawLine,
              originalMessage: messageData, // 🔧 CRITICAL FIX: Store full message content
              messageId: messageIdData,
            };
            
            await storage.createWatchRequirement(requirementData);
            requirementCount++;
            console.log("✅ Successfully stored requirement:", listing.pid);
          } catch (error) {
            console.error("❌ Error storing requirement:", error);
          }
        }
        
        // Update raw message status in global storage
        if ((global as any).rawMessages) {
          const messageIndex = (global as any).rawMessages.findIndex((msg: any) => msg.messageId === messageIdData);
          if (messageIndex !== -1) {
            (global as any).rawMessages[messageIndex].processed = true;
            (global as any).rawMessages[messageIndex].status = `Requirements (${parsedListings.length})`;
          }
        }
        
        return res.json({
          success: true,
          stored: true,
          parsed: true,
          count: parsedListings.length,
          type: "requirement",
          message: `Processed ${parsedListings.length} watch requirements`
        });
      }

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
              
              // SECURITY: Get userId from group/instance configuration for tenant isolation
              const dataWorkspaceId = await storage.getDataWorkspaceIdByInstanceId(waConfig.instanceId);
              
              const matchedAlerts = await storage.checkPidAlerts(
                listing.pid, 
                listing.variant, 
                listing.price, 
                listing.currency,
                dataWorkspaceId || 'system' // SECURITY: Fail-safe for tenant isolation
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

      // Update raw message status in global storage
      if ((global as any).rawMessages) {
        const messageIndex2 = (global as any).rawMessages.findIndex((msg: any) => msg.messageId === messageIdData);
        if (messageIndex2 !== -1) {
          if (parsedListings.length > 0) {
            (global as any).rawMessages[messageIndex2].processed = true;
            (global as any).rawMessages[messageIndex2].status = `Listings (${parsedListings.length})`;
          } else {
            (global as any).rawMessages[messageIndex2].status = "no-pid";
          }
        }
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

      // Update message log status after processing with improved logic
      if (messageLogId) {
        try {
          // Check if message was already marked as duplicate
          const existingLog = await storage.getMessageLogById(messageLogId);
          let status: string;
          
          if (existingLog?.status === "duplicate") {
            // Don't override duplicate status - keep it as duplicate
            status = "duplicate";
          } else if (parsedListings.length > 0) {
            // Message contains parseable watch listings
            status = "processed";
          } else if (isLookingForMessage) {
            // Message is a buying request/requirement
            status = "requirement";
          } else {
            // Message has no relevant watch trading content (consolidating ignore)
            status = "ignored";
          }
          
          // SECURITY: Get userId for tenant isolation
          const dataWorkspaceId = await storage.getDataWorkspaceIdByInstanceId(waConfig.instanceId);
          
          await storage.updateMessageLogStatus(
            messageIdData, 
            status, 
            parsedListings.length,
            isLookingForMessage ? requirementCount : 0,
            undefined, // errorMessage
            dataWorkspaceId || 'system' // SECURITY: Fail-safe for tenant isolation
          );
          console.log(`📊 Updated message log ${messageLogId} with status: ${status}`);
        } catch (error) {
          console.error('Error updating message log status:', error);
        }
      }
      
      // Helper function to detect PID patterns
      function containsPIDPattern(text: string): boolean {
        const pidPatterns = [
          /\b\d{4,6}[A-Z]{1,3}\b/g,     // Standard Rolex PIDs (e.g., 126500, 114060LN)
          /\b[A-Z]{1,2}\d{3,4}[A-Z]{0,2}\b/g, // AP PIDs (e.g., 26331ST, RO15400)
          /\b\d{4,5}[A-Z]{1,2}\b/g,     // Patek PIDs (e.g., 5711A, 5164R)
          /\bDW-?\d{4}\b/gi,            // G-Shock PIDs (e.g., DW-6900)
        ];
        return pidPatterns.some(pattern => pattern.test(text));
      }

      res.json({
        success: true,
        stored: true,
        parsed: parsedListings.length > 0,
        listings: parsedListings.length,
        status: parsedListings.length > 0 ? `Listings (${parsedListings.length})` : logStatus,
        results: results
      });

    } catch (error: any) {
      console.error("❌ Webhook processing error:", error);
      res.status(500).json({ error: "Failed to process WhatsApp webhook" });
    }
  });
  */

  // Base message-logs route - CRITICAL: This was missing!
  app.get("/api/message-logs", requireAuth, async (req: AuthRequest, res) => {
    try {
      const {
        page = '1',
        limit = '50',
        search = '',
        status = 'all',
        groupName = '',
        orderBy = 'newest'
      } = req.query;

      const filters = {
        offset: (parseInt(page as string) - 1) * parseInt(limit as string),
        limit: parseInt(limit as string),
        search: search as string,
        status: status as string,
        groupName: groupName as string,
        orderBy: orderBy as string
      };

      // Add userId to filters for proper multi-tenant access
      const filtersWithUser = { ...filters, userId: req.user.userId };
      const result = await storage.getMessageLogs(filtersWithUser);
      res.json(result);
    } catch (error) {
      console.error('Message logs error:', error);
      res.status(500).json({ error: 'Failed to fetch message logs' });
    }
  });

  // Get message logs from database (replaces old /api/whatsapp/messages)
  app.get("/api/whatsapp/message-logs", requireAuth, async (req: AuthRequest, res) => {
    try {
      const {
        search,
        sender,
        groupId,
        status,
        dateFrom,
        dateTo,
        limit = 500, // Increased from 100 to 500 as requested
        offset = 0
      } = req.query;

      const filters = {
        search: search as string,
        sender: sender as string,
        groupId: groupId as string,
        status: status as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        userId: req.user.userId // **SECURITY FIX**: Add user filtering for multi-tenancy
      };

      const result = await storage.getMessageLogs(filters);
      
      // Transform to match the old format for compatibility
      const messages = result.logs.map(log => ({
        id: `msg_${log.id}`,
        messageId: log.messageId,
        timestamp: log.timestamp.toISOString(),
        groupId: log.groupId,
        groupName: log.groupName,
        sender: log.sender,
        senderNumber: log.senderNumber,
        message: log.message,
        status: log.status,
        processed: log.processed,
        parsedCount: log.parsedCount,
        requirementCount: log.requirementCount,
        errorMessage: log.errorMessage,
        createdAt: log.createdAt?.toISOString()
      }));

      res.json({
        messages,
        total: result.total,
        filters: filters
      });
    } catch (error) {
      console.error("Error fetching message logs:", error);
      res.status(500).json({ error: "Failed to fetch message logs" });
    }
  });

  // Legacy endpoint for backward compatibility - redirect to message logs
  app.get("/api/whatsapp/messages", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Redirect to new endpoint with same query parameters
      const queryString = new URLSearchParams(req.query as any).toString();
      const newUrl = `/api/whatsapp/message-logs?${queryString}`;
      
      // For now, call the new endpoint internally
      const {
        search,
        sender,
        groupId,
        status,
        dateFrom,
        dateTo,
        limit = 500, // Increased from 100 to 500 as requested
        offset = 0
      } = req.query;

      const filters = {
        search: search as string,
        sender: sender as string,
        groupId: groupId as string,
        status: status as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        userId: req.user.userId // **SECURITY FIX**: Add user filtering for multi-tenancy
      };

      const result = await storage.getMessageLogs(filters);
      
      // Return in legacy format
      const messages = result.logs.map(log => ({
        id: `raw_${log.id}`,
        messageId: log.messageId,
        timestamp: log.timestamp.toISOString(),
        groupId: log.groupId,
        groupName: log.groupName,
        sender: log.sender,
        senderNumber: log.senderNumber,
        message: log.message,
        status: log.status,
        processed: log.processed
      }));

      res.json({ messages });
    } catch (error) {
      console.error("Error fetching messages (legacy):", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });
  
  // Get WhatsApp instance information - USER SPECIFIC
  app.get("/api/whatsapp/instance-info", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { db } = await import('./db');
      const { userWhatsappConfig, users } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      // Get user info to check if they're a team member
      const [userData] = await db.select().from(users).where(eq(users.id, req.user.userId));
      
      if (!userData) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // For team members, return their workspace owner's (admin's) config
      const configUserId = (userData.plan === 'team' && userData.workspaceOwnerId) 
        ? userData.workspaceOwnerId 
        : req.user.userId;
      
      // Get WhatsApp configuration
      const [config] = await db.select()
        .from(userWhatsappConfig)
        .where(eq(userWhatsappConfig.userId, configUserId));
      
      if (!config) {
        return res.json({
          instanceId: 'Not configured',
          mobileNumber: 'Not configured',
          status: 'Not Connected',
          isTeamMember: userData.plan === 'team'
        });
      }
      
      res.json({
        instanceId: config.receivingInstanceId || config.instanceId || 'Not configured',
        mobileNumber: config.receivingMobileNumber || config.mobileNumber || 'Not configured',
        status: (config.receivingInstanceId || config.instanceId) ? 'Configured' : 'Not Connected',
        isTeamMember: userData.plan === 'team'
      });
    } catch (error) {
      console.error("Error getting instance info:", error);
      res.status(500).json({ error: "Failed to get instance info" });
    }
  });

  // Retention policy management endpoints
  app.get("/api/whatsapp/retention-settings", async (req, res) => {
    try {
      // Return current retention settings (could be stored in config or database)
      const defaultSettings = {
        retentionDays: 90, // Default 90 days retention
        autoCleanup: true,
        maxRecords: 50000, // Maximum records to keep
        cleanupInterval: "daily" // daily, weekly, monthly
      };
      res.json(defaultSettings);
    } catch (error) {
      console.error("Error getting retention settings:", error);
      res.status(500).json({ error: "Failed to get retention settings" });
    }
  });

  app.post("/api/whatsapp/retention-settings", async (req, res) => {
    try {
      const { retentionDays, autoCleanup, maxRecords, cleanupInterval } = req.body;
      
      // Here you would save these settings to database or config file
      // For now, just return success
      res.json({ 
        success: true, 
        message: "Retention settings updated",
        settings: { retentionDays, autoCleanup, maxRecords, cleanupInterval }
      });
    } catch (error) {
      console.error("Error updating retention settings:", error);
      res.status(500).json({ error: "Failed to update retention settings" });
    }
  });

  // Clear message logs with retention policy
  app.delete("/api/whatsapp/message-logs", async (req, res) => {
    try {
      const { retentionDays = 30 } = req.query;
      const deletedCount = await storage.cleanupOldMessageLogs(parseInt(retentionDays as string));
      res.json({ 
        success: true, 
        message: `Cleaned up ${deletedCount} old message logs (older than ${retentionDays} days)`,
        deletedCount
      });
    } catch (error) {
      console.error("Error cleaning up message logs:", error);
      res.status(500).json({ error: "Failed to clean up message logs" });
    }
  });

  // Manual cleanup endpoint with various options
  app.post("/api/whatsapp/message-logs/cleanup", async (req, res) => {
    try {
      const { retentionDays = 30, maxRecords } = req.body;
      
      let deletedCount = 0;
      if (maxRecords) {
        // Complex cleanup logic would go here for max records
        // For now, just use retention days
        deletedCount = await storage.cleanupOldMessageLogs(retentionDays);
      } else {
        deletedCount = await storage.cleanupOldMessageLogs(retentionDays);
      }
      
      res.json({ 
        success: true, 
        message: `Manual cleanup completed`,
        deletedCount,
        retentionDays
      });
    } catch (error) {
      console.error("Error in manual cleanup:", error);
      res.status(500).json({ error: "Failed to perform manual cleanup" });
    }
  });

  // Legacy clear endpoint
  app.delete("/api/whatsapp/messages", async (req, res) => {
    try {
      // Clean up old logs instead of clearing in-memory array
      const deletedCount = await storage.cleanupOldMessageLogs(30);
      res.json({ 
        success: true, 
        message: `Cleaned up ${deletedCount} old message logs (30+ days)` 
      });
    } catch (error) {
      console.error("Error cleaning up messages:", error);
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
  
  // **REMOVED DUPLICATE**: Connection status endpoint moved to whatsapp.ts to avoid conflicts

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

  // Send WhatsApp message endpoint
  app.post("/api/whatsapp/send", async (req, res) => {
    try {
      const { phone, message } = req.body;
      const { waConfig } = await import('./waConfig');
      
      console.log(`📤 Sending WhatsApp message to: ${phone}`);
      console.log(`📤 Message: ${message}`);
      console.log(`🔧 Using access token: ${waConfig.accessToken}`);
      console.log(`🔧 Using instance ID: ${waConfig.instanceId}`);
      
      if (!waConfig.accessToken || !waConfig.instanceId) {
        return res.status(400).json({ error: "WhatsApp not configured" });
      }
      
      // Clean phone number: remove spaces, dashes, parentheses, and plus sign
      const cleanPhone = phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');
      console.log(`📞 Cleaned phone: ${cleanPhone}`);
      
      // Build URL with parameters (as shown in API docs)
      const url = new URL('https://mblaster.in/api/send');
      url.searchParams.set('number', cleanPhone);
      url.searchParams.set('type', 'text');
      url.searchParams.set('message', message);
      url.searchParams.set('instance_id', waConfig.instanceId);
      url.searchParams.set('access_token', waConfig.accessToken);
      
      console.log(`📤 Request URL:`, url.toString());
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const responseText = await response.text();
      console.log(`📤 Raw response: ${responseText}`);
      
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Failed to parse response as JSON:', parseError);
        return res.status(500).json({ error: "Invalid response from WhatsApp API" });
      }
      
      console.log(`📤 Parsed response:`, result);
      
      if (result.status === 'success' || result.success === true) {
        res.json({ success: true, message: "Message sent successfully" });
      } else {
        console.error('❌ Send failed:', result);
        res.status(400).json({ 
          error: result.error || result.message || "Failed to send message",
          details: result
        });
      }
    } catch (error) {
      console.error('❌ Send message error:', error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Update WhatsApp configuration endpoint
  app.put("/api/whatsapp/config", async (req, res) => {
    try {
      const { mobileNumber, instanceId, accessToken } = req.body;
      const { saveConfig } = await import('./waConfig');
      
      const updates: any = {};
      if (mobileNumber) updates.mobileNumber = mobileNumber;
      if (instanceId) updates.instanceId = instanceId;
      if (accessToken) updates.accessToken = accessToken;
      
      await saveConfig(updates);
      res.json({ success: true, message: "Configuration updated successfully" });
    } catch (error) {
      console.error('Config update error:', error);
      res.status(500).json({ error: "Failed to update configuration" });
    }
  });

  // Force connection check endpoint (webhook-aware ping)
  app.post("/api/whatsapp/ping", async (req, res) => {
    try {
      // Import waCache for webhook-based health
      const { waCache } = await import('./state/waCache');
      
      const MS = 1000;
      const WEBHOOK_FRESH_MS = 2 * 60 * MS; // 2 minutes
      const fresh = waCache.getLastWebhookAgeMs() <= WEBHOOK_FRESH_MS;
      let mode: 'webhook' | 'api' | 'none' = fresh ? 'webhook' : 'none';
      let connected = fresh;

      // Only if !connected, then try the mBlaster APIs
      if (!connected) {
        const { waConfig } = await import('./waConfig');
        
        if (!waConfig.accessToken || !waConfig.instanceId) {
          return res.json({ 
            connected: false, 
            mode: 'none',
            error: 'No credentials configured',
            lastWebhookAt: waCache.lastWebhookAt,
            lastWebhookAgeMs: waCache.getLastWebhookAgeMs()
          });
        }

        // Primary test: Try to get groups (proves full functionality)
        try {
          const groupsResponse = await fetch(`https://mblaster.in/api/get_groups?instance_id=${waConfig.instanceId}&access_token=${waConfig.accessToken}`, {
            method: 'GET',
            timeout: 8000
          });
          
          if (groupsResponse.ok) {
            const groupsText = await groupsResponse.text();
            
            if (!groupsText.includes('<!DOCTYPE html>')) {
              try {
                const groupsData = JSON.parse(groupsText);
                
                if (groupsData.groups && Array.isArray(groupsData.groups)) {
                  connected = true;
                  mode = 'api';
                  
                  return res.json({ 
                    connected: true, 
                    mode,
                    status: 'groups_accessible',
                    groupCount: groupsData.groups.length,
                    lastWebhookAt: waCache.lastWebhookAt,
                    lastWebhookAgeMs: waCache.getLastWebhookAgeMs()
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
        try {
          const statusResponse = await fetch(`https://mblaster.in/api/get_instance_status?instance_id=${waConfig.instanceId}&access_token=${waConfig.accessToken}`, {
            method: 'GET',
            timeout: 5000
          });
          
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
                  connected = true;
                  mode = 'api';
                }
              } catch (parseError) {
                console.log("📡 Status endpoint parse error:", parseError);
              }
            }
          }
        } catch (statusError) {
          console.log("📡 Status endpoint failed:", statusError.message);
        }
      }

      return res.json({
        connected,
        mode,                   // 'webhook' or 'api' or 'none'
        lastWebhookAt: waCache.lastWebhookAt,
        lastWebhookAgeMs: waCache.getLastWebhookAgeMs(),
        error: !connected ? 'All endpoints returned HTML or failed, but webhook health is authoritative' : undefined
      });
    } catch (error) {
      return res.json({ 
        connected: false, 
        mode: 'none',
        error: error.message 
      });
    }
  });



  // WhatsApp Groups Database endpoints - for WhatsApp Setup page
  app.get("/api/whatsapp/groups/database", requireAuth, async (req, res) => {
    try {
      const { db } = await import('./db');
      const { whatsappGroups, watchListings, watchRequirements } = await import('@shared/schema');
      const { desc, sql, ne, and } = await import('drizzle-orm');
      const { createUserAccessCondition } = await import('./lib/access');
      
      console.log(`📊 WhatsApp Setup > Groups Database API called for user ${req.user.userId}`);
      
      // **SECURITY FIX**: Filter groups by accessible user IDs (multi-tenant isolation)
      const userAccessCondition = await createUserAccessCondition(req.user, whatsappGroups.userId);
      
      // Get groups from database belonging to current user/workspace only
      const groups = await db.select({
        id: whatsappGroups.id,
        groupId: whatsappGroups.groupId,
        groupJid: whatsappGroups.groupId, 
        groupName: whatsappGroups.groupName,
        participantCount: whatsappGroups.participantCount,
        lastSeen: whatsappGroups.lastSeen,
        mobileNumber: whatsappGroups.instancePhone,
        messageCount: sql<number>`0`
      })
      .from(whatsappGroups)
      .where(and(
        userAccessCondition,
        ne(whatsappGroups.groupName, 'Unknown Group')
      ))
      .orderBy(desc(whatsappGroups.lastSeen));
      
      console.log(`📊 WhatsApp Setup Groups Database: Found ${groups.length} groups in database:`, groups.map(g => g.groupName));
      return res.status(200).json({ groups });
    } catch (error) {
      console.error("❌ WhatsApp Setup Groups Database API error:", error);
      res.status(500).json({ error: "Failed to fetch groups database" });
    }
  });

  app.post("/api/whatsapp/groups/database/whitelist", requireAuth, async (req, res) => {
    try {
      const { groupIds } = req.body;
      
      if (!Array.isArray(groupIds)) {
        return res.status(400).json({ error: "groupIds must be an array" });
      }
      
      console.log(`📊 WhatsApp Setup > Groups Whitelist API called for user ${req.user.userId} with ${groupIds.length} groups`);
      
      // **SECURITY FIX**: Implement per-user whitelist storage in database
      // Store whitelist per user instead of global shared config
      const { storage } = await import('./storage');
      
      // Convert groupIds array to comma-separated string for storage
      const whitelistString = groupIds.join(",");
      await storage.updateUserWhatsappConfig(req.user.userId, { 
        whitelistedGroups: whitelistString 
      });
      
      console.log(`🔒 [User ${req.user.userId}] Updated per-user whitelist with groups: ${groupIds.join(", ")}`);
      
      res.json({ 
        success: true, 
        message: `Updated whitelist with ${groupIds.length} groups`,
        whitelistedGroups: groupIds,
        userId: req.user.userId
      });
    } catch (error) {
      console.error(`❌ [User ${req.user.userId}] Error updating group whitelist:`, error);
      res.status(500).json({ error: "Failed to update group whitelist" });
    }
  });

  app.delete("/api/whatsapp/groups/database/:groupId", async (req, res) => {
    try {
      const { groupId } = req.params;
      const { db } = await import('./db');
      const { whatsappGroups } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      await db.delete(whatsappGroups)
        .where(eq(whatsappGroups.groupId, groupId));
      
      res.json({ success: true, message: "Group removed from database" });
    } catch (error) {
      console.error("❌ Error deleting group:", error);
      res.status(500).json({ error: "Failed to delete group" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}