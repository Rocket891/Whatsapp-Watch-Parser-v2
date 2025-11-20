// server/routes/inventory.ts
import express from 'express';
import { parseInventoryMessage } from '../inventory-parser';

const router = express.Router();

// Store inventory items
let inventoryItems: any[] = [];

// POST /api/inventory/upload - Parse and store inventory
router.post('/api/inventory/upload', async (req, res) => {
  try {
    const { message, source } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message content required' });
    }
    
    const parsedItems = parseInventoryMessage(message);
    
    // Add metadata
    const itemsWithMeta = parsedItems.map(item => ({
      ...item,
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source: source || 'manual',
      addedAt: new Date().toISOString(),
    }));
    
    // Store items (replace existing)
    inventoryItems = itemsWithMeta;
    
    res.json({
      success: true,
      message: `Parsed ${parsedItems.length} inventory items`,
      items: itemsWithMeta,
      count: parsedItems.length
    });
    
  } catch (error) {
    console.error('Inventory upload error:', error);
    res.status(500).json({ error: 'Failed to parse inventory' });
  }
});

// GET /api/inventory - Get all inventory items
router.get('/api/inventory', async (req, res) => {
  try {
    const { search, brand, condition, minPrice, maxPrice } = req.query;
    
    let filtered = [...inventoryItems];
    
    // Apply filters
    if (search) {
      const searchLower = String(search).toLowerCase();
      filtered = filtered.filter(item => 
        item.pid?.toLowerCase().includes(searchLower) ||
        item.brand?.toLowerCase().includes(searchLower) ||
        item.variant?.toLowerCase().includes(searchLower)
      );
    }
    
    if (brand) {
      filtered = filtered.filter(item => 
        item.brand?.toLowerCase().includes(String(brand).toLowerCase())
      );
    }
    
    if (condition) {
      filtered = filtered.filter(item => 
        item.condition?.toLowerCase().includes(String(condition).toLowerCase())
      );
    }
    
    if (minPrice) {
      filtered = filtered.filter(item => 
        item.price && item.price >= Number(minPrice)
      );
    }
    
    if (maxPrice) {
      filtered = filtered.filter(item => 
        item.price && item.price <= Number(maxPrice)
      );
    }
    
    res.json({
      items: filtered,
      total: filtered.length
    });
    
  } catch (error) {
    console.error('Inventory fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// POST /api/inventory/match-requirements - Check requirements against inventory
router.post('/api/inventory/match-requirements', async (req, res) => {
  try {
    const { requirementPid, requirementVariant } = req.body;
    
    if (!requirementPid) {
      return res.status(400).json({ error: 'Requirement PID required' });
    }
    
    // Find matching inventory items
    const matches = inventoryItems.filter(item => {
      // Exact PID match
      if (item.pid === requirementPid) {
        // If requirement has specific variant, check if inventory matches
        if (requirementVariant && requirementVariant !== 'any condition') {
          return !item.variant || item.variant.toLowerCase().includes(requirementVariant.toLowerCase());
        }
        return true;
      }
      return false;
    });
    
    res.json({
      matches,
      count: matches.length,
      requirementPid,
      requirementVariant
    });
    
  } catch (error) {
    console.error('Inventory match error:', error);
    res.status(500).json({ error: 'Failed to match requirements' });
  }
});

// DELETE /api/inventory - Clear all inventory
router.delete('/api/inventory', async (req, res) => {
  try {
    inventoryItems = [];
    res.json({ success: true, message: 'Inventory cleared' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear inventory' });
  }
});

export default router;