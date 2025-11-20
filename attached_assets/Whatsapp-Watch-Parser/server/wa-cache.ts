import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(DATA_DIR, 'wa-cache.json');

export type CacheShape = {
  lastWebhookAt?: number;
  groups: Record<string, { // key: `${instanceId}:${groupId}`
    id: string;
    instanceId: string;
    name?: string;      // friendly/subject
    lastSeen: number;
    size?: number;
    source?: 'webhook'|'api'|'manual';
  }>;
  contacts: Record<string, { // key: waJid like '9198...@s.whatsapp.net'
    id: string;
    name?: string;      // pushName/notify
    lastSeen: number;
    source?: 'webhook'|'api';
  }>;
};

const empty: CacheShape = { groups: {}, contacts: {} };

export function loadCache(): CacheShape {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CACHE_FILE)) return { ...empty };
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...empty, ...parsed };
  } catch {
    return { ...empty };
  }
}

export function saveCache(cache: CacheShape) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.error('❌ Failed to save WA cache:', error);
  }
}

// Module-level cache instance
let WA_CACHE = loadCache();

// Cache helper functions
export function cacheSetLastWebhook() { 
  WA_CACHE.lastWebhookAt = Date.now(); 
  saveCache(WA_CACHE); 
}

export function upsertGroup(instanceId: string, groupId: string, patch: Partial<{name:string; size:number; source:'webhook'|'api'|'manual'}>) {
  const key = `${instanceId}:${groupId}`;
  const row = WA_CACHE.groups[key] || { id: groupId, instanceId, lastSeen: 0 };
  WA_CACHE.groups[key] = { ...row, ...patch, lastSeen: Date.now() };
  saveCache(WA_CACHE);
}

export function upsertContact(jid: string, patch: Partial<{name:string; source:'webhook'|'api'}>) {
  const row = WA_CACHE.contacts[jid] || { id: jid, lastSeen: 0 };
  WA_CACHE.contacts[jid] = { ...row, ...patch, lastSeen: Date.now() };
  saveCache(WA_CACHE);
}

export function getGroupsForInstance(instanceId: string) {
  return Object.values(WA_CACHE.groups).filter(g => g.instanceId === instanceId);
}

export function getContactName(jid: string) {
  return WA_CACHE.contacts[jid]?.name || '';
}

export function getLastWebhookAt(): number {
  return WA_CACHE.lastWebhookAt || 0;
}

export function getCache(): CacheShape {
  return WA_CACHE;
}

// Reload cache from disk (useful after external changes)
export function reloadCache() {
  WA_CACHE = loadCache();
}