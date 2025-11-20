import { users, watchListings, processingLogs, systemStats, pidAlerts, referenceDatabase, type User, type InsertUser, type WatchListing, type InsertWatchListing, type ProcessingLog, type InsertProcessingLog, type SystemStats, type InsertSystemStats, type SearchFilters, type PidAlert, type InsertPidAlert, type ReferenceDatabase, type InsertReferenceDatabase } from "@shared/schema";
import { db } from "./db";
import { eq, and, or, gte, lte, ilike, desc, asc, sql, count } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Watch listing methods
  createWatchListing(listing: InsertWatchListing): Promise<WatchListing>;
  getWatchListings(filters: SearchFilters): Promise<{ listings: WatchListing[], total: number }>;
  getWatchListingById(id: number): Promise<WatchListing | undefined>;
  getWatchListingsByPid(pid: string): Promise<WatchListing[]>;
  getRecentWatchListings(limit?: number): Promise<WatchListing[]>;
  
  // Processing log methods
  createProcessingLog(log: InsertProcessingLog): Promise<ProcessingLog>;
  getProcessingLogs(limit?: number): Promise<ProcessingLog[]>;
  getRecentErrors(limit?: number): Promise<ProcessingLog[]>;
  
  // System stats methods
  updateSystemStats(date: string, stats: Partial<InsertSystemStats>): Promise<SystemStats>;
  getSystemStats(date: string): Promise<SystemStats | undefined>;
  getSystemStatsRange(fromDate: string, toDate: string): Promise<SystemStats[]>;
  
  // Analytics methods
  getDashboardStats(): Promise<{
    messagesToday: number;
    parsedSuccess: number;
    parseErrors: number;
    uniquePids: number;
  }>;
  
  getUniquePids(): Promise<string[]>;
  getUniqueConditions(): Promise<string[]>;
  getCurrencyStats(): Promise<{ currency: string; count: number }[]>;
  getSenderStats(): Promise<{ sender: string; count: number }[]>;
  
  // Update methods
  updateWatchListingGroupName(id: number, groupName: string): Promise<void>;
  
  // Reference database methods
  getAllReferenceRecords(): Promise<ReferenceDatabase[]>;
  createReferenceRecord(record: InsertReferenceDatabase): Promise<ReferenceDatabase>;
  clearReferenceDatabase(): Promise<void>;
  
  // PID Alert methods
  getAllPidAlerts(): Promise<PidAlert[]>;
  createPidAlert(alert: InsertPidAlert): Promise<PidAlert>;
  updatePidAlert(id: number, alert: Partial<InsertPidAlert>): Promise<PidAlert>;
  deletePidAlert(id: number): Promise<void>;
  checkPidAlerts(pid: string, variant: string | null, price: number | null, currency: string | null): Promise<PidAlert[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createWatchListing(listing: InsertWatchListing): Promise<WatchListing> {
    const [watchListing] = await db
      .insert(watchListings)
      .values(listing)
      .returning();
    return watchListing;
  }

  async getWatchListings(filters: SearchFilters): Promise<{ listings: WatchListing[], total: number }> {
    const conditions = [];
    
    // Multiple PID search
    if (filters.pids && filters.pids.length > 0) {
      const pidConditions = filters.pids.map(pid => ilike(watchListings.pid, `%${pid}%`));
      conditions.push(or(...pidConditions));
    } else if (filters.pid) {
      conditions.push(ilike(watchListings.pid, `%${filters.pid}%`));
    }
    
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

    // Sorting - build the order clause first
    let orderByClause;
    if (filters.sortBy) {
      const sortOrder = filters.sortOrder === 'desc' ? desc : asc;
      switch (filters.sortBy) {
        case 'createdAt':
          orderByClause = sortOrder(watchListings.createdAt);
          break;
        case 'price':
          orderByClause = sortOrder(watchListings.price);
          break;
        case 'date':
          orderByClause = sortOrder(watchListings.date);
          break;
        case 'sender':
          orderByClause = sortOrder(watchListings.sender);
          break;
        case 'pid':
          orderByClause = sortOrder(watchListings.pid);
          break;
        default:
          orderByClause = desc(watchListings.createdAt);
      }
    } else {
      orderByClause = desc(watchListings.createdAt);
    }

    let query = db
      .select()
      .from(watchListings)
      .where(whereClause)
      .orderBy(orderByClause);

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

  async getWatchListingById(id: number): Promise<WatchListing | undefined> {
    const [listing] = await db.select().from(watchListings).where(eq(watchListings.id, id));
    return listing || undefined;
  }

  async getWatchListingsByPid(pid: string): Promise<WatchListing[]> {
    return await db
      .select()
      .from(watchListings)
      .where(eq(watchListings.pid, pid))
      .orderBy(desc(watchListings.createdAt));
  }

  async getRecentWatchListings(limit: number = 10): Promise<WatchListing[]> {
    return await db
      .select()
      .from(watchListings)
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

  async getProcessingLogs(limit: number = 50): Promise<ProcessingLog[]> {
    return await db
      .select()
      .from(processingLogs)
      .orderBy(desc(processingLogs.createdAt))
      .limit(limit);
  }

  async getRecentErrors(limit: number = 10): Promise<ProcessingLog[]> {
    return await db
      .select()
      .from(processingLogs)
      .where(or(eq(processingLogs.status, 'error'), eq(processingLogs.status, 'partial')))
      .orderBy(desc(processingLogs.createdAt))
      .limit(limit);
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

  async getDashboardStats(): Promise<{
    messagesToday: number;
    parsedSuccess: number;
    parseErrors: number;
    uniquePids: number;
  }> {
    const today = new Date().toISOString().split('T')[0];
    
    const [todayStats] = await db
      .select()
      .from(systemStats)
      .where(eq(systemStats.date, today));

    const [uniquePidsResult] = await db
      .select({ count: sql<number>`count(distinct ${watchListings.pid})` })
      .from(watchListings)
      .where(sql`${watchListings.pid} is not null and ${watchListings.pid} != ''`);

    return {
      messagesToday: todayStats?.messagesProcessed || 0,
      parsedSuccess: todayStats?.parsedSuccessful || 0,
      parseErrors: todayStats?.parseErrors || 0,
      uniquePids: uniquePidsResult?.count || 0,
    };
  }

  async getUniquePids(): Promise<string[]> {
    const results = await db
      .selectDistinct({ pid: watchListings.pid })
      .from(watchListings)
      .where(sql`${watchListings.pid} is not null and ${watchListings.pid} != ''`)
      .orderBy(asc(watchListings.pid));
    
    return results.map(r => r.pid!);
  }

  async getUniqueConditions(): Promise<string[]> {
    const results = await db
      .selectDistinct({ condition: watchListings.condition })
      .from(watchListings)
      .where(sql`${watchListings.condition} is not null and ${watchListings.condition} != ''`)
      .orderBy(asc(watchListings.condition));
    
    return results.map(r => r.condition!);
  }

  async getCurrencyStats(): Promise<{ currency: string; count: number }[]> {
    const results = await db
      .select({
        currency: watchListings.currency,
        count: sql<number>`count(*)`,
      })
      .from(watchListings)
      .where(sql`${watchListings.currency} is not null and ${watchListings.currency} != ''`)
      .groupBy(watchListings.currency)
      .orderBy(desc(sql`count(*)`));
    
    return results.map(r => ({ currency: r.currency!, count: r.count }));
  }

  async getSenderStats(): Promise<{ sender: string; count: number }[]> {
    const results = await db
      .select({
        sender: watchListings.sender,
        count: sql<number>`count(*)`,
      })
      .from(watchListings)
      .groupBy(watchListings.sender)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    
    return results.map(r => ({ sender: r.sender, count: r.count }));
  }

  async updateWatchListingGroupName(id: number, groupName: string): Promise<void> {
    await db
      .update(watchListings)
      .set({ groupName })
      .where(eq(watchListings.id, id));
  }
  async getAllReferenceRecords(): Promise<ReferenceDatabase[]> {
    const schema = await import('../shared/schema');
    return await db.select().from(schema.referenceDatabase);
  }

  async createReferenceRecord(record: InsertReferenceDatabase): Promise<ReferenceDatabase> {
    const schema = await import('../shared/schema');
    const [created] = await db.insert(schema.referenceDatabase).values(record).returning();
    return created;
  }

  async clearReferenceDatabase(): Promise<void> {
    const schema = await import('../shared/schema');
    await db.delete(schema.referenceDatabase);
  }
  
  async getAllPidAlerts(): Promise<PidAlert[]> {
    const alerts = await db.select().from(pidAlerts).where(eq(pidAlerts.isActive, true));
    return alerts;
  }
  
  async createPidAlert(alert: InsertPidAlert): Promise<PidAlert> {
    const [newAlert] = await db.insert(pidAlerts).values(alert).returning();
    return newAlert;
  }
  
  async updatePidAlert(id: number, alert: Partial<InsertPidAlert>): Promise<PidAlert> {
    const [updatedAlert] = await db.update(pidAlerts)
      .set({ ...alert, updatedAt: new Date() })
      .where(eq(pidAlerts.id, id))
      .returning();
    return updatedAlert;
  }
  
  async deletePidAlert(id: number): Promise<void> {
    await db.delete(pidAlerts).where(eq(pidAlerts.id, id));
  }
  
  async checkPidAlerts(pid: string, variant: string | null, price: number | null, currency: string | null): Promise<PidAlert[]> {
    let query = db.select().from(pidAlerts).where(
      and(
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
}

export const storage = new DatabaseStorage();
