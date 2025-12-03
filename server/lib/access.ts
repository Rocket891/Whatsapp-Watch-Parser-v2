import { and, eq, or, inArray, not } from 'drizzle-orm';
import { db } from '../db';
import { users, watchListings } from '@shared/schema';

export type AuthUser = {
  id: string;
  isAdmin: boolean;
  workspaceOwnerId?: string | null;
  useSharedData?: boolean | null;
};

/**
 * Get all user IDs that the current user can access data for.
 * - Admin users: see their own data + any team members/shared users explicitly linked to them
 * - Shared users (workspaceOwnerId set): see their workspace owner's data
 * - Regular users: see only their own data (workspace isolation)
 * 
 * SECURITY: Shared data users must have workspaceOwnerId explicitly set by admin
 * They are NOT auto-linked to prevent cross-tenant data leakage
 */
export async function getAccessibleUserIds(currentUser: AuthUser): Promise<string[]> {
  if (!currentUser.id) {
    return [];
  }

  // Admin users can see their own data + users explicitly linked to them (workspaceOwnerId = admin's id)
  if (currentUser.isAdmin) {
    // Only include users who have been explicitly linked to THIS admin via workspaceOwnerId
    const linkedUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.workspaceOwnerId, currentUser.id)); // Only users linked to THIS admin
    
    const linkedUserIds = linkedUsers.map(member => member.id);
    
    // Return admin + all users explicitly linked to them
    return [currentUser.id, ...linkedUserIds];
  }

  // Team members / Shared users with workspaceOwnerId set can see their workspace owner's data
  if (currentUser.workspaceOwnerId) {
    // Get all users in the same workspace (same workspace owner + the workspace owner itself)
    const workspaceUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        or(
          eq(users.id, currentUser.workspaceOwnerId), // The workspace owner
          eq(users.workspaceOwnerId, currentUser.workspaceOwnerId) // Other users in same workspace
        )
      );
    
    const workspaceUserIds = workspaceUsers.map(user => user.id);
    
    // Return current user + workspace owner + other users in same workspace
    return [currentUser.id, ...workspaceUserIds];
  }

  // Shared data users without workspaceOwnerId - they need to be linked by admin first
  // SECURITY: Do not auto-link to any admin - this prevents cross-tenant data leakage
  if (currentUser.useSharedData) {
    console.log(`⚠️ User ${currentUser.id} has useSharedData=true but no workspaceOwnerId - waiting for admin to link them`);
    // Return only their own data until admin explicitly links them
  }

  // Regular users only see their own data
  return [currentUser.id];
}

/**
 * Safe inArray that handles empty lists by returning a condition that never matches
 */
export function inArraySafe<T>(column: any, ids: T[]) {
  if (ids.length === 0) {
    // Return a condition that never matches
    return eq(column, '__never_matches__');
  }
  return inArray(column, ids);
}

/**
 * Create a standard access control WHERE condition for any table with userId column
 */
export async function createUserAccessCondition(currentUser: AuthUser, userIdColumn: any) {
  const accessibleIds = await getAccessibleUserIds(currentUser);
  return inArraySafe(userIdColumn, accessibleIds);
}

/**
 * Create a special access condition for watch_listings table that EXCLUDES inventory from sharing.
 * 
 * INVENTORY PRIVACY RULE:
 * - Admin users can see all data (including their own inventory)
 * - Shared data users can see:
 *   - Their OWN data (including their own inventory)
 *   - Workspace owner's data EXCEPT inventory items (isInventory=true)
 * - Regular users see only their own data
 * 
 * This ensures inventory remains private to each user while sharing all other data.
 */
export async function createWatchListingsAccessCondition(currentUser: AuthUser) {
  console.log('📊 createWatchListingsAccessCondition called with:', {
    id: currentUser.id,
    isAdmin: currentUser.isAdmin,
    workspaceOwnerId: currentUser.workspaceOwnerId,
    useSharedData: currentUser.useSharedData
  });
  
  if (!currentUser.id) {
    console.log('📊 No user ID - returning never matches condition');
    return eq(watchListings.userId, '__never_matches__');
  }

  // Admin users can see all data for themselves and linked users (including inventory)
  if (currentUser.isAdmin) {
    const accessibleIds = await getAccessibleUserIds(currentUser);
    console.log('📊 Admin user - accessible IDs:', accessibleIds);
    return inArraySafe(watchListings.userId, accessibleIds);
  }

  // Shared data users with workspaceOwnerId: see workspace data BUT exclude others' inventory
  if (currentUser.workspaceOwnerId && currentUser.useSharedData) {
    console.log('📊 Shared data user with workspaceOwnerId detected');
    // Get all users in workspace (for reference)
    const workspaceUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        or(
          eq(users.id, currentUser.workspaceOwnerId), // The workspace owner
          eq(users.workspaceOwnerId, currentUser.workspaceOwnerId) // Other users in same workspace
        )
      );
    
    const workspaceUserIds = workspaceUsers.map(user => user.id);
    const otherUserIds = workspaceUserIds.filter(id => id !== currentUser.id);
    
    console.log('📊 Workspace users found:', workspaceUserIds);
    console.log('📊 Other users (for data sharing):', otherUserIds);
    
    // Build condition:
    // - User's own data (any isInventory value) 
    // OR
    // - Other workspace users' data WHERE isInventory = false
    const condition = or(
      eq(watchListings.userId, currentUser.id), // User's own data (including their inventory)
      and(
        inArraySafe(watchListings.userId, otherUserIds), // Other workspace users' data
        eq(watchListings.isInventory, false) // But ONLY non-inventory items
      )
    );
    console.log('📊 Created shared data condition for user:', currentUser.id);
    return condition;
  }

  // Regular users or unlinked shared users: only their own data
  return eq(watchListings.userId, currentUser.id);
}