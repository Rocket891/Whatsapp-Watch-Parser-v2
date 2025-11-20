// server/state/waCache.ts
export type GroupInfo = { id: string; name?: string; size?: number };

class WaCache {
  lastWebhookAt: number | null = null;
  // groupId -> name
  groupName = new Map<string, string>();
  // senderId/number -> display name
  contactName = new Map<string, string>();
  // discovered group IDs
  seenGroupIds = new Set<string>();

  markWebhookNow() { this.lastWebhookAt = Date.now(); }

  upsertGroup(gid: string, name?: string) {
    if (!gid) return;
    this.seenGroupIds.add(gid);
    if (name && name.trim()) this.groupName.set(gid, name.trim());
  }

  upsertContact(id: string, name?: string) {
    if (!id) return;
    if (name && name.trim()) this.contactName.set(id, name.trim());
  }

  getLastWebhookAgeMs() {
    return this.lastWebhookAt ? (Date.now() - this.lastWebhookAt) : Number.POSITIVE_INFINITY;
  }

  getGroupsSnapshot(): GroupInfo[] {
    const ids = Array.from(this.seenGroupIds);
    return ids.map(id => ({ id, name: this.groupName.get(id) }));
  }

  getGroupName(id: string) { return this.groupName.get(id); }
  getContactName(id: string) { return this.contactName.get(id); }
}

export const waCache = new WaCache();