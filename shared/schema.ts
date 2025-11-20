import { pgTable, text, serial, integer, boolean, timestamp, varchar, decimal, jsonb, unique, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";
import { sql } from "drizzle-orm";

// SaaS Users table with billing and authentication
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // SECURITY: Only store hashed passwords
  plan: text("plan").notNull().default("free"), // 'free', 'pro', 'business', 'team'
  planStatus: text("plan_status").notNull().default("active"), // 'active', 'past_due', 'inactive'
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  usageMessages: integer("usage_messages").notNull().default(0),
  usageStorageMb: integer("usage_storage_mb").notNull().default(0),
  usageWhatsappGroups: integer("usage_whatsapp_groups").notNull().default(0),
  usagePeriodStart: timestamp("usage_period_start").notNull().defaultNow(),
  usagePeriodEnd: timestamp("usage_period_end").notNull().default(sql`NOW() + INTERVAL '30 days'`),
  isAdmin: boolean("is_admin").notNull().default(false),
  useSharedData: boolean("use_shared_data").notNull().default(false), // Whether user can use shared admin instances
  workspaceOwnerId: uuid("workspace_owner_id"), // Points to workspace owner for team members
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// API Keys table for programmatic access  
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull(),
  name: text("name").notNull().default("Default Key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

// User WhatsApp configuration (multi-tenant) - Updated for separate receiving/sending instances
export const userWhatsappConfig = pgTable("user_whatsapp_config", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Receiving instance (for incoming messages) - locked for shared users
  receivingInstanceId: text("receiving_instance_id"),
  receivingAccessToken: text("receiving_access_token"),
  receivingMobileNumber: text("receiving_mobile_number"),
  
  // Sending instance (for outgoing messages) - customizable by shared users
  sendingInstanceId: text("sending_instance_id"),
  sendingAccessToken: text("sending_access_token"),
  sendingMobileNumber: text("sending_mobile_number"),
  
  // Shared configuration
  whitelistedGroups: text("whitelisted_groups"),
  webhookSecret: text("webhook_secret").unique().default(sql`gen_random_uuid()::text`),
  isActive: boolean("is_active").notNull().default(true),
  
  // Legacy fields for backward compatibility (will map to receiving instance)
  instanceId: text("instance_id"),
  accessToken: text("access_token"),
  mobileNumber: text("mobile_number"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userInstanceUnique: unique().on(table.userId, table.receivingInstanceId),
}));

// Subscription plans configuration
export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").unique().notNull(),
  priceId: text("price_id").unique(), // Stripe price ID
  maxMessages: integer("max_messages").notNull(),
  maxStorageMb: integer("max_storage_mb").notNull(),
  maxWhatsappGroups: integer("max_whatsapp_groups").notNull(),
  maxPidAlerts: integer("max_pid_alerts").notNull(),
  features: text("features").array(), // Array of features
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Usage tracking logs
export const usageLogs = pgTable("usage_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  usageType: text("usage_type").notNull(), // 'message', 'storage', 'group', 'alert'
  amount: integer("amount").notNull().default(1),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const watchListings = pgTable("watch_listings", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id), // Data isolation
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
  messageType: text("message_type").default("selling"), // "selling" or "looking_for"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const processingLogs = pgTable("processing_logs", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id), // Data isolation
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

export const pidAlerts = pgTable("pid_alerts", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id), // Data isolation
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

// WhatsApp Groups table for persistent storage
export const whatsappGroups = pgTable("whatsapp_groups", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id), // Data isolation
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

// Message Logs table for all incoming messages with comprehensive tracking
export const messageLogs = pgTable("message_logs", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id), // Data isolation
  messageId: text("message_id").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  groupId: text("group_id"),
  groupName: text("group_name"),
  sender: text("sender").notNull(),
  senderNumber: text("sender_number"),
  message: text("message"),
  status: text("status").notNull(), // 'pending', 'processed', 'duplicate', 'error', 'no-pid', 'requirement'
  processed: boolean("processed").default(false),
  parsedCount: integer("parsed_count").default(0),
  requirementCount: integer("requirement_count").default(0),
  errorMessage: text("error_message"),
  instanceId: text("instance_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const broadcastReports = pgTable("broadcast_reports", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id), // Data isolation - CRITICAL SECURITY FIX
  reportId: text("report_id").notNull().unique(), // UUID for tracking
  broadcastType: text("broadcast_type").notNull(), // 'contacts' or 'groups'
  targetType: text("target_type").notNull(), // 'individual' or 'bulk'
  message: text("message").notNull(),
  totalTargets: integer("total_targets").notNull(),
  successCount: integer("success_count").default(0),
  failureCount: integer("failure_count").default(0),
  status: text("status").notNull().default("pending"), // 'pending', 'running', 'completed', 'failed'
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  settings: jsonb("settings"), // stores broadcast settings (intervals, breaks, etc)
  targets: jsonb("targets"), // array of target phone numbers/group IDs
  results: jsonb("results"), // detailed results for each target
  createdBy: text("created_by").notNull().default("system"),
});

// Watch Requirements table - for "Looking for" / WTB messages
export const watchRequirements = pgTable("watch_requirements", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id), // Data isolation
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

// Contact mapping table for proper phone numbers
export const contactMappings = pgTable("contact_mappings", {
  id: serial("id").primaryKey(),
  participantId: text("participant_id").notNull().unique(),
  realPhoneNumber: text("real_phone_number").notNull(),
  contactName: text("contact_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Contacts database for uploaded contact data from mBlaster exports
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id), // Data isolation
  pushName: text("push_name").notNull(), // Name shown in WhatsApp
  phoneNumber: text("phone_number").notNull(), // +country_code phone number
  groupJid: text("group_jid"), // Which group this contact was exported from
  groupName: text("group_name"), // Group name for reference
  isAdmin: boolean("is_admin").default(false), // Whether this contact is a group admin
  notes: text("notes"), // Optional notes
  uploadBatch: text("upload_batch"), // Batch identifier for bulk uploads
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Team Members table - for sharing workspace access
export const teamMembers = pgTable("team_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceOwnerId: uuid("workspace_owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  memberUserId: uuid("member_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  memberEmail: text("member_email").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  invitedAt: timestamp("invited_at").notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Ensure unique workspace-member combinations
  workspaceMemberUnique: unique().on(table.workspaceOwnerId, table.memberUserId),
}));

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
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usagePeriodStart: true,
  usagePeriodEnd: true,
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

export const insertPidAlertSchema = createInsertSchema(pidAlerts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPidAlert = z.infer<typeof insertPidAlertSchema>;
export type PidAlert = typeof pidAlerts.$inferSelect;

export const insertWhatsappGroupSchema = createInsertSchema(whatsappGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWatchRequirementSchema = createInsertSchema(watchRequirements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContactMappingSchema = createInsertSchema(contactMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  uploadedAt: true,
  updatedAt: true,
});

export const insertMessageLogSchema = createInsertSchema(messageLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertWhatsappGroup = z.infer<typeof insertWhatsappGroupSchema>;
export type WhatsappGroup = typeof whatsappGroups.$inferSelect;

export type InsertMessageLog = z.infer<typeof insertMessageLogSchema>;
export type MessageLog = typeof messageLogs.$inferSelect;

export const insertBroadcastReportSchema = createInsertSchema(broadcastReports).omit({
  id: true,
  startedAt: true,
});

export type InsertBroadcastReport = z.infer<typeof insertBroadcastReportSchema>;
export type BroadcastReport = typeof broadcastReports.$inferSelect;

export type InsertWatchRequirement = z.infer<typeof insertWatchRequirementSchema>;
export type WatchRequirement = typeof watchRequirements.$inferSelect;

export type InsertContactMapping = z.infer<typeof insertContactMappingSchema>;
export type ContactMapping = typeof contactMappings.$inferSelect;

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;

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

// Message log filter schema
export const messageLogFiltersSchema = z.object({
  search: z.string().optional(),
  sender: z.string().optional(),
  groupId: z.string().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  userId: z.string().optional(), // Add userId for data isolation
  limit: z.union([z.number(), z.string()]).optional().transform((val) => 
    typeof val === 'string' ? (val === '' ? undefined : Number(val)) : val
  ),
  offset: z.union([z.number(), z.string()]).optional().transform((val) => 
    typeof val === 'string' ? (val === '' ? undefined : Number(val)) : val
  ),
});

export type MessageLogFilters = z.infer<typeof messageLogFiltersSchema>;

// User WhatsApp configuration schema
export const insertUserWhatsappConfigSchema = createInsertSchema(userWhatsappConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  webhookSecret: true, // Auto-generated
});

export type InsertUserWhatsappConfig = z.infer<typeof insertUserWhatsappConfigSchema>;
export type UserWhatsappConfig = typeof userWhatsappConfig.$inferSelect;
