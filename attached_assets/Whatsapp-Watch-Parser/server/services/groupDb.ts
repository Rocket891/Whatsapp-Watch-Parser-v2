// server/services/groupDb.ts
import fs from "fs";
import path from "path";

export type GroupRow = {
  id: string;                // numeric group id (from 1203...@g.us)
  name: string;              // real group subject/name
  instanceNumber?: string;   // e.g., "9821822960"
  firstSeen: number;         // epoch ms
  lastSeen: number;          // epoch ms
};

type GroupsMap = Record<string, GroupRow>;

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "groups.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(): GroupsMap {
  ensureDir();
  if (!fs.existsSync(FILE)) return {};
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function save(db: GroupsMap) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

function normalizeGroupId(raw?: string): string | null {
  if (!raw) return null;
  const id = String(raw).trim();
  const m = id.match(/(\d{10,})/);
  return m ? m[1] : null;
}

function isPlaceholderName(name?: string): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (n.startsWith("watch group")) return true; // ignore UI placeholder
  if (n.startsWith("group chat")) return true; // ignore our placeholder
  if (n === "group" || n === "unknown group") return true;
  if (n === "unknown name" || n === "unknown") return true;
  return false;
}

export function getGroups(): GroupRow[] {
  const db = load();
  return Object.values(db).sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Upsert on every inbound group message/webhook */
export function upsertFromWebhook(opts: {
  rawGroupId?: string;
  candidateNames: Array<string | undefined>;
  instanceNumber?: string; // "+91..." or "9821822960"
  at?: number;             // timestamp ms
}): GroupRow | null {
  const at = opts.at ?? Date.now();
  const groupId = normalizeGroupId(opts.rawGroupId);
  if (!groupId) return null;

  const db = load();
  const existing = db[groupId];

  // choose best non-placeholder name
  let bestName: string | undefined;
  for (const c of opts.candidateNames) {
    if (c && !isPlaceholderName(c)) { bestName = c.trim(); break; }
  }
  if (!bestName && existing?.name && !isPlaceholderName(existing.name)) {
    bestName = existing.name;
  }
  if (!bestName) bestName = `Unknown (${groupId})`;

  const row: GroupRow = {
    id: groupId,
    name: bestName,
    instanceNumber: opts.instanceNumber || existing?.instanceNumber,
    firstSeen: existing?.firstSeen ?? at,
    lastSeen: at,
  };

  // keep the better (non-placeholder) name if we already had it
  if (existing && !isPlaceholderName(existing.name) && isPlaceholderName(bestName)) {
    row.name = existing.name;
  }

  db[groupId] = row;
  save(db);
  return row;
}

/** Backfill from All Records (history array posted to /api/groups/rebuild) */
export function rebuildFromMessages(history: Array<{
  groupId?: string;
  group_name?: string;
  groupSubject?: string;
  chatName?: string;
  pushName?: string;
  instanceNumber?: string;
  timestamp?: number;
}>) {
  const seen: GroupsMap = {};
  for (const r of history) {
    const id = normalizeGroupId(r.groupId);
    if (!id) continue;

    const names = [r.group_name, r.groupSubject, r.chatName, r.pushName];
    let name: string | undefined;
    for (const c of names) {
      if (c && !isPlaceholderName(c)) { name = c.trim(); break; }
    }
    if (!name) name = `Unknown (${id})`;

    const at = r.timestamp ?? Date.now();
    const prev = seen[id];

    seen[id] = {
      id,
      name: prev?.name && !isPlaceholderName(prev.name) ? prev.name : name,
      instanceNumber: r.instanceNumber ?? prev?.instanceNumber,
      firstSeen: prev ? Math.min(prev.firstSeen, at) : at,
      lastSeen: prev ? Math.max(prev.lastSeen, at) : at,
    };
  }
  save(seen);
}

export function displayName(row: GroupRow): string {
  return `${row.name} (${row.id})`;
}