import { pgTable, text, serial, integer, boolean, timestamp, varchar, decimal, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const watchListings = pgTable("watch_listings", {
  id: serial("id").primaryKey(),
  pid: text("pid"),
  year: text("year"),
  variant: text("variant"),
  condition: text("condition"),
  price: integer("price"),
  chatId: text("chat_id").notNull(),
  groupName: text("group_name"),
  sender: text("sender").notNull(),
  senderNumber: text("sender_number"),
  date: text("date").notNull(),
  time: text("time").notNull(),
  rawLine: text("raw_line"),
  originalMessage: text("original_message"),
  // Additional fields for compatibility
  currency: text("currency"),
  listingIndex: integer("listing_index"),
  totalListings: integer("total_listings"),
  messageId: text("message_id"),
  brand: text("brand"),
  family: text("family"),
  month: text("month"), // N1-N12 month notation
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const processingLogs = pgTable("processing_logs", {
  id: serial("id").primaryKey(),
  messageId: text("message_id"),
  status: text("status").notNull(), // 'success', 'error', 'partial', 'no-pid'
  errorMessage: text("error_message"),
  rawMessage: text("raw_message"),
  parsedData: jsonb("parsed_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const systemStats = pgTable("system_stats", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  messagesProcessed: integer("messages_processed").default(0),
  parsedSuccessful: integer("parsed_successful").default(0),
  parseErrors: integer("parse_errors").default(0),
  uniquePids: integer("unique_pids").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const referenceDatabase = pgTable("reference_database", {
  id: serial("id").primaryKey(),
  pid: text("pid").notNull(),
  brand: text("brand").notNull(),
  family: text("family").notNull(),
  reference: text("reference").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// WhatsApp Groups table for persistent storage
export const whatsappGroups = pgTable("whatsapp_groups", {
  id: serial("id").primaryKey(),
  groupId: text("group_id").notNull(),
  instanceId: text("instance_id").notNull(),
  instancePhone: text("instance_phone"),
  groupName: text("group_name"),
  participantCount: integer("participant_count"),
  source: text("source").notNull(), // 'webhook', 'api', 'manual'
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Unique constraint for group_id + instance_id combination
  groupInstanceUnique: unique().on(table.groupId, table.instanceId),
}));

export const pidAlerts = pgTable("pid_alerts", {
  id: serial("id").primaryKey(),
  pid: text("pid").notNull(),
  variant: text("variant"),
  minPrice: decimal("min_price"),
  maxPrice: decimal("max_price"),
  currency: text("currency").default("USD"),
  notificationPhone: text("notification_phone").notNull(),
  isActive: boolean("is_active").default(true),
  triggeredCount: integer("triggered_count").default(0),
  lastTriggered: timestamp("last_triggered"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Watch Requirements table - for "Looking for" / WTB messages
export const watchRequirements = pgTable("watch_requirements", {
  id: serial("id").primaryKey(),
  pid: text("pid").notNull(),
  variant: text("variant"),
  condition: text("condition"), // "new", "used", "new/used"
  chatId: text("chat_id"),
  groupName: text("group_name"),
  sender: text("sender"),
  senderNumber: text("sender_number"),
  date: text("date"),
  time: text("time"),
  rawLine: text("raw_line"), // Original "Looking for RM72-01 monaco" line
  originalMessage: text("original_message"), // Full message content
  messageId: text("message_id"),
  brand: text("brand"),
  family: text("family"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const watchListingsRelations = relations(watchListings, ({ many }) => ({
  processingLogs: many(processingLogs),
}));

export const processingLogsRelations = relations(processingLogs, ({ one }) => ({
  watchListing: one(watchListings, {
    fields: [processingLogs.messageId],
    references: [watchListings.messageId],
  }),
}));

// Zod schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertWatchListingSchema = createInsertSchema(watchListings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  groupName: z.string().optional(),
});

export const insertProcessingLogSchema = createInsertSchema(processingLogs).omit({
  id: true,
  createdAt: true,
});

export const insertSystemStatsSchema = createInsertSchema(systemStats).omit({
  id: true,
  lastUpdated: true,
});

export const insertReferenceDatabaseSchema = createInsertSchema(referenceDatabase).omit({
  id: true,
  createdAt: true,
});

export const insertWhatsappGroupSchema = createInsertSchema(whatsappGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertWatchListing = z.infer<typeof insertWatchListingSchema>;
export type WatchListing = typeof watchListings.$inferSelect;

export type InsertProcessingLog = z.infer<typeof insertProcessingLogSchema>;
export type ProcessingLog = typeof processingLogs.$inferSelect;

export type InsertSystemStats = z.infer<typeof insertSystemStatsSchema>;
export type SystemStats = typeof systemStats.$inferSelect;

export type InsertReferenceDatabase = z.infer<typeof insertReferenceDatabaseSchema>;
export type ReferenceDatabase = typeof referenceDatabase.$inferSelect;

export type InsertWhatsappGroup = z.infer<typeof insertWhatsappGroupSchema>;
export type WhatsappGroup = typeof whatsappGroups.$inferSelect;

export const insertPidAlertSchema = createInsertSchema(pidAlerts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWatchRequirementSchema = createInsertSchema(watchRequirements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPidAlert = z.infer<typeof insertPidAlertSchema>;
export type PidAlert = typeof pidAlerts.$inferSelect;

export type InsertWatchRequirement = z.infer<typeof insertWatchRequirementSchema>;
export type WatchRequirement = typeof watchRequirements.$inferSelect;

// Search and filter types
export const searchFiltersSchema = z.object({
  pid: z.string().optional(),
  pids: z.union([z.array(z.string()), z.string()]).optional().transform((val) => {
    if (typeof val === 'string') return [val];
    return val;
  }),
  brand: z.string().optional(),
  family: z.string().optional(),
  year: z.string().optional(),
  variant: z.string().optional(),
  condition: z.string().optional(),
  currency: z.string().optional(),
  groupName: z.string().optional(),
  sender: z.string().optional(),
  search: z.string().optional(),
  durationValue: z.union([z.number(), z.string()]).optional().transform((val) => 
    typeof val === 'string' ? (val === '' ? undefined : Number(val)) : val
  ),
  durationUnit: z.enum(['minutes', 'hours', 'days', 'months', 'years']).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.union([z.number(), z.string()]).optional().transform((val) => 
    typeof val === 'string' ? (val === '' ? undefined : Number(val)) : val
  ),
  offset: z.union([z.number(), z.string()]).optional().transform((val) => 
    typeof val === 'string' ? (val === '' ? undefined : Number(val)) : val
  ),
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;
