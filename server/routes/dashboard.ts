import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    // Get total counts  
    const totalListings = await storage.query(`SELECT COUNT(*) as count FROM watch_listings`);
    const totalRequirements = await storage.query(`SELECT COUNT(*) as count FROM watch_requirements`); 
    const totalContacts = await storage.query(`SELECT COUNT(*) as count FROM contacts`);
    const totalGroups = await storage.query(`SELECT COUNT(DISTINCT group_name) as count FROM contacts WHERE group_name IS NOT NULL AND group_name != 'Unknown Group'`);
    
    // Get today's message count
    const todayMessages = await storage.query(`
      SELECT COUNT(*) as count 
      FROM watch_listings 
      WHERE DATE(date) = CURRENT_DATE
    `);
    
    // Get successful parsing count
    const successfulParses = await storage.query(`
      SELECT COUNT(*) as count 
      FROM processing_logs 
      WHERE status = 'success' 
      AND DATE(created_at) = CURRENT_DATE
    `);
    
    // Get error count
    const errorCount = await storage.query(`
      SELECT COUNT(*) as count 
      FROM processing_logs 
      WHERE status = 'error' 
      AND DATE(created_at) = CURRENT_DATE
    `);
    
    // Get top groups by activity
    const topGroups = await storage.query(`
      SELECT group_name, COUNT(*) as count
      FROM watch_listings 
      WHERE group_name IS NOT NULL 
      AND group_name != 'Unknown Group'
      GROUP BY group_name 
      ORDER BY count DESC 
      LIMIT 5
    `);
    
    // Get recent activity
    const recentActivity = await storage.query(`
      SELECT 
        'listing' as type,
        CONCAT('New listing: ', pid) as message,
        date as timestamp,
        'success' as status
      FROM watch_listings 
      WHERE DATE(date) >= CURRENT_DATE - INTERVAL '7 days'
      UNION ALL
      SELECT 
        'requirement' as type,
        CONCAT('New requirement: ', pid) as message,
        date as timestamp,
        'info' as status
      FROM watch_requirements 
      WHERE DATE(date) >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY timestamp DESC 
      LIMIT 10
    `);

    const stats = {
      totalListings: totalListings[0]?.count || 0,
      totalRequirements: totalRequirements[0]?.count || 0,
      totalContacts: totalContacts[0]?.count || 0,
      totalGroups: totalGroups[0]?.count || 0,
      todayMessages: todayMessages[0]?.count || 0,
      activeConnections: 1, // WhatsApp connection
      successfulParses: successfulParses[0]?.count || 0,
      errorCount: errorCount[0]?.count || 0,
      topGroups: topGroups || [],
      recentActivity: recentActivity || []
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

export { router as dashboardRouter };