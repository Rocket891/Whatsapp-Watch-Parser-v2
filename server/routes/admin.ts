import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { storage } from '../storage';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { watchListings, watchRequirements, processingLogs } from '../../shared/schema';
import { lt, sql } from 'drizzle-orm';

const router = Router();

// Apply admin middleware to all routes
router.use(requireAdmin);

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await storage.getAllUsers();
    
    // Add usage statistics for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const totalListings = await storage.getUserListingsCount(user.id);
        const dataUsage = await storage.getUserDataUsage(user.id);
        
        return {
          ...user,
          passwordHash: undefined, // Remove password hash from response for security
          totalListings,
          dataUsage
        };
      })
    );
    
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
    
    // Never allow changing admin status - only rocketelabs@gmail.com can be admin
    if ('isAdmin' in updates) {
      delete updates.isAdmin;
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

// Data deletion endpoints
router.delete('/data/older-than/:days', async (req, res) => {
  try {
    const days = parseInt(req.params.days);
    if (isNaN(days) || days < 1) {
      return res.status(400).json({ error: 'Invalid number of days' });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Delete watch listings older than cutoff date
    const deletedListings = await db.delete(watchListings)
      .where(lt(watchListings.createdAt, cutoffDate));

    // Delete watch requirements older than cutoff date  
    const deletedRequirements = await db.delete(watchRequirements)
      .where(lt(watchRequirements.createdAt, cutoffDate));

    // Delete processing logs older than cutoff date
    const deletedLogs = await db.delete(processingLogs)
      .where(lt(processingLogs.createdAt, cutoffDate));

    res.json({
      message: `Deleted data older than ${days} days`,
      deletedListings: deletedListings.rowCount,
      deletedRequirements: deletedRequirements.rowCount,
      deletedLogs: deletedLogs.rowCount,
      cutoffDate: cutoffDate.toISOString()
    });
  } catch (error) {
    console.error('Error deleting old data:', error);
    res.status(500).json({ error: 'Failed to delete old data' });
  }
});

router.delete('/data/date-range', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Delete watch listings in date range
    const deletedListings = await db.delete(watchListings)
      .where(sql`${watchListings.createdAt} >= ${start} AND ${watchListings.createdAt} <= ${end}`);

    // Delete watch requirements in date range
    const deletedRequirements = await db.delete(watchRequirements)
      .where(sql`${watchRequirements.createdAt} >= ${start} AND ${watchRequirements.createdAt} <= ${end}`);

    res.json({
      message: `Deleted data from ${startDate} to ${endDate}`,
      deletedListings: deletedListings.rowCount,
      deletedRequirements: deletedRequirements.rowCount,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('Error deleting data by date range:', error);
    res.status(500).json({ error: 'Failed to delete data by date range' });
  }
});

router.delete('/data/all-listings', async (req, res) => {
  try {
    // Delete all watch listings
    const deletedListings = await db.delete(watchListings);
    
    // Delete all watch requirements
    const deletedRequirements = await db.delete(watchRequirements);

    res.json({
      message: 'All watch listings and requirements deleted',
      deletedListings: deletedListings.rowCount,
      deletedRequirements: deletedRequirements.rowCount
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