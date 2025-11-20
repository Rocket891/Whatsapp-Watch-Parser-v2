// server/routes/groups.ts
import type { Express } from "express";
import { getGroups, rebuildFromMessages } from "../services/groupDb";

export function registerGroupRoutes(app: Express) {
  app.get("/api/groups", (_req, res) => {
    const groups = getGroups();
    res.json({ ok: true, data: groups });
  });

  /** Optional backfill:
   * POST body: { history: [{ groupId, group_name, groupSubject, chatName, pushName, instanceNumber, timestamp }, ...] }
   */
  app.post("/api/groups/rebuild", (req, res) => {
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    rebuildFromMessages(history);
    res.json({ ok: true, count: history.length });
  });

  // New endpoint to get groups in the format expected by our existing UI
  app.get("/api/whatsapp/database-groups", (_req, res) => {
    try {
      const groups = getGroups();
      const formattedGroups = groups.map(group => ({
        id: `${group.id}@g.us`,
        name: group.name, // FIXED: Just the real name, no ID appended
        instancePhone: group.instanceNumber || '-',
        lastSeen: new Date(group.lastSeen).toISOString()
      }));

      res.json({ groups: formattedGroups });
    } catch (error) {
      console.error('❌ Error fetching database groups:', error);
      res.status(500).json({ error: "Failed to load groups" });
    }
  });
}