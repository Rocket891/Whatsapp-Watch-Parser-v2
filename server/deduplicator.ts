/**
 * Message deduplication system
 * Uses LRU cache to track recent messages by composite key
 */

interface DedupEntry {
  timestamp: number;
  messageId: string;
  content?: string;
  sender?: string;
}

class MessageDeduplicator {
  private cache = new Map<string, DedupEntry>();
  private contentCache = new Map<string, DedupEntry>(); // For cross-group content deduplication
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly contentTtlMs: number; // Shorter TTL for content-based deduplication

  constructor(maxSize = 10000, ttlHours = 24, contentTtlMinutes = 10) {
    this.maxSize = maxSize;
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    this.contentTtlMs = contentTtlMinutes * 60 * 1000; // 10 minutes for cross-group content dedup
  }

  private createKey(id: string, remoteJid: string, participant?: string): string {
    return `${id}::${remoteJid}::${participant ?? ""}`;
  }

  private createContentKey(content: string, sender: string): string {
    // Create a hash-like key from content and sender for cross-group deduplication
    const normalizedContent = content.toLowerCase().replace(/\s+/g, ' ').trim();
    return `content::${sender}::${normalizedContent}`;
  }

  private cleanup() {
    const now = Date.now();
    
    // Cleanup regular cache
    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }

    // Cleanup content cache with shorter TTL
    const contentEntries = Array.from(this.contentCache.entries());
    for (const [key, entry] of contentEntries) {
      if (now - entry.timestamp > this.contentTtlMs) {
        this.contentCache.delete(key);
      }
    }

    // If still too large, remove oldest entries from regular cache
    if (this.cache.size > this.maxSize) {
      const sortedEntries = entries
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, this.cache.size - this.maxSize);
      
      for (const [key] of sortedEntries) {
        this.cache.delete(key);
      }
    }

    // Keep content cache smaller
    if (this.contentCache.size > this.maxSize / 2) {
      const sortedContentEntries = contentEntries
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, this.contentCache.size - this.maxSize / 2);
      
      for (const [key] of sortedContentEntries) {
        this.contentCache.delete(key);
      }
    }
  }

  isDuplicate(id: string, remoteJid: string, participant?: string, content?: string, sender?: string): boolean {
    const now = Date.now();
    
    // Check for exact message ID duplicate (same message in same group)
    const key = this.createKey(id, remoteJid, participant);
    const existing = this.cache.get(key);
    
    if (existing) {
      const age = now - existing.timestamp;
      if (age <= this.ttlMs) {
        return true; // Exact duplicate found - same message ID in same group
      } else {
        this.cache.delete(key); // Expired, remove it
      }
    }
    
    // Check for content-based duplicate across groups (same sender, same content)
    let isContentDuplicate = false;
    if (content && sender && content.length > 20) { // Only check substantial messages
      const contentKey = this.createContentKey(content, sender);
      const contentExisting = this.contentCache.get(contentKey);
      
      if (contentExisting) {
        const contentAge = now - contentExisting.timestamp;
        if (contentAge <= this.contentTtlMs) {
          console.log(`⚠️  Duplicate message detected (unified check) - content already seen from ${sender}`);
          isContentDuplicate = true; // Content duplicate found across groups
        } else {
          this.contentCache.delete(contentKey); // Expired, remove it
        }
      }
      
      // Always mark content as seen (even for duplicates) to track cross-group sending
      if (!isContentDuplicate) {
        this.contentCache.set(contentKey, {
          timestamp: now,
          messageId: id,
          content,
          sender,
        });
      }
    }
    
    // Only mark message ID as seen if this is NOT a duplicate
    if (!isContentDuplicate) {
      this.cache.set(key, {
        timestamp: now,
        messageId: id,
        content,
        sender,
      });
    }
    
    // Periodic cleanup
    if (this.cache.size > this.maxSize * 1.1 || this.contentCache.size > this.maxSize * 0.6) {
      this.cleanup();
    }
    
    return isContentDuplicate;
  }

  getStats() {
    return {
      cacheSize: this.cache.size,
      contentCacheSize: this.contentCache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
      contentTtlMs: this.contentTtlMs,
    };
  }

  clear() {
    this.cache.clear();
    this.contentCache.clear();
  }
}

// Singleton instance
export const messageDeduplicator = new MessageDeduplicator();