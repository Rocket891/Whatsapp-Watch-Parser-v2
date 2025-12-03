import { and, eq, or, inArray } from 'drizzle-orm';
import { db } from '../db';
import { users } from '@shared/schema';

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