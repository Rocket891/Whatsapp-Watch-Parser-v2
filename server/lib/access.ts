import { and, eq, or, inArray } from 'drizzle-orm';
import { db } from '../db';
import { users } from '@shared/schema';

export type AuthUser = {
  id: string;
  isAdmin: boolean;
  workspaceOwnerId?: string | null;
};

/**
 * Get all user IDs that the current user can access data for.
 * - Admin users: see their own data + any team members under them
 * - Shared users (workspaceOwnerId set): see their workspace owner's data + their own data
 * - Regular users: see only their own data (workspace isolation)
 */
export async function getAccessibleUserIds(currentUser: AuthUser): Promise<string[]> {
  if (!currentUser.id) {
    return [];
  }

  // Admin users can see their own data + team members
  if (currentUser.isAdmin) {
    const teamMembers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.workspaceOwnerId, currentUser.id));
    
    const teamMemberIds = teamMembers.map(member => member.id);
    
    // Return admin + all their team members
    return [currentUser.id, ...teamMemberIds];
  }

  // Shared users (have workspaceOwnerId) can see their workspace owner's data
  if (currentUser.workspaceOwnerId) {
    // Get all users in the same workspace (same workspace owner + the workspace owner itself)
    const workspaceUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        or(
          eq(users.id, currentUser.workspaceOwnerId), // The workspace owner
          eq(users.workspaceOwnerId, currentUser.workspaceOwnerId) // Other shared users in same workspace
        )
      );
    
    const workspaceUserIds = workspaceUsers.map(user => user.id);
    
    // Return current user + workspace owner + other shared users in same workspace
    return [currentUser.id, ...workspaceUserIds];
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