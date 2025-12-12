import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { storage } from '../storage';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { watchListings, watchRequirements, processingLogs, users } from '../../shared/schema';
import { lt, sql, eq, and, inArray } from 'drizzle-orm';

// Helper function to get all user IDs in deletion scope (admin + team members)
async function getDeleteScopeUserIds(adminUserId: string): Promise<string[]> {
  // Get all team members where this admin is the workspace owner
  const teamMembers = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.workspaceOwnerId, adminUserId));
  
  // Include admin's own ID plus all team member IDs
  const allUserIds = [adminUserId, ...teamMembers.map(m => m.id)];
  console.log(`🗑️  Delete scope: Admin ${adminUserId} + ${teamMembers.length} team members = ${allUserIds.length} users total`);
  
  return allUserIds;
}

const router = Router();

// Apply admin middleware to all routes
router.use(requireAdmin);

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await storage.getAllUsers();
    
    // PERFORMANCE FIX: Get all users' stats in a single query instead of per-user queries
    // This reduces 14 queries (2 per user x 7 users) to just 1 query!
    const listingsCountsByUser = await db
      .select({
        userId: watchListings.userId,
        count: sql<number>`COUNT(*)::int`
      })
      .from(watchListings)
      .groupBy(watchListings.userId);
    
    // Create a lookup map for O(1) access
    const listingsMap = new Map(
      listingsCountsByUser.map(row => [row.userId, row.count])
    );
    
    // Merge stats with user data
    const usersWithStats = users.map(user => {
      const totalListings = listingsMap.get(user.id) || 0;
      const dataUsage = totalListings * 1024; // Estimate ~1KB per listing
      
      return {
        ...user,
        passwordHash: undefined, // Remove password hash from response for security
        totalListings,
        dataUsage
      };
    });
    
    res.json(usersWithStats);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create new user
router.post('/users', async (req, res) => {
  try {
    const { email, password, plan = 'free' } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Check if user already exists
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Only rocketelabs@gmail.com can be admin
    const isAdmin = email === 'rocketelabs@gmail.com';
    
    // For team plan users, set the current admin as workspace owner
    let workspaceOwnerId = null;
    if (plan === 'team') {
      const currentUser = (req as any).user;
      workspaceOwnerId = currentUser.id;
    }
    
    const user = await storage.createUser({
      email,
      passwordHash: hashedPassword,
      firstName: email.split('@')[0], // Default first name from email
      lastName: '',
      plan,
      isAdmin,
      workspaceOwnerId,
    });
    
    // If it's a team member, also create a team member record
    if (plan === 'team' && workspaceOwnerId) {
      await storage.addTeamMember(workspaceOwnerId, email);
    }
    
    // Remove password from response
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
router.put('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    const currentAdmin = (req as any).user;
    
    // Never allow changing admin status - only rocketelabs@gmail.com can be admin
    if ('isAdmin' in updates) {
      delete updates.isAdmin;
    }
    
    // SHARED DATA FEATURE: When enabling useSharedData, also set workspaceOwnerId to current admin
    // This ensures proper data access linkage
    if (updates.useSharedData === true) {
      updates.workspaceOwnerId = currentAdmin.id;
      console.log(`📎 Linking shared data user ${userId} to admin ${currentAdmin.id}`);
    }
    
    // If disabling useSharedData AND user is not a team member, clear workspaceOwnerId
    if (updates.useSharedData === false) {
      const existingUser = await storage.getUser(userId);
      // Only clear workspaceOwnerId if user was a shared data user (not a team member)
      if (existingUser && existingUser.useSharedData === true && existingUser.plan !== 'team') {
        updates.workspaceOwnerId = null;
        console.log(`🔓 Unlinking shared data user ${userId} from admin workspace`);
      }
    }
    
    const user = await storage.updateUser(userId, updates);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove password from response
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Reset user password
router.post('/users/:userId/reset-password', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Generate new password
    const newPassword = 'pass' + Math.random().toString(36).slice(2, 8);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const user = await storage.updateUser(userId, {
      passwordHash: hashedPassword
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ newPassword, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Delete user
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Prevent deleting self
    if ((req as any).user.id === userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const success = await storage.deleteUser(userId);
    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Team member management routes

// Get team members for current workspace
router.get('/team-members', async (req, res) => {
  try {
    const adminUser = (req as any).user;
    const workspaceOwnerId = await storage.getWorkspaceOwnerId(adminUser.id);
    
    const teamMembers = await storage.getTeamMembers(workspaceOwnerId);
    res.json(teamMembers);
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// Add team member
router.post('/team-members', async (req, res) => {
  try {
    const { memberEmail } = req.body;
    
    if (!memberEmail) {
      return res.status(400).json({ error: 'Member email is required' });
    }
    
    const adminUser = (req as any).user;
    const workspaceOwnerId = await storage.getWorkspaceOwnerId(adminUser.id);
    
    const teamMember = await storage.addTeamMember(workspaceOwnerId, memberEmail);
    res.json(teamMember);
  } catch (error) {
    console.error('Error adding team member:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// Remove team member
router.delete('/team-members/:memberUserId', async (req, res) => {
  try {
    const { memberUserId } = req.params;
    
    const adminUser = (req as any).user;
    const workspaceOwnerId = await storage.getWorkspaceOwnerId(adminUser.id);
    
    const success = await storage.removeTeamMember(workspaceOwnerId, memberUserId);
    if (!success) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    
    res.json({ message: 'Team member removed successfully' });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// Get system statistics
router.get('/system-stats', async (req, res) => {
  try {
    const totalUsers = await storage.getTotalUsersCount();
    const activeUsers = await storage.getActiveUsersCount();
    const totalListings = await storage.getTotalListingsCount();
    const storageUsed = await storage.getTotalStorageUsed();
    const apiCalls = await storage.getApiCallsCount();
    const errorRate = await storage.getErrorRate();
    
    res.json({
      totalUsers,
      activeUsers,
      totalListings,
      storageUsed,
      apiCalls,
      errorRate,
    });
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({ error: 'Failed to fetch system statistics' });
  }
});

// Get system settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await storage.getSystemSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({ error: 'Failed to fetch system settings' });
  }
});

// Update system settings
router.put('/settings', async (req, res) => {
  try {
    const settings = req.body;
    const updatedSettings = await storage.updateSystemSettings(settings);
    res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({ error: 'Failed to update system settings' });
  }
});

// Save feature settings
router.post('/features', async (req, res) => {
  try {
    const featureSettings = req.body;
    
    // Here you could save to database if needed
    // For now, just return success
    console.log('Feature settings received:', featureSettings);
    
    res.json({ message: 'Feature settings saved successfully' });
  } catch (error) {
    console.error('Error saving features:', error);
    res.status(500).json({ error: 'Failed to save feature settings' });
  }
});

// Data deletion endpoints - ADMIN ONLY
router.delete('/data/older-than/:days', async (req, res) => {
  try {
    const days = parseInt(req.params.days);
    const userId = (req as any).user?.id;
    const isAdmin = (req as any).user?.isAdmin;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // SECURITY: Only admin can delete data
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admin users can delete data' });
    }

    if (isNaN(days) || days < 1) {
      return res.status(400).json({ error: 'Invalid number of days' });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateString = cutoffDate.toISOString().split('T')[0];

    // ADMIN FIX: Delete data for admin + all team members
    const userIdsToDelete = await getDeleteScopeUserIds(userId);

    const deletedListings = await db.delete(watchListings)
      .where(and(
        inArray(watchListings.userId, userIdsToDelete),
        lt(watchListings.date, cutoffDateString)
      ));

    const deletedRequirements = await db.delete(watchRequirements)
      .where(and(
        inArray(watchRequirements.userId, userIdsToDelete),
        lt(watchRequirements.date, cutoffDateString)
      ));

    const deletedLogs = await db.delete(processingLogs)
      .where(and(
        inArray(processingLogs.userId, userIdsToDelete),
        lt(processingLogs.createdAt, cutoffDate)
      ));

    res.json({
      message: `Deleted data older than ${days} days for ${userIdsToDelete.length} user(s)`,
      deletedListings: deletedListings.rowCount,
      deletedRequirements: deletedRequirements.rowCount,
      deletedLogs: deletedLogs.rowCount,
      cutoffDate: cutoffDate.toISOString(),
      usersAffected: userIdsToDelete.length
    });
  } catch (error) {
    console.error('Error deleting old data:', error);
    res.status(500).json({ error: 'Failed to delete old data' });
  }
});

router.delete('/data/date-range', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const userId = (req as any).user?.id;
    const isAdmin = (req as any).user?.isAdmin;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // SECURITY: Only admin can delete data
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admin users can delete data' });
    }
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    // Format dates as YYYY-MM-DD strings for comparison with date column
    const start = startDate.split('T')[0];
    const end = endDate.split('T')[0];

    // ADMIN FIX: Delete data for admin + all team members
    const userIdsToDelete = await getDeleteScopeUserIds(userId);

    const deletedListings = await db.delete(watchListings)
      .where(and(
        inArray(watchListings.userId, userIdsToDelete),
        sql`${watchListings.date} >= ${start} AND ${watchListings.date} <= ${end}`
      ));

    const deletedRequirements = await db.delete(watchRequirements)
      .where(and(
        inArray(watchRequirements.userId, userIdsToDelete),
        sql`${watchRequirements.date} >= ${start} AND ${watchRequirements.date} <= ${end}`
      ));

    res.json({
      message: `Deleted data from ${startDate} to ${endDate} for ${userIdsToDelete.length} user(s)`,
      deletedListings: deletedListings.rowCount,
      deletedRequirements: deletedRequirements.rowCount,
      dateRange: { startDate, endDate },
      usersAffected: userIdsToDelete.length
    });
  } catch (error) {
    console.error('Error deleting data by date range:', error);
    res.status(500).json({ error: 'Failed to delete data by date range' });
  }
});

router.delete('/data/all-listings', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const isAdmin = (req as any).user?.isAdmin;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // SECURITY: Only admin can delete data
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admin users can delete data' });
    }

    // ADMIN FIX: Delete data for admin + all team members
    const userIdsToDelete = await getDeleteScopeUserIds(userId);

    const deletedListings = await db.delete(watchListings)
      .where(inArray(watchListings.userId, userIdsToDelete));
    
    const deletedRequirements = await db.delete(watchRequirements)
      .where(inArray(watchRequirements.userId, userIdsToDelete));

    res.json({
      message: `All watch listings and requirements deleted for ${userIdsToDelete.length} user(s)`,
      deletedListings: deletedListings.rowCount,
      deletedRequirements: deletedRequirements.rowCount,
      usersAffected: userIdsToDelete.length
    });
  } catch (error) {
    console.error('Error deleting all listings:', error);
    res.status(500).json({ error: 'Failed to delete all listings' });
  }
});

// ADMIN FEATURE: User impersonation route
router.post('/impersonate/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const adminUser = (req as any).user;
    
    // Double check admin access
    if (!adminUser.isAdmin) {
      return res.status(403).json({ error: 'Admin access required for impersonation' });
    }
    
    // Get the target user
    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // For security, don't allow impersonating other admins
    if (targetUser.isAdmin) {
      return res.status(403).json({ error: 'Cannot impersonate other admin users' });
    }
    
    // Generate a temporary token for the target user
    const jwt = await import('jsonwebtoken');
    const token = jwt.default.sign(
      { 
        userId: targetUser.id, 
        email: targetUser.email, 
        plan: targetUser.plan,
        isAdmin: targetUser.isAdmin,
        workspaceOwnerId: targetUser.workspaceOwnerId,
        impersonatedBy: adminUser.id 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' } // 1 hour session for impersonation
    );
    
    // Remove password hash from response
    const { passwordHash: _, ...userWithoutPassword } = targetUser;
    
    res.json({ 
      token, 
      user: userWithoutPassword,
      message: `Impersonating ${targetUser.email} for 1 hour`,
      impersonatedBy: adminUser.email
    });
  } catch (error) {
    console.error('Error impersonating user:', error);
    res.status(500).json({ error: 'Failed to impersonate user' });
  }
});

export default router;