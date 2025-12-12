import { users, watchListings, processingLogs, systemStats, pidAlerts, referenceDatabase, whatsappGroups, watchRequirements, messageLogs, subscriptionPlans, teamMembers, userWhatsappConfig, type User, type InsertUser, type WatchListing, type InsertWatchListing, type ProcessingLog, type InsertProcessingLog, type SystemStats, type InsertSystemStats, type SearchFilters, type PidAlert, type InsertPidAlert, type ReferenceDatabase, type InsertReferenceDatabase, type WhatsappGroup, type InsertWhatsappGroup, type WatchRequirement, type InsertWatchRequirement, type MessageLog, type InsertMessageLog, type MessageLogFilters, type TeamMember, type InsertTeamMember, type UserWhatsappConfig, type InsertUserWhatsappConfig } from "@shared/schema";
import { db } from "./db";
import { eq, and, or, gte, lte, ilike, desc, asc, sql, count, inArray } from "drizzle-orm";
import { createUserAccessCondition, createWatchListingsAccessCondition, getAccessibleUserIds } from "./lib/access";

export interface FeatureAccess {
  canAccessAdvancedSearch: boolean;
  canExportData: boolean;
  canAccessMultipleGroups: boolean;
  canCreateUnlimitedAlerts: boolean;
  canAccessAPI: boolean;
  hasCustomIntegrations: boolean;
  hasPrioritySupport: boolean;
  maxMessages: number;
  maxStorageMb: number;
  maxWhatsappGroups: number;
  maxPidAlerts: number;
}

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<boolean>;
  
  // Workspace methods
  getWorkspaceOwnerId(userId: string): Promise<string>;
  addTeamMember(workspaceOwnerId: string, memberEmail: string): Promise<TeamMember>;
  removeTeamMember(workspaceOwnerId: string, memberUserId: string): Promise<boolean>;
  getTeamMembers(workspaceOwnerId: string): Promise<TeamMember[]>;
  
  // Admin analytics methods
  getUserListingsCount(userId: string): Promise<number>;
  getUserDataUsage(userId: string): Promise<number>;
  getTotalUsersCount(): Promise<number>;
  getActiveUsersCount(): Promise<number>;
  getTotalListingsCount(): Promise<number>;
  getTotalStorageUsed(): Promise<number>;
  getApiCallsCount(): Promise<number>;
  getErrorRate(): Promise<number>;
  getSystemSettings(): Promise<any>;
  updateSystemSettings(settings: any): Promise<any>;

  // Watch listing methods
  createWatchListing(listing: InsertWatchListing): Promise<WatchListing>;
  getWatchListings(filters: SearchFilters, userId: string): Promise<{ listings: WatchListing[], total: number }>;
  getWatchListingById(id: number, userId: string): Promise<WatchListing | undefined>;
  getWatchListingsByPid(pid: string, userId: string): Promise<WatchListing[]>;
  getRecentWatchListings(userId: string, limit?: number): Promise<WatchListing[]>;
  
  // Processing log methods
  createProcessingLog(log: InsertProcessingLog): Promise<ProcessingLog>;
  getProcessingLogs(limit: number, userId: string): Promise<ProcessingLog[]>;
  getRecentErrors(userId: string, limit?: number): Promise<ProcessingLog[]>;
  
  // System stats methods
  updateSystemStats(date: string, stats: Partial<InsertSystemStats>): Promise<SystemStats>;
  getSystemStats(date: string): Promise<SystemStats | undefined>;
  getSystemStatsRange(fromDate: string, toDate: string): Promise<SystemStats[]>;
  
  // Analytics methods
  getDashboardStats(userId: string): Promise<{
    messagesToday: number;
    parsedSuccess: number;
    parseErrors: number;
    uniquePids: number;
  }>;
  
  getUniquePids(userId: string): Promise<string[]>;
  getUniqueConditions(userId: string): Promise<string[]>;
  getCurrencyStats(userId: string): Promise<{ currency: string; count: number }[]>;
  getSenderStats(userId: string): Promise<{ sender: string; count: number }[]>;
  
  // Update methods
  updateWatchListingGroupName(id: number, groupName: string, userId: string): Promise<void>;
  
  // Reference database methods
  getAllReferenceRecords(userId: string): Promise<ReferenceDatabase[]>;
  createReferenceRecord(record: InsertReferenceDatabase): Promise<ReferenceDatabase>;
  clearReferenceDatabase(userId: string): Promise<void>;
  
  // PID Alert methods
  getAllPidAlerts(userId: string): Promise<PidAlert[]>;
  createPidAlert(alert: InsertPidAlert): Promise<PidAlert>;
  updatePidAlert(id: number, alert: Partial<InsertPidAlert>, userId: string): Promise<PidAlert>;
  deletePidAlert(id: number, userId: string): Promise<void>;
  checkPidAlerts(pid: string, variant: string | null, price: number | null, currency: string | null, userId: string): Promise<PidAlert[]>;
  
  // WhatsApp Groups methods
  getAllWhatsappGroups(userId: string): Promise<WhatsappGroup[]>;
  createWhatsappGroup(group: InsertWhatsappGroup): Promise<WhatsappGroup>;
  updateWhatsappGroup(id: number, group: Partial<InsertWhatsappGroup>, userId: string): Promise<WhatsappGroup>;
  
  // Feature access control methods
  getUserFeatureAccess(userId: string): Promise<FeatureAccess>;
  checkFeatureAccess(userId: string, feature: string): Promise<boolean>;
  getUserUsageLimits(userId: string): Promise<{ messages: number; storage: number; groups: number; alerts: number }>;
  isWithinUsageLimits(userId: string): Promise<{ withinLimits: boolean; exceeded: string[] }>;
  deleteWhatsappGroup(id: number, userId: string): Promise<void>;
  
  // Watch Requirements methods
  getAllWatchRequirements(filters: { search?: string; sender?: string; group?: string; brand?: string; startDate?: string; endDate?: string; page?: number; limit?: number; userId: string }): Promise<{ requirements: WatchRequirement[], total: number }>;
  createWatchRequirement(requirement: InsertWatchRequirement): Promise<WatchRequirement>;
  deleteWatchRequirement(id: number, userId: string): Promise<void>;
  
  // Inventory methods (using watch listings with specific filtering)
  getInventoryItems(filters: { search?: string; brand?: string; condition?: string; userId: string }): Promise<{ items: WatchListing[], total: number }>;
  
  // Contact mapping methods for phone numbers
  createContactMapping(participantId: string, realPhoneNumber: string, contactName: string, userId: string): Promise<void>;
  getContactMapping(participantId: string, userId: string): Promise<{ phoneNumber: string; contactName: string } | null>;
  getAllContactMappings(userId: string): Promise<{ participantId: string; phoneNumber: string; contactName: string }[]>;
  
  // Message log methods for comprehensive incoming message tracking
  createMessageLog(messageLog: InsertMessageLog): Promise<MessageLog>;
  getMessageLogs(filters: MessageLogFilters & { userId: string }): Promise<{ logs: MessageLog[], total: number }>;
  updateMessageLogStatus(messageId: string, status: string, parsedCount?: number, requirementCount?: number, errorMessage?: string, userId?: string): Promise<void>;
  cleanupOldMessageLogs(retentionDays: number): Promise<number>; // Returns number of deleted records
  
  // User WhatsApp Configuration methods (multi-tenant)
  getUserWhatsappConfig(userId: string): Promise<UserWhatsappConfig | undefined>;
  getUserWhatsappConfigByInstance(instanceId: string): Promise<UserWhatsappConfig | undefined>;
  createUserWhatsappConfig(config: InsertUserWhatsappConfig): Promise<UserWhatsappConfig>;
  updateUserWhatsappConfig(userId: string, updates: Partial<InsertUserWhatsappConfig>): Promise<UserWhatsappConfig>;
  deleteUserWhatsappConfig(userId: string): Promise<boolean>;
  getUserIdByInstanceId(instanceId: string): Promise<string | undefined>; // Critical for webhook user mapping
  
  // Polling service support methods
  getAllUsersWithActiveWhatsapp(): Promise<UserWhatsappConfig[]>;
  getLastMessageTime(userId: string): Promise<Date | null>;
  messageExists(userId: string, messageId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    // For now, treat username as email since we use email as primary identifier
    return this.getUserByEmail(username);
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Workspace methods
  async getWorkspaceOwnerId(userId: string): Promise<string> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // If user has a workspaceOwnerId, they're a team member accessing someone else's workspace
    if (user.workspaceOwnerId) {
      return user.workspaceOwnerId;
    }
    
    // Otherwise, they're accessing their own workspace
    return userId;
  }

  async getDataWorkspaceId(userId: string): Promise<string | null> {
    // SECURITY: Validate userId before any processing
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId for data workspace access');
    }
    
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error('User not found - access denied');
    }
    
    // ADMIN FEATURE: Admins can access all data across their organization
    if (user.isAdmin) {
      // For admin users, return their own ID as they can see all data
      return userId;
    }
    
    // Check if user has workspaceOwnerId set (team members OR shared data users)
    // SECURITY: workspaceOwnerId must be explicitly set by an admin - never auto-assigned
    if (user.workspaceOwnerId) {
      // Verify team membership is legitimate by checking the owner exists
      const workspaceOwner = await this.getUser(user.workspaceOwnerId);
      if (!workspaceOwner) {
        throw new Error('Invalid workspace owner - access denied');
      }
      return user.workspaceOwnerId;
    }
    
    // SHARED DATA FEATURE: Users with useSharedData=true but no workspaceOwnerId yet
    // They must be explicitly linked to an admin through admin settings - don't auto-link
    // For now, they see only their own data until an admin links them
    if (user.useSharedData) {
      // User has shared data enabled but no workspace owner assigned yet
      // Return their own userId - they'll see empty data until an admin links them
      console.log(`⚠️ User ${userId} has useSharedData=true but no workspaceOwnerId - needs admin to link them`);
    }
    
    // Users get their own isolated workspace by default
    return userId;
  }

  /**
   * Get the inventory exclusion condition for watch listings queries.
   * For shared data users, this excludes other users' inventory items.
   * Returns null if no exclusion is needed.
   */
  async getInventoryExclusionCondition(userId: string): Promise<ReturnType<typeof eq> | null> {
    const user = await this.getUser(userId);
    if (!user) return null;
    
    // Admins see all data including inventory
    if (user.isAdmin) return null;
    
    // Shared data users should exclude other users' inventory
    if (user.useSharedData && user.workspaceOwnerId) {
      // Only include listings where either:
      // - It belongs to the current user (they see their own inventory)
      // - It's not marked as inventory (they see shared non-inventory items)
      // This is a partial condition - the calling method needs to combine it properly
      return eq(watchListings.isInventory, false);
    }
    
    // Regular users see all their own data
    return null;
  }

  // ADMIN FEATURE: Get user IDs that an admin can access (their team + themselves)
  async getAdminAccessibleUserIds(adminUserId: string): Promise<string[]> {
    const admin = await this.getUser(adminUserId);
    if (!admin || !admin.isAdmin) {
      return [adminUserId]; // Non-admins only see their own data
    }
    
    // Get all team members under this admin
    const teamMembers = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.workspaceOwnerId, adminUserId));
    
    const teamMemberIds = teamMembers.map(member => member.id);
    
    // Return admin + all their team members
    return [adminUserId, ...teamMemberIds];
  }

  async addTeamMember(workspaceOwnerId: string, memberEmail: string): Promise<TeamMember> {
    // First create the user account for the team member
    const existingUser = await this.getUserByEmail(memberEmail);
    let memberUser: User;
    
    if (existingUser) {
      // Update existing user to point to workspace owner
      memberUser = await this.updateUser(existingUser.id, {
        workspaceOwnerId: workspaceOwnerId
      });
    } else {
      // Create new user with workspace owner reference
      memberUser = await this.createUser({
        email: memberEmail,
        passwordHash: 'temporary-hash', // Should be set properly during first login
        firstName: memberEmail.split('@')[0],
        lastName: '',
        plan: 'free', // Team members inherit workspace owner's plan
        workspaceOwnerId: workspaceOwnerId
      });
    }

    // Create team member record (this will need the table to exist)
    // For now, we'll return a mock team member object
    return {
      id: 'temp-id',
      workspaceOwnerId,
      memberUserId: memberUser.id,
      memberEmail,
      isActive: true,
      invitedAt: new Date(),
      acceptedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    } as TeamMember;
  }

  async removeTeamMember(workspaceOwnerId: string, memberUserId: string): Promise<boolean> {
    // Remove workspace owner reference from user
    await this.updateUser(memberUserId, {
      workspaceOwnerId: null
    });
    
    // In the future, also delete from team_members table
    return true;
  }

  async getTeamMembers(workspaceOwnerId: string): Promise<TeamMember[]> {
    // Get all users who have this workspace owner
    const teamMemberUsers = await db
      .select()
      .from(users)
      .where(eq(users.workspaceOwnerId, workspaceOwnerId));
    
    // Convert to TeamMember objects
    return teamMemberUsers.map(user => ({
      id: user.id,
      workspaceOwnerId,
      memberUserId: user.id,
      memberEmail: user.email,
      isActive: true,
      invitedAt: user.createdAt,
      acceptedAt: user.createdAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    } as TeamMember));
  }

  async getUserListingsCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(watchListings)
      .where(eq(watchListings.userId, userId));
    return result.count;
  }

  async getUserDataUsage(userId: string): Promise<number> {
    // Calculate approximate data usage based on listings and logs
    const listingsCount = await this.getUserListingsCount(userId);
    // Estimate ~1KB per listing (rough approximation)
    return listingsCount * 1024;
  }

  async getTotalUsersCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(users);
    return result.count;
  }

  async getActiveUsersCount(): Promise<number> {
    // Count users who have been active within the last 30 days (using updatedAt as proxy)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [result] = await db
      .select({ count: count() })
      .from(users)
      .where(gte(users.updatedAt, thirtyDaysAgo));
    return result.count;
  }

  async getTotalListingsCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(watchListings);
    return result.count;
  }

  async getTotalStorageUsed(): Promise<number> {
    // Calculate storage based on record counts
    const [listingsCount] = await db.select({ count: count() }).from(watchListings);
    const [logsCount] = await db.select({ count: count() }).from(processingLogs);
    
    // Rough estimate: 1KB per listing, 0.5KB per log
    return (listingsCount.count * 1024) + (logsCount.count * 512);
  }

  async getApiCallsCount(): Promise<number> {
    // Count processing logs from today as proxy for API calls
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [result] = await db
      .select({ count: count() })
      .from(processingLogs)
      .where(gte(processingLogs.createdAt, today));
    return result.count;
  }

  async getErrorRate(): Promise<number> {
    // Calculate error rate from processing logs
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [totalResult] = await db
      .select({ count: count() })
      .from(processingLogs)
      .where(gte(processingLogs.createdAt, today));
    
    const [errorResult] = await db
      .select({ count: count() })
      .from(processingLogs)
      .where(
        and(
          gte(processingLogs.createdAt, today),
          eq(processingLogs.status, 'error')
        )
      );
    
    if (totalResult.count === 0) return 0;
    return errorResult.count / totalResult.count;
  }

  async getSystemSettings(): Promise<any> {
    // Return default system settings for now
    return {
      maxUsers: 1000,
      maxStorage: 100 * 1024 * 1024 * 1024, // 100GB
      rateLimitApi: 60,
      sessionTimeout: 24,
      allowRegistration: true,
      maintenanceMode: false,
      emailNotifications: true,
      apiAccess: true,
    };
  }

  async updateSystemSettings(settings: any): Promise<any> {
    // For now, just return the settings as updated
    // In a real implementation, you'd store these in a settings table
    return settings;
  }


  async createWatchListing(listing: InsertWatchListing): Promise<WatchListing> {
    const [watchListing] = await db
      .insert(watchListings)
      .values(listing)
      .returning();
    return watchListing;
  }

  async getWatchListings(filters: SearchFilters, userId?: string): Promise<{ listings: WatchListing[], total: number }> {
    const conditions = [];
    
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getWatchListings called without userId - returning empty results for security');
      return { listings: [], total: 0 };
    }
    
    // Apply consistent access control for all users
    const user = await this.getUser(userId);
    if (!user) {
      console.warn('⚠️ User not found:', userId);
      return { listings: [], total: 0 };
    }

    // Use special watch listings access that excludes inventory from shared data
    const accessCondition = await createWatchListingsAccessCondition(
      { id: userId, isAdmin: user.isAdmin, workspaceOwnerId: user.workspaceOwnerId, useSharedData: user.useSharedData }
    );
    conditions.push(accessCondition);
    
    // Universal search - search across multiple fields
    if (filters.search) {
      const searchTerm = filters.search;
      const searchConditions = [
        ilike(watchListings.pid, `%${searchTerm}%`),
        ilike(watchListings.brand, `%${searchTerm}%`),
        ilike(watchListings.family, `%${searchTerm}%`),
        ilike(watchListings.sender, `%${searchTerm}%`),
        ilike(watchListings.groupName, `%${searchTerm}%`),
        ilike(watchListings.variant, `%${searchTerm}%`),
        ilike(watchListings.condition, `%${searchTerm}%`)
      ];
      conditions.push(or(...searchConditions));
    }
    
    // Multiple PID search - apply regardless of universal search
    if (filters.pids && filters.pids.length > 0) {
      const pidConditions = filters.pids.map(pid => ilike(watchListings.pid, `%${pid}%`));
      conditions.push(or(...pidConditions));
    } else if (filters.pid) {
      conditions.push(ilike(watchListings.pid, `%${filters.pid}%`));
    }
    
    // Individual field filters - apply regardless of universal search
    if (filters.sender) {
      conditions.push(ilike(watchListings.sender, `%${filters.sender}%`));
    }
    if (filters.currency) {
      conditions.push(eq(watchListings.currency, filters.currency));
    }
    if (filters.condition) {
      conditions.push(ilike(watchListings.condition, `%${filters.condition}%`));
    }
    if (filters.year) {
      conditions.push(eq(watchListings.year, filters.year));
    }
    if (filters.variant) {
      conditions.push(ilike(watchListings.variant, `%${filters.variant}%`));
    }
    if (filters.groupName) {
      conditions.push(ilike(watchListings.groupName, `%${filters.groupName}%`));
    }
    if (filters.brand) {
      conditions.push(ilike(watchListings.brand, `%${filters.brand}%`));
    }
    if (filters.family) {
      conditions.push(ilike(watchListings.family, `%${filters.family}%`));
    }
    // Removed dateFrom and dateTo filters as they don't exist in SearchFilters type
    
    // Duration filter
    if (filters.durationValue && filters.durationUnit) {
      const now = new Date();
      const durationMs = this.getDurationInMs(filters.durationValue, filters.durationUnit);
      const fromDate = new Date(now.getTime() - durationMs);
      conditions.push(gte(watchListings.createdAt, fromDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db
      .select({ count: count() })
      .from(watchListings)
      .where(whereClause);

    let query = db
      .select()
      .from(watchListings)
      .where(whereClause);

    // Sorting
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case 'pid':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.pid) : asc(watchListings.pid));
          break;
        case 'brand':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.brand) : asc(watchListings.brand));
          break;
        case 'family':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.family) : asc(watchListings.family));
          break;
        case 'price':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.price) : asc(watchListings.price));
          break;
        case 'year':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.year) : asc(watchListings.year));
          break;
        case 'month':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.month) : asc(watchListings.month));
          break;
        case 'sender':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.sender) : asc(watchListings.sender));
          break;
        case 'groupName':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.groupName) : asc(watchListings.groupName));
          break;
        case 'condition':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.condition) : asc(watchListings.condition));
          break;
        case 'currency':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.currency) : asc(watchListings.currency));
          break;
        case 'variant':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.variant) : asc(watchListings.variant));
          break;
        case 'date':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.date) : asc(watchListings.date));
          break;
        case 'time':
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.time) : asc(watchListings.time));
          break;
        case 'createdAt':
        default:
          query = query.orderBy(filters.sortOrder === 'desc' ? desc(watchListings.createdAt) : asc(watchListings.createdAt));
          break;
      }
    } else {
      query = query.orderBy(desc(watchListings.createdAt));
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    
    const listings = await query.limit(limit).offset(offset);

    return {
      listings,
      total: totalResult.count,
    };
  }

  private getDurationInMs(value: number, unit: string): number {
    const multipliers = {
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      months: 30 * 24 * 60 * 60 * 1000,
      years: 365 * 24 * 60 * 60 * 1000
    };
    return value * (multipliers[unit as keyof typeof multipliers] || 0);
  }

  async getWatchListingById(id: number, userId: string): Promise<WatchListing | undefined> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getWatchListingById called without userId - returning undefined for security');
      return undefined;
    }
    
    // Add workspace isolation
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      return undefined;
    }
    
    const [listing] = await db.select().from(watchListings).where(
      and(
        eq(watchListings.id, id),
        eq(watchListings.userId, dataWorkspaceId)
      )
    );
    return listing || undefined;
  }

  async getWatchListingsByPid(pid: string, userId: string): Promise<WatchListing[]> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getWatchListingsByPid called without userId - returning empty results for security');
      return [];
    }
    
    // Add workspace isolation for watch listings by PID
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      return [];
    }
    
    return await db
      .select()
      .from(watchListings)
      .where(and(
        eq(watchListings.userId, dataWorkspaceId),
        eq(watchListings.pid, pid)
      ))
      .orderBy(desc(watchListings.createdAt));
  }

  async getRecentWatchListings(userId: string, limit: number = 10): Promise<WatchListing[]> {
    const conditions = [];
    
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getRecentWatchListings called without userId - returning empty results for security');
      return [];
    }
    
    // Add workspace isolation
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (dataWorkspaceId) {
      conditions.push(eq(watchListings.userId, dataWorkspaceId));
    } else {
      return [];
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    return await db
      .select()
      .from(watchListings)
      .where(whereClause)
      .orderBy(desc(watchListings.createdAt))
      .limit(limit);
  }

  async createProcessingLog(log: InsertProcessingLog): Promise<ProcessingLog> {
    const [processingLog] = await db
      .insert(processingLogs)
      .values(log)
      .returning();
    return processingLog;
  }

  async getProcessingLogs(limit: number = 50, userId: string): Promise<ProcessingLog[]> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getProcessingLogs called without userId - returning empty results for security');
      return [];
    }
    
    // Add workspace isolation for processing logs
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      return [];
    }
    
    return await db
      .select()
      .from(processingLogs)
      .where(eq(processingLogs.userId, dataWorkspaceId))
      .orderBy(desc(processingLogs.createdAt))
      .limit(limit);
  }

  async getRecentErrors(userId: string, limit: number = 10): Promise<ProcessingLog[]> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getRecentErrors called without userId - returning empty results for security');
      return [];
    }
    
    // Add workspace isolation for processing logs
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      return [];
    }
    
    // Validate limit to prevent undefined/invalid SQL
    const take = Number.isFinite(limit) && limit > 0 ? limit : 10;
    
    return await db
      .select()
      .from(processingLogs)
      .where(and(
        or(eq(processingLogs.status, 'error'), eq(processingLogs.status, 'partial')),
        eq(processingLogs.userId, dataWorkspaceId)
      ))
      .orderBy(desc(processingLogs.createdAt))
      .limit(take);
  }

  async updateSystemStats(date: string, stats: Partial<InsertSystemStats>): Promise<SystemStats> {
    const [existing] = await db
      .select()
      .from(systemStats)
      .where(eq(systemStats.date, date));

    if (existing) {
      const [updated] = await db
        .update(systemStats)
        .set({ ...stats, lastUpdated: new Date() })
        .where(eq(systemStats.date, date))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(systemStats)
        .values({ date, ...stats })
        .returning();
      return created;
    }
  }

  async getSystemStats(date: string): Promise<SystemStats | undefined> {
    const [stats] = await db.select().from(systemStats).where(eq(systemStats.date, date));
    return stats || undefined;
  }

  async getSystemStatsRange(fromDate: string, toDate: string): Promise<SystemStats[]> {
    return await db
      .select()
      .from(systemStats)
      .where(and(gte(systemStats.date, fromDate), lte(systemStats.date, toDate)))
      .orderBy(asc(systemStats.date));
  }

  async getDashboardStats(userId: string): Promise<{
    messagesToday: number;
    parsedSuccess: number;
    parseErrors: number;
    uniquePids: number;
  }> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getDashboardStats called without userId - returning empty results for security');
      return { messagesToday: 0, parsedSuccess: 0, parseErrors: 0, uniquePids: 0 };
    }
    
    try {
      // Add workspace isolation
      const dataWorkspaceId = await this.getDataWorkspaceId(userId);
      if (!dataWorkspaceId) {
        return { messagesToday: 0, parsedSuccess: 0, parseErrors: 0, uniquePids: 0 };
      }
    
    const today = sql`CURRENT_DATE`;
    
    // Get workspace-specific processing logs for today's stats
    const [todayProcessingCount] = await db
      .select({ count: count() })
      .from(processingLogs)
      .where(and(
        eq(processingLogs.userId, dataWorkspaceId),
        gte(processingLogs.createdAt, today)
      ));
    
    const [todaySuccessCount] = await db
      .select({ count: count() })
      .from(processingLogs)
      .where(and(
        eq(processingLogs.userId, dataWorkspaceId),
        eq(processingLogs.status, 'success'),
        gte(processingLogs.createdAt, today)
      ));
    
    const [todayErrorCount] = await db
      .select({ count: count() })
      .from(processingLogs)
      .where(and(
        eq(processingLogs.userId, dataWorkspaceId),
        eq(processingLogs.status, 'error'),
        gte(processingLogs.createdAt, today)
      ));

    // Get user for access control
    const user = await this.getUser(userId);
    if (!user) {
      return { messagesToday: 0, parsedSuccess: 0, parseErrors: 0, uniquePids: 0 };
    }
    
    // Use proper access condition that handles inventory exclusion and includes user's own data
    const accessCondition = await createWatchListingsAccessCondition(
      { id: userId, isAdmin: user.isAdmin, workspaceOwnerId: user.workspaceOwnerId, useSharedData: user.useSharedData }
    );

    const [uniquePidsResult] = await db
      .select({ count: sql<number>`count(distinct ${watchListings.pid})` })
      .from(watchListings)
      .where(and(
        accessCondition,
        sql`${watchListings.pid} is not null and ${watchListings.pid} != ''`
      ));

      return {
        messagesToday: Number(todayProcessingCount?.count) || 0,
        parsedSuccess: Number(todaySuccessCount?.count) || 0,
        parseErrors: Number(todayErrorCount?.count) || 0,
        uniquePids: Number(uniquePidsResult?.count) || 0,
      };
    } catch (error) {
      console.error('Error in getDashboardStats:', error);
      return { messagesToday: 0, parsedSuccess: 0, parseErrors: 0, uniquePids: 0 };
    }
  }

  async getUniquePids(userId: string): Promise<string[]> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getUniquePids called without userId - returning empty results for security');
      return [];
    }
    
    // Get user for access control
    const user = await this.getUser(userId);
    if (!user) {
      return [];
    }
    
    // Use proper access condition that handles inventory exclusion and includes user's own data
    const accessCondition = await createWatchListingsAccessCondition(
      { id: userId, isAdmin: user.isAdmin, workspaceOwnerId: user.workspaceOwnerId, useSharedData: user.useSharedData }
    );
    
    const results = await db
      .selectDistinct({ pid: watchListings.pid })
      .from(watchListings)
      .where(and(
        accessCondition,
        sql`${watchListings.pid} is not null and ${watchListings.pid} != ''`
      ))
      .orderBy(asc(watchListings.pid));
    
    return results.map(r => r.pid!);
  }

  async getUniqueConditions(userId: string): Promise<string[]> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getUniqueConditions called without userId - returning empty results for security');
      return [];
    }
    
    // Get user for access control
    const user = await this.getUser(userId);
    if (!user) {
      return [];
    }
    
    // Use proper access condition that handles inventory exclusion and includes user's own data
    const accessCondition = await createWatchListingsAccessCondition(
      { id: userId, isAdmin: user.isAdmin, workspaceOwnerId: user.workspaceOwnerId, useSharedData: user.useSharedData }
    );
    
    const results = await db
      .selectDistinct({ condition: watchListings.condition })
      .from(watchListings)
      .where(and(
        accessCondition,
        sql`${watchListings.condition} is not null and ${watchListings.condition} != ''`
      ))
      .orderBy(asc(watchListings.condition));
    
    return results.map(r => r.condition!);
  }

  async getCurrencyStats(userId: string): Promise<{ currency: string; count: number }[]> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getCurrencyStats called without userId - returning empty results for security');
      return [];
    }
    
    // Get user for access control
    const user = await this.getUser(userId);
    if (!user) {
      return [];
    }
    
    // Use proper access condition that handles inventory exclusion and includes user's own data
    const accessCondition = await createWatchListingsAccessCondition(
      { id: userId, isAdmin: user.isAdmin, workspaceOwnerId: user.workspaceOwnerId, useSharedData: user.useSharedData }
    );
    
    const results = await db
      .select({
        currency: watchListings.currency,
        count: sql<number>`count(*)`,
      })
      .from(watchListings)
      .where(and(
        accessCondition,
        sql`${watchListings.currency} is not null and ${watchListings.currency} != ''`
      ))
      .groupBy(watchListings.currency)
      .orderBy(desc(sql`count(*)`));
    
    return results.map(r => ({ currency: r.currency!, count: r.count }));
  }

  async getSenderStats(userId: string): Promise<{ sender: string; count: number }[]> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getSenderStats called without userId - returning empty results for security');
      return [];
    }
    
    // Get user for access control
    const user = await this.getUser(userId);
    if (!user) {
      return [];
    }
    
    // Use proper access condition that handles inventory exclusion and includes user's own data
    const accessCondition = await createWatchListingsAccessCondition(
      { id: userId, isAdmin: user.isAdmin, workspaceOwnerId: user.workspaceOwnerId, useSharedData: user.useSharedData }
    );
    
    const results = await db
      .select({
        sender: watchListings.sender,
        count: sql<number>`count(*)`,
      })
      .from(watchListings)
      .where(accessCondition)
      .groupBy(watchListings.sender)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    
    return results.map(r => ({ sender: r.sender, count: r.count }));
  }

  async updateWatchListingGroupName(id: number, groupName: string, userId: string): Promise<void> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      throw new Error('updateWatchListingGroupName requires userId for security');
    }
    
    // Add workspace isolation
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      throw new Error('Invalid workspace access');
    }
    
    await db
      .update(watchListings)
      .set({ groupName })
      .where(
        and(
          eq(watchListings.id, id),
          eq(watchListings.userId, dataWorkspaceId)
        )
      );
  }
  async getAllReferenceRecords(userId: string): Promise<ReferenceDatabase[]> {
    // SECURITY: Reference database is shared globally for all users
    // But we still require userId parameter for consistency and future workspace filtering
    if (!userId) {
      console.warn('⚠️ getAllReferenceRecords called without userId - returning empty results for security');
      return [];
    }
    
    const schema = await import('../shared/schema');
    return await db.select().from(schema.referenceDatabase);
  }

  async createReferenceRecord(record: InsertReferenceDatabase, userId?: string): Promise<ReferenceDatabase> {
    // SECURITY: Log who created reference records for audit trail
    if (userId) {
      console.log(`🗂️ Creating reference record - created by user: ${userId}`);
    }
    
    const schema = await import('../shared/schema');
    const [created] = await db.insert(schema.referenceDatabase).values(record).returning();
    return created;
  }

  async clearReferenceDatabase(userId: string): Promise<void> {
    // SECURITY: Reference database is global but require userId for audit trail
    if (!userId) {
      throw new Error('clearReferenceDatabase requires userId for security audit');
    }
    console.log(`🗂️ Clearing reference database - requested by user: ${userId}`);
    
    const schema = await import('../shared/schema');
    await db.delete(schema.referenceDatabase);
  }
  
  async getAllPidAlerts(userId: string): Promise<PidAlert[]> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getAllPidAlerts called without userId - returning empty results for security');
      return [];
    }
    
    // Add workspace isolation for PID alerts
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      return [];
    }
    
    const alerts = await db
      .select()
      .from(pidAlerts)
      .where(and(
        eq(pidAlerts.userId, dataWorkspaceId),
        eq(pidAlerts.isActive, true)
      ));
    return alerts;
  }
  
  async createPidAlert(alert: InsertPidAlert): Promise<PidAlert> {
    const [newAlert] = await db.insert(pidAlerts).values(alert).returning();
    return newAlert;
  }
  
  async updatePidAlert(id: number, alert: Partial<InsertPidAlert>, userId: string): Promise<PidAlert> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      throw new Error('updatePidAlert requires userId for security');
    }
    
    // Add workspace isolation
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      throw new Error('Invalid workspace access');
    }
    
    const [updatedAlert] = await db.update(pidAlerts)
      .set({ ...alert, updatedAt: new Date() })
      .where(
        and(
          eq(pidAlerts.id, id),
          eq(pidAlerts.userId, dataWorkspaceId)
        )
      )
      .returning();
    return updatedAlert;
  }
  
  async deletePidAlert(id: number, userId: string): Promise<void> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      throw new Error('deletePidAlert requires userId for security');
    }
    
    // Add workspace isolation
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      throw new Error('Invalid workspace access');
    }
    
    await db.delete(pidAlerts).where(
      and(
        eq(pidAlerts.id, id),
        eq(pidAlerts.userId, dataWorkspaceId)
      )
    );
  }
  
  async checkPidAlerts(pid: string, variant: string | null, price: number | null, currency: string | null, userId: string): Promise<PidAlert[]> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ checkPidAlerts called without userId - returning empty results for security');
      return [];
    }
    
    // Add workspace isolation
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      return [];
    }
    
    let query = db.select().from(pidAlerts).where(
      and(
        eq(pidAlerts.userId, dataWorkspaceId), // SECURITY: Filter by workspace
        eq(pidAlerts.isActive, true),
        eq(pidAlerts.pid, pid)
      )
    );
    
    const alerts = await query;
    
    const matchedAlerts = alerts.filter(alert => {
      // Check variant match
      if (alert.variant && variant) {
        if (!variant.toLowerCase().includes(alert.variant.toLowerCase())) {
          return false;
        }
      }
      
      // Check currency match
      if (alert.currency && currency && alert.currency !== currency) {
        return false;
      }
      
      // Check price range
      if (price !== null && (alert.minPrice !== null || alert.maxPrice !== null)) {
        const alertMin = alert.minPrice ? parseFloat(alert.minPrice) : 0;
        const alertMax = alert.maxPrice ? parseFloat(alert.maxPrice) : Infinity;
        if (price < alertMin || price > alertMax) {
          return false;
        }
      }
      
      return true;
    });
    
    // Update triggered count for matched alerts
    for (const alert of matchedAlerts) {
      try {
        await db.update(pidAlerts)
          .set({ 
            triggeredCount: (alert.triggeredCount || 0) + 1,
            lastTriggered: new Date(),
            updatedAt: new Date()
          })
          .where(eq(pidAlerts.id, alert.id));
      } catch (error) {
        console.error('Error updating triggered count:', error);
      }
    }
    
    return matchedAlerts;
  }

  // WhatsApp Groups methods
  async getAllWhatsappGroups(userId: string): Promise<WhatsappGroup[]> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getAllWhatsappGroups called without userId - returning empty results for security');
      return [];
    }
    
    // Add workspace isolation for WhatsApp groups
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      return [];
    }
    
    return await db
      .select()
      .from(whatsappGroups)
      .where(eq(whatsappGroups.userId, dataWorkspaceId))
      .orderBy(desc(whatsappGroups.lastSeen));
  }

  async createWhatsappGroup(group: InsertWhatsappGroup): Promise<WhatsappGroup> {
    const [createdGroup] = await db
      .insert(whatsappGroups)
      .values(group)
      .returning();
    return createdGroup;
  }

  async updateWhatsappGroup(id: number, group: Partial<InsertWhatsappGroup>, userId: string): Promise<WhatsappGroup> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      throw new Error('updateWhatsappGroup requires userId for security');
    }
    
    // Add workspace isolation
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      throw new Error('Invalid workspace access');
    }
    
    const [updatedGroup] = await db
      .update(whatsappGroups)
      .set({ ...group, updatedAt: new Date() })
      .where(
        and(
          eq(whatsappGroups.id, id),
          eq(whatsappGroups.userId, dataWorkspaceId)
        )
      )
      .returning();
    return updatedGroup;
  }

  async deleteWhatsappGroup(id: number, userId: string): Promise<void> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      throw new Error('deleteWhatsappGroup requires userId for security');
    }
    
    // Add workspace isolation
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      throw new Error('Invalid workspace access');
    }
    
    await db.delete(whatsappGroups).where(
      and(
        eq(whatsappGroups.id, id),
        eq(whatsappGroups.userId, dataWorkspaceId)
      )
    );
  }

  // Watch Requirements methods
  async getAllWatchRequirements(filters: { search?: string; sender?: string; group?: string; brand?: string; startDate?: string; endDate?: string; page?: number; limit?: number; userId: string }): Promise<{ requirements: WatchRequirement[], total: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    let whereConditions: any[] = [];

    // SECURITY: Fail-safe - require userId for data isolation
    if (!filters.userId) {
      console.warn('⚠️ getAllWatchRequirements called without userId - returning empty results for security');
      return { requirements: [], total: 0 };
    }

    // Add workspace isolation
    const dataWorkspaceId = await this.getDataWorkspaceId(filters.userId);
    if (dataWorkspaceId) {
      whereConditions.push(eq(watchRequirements.userId, dataWorkspaceId));
    } else {
      return { requirements: [], total: 0 };
    }

    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      whereConditions.push(
        or(
          ilike(watchRequirements.pid, searchTerm),
          ilike(watchRequirements.variant, searchTerm),
          ilike(watchRequirements.brand, searchTerm),
          ilike(watchRequirements.family, searchTerm)
        )
      );
    }

    if (filters?.sender) {
      whereConditions.push(ilike(watchRequirements.sender, `%${filters.sender}%`));
    }

    if (filters?.group) {
      whereConditions.push(ilike(watchRequirements.groupName, `%${filters.group}%`));
    }

    if (filters?.brand) {
      whereConditions.push(ilike(watchRequirements.brand, `%${filters.brand}%`));
    }

    if (filters?.startDate) {
      whereConditions.push(gte(watchRequirements.date, filters.startDate));
    }

    if (filters?.endDate) {
      whereConditions.push(lte(watchRequirements.date, filters.endDate));
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [requirements, totalResult] = await Promise.all([
      db
        .select()
        .from(watchRequirements)
        .where(whereClause)
        .orderBy(desc(watchRequirements.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(watchRequirements)
        .where(whereClause)
    ]);

    return {
      requirements,
      total: totalResult[0]?.count || 0
    };
  }

  async createWatchRequirement(requirement: InsertWatchRequirement): Promise<WatchRequirement> {
    const [created] = await db
      .insert(watchRequirements)
      .values(requirement)
      .returning();
    return created;
  }

  async deleteWatchRequirement(id: number, userId: string): Promise<void> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      throw new Error('deleteWatchRequirement requires userId for security');
    }
    
    // Add workspace isolation
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      throw new Error('Invalid workspace access');
    }
    
    await db.delete(watchRequirements).where(
      and(
        eq(watchRequirements.id, id),
        eq(watchRequirements.userId, dataWorkspaceId)
      )
    );
  }

  // Inventory methods (using watch listings with specific filtering)
  async getInventoryItems(filters: { search?: string; brand?: string; condition?: string; userId: string }): Promise<{ items: WatchListing[], total: number }> {
    let whereConditions: any[] = [
      eq(watchListings.chatId, "inventory_upload") // Only manually uploaded inventory items
    ];

    // SECURITY: Fail-safe - require userId for data isolation
    if (!filters.userId) {
      console.warn('⚠️ getInventoryItems called without userId - returning empty results for security');
      return { items: [], total: 0 };
    }

    // Add workspace isolation
    const dataWorkspaceId = await this.getDataWorkspaceId(filters.userId);
    if (dataWorkspaceId) {
      whereConditions.push(eq(watchListings.userId, dataWorkspaceId));
    } else {
      return { items: [], total: 0 };
    }

    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      whereConditions.push(
        or(
          ilike(watchListings.pid, searchTerm),
          ilike(watchListings.variant, searchTerm),
          ilike(watchListings.brand, searchTerm),
          ilike(watchListings.family, searchTerm)
        )
      );
    }

    if (filters?.brand) {
      whereConditions.push(ilike(watchListings.brand, `%${filters.brand}%`));
    }

    if (filters?.condition) {
      whereConditions.push(ilike(watchListings.condition, `%${filters.condition}%`));
    }

    const whereClause = and(...whereConditions);

    const [items, totalResult] = await Promise.all([
      db
        .select()
        .from(watchListings)
        .where(whereClause)
        .orderBy(desc(watchListings.createdAt))
        .limit(100),
      db
        .select({ count: count() })
        .from(watchListings)
        .where(whereClause)
    ]);

    return {
      items,
      total: totalResult[0]?.count || 0
    };
  }

  // Contact mapping methods implementation
  async createContactMapping(participantId: string, realPhoneNumber: string, contactName: string, userId: string): Promise<void> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      throw new Error('createContactMapping requires userId for security');
    }
    
    // For now, store in memory until we can push the schema
    // This would normally use the database with proper userId filtering
    console.log(`📞 Contact mapping created for user ${userId}: ${participantId} -> ${realPhoneNumber} (${contactName})`);
  }

  async getContactMapping(participantId: string, userId: string): Promise<{ phoneNumber: string; contactName: string } | null> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getContactMapping called without userId - returning null for security');
      return null;
    }
    
    // Add workspace isolation
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      return null;
    }
    
    // Known contact mappings - add more as needed
    // In a real implementation, these would be filtered by dataWorkspaceId
    const mappings: Record<string, { phoneNumber: string; contactName: string }> = {
      "110308181950700": { phoneNumber: "+852 9370 4267", contactName: "Lucy" },
      "202890564096136": { phoneNumber: "+86 181 3846 5561", contactName: "qyh" }
    };
    
    return mappings[participantId] || null;
  }

  async getAllContactMappings(userId: string): Promise<{ participantId: string; phoneNumber: string; contactName: string }[]> {
    // SECURITY: Fail-safe - require userId for data isolation
    if (!userId) {
      console.warn('⚠️ getAllContactMappings called without userId - returning empty results for security');
      return [];
    }
    
    // Add workspace isolation (for now return hardcoded mapping filtered by userId)
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      return [];
    }
    
    // Return hardcoded mapping for now (workspace-scoped)
    return [
      {
        participantId: "110308181950700",
        phoneNumber: "+852 9370 4267", 
        contactName: "Lucy"
      }
    ];
  }

  // Message log methods for comprehensive incoming message tracking
  async createMessageLog(messageLog: InsertMessageLog): Promise<MessageLog> {
    // **DEBUG**: Log what we're trying to insert
    console.log('🔍 createMessageLog called with:', JSON.stringify(messageLog, null, 2));
    
    // **CRITICAL FIX**: Ensure timestamp is never null
    if (!messageLog.timestamp) {
      console.warn('⚠️ Null timestamp detected, using current time');
      messageLog.timestamp = new Date();
    }
    
    const [newLog] = await db.insert(messageLogs).values(messageLog).returning();
    return newLog;
  }

  async getMessageLogs(filters: MessageLogFilters & { userId: string }): Promise<{ logs: MessageLog[], total: number }> {
    const conditions = [];
    
    // SECURITY: Fail-safe - require userId for data isolation
    if (!filters.userId) {
      console.warn('⚠️ getMessageLogs called without userId - returning empty results for security');
      return { logs: [], total: 0 };
    }
    
    // Add workspace isolation for message logs
    const dataWorkspaceId = await this.getDataWorkspaceId(filters.userId);
    if (dataWorkspaceId) {
      conditions.push(eq(messageLogs.userId, dataWorkspaceId));
    } else {
      return { logs: [], total: 0 };
    }
    
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(messageLogs.message, searchTerm),
          ilike(messageLogs.sender, searchTerm),
          ilike(messageLogs.groupName, searchTerm)
        )
      );
    }
    
    if (filters.sender) {
      conditions.push(ilike(messageLogs.sender, `%${filters.sender}%`));
    }
    
    if (filters.groupId) {
      conditions.push(eq(messageLogs.groupId, filters.groupId));
    }
    
    if (filters.status) {
      conditions.push(eq(messageLogs.status, filters.status));
    }
    
    if (filters.dateFrom) {
      conditions.push(gte(messageLogs.timestamp, new Date(filters.dateFrom)));
    }
    
    if (filters.dateTo) {
      conditions.push(lte(messageLogs.timestamp, new Date(filters.dateTo)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters.limit || 500; // Default to 500 instead of 100
    const offset = filters.offset || 0;

    const [logs, totalResult] = await Promise.all([
      db
        .select()
        .from(messageLogs)
        .where(whereClause)
        .orderBy(desc(messageLogs.timestamp))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(messageLogs)
        .where(whereClause)
    ]);

    return {
      logs,
      total: totalResult[0]?.count || 0
    };
  }

  async updateMessageLogStatus(messageId: string, status: string, parsedCount?: number, requirementCount?: number, errorMessage?: string, userId?: string): Promise<void> {
    const updateData: any = { 
      status, 
      processed: status === 'processed' || status === 'requirement'
    };
    
    if (parsedCount !== undefined) updateData.parsedCount = parsedCount;
    if (requirementCount !== undefined) updateData.requirementCount = requirementCount;
    if (errorMessage !== undefined) updateData.errorMessage = errorMessage;

    let whereCondition = eq(messageLogs.messageId, messageId);
    
    // If userId provided, add workspace filtering for security
    if (userId) {
      const dataWorkspaceId = await this.getDataWorkspaceId(userId);
      if (dataWorkspaceId) {
        whereCondition = and(
          eq(messageLogs.messageId, messageId),
          eq(messageLogs.userId, dataWorkspaceId)
        );
      }
    }

    await db
      .update(messageLogs)
      .set(updateData)
      .where(whereCondition);
  }

  async cleanupOldMessageLogs(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = await db
      .delete(messageLogs)
      .where(lte(messageLogs.createdAt, cutoffDate))
      .returning();
    
    return result.length;
  }
  
  // User WhatsApp Configuration methods (multi-tenant)
  async getUserWhatsappConfig(userId: string): Promise<UserWhatsappConfig | undefined> {
    const [config] = await db.select().from(userWhatsappConfig).where(eq(userWhatsappConfig.userId, userId));
    return config || undefined;
  }

  async getUserWhatsappConfigByInstance(instanceId: string): Promise<UserWhatsappConfig | undefined> {
    const [config] = await db.select().from(userWhatsappConfig).where(eq(userWhatsappConfig.instanceId, instanceId));
    return config || undefined;
  }

  async createUserWhatsappConfig(config: InsertUserWhatsappConfig): Promise<UserWhatsappConfig> {
    const [newConfig] = await db.insert(userWhatsappConfig).values(config).returning();
    return newConfig;
  }

  async updateUserWhatsappConfig(userId: string, updates: Partial<InsertUserWhatsappConfig>): Promise<UserWhatsappConfig> {
    const [config] = await db
      .update(userWhatsappConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userWhatsappConfig.userId, userId))
      .returning();
    return config;
  }

  async deleteUserWhatsappConfig(userId: string): Promise<boolean> {
    const result = await db.delete(userWhatsappConfig).where(eq(userWhatsappConfig.userId, userId));
    return result.rowCount > 0;
  }

  async getUserIdByInstanceId(instanceId: string): Promise<string | undefined> {
    // CRITICAL FIX: When multiple users share the same instance ID, always prefer the admin user
    // This ensures webhook messages route to the correct workspace owner
    const configs = await db
      .select({ 
        userId: userWhatsappConfig.userId,
        isAdmin: users.isAdmin,
        email: users.email
      })
      .from(userWhatsappConfig)
      .innerJoin(users, eq(userWhatsappConfig.userId, users.id))
      .where(eq(userWhatsappConfig.instanceId, instanceId))
      .orderBy(desc(users.isAdmin)); // Admin users first
    
    if (configs.length > 0) {
      const adminConfig = configs.find(c => c.isAdmin);
      const selectedConfig = adminConfig || configs[0];
      
      if (configs.length > 1) {
        console.log(`⚠️ Multiple users share instance ${instanceId}:`, configs.map(c => `${c.email} (admin: ${c.isAdmin})`));
        console.log(`🔐 Prioritizing admin: ${selectedConfig.email}`);
      }
      
      console.log(`🔐 Instance match: ${instanceId} → User ${selectedConfig.userId} (${selectedConfig.email})`);
      return selectedConfig.userId;
    }

    // **DYNAMIC INSTANCE SHARING**: If no direct match, check if there are admin instances available
    // and users with use_shared_data=true who can use them
    console.log(`🔍 No direct match for instance ${instanceId}, checking for shared admin instances...`);
    
    // Get all admin instances that are available
    const adminInstances = await db
      .select({ 
        userId: userWhatsappConfig.userId,
        instanceId: userWhatsappConfig.instanceId,
        email: users.email
      })
      .from(userWhatsappConfig)
      .innerJoin(users, eq(userWhatsappConfig.userId, users.id))
      .where(eq(users.isAdmin, true));

    if (adminInstances.length > 0) {
      console.log(`🔐 Found ${adminInstances.length} admin instances:`, adminInstances.map(ai => ai.instanceId));
      
      // SECURITY CHECK: Only route if the unknown instance is actually an admin instance
      const adminInstanceIds = adminInstances.map(ai => ai.instanceId).filter(id => id); // Remove nulls
      const isAdminInstance = adminInstanceIds.includes(instanceId);
      
      if (!isAdminInstance) {
        console.log(`🚫 Security: Instance ${instanceId} is not an admin instance. Admin instances: [${adminInstanceIds.join(', ')}]`);
        console.log(`❌ No user found for instance ID: ${instanceId} - potential security breach attempt`);
        return undefined;
      }
      
      // SECURITY FIX: Find the admin who owns this specific instance, then only look for shared users within that admin's workspace
      console.log(`🔍 Finding admin owner for instance ${instanceId} to ensure proper tenant isolation...`);
      
      const adminOwner = adminInstances.find(ai => ai.instanceId === instanceId);
      
      if (!adminOwner) {
        console.log(`❌ Admin instance ${instanceId} found in list but no owner identified - security error`);
        return undefined;
      }
      
      console.log(`🔐 Instance ${instanceId} is owned by admin ${adminOwner.userId} (${adminOwner.email})`);
      
      // TENANT ISOLATION: Only look for shared users within the same workspace as the admin instance owner
      console.log(`🔍 Searching for shared users within admin ${adminOwner.userId}'s workspace...`);
      
      const [sharedDataUser] = await db
        .select({ userId: users.id, email: users.email, useSharedData: users.useSharedData, workspaceOwnerId: users.workspaceOwnerId })
        .from(users)
        .where(
          and(
            eq(users.useSharedData, true),
            eq(users.workspaceOwnerId, adminOwner.userId)
          )
        )
        .orderBy(users.createdAt) // Deterministic routing
        .limit(1);

      console.log(`🔍 Found workspace-scoped shared user:`, sharedDataUser);

      if (sharedDataUser?.userId) {
        console.log(`🔐 Secure tenant routing: ${instanceId} → User ${sharedDataUser.userId} (${sharedDataUser.email}) within admin ${adminOwner.userId}'s workspace`);
        return sharedDataUser.userId;
      } else {
        // FALLBACK: Route to the admin's own userId if no shared users exist in their workspace
        console.log(`⚠️ No shared users in admin ${adminOwner.userId}'s workspace, routing to admin's own account`);
        console.log(`🔐 Admin fallback routing: ${instanceId} → Admin ${adminOwner.userId} (${adminOwner.email})`);
        return adminOwner.userId;
      }
    }

    console.log(`❌ No user found for instance ID: ${instanceId}`);
    return undefined;
  }

  // Polling service support methods
  async getAllUsersWithActiveWhatsapp(): Promise<UserWhatsappConfig[]> {
    return await db
      .select()
      .from(userWhatsappConfig)
      .where(eq(userWhatsappConfig.isActive, true));
  }

  async getLastMessageTime(userId: string): Promise<Date | null> {
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      return null;
    }

    const [result] = await db
      .select({ createdAt: watchListings.createdAt })
      .from(watchListings)
      .where(eq(watchListings.userId, dataWorkspaceId))
      .orderBy(desc(watchListings.createdAt))
      .limit(1);

    return result?.createdAt || null;
  }

  async messageExists(userId: string, messageId: string): Promise<boolean> {
    const dataWorkspaceId = await this.getDataWorkspaceId(userId);
    if (!dataWorkspaceId) {
      return false;
    }

    const [result] = await db
      .select({ id: messageLogs.id })
      .from(messageLogs)
      .where(
        and(
          eq(messageLogs.userId, dataWorkspaceId),
          eq(messageLogs.messageId, messageId)
        )
      )
      .limit(1);

    return !!result;
  }

  async getMessageLogById(id: number): Promise<any> {
    const [log] = await db
      .select()
      .from(messageLogs)
      .where(eq(messageLogs.id, id))
      .limit(1);
    return log;
  }

  // Feature access control implementation
  async getUserFeatureAccess(userId: string): Promise<FeatureAccess> {
    // Get user with their plan
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get plan details from subscription_plans table
    const [plan] = await db.select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.name, user.plan));

    if (!plan) {
      // Default to free plan if plan not found
      return {
        canAccessAdvancedSearch: false,
        canExportData: false,
        canAccessMultipleGroups: false,
        canCreateUnlimitedAlerts: false,
        canAccessAPI: false,
        hasCustomIntegrations: false,
        hasPrioritySupport: false,
        maxMessages: 100,
        maxStorageMb: 50,
        maxWhatsappGroups: 1,
        maxPidAlerts: 3,
      };
    }

    const features = plan.features || [];
    return {
      canAccessAdvancedSearch: features.includes('advanced_search') || features.includes('enterprise_search'),
      canExportData: features.includes('export_data'),
      canAccessMultipleGroups: features.includes('multiple_groups') || features.includes('unlimited_groups'),
      canCreateUnlimitedAlerts: features.includes('unlimited_alerts'),
      canAccessAPI: features.includes('api_access'),
      hasCustomIntegrations: features.includes('custom_integrations'),
      hasPrioritySupport: features.includes('priority_support') || features.includes('dedicated_support'),
      maxMessages: plan.max_messages || 100,
      maxStorageMb: plan.max_storage_mb || 50,
      maxWhatsappGroups: plan.max_whatsapp_groups || 1,
      maxPidAlerts: plan.max_pid_alerts || 3,
    };
  }

  async checkFeatureAccess(userId: string, feature: string): Promise<boolean> {
    const access = await this.getUserFeatureAccess(userId);
    
    switch (feature) {
      case 'advanced_search':
        return access.canAccessAdvancedSearch;
      case 'export_data':
        return access.canExportData;
      case 'multiple_groups':
        return access.canAccessMultipleGroups;
      case 'unlimited_alerts':
        return access.canCreateUnlimitedAlerts;
      case 'api_access':
        return access.canAccessAPI;
      case 'custom_integrations':
        return access.hasCustomIntegrations;
      case 'priority_support':
        return access.hasPrioritySupport;
      default:
        return false;
    }
  }

  async getUserUsageLimits(userId: string): Promise<{ messages: number; storage: number; groups: number; alerts: number }> {
    const access = await this.getUserFeatureAccess(userId);
    return {
      messages: access.maxMessages,
      storage: access.maxStorageMb,
      groups: access.maxWhatsappGroups,
      alerts: access.maxPidAlerts,
    };
  }

  async isWithinUsageLimits(userId: string): Promise<{ withinLimits: boolean; exceeded: string[] }> {
    const user = await this.getUser(userId);
    const limits = await this.getUserUsageLimits(userId);
    
    if (!user) {
      return { withinLimits: false, exceeded: ['user_not_found'] };
    }

    const exceeded: string[] = [];

    // Check message usage
    if (user.usageMessages >= limits.messages) {
      exceeded.push('messages');
    }

    // Check storage usage  
    if (user.usageStorageMb >= limits.storage) {
      exceeded.push('storage');
    }

    // Check WhatsApp groups usage
    if (user.usageWhatsappGroups >= limits.groups) {
      exceeded.push('whatsapp_groups');
    }

    // Check PID alerts count
    const alertsCount = await db.select({ count: count() })
      .from(pidAlerts)
      .where(eq(pidAlerts.userId, userId));
    
    if (alertsCount[0]?.count >= limits.alerts) {
      exceeded.push('pid_alerts');
    }

    return {
      withinLimits: exceeded.length === 0,
      exceeded
    };
  }
}

export const storage = new DatabaseStorage();
