export interface ParsedWatchListing {
  pid: string;
  year?: string;
  variant?: string;
  condition?: string;
  price?: number;
  currency?: string;
  rawLine: string;
  month?: string; // N1-N12 month notation
  messageType?: 'selling' | 'looking_for'; // NEW: Message type
  // Enriched data from reference database
  brand?: string;
  family?: string;
  name?: string;
}

// PRODUCTION-SAFE LOGGING: Reduces log volume to prevent Railway OOM crashes
const isProduction = process.env.NODE_ENV === 'production';
const isDebugMode = process.env.DEBUG_LOGGING === 'true';

function debugLog(...args: any[]): void {
  if (!isProduction || isDebugMode) {
    console.log(...args);
  }
}

export class WatchMessageParser {
  private referenceCache: Map<string, any> = new Map();
  private lastCacheUpdate: number = 0;
  
  private async loadReferenceDatabase(userId?: string): Promise<void> {
    // Only reload cache every 5 minutes
    if (Date.now() - this.lastCacheUpdate < 5 * 60 * 1000) {
      return;
    }
    
    try {
      const { storage } = await import('./storage');
      const references = await storage.getAllReferenceRecords(userId || 'system');
      
      this.referenceCache.clear();
      for (const ref of references) {
        // Index by reference (which is the actual watch ID) 
        this.referenceCache.set(ref.reference.toLowerCase(), ref);
        
        // Index by PID for exact matches
        this.referenceCache.set(ref.pid.toLowerCase(), ref);
        
        // Index by base patterns for smart matching
        // For "5267/200A-001", store under "5267/200a"
        const basePid = ref.reference.toLowerCase().split('-')[0];
        if (basePid !== ref.reference.toLowerCase()) {
          this.referenceCache.set(basePid, ref);
        }
      }
      
      this.lastCacheUpdate = Date.now();
      debugLog(`Loaded ${references.length} reference records into cache`);
    } catch (error) {
      console.error('Failed to load reference database:', error);
    }
  }
  
  private async enrichWithReference(pid: string, userId?: string): Promise<{ brand?: string; family?: string; name?: string }> {
    await this.loadReferenceDatabase(userId);
    
    const pidLower = pid.toLowerCase();
    
    // Try exact match first
    let match = this.referenceCache.get(pidLower);
    if (match) {
      return {
        brand: match.brand,
        family: match.family,
        name: match.name
      };
    }
    
    // Try pattern matching - look for references that start with the PID
    for (const [key, value] of this.referenceCache.entries()) {
      if (key.startsWith(pidLower)) {
        return {
          brand: value.brand,
          family: value.family,
          name: value.name
        };
      }
    }
    
    return {};
  }

  // ENHANCED HEADER CONTEXT DETECTION: Detect headers with year, condition, and brand information
  private detectHeaderContext(message: string): { condition?: string; brand?: string; year?: string } | null {
    const lines = message.split('\n').map(line => line.trim());
    
    for (const line of lines) {
      // Detect emoji number + brand + condition headers like "6⃣️AP used full set"
      const emojiHeaderMatch = line.match(/^[\d️⃣]+\s*([A-Za-z]+)\s+(used|new|brand\s*new|preowned)\s*(.*)$/i);
      if (emojiHeaderMatch) {
        const brandCode = emojiHeaderMatch[1].trim();
        const conditionText = emojiHeaderMatch[2].toLowerCase();
        const accessories = emojiHeaderMatch[3].trim();
        
        let condition = '';
        if (conditionText.includes('brand new') || conditionText.includes('new')) {
          condition = 'New';
        } else if (conditionText.includes('preowned') || conditionText.includes('used')) {
          condition = 'Used';
        }
        
        // Map brand codes to full names
        let brand = brandCode;
        if (brandCode.toLowerCase() === 'ap') {
          brand = 'Audemars Piguet';
        } else if (brandCode.toLowerCase() === 'pp') {
          brand = 'Patek Philippe';
        } else if (brandCode.toLowerCase() === 'vc') {
          brand = 'Vacheron Constantin';
        }
        
        debugLog(`🏷️ Emoji + Brand + Condition header detected: Brand="${brand}", Condition="${condition}", Accessories="${accessories}"`);
        return { condition, brand };
      }
      
      // Detect year + condition headers like "2024 all brand new", "2025 Used", "🌟 2024 all brand new"
      const yearConditionMatch = line.match(/^[🌟\s]*(\d{4})\s+.*?(brand\s*new|new|used|preowned)/i);
      if (yearConditionMatch) {
        const year = yearConditionMatch[1];
        const conditionText = yearConditionMatch[2].toLowerCase();
        
        let condition = '';
        if (conditionText.includes('brand new') || conditionText.includes('new')) {
          condition = 'New';
        } else if (conditionText.includes('preowned') || conditionText.includes('used')) {
          condition = 'Used';
        }
        
        debugLog(`🏷️ Year + Condition header detected: Year="${year}", Condition="${condition}"`);
        return { condition, year };
      }
      
      // Detect brand + condition headers like "Audemars Piguet (Brand New)", "Patek Philippe (Preowned)"
      const brandConditionMatch = line.match(/^([A-Za-z\s&]+)\s*\(([^)]+)\)$/);
      if (brandConditionMatch) {
        const brand = brandConditionMatch[1].trim();
        const conditionText = brandConditionMatch[2].trim().toLowerCase();
        
        let condition = '';
        if (conditionText.includes('brand new') || conditionText.includes('new')) {
          condition = 'New';
        } else if (conditionText.includes('preowned') || conditionText.includes('used')) {
          condition = 'Used';
        }
        
        debugLog(`🏷️ Brand + Condition header detected: Brand="${brand}", Condition="${condition}"`);
        return { condition, brand };
      }
      
      // Detect simple condition headers like "New", "Preowned"
      if (line.toLowerCase() === 'new') {
        debugLog(`🏷️ Simple header context: "New"`);
        return { condition: 'New' };
      }
      if (line.toLowerCase() === 'preowned' || line.toLowerCase() === 'used') {
        debugLog(`🏷️ Simple header context: "Used"`);
        return { condition: 'Used' };
      }

      // Emoji-decorated sub-header that is JUST a condition phrase, e.g.
      // "✨used full set✨", "⭐ brand new ⭐", "💎 unused full set 💎",
      // "✨watch only✨", "* NOS *". Strip non-letter chars and match the
      // cleaned string against a fixed phrase list — naturally excludes
      // listing lines (those don't reduce to a pure condition phrase).
      const cleaned = line.replace(/[^A-Za-z]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
      if (cleaned.length > 0 && cleaned.length <= 28) {
        const condMap: Record<string, string> = {
          "unused full set": "Unused Full Set", "used full set": "Used Full Set",
          "all fullset": "Full Set", "all full set": "Full Set",
          "new full set": "New Full Set", "brand new full set": "New Full Set",
          "brand new sealed": "Brand New", "brand new": "Brand New",
          "like new": "Like New", "like new full set": "Like New",
          "unworn": "Unworn", "unworn full set": "Unworn",
          "nos": "NOS", "new old stock": "NOS",
          "fullset": "Full Set", "full set": "Full Set",
          "watch only": "Watch Only", "only watch": "Watch Only", "naked": "Watch Only",
          "both tags": "Both Tags", "mint": "Mint",
          "used": "Used", "preowned": "Used", "pre owned": "Used", "second hand": "Used",
          "new": "New", "unused": "Unused Full Set",
        };
        if (condMap[cleaned]) {
          debugLog(`🏷️ Emoji-decorated condition header: "${condMap[cleaned]}" (from "${line}")`);
          return { condition: condMap[cleaned] };
        }
        // "Used <brand>" / "New <brand>" headers like "Used Zenith", "New Patek":
        // map first word to condition (use existing brand name as the brand).
        const cb = cleaned.match(/^(used|unused|preowned|new|brand new)\s+(zenith|patek|rolex|ap|pp|vc|cartier|omega|hublot|tudor|piaget|vacheron|iwc|chopard|panerai|blancpain|jlc|jaeger|fpj|lange|alange|breitling|tag|tag heuer|grand seiko|gs|seiko)$/);
        if (cb) {
          const c = cb[1] === "new" || cb[1] === "brand new" ? "Brand New"
                  : cb[1] === "unused" ? "Unused Full Set" : "Used";
          debugLog(`🏷️ "Condition <brand>" header detected: "${c}" (from "${line}")`);
          return { condition: c };
        }
      }
    }

    return null;
  }

  // MONTH EXTRACTION: Extract N1-N12 month notation
  private extractMonth(text: string): string | undefined {
    // N-notation: N1, N2, N12
    const nPattern = /\bN(\d{1,2})\b/i;
    const nMatch = text.match(nPattern);
    if (nMatch) {
      const monthNum = parseInt(nMatch[1]);
      if (monthNum >= 1 && monthNum <= 12) {
        debugLog(`📅 Month extracted: N${monthNum}`);
        return `N${monthNum}`;
      }
    }

    // M/YY format: 3/26, 8/24, 12/25
    const myPattern = /\b(\d{1,2})\/(\d{2})\b/;
    const myMatch = text.match(myPattern);
    if (myMatch) {
      const monthNum = parseInt(myMatch[1]);
      if (monthNum >= 1 && monthNum <= 12) {
        debugLog(`📅 Month extracted from M/YY: ${monthNum}`);
        return `N${monthNum}`;
      }
    }

    return undefined;
  }

  // Detect if a message is "looking for" (buy-side) vs "selling" (dealer listing).
  //
  // Prior logic checked over-broad "selling" regexes FIRST (e.g. any
  // "number<space>number+k" pattern = selling), which matched WTB messages
  // too and short-circuited before the looking-for branch could run. Every
  // row in the DB ended up 'selling'.
  //
  // New logic: check UNAMBIGUOUS buy-side keywords first. Dealer lists are
  // the normal case, so default is 'selling' when no buy signal is present.
  // Kept in sync with the SQL regex used by POST /api/demand-stats/backfill.
  private detectMessageType(message: string): 'selling' | 'looking_for' {
    const lower = message.toLowerCase();

    // Strong, unambiguous buy-side keywords.
    const buyPatterns = [
      /\bwtb\b/,                          // "WTB 116500"
      /\bw\.?t\.?b\b/,                    // "W.T.B" / "WTB."
      /\blooking\s+for\b/,                // "looking for Panda"
      /\blooking\s+to\s+buy\b/,
      /\bwant\s+to\s+buy\b/,
      /\bwanted\b/,                       // "WANTED: 15202ST"
      /\bsearching\s+for\b/,
      /\binterested\s+in\s+buying\b/,
      /\bif\s+you\s+have\s+[a-z0-9]/,     // "if you have a Daytona..."
      /\banyone\s+(has|have|selling|got)\b/, // "anyone has a 116500?"
      /\bcash\s+ready\b/,
      /\bready\s+cash\b/,
      /\bpm\s+me\s+(if|your|asap)\b/,
      /\bdm\s+me\s+(if|your|asap)\b/,
      /\bquote\s+me\s+(best|your)\b/,     // "quote me best price"
      /\burgent(ly)?\s+(need|looking|want|buy)\b/,
    ];

    for (const p of buyPatterns) {
      if (p.test(lower)) return 'looking_for';
    }

    // Default: dealer listing / selling.
    return 'selling';
  }

  /**
   * Split ONE physical line that packs multiple watches into one segment per
   * watch. Dealers often post several listings on a single line, each ending
   * in its own price, e.g.:
   *   "126334G Blue Oys N5/26 $116500 126333G Blk Jub N5/26 $172000"
   *   "5270J ... 1120000 HKD 7010R ... 580000 HKD 5821/1AR ... 725000 HKD"
   * Strategy: find every number-adjacent currency anchor and cut the line just
   * AFTER each one, so each segment carries one PID (before the price) plus its
   * price. Only splits when ≥2 anchors are present; otherwise returns [line]
   * unchanged so single-watch lines are never disturbed. Segments without a
   * PID (e.g. a trailing "/ 421000u" alt-price) are harmlessly dropped later by
   * parseChunkWithContext returning null.
   */
  private splitLineByWatches(line: string): string[] {
    // Anchor = a price expression. Leading currency ($/HKD/...) may be space-
    // separated from its number; trailing word-currency (HKD/USD/AED) too; a
    // trailing "$" must hug its number ("26,703$") so a bare year before the
    // NEXT watch's "$115,000" is never swallowed as "2026 $". The bare-"u" USD
    // suffix ("421000u") is only honoured after 5+ digits, so Vacheron refs
    // like "4000U" are NOT mistaken for a $4000 price.
    const ANCHOR = /(?:hk\$|\$|hkd|usdt|usd|eur|chf|gbp|aed|rmb)\s*\d[\d.,]*\s*[km]?|\d[\d.,]*\s*[km]?\s*(?:hkd|usdt|usd|eur|chf|gbp|aed|rmb)\b|\d{5,}\s*u\b|\d[\d.,]*\$|\d[\d.,]*\s*[km]\b/gi;

    // Only a REAL price counts as a split boundary. A currency word is
    // ambiguous: in "2015 HKD118k" the HKD is a prefix of 118k, not a suffix of
    // the year 2015 — so an anchor whose number is a bare year (or a tiny value
    // like a month "N5", or a garbage "000M" reference fragment) must NOT
    // trigger a split, otherwise we'd orphan the real price or split a ref.
    const anchorIsRealPrice = (a: string): boolean => {
      const s = a.toLowerCase();
      const km = /(\d[\d.,]*)\s*([km])\b/.exec(s);
      if (km) {
        const n = /^\d{1,3},\d{1,3}$/.test(km[1]) ? km[1].replace(",", ".") : km[1].replace(/,/g, "");
        const val = parseFloat(n) * (km[2] === "k" ? 1000 : 1000000);
        return isFinite(val) && val >= 1000;                        // "000m" -> 0 -> not a price
      }
      let num = s.replace(/(hk\$|\$|hkd|usdt|usd|eur|chf|gbp|aed|rmb)/g, " ").replace(/\bu\b/g, " ");
      num = num.replace(/[^\d.,]/g, "");
      const digitsOnly = num.replace(/[.,]/g, "");
      if (/^(19|20)\d{2}$/.test(digitsOnly)) return false;          // bare year
      const v = parseInt(digitsOnly, 10);
      return isFinite(v) && v >= 100;
    };

    // Collect real-price anchors as {start,end}.
    const anchors: { start: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = ANCHOR.exec(line)) !== null) {
      if (anchorIsRealPrice(m[0])) anchors.push({ start: m.index, end: m.index + m[0].length });
      if (ANCHOR.lastIndex === m.index) ANCHOR.lastIndex++;
    }
    if (anchors.length < 2) return [line];

    // A boundary is placed after an anchor ONLY IF the gap to the next anchor
    // contains real content (a new watch's PID/description). If the gap is just
    // separators ("//", "/", "|", spaces) the next price is an ALTERNATE
    // currency for the SAME watch (e.g. "207k USDT // 1.61m HKD") — keep them
    // together so price ranking (HKD-preferred) still applies.
    const ends: number[] = [];
    for (let i = 0; i < anchors.length; i++) {
      const isLast = i === anchors.length - 1;
      const gap = isLast ? "" : line.slice(anchors[i].end, anchors[i + 1].start);
      if (isLast || !/^[\s/\\|,;:～~–—-]*$/.test(gap)) ends.push(anchors[i].end);
    }
    if (ends.length < 2) return [line];

    const segs: string[] = [];
    let prev = 0;
    for (const e of ends) {
      const seg = line.slice(prev, e).trim();
      if (seg) segs.push(seg);
      prev = e;
    }
    // Attach any trailing remainder (e.g. "—— used AP") to the last segment.
    const tail = line.slice(prev).trim();
    if (tail && segs.length) segs[segs.length - 1] += " " + tail;

    return segs.length >= 2 ? segs : [line];
  }

  async parseMessage(message: string): Promise<ParsedWatchListing[]> {
    const listings: ParsedWatchListing[] = [];
    
    // Quick gate check - is this likely a watch message?
    if (!this.isWatchMessage(message)) {
      return listings;
    }

    // Detect message type - "looking for" vs "selling"
    const messageType = this.detectMessageType(message);
    debugLog(`🔍 Message type detected: ${messageType}`);
    
    // ENHANCED HEADER CONTEXT DETECTION: Parse headers with year, condition, and brand info
    let currentContext = this.detectHeaderContext(message);
    
    // CONTEXTUAL PARSING: Apply different contexts based on line position
    const messageLines = message.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const contextsPerLine: (typeof currentContext)[] = [];
    
    for (let i = 0; i < messageLines.length; i++) {
      const line = messageLines[i];
      
      // Check if this line is a new header that changes context
      const lineContext = this.detectHeaderContext(line);
      if (lineContext) {
        currentContext = lineContext;
        debugLog(`🔄 Context changed at line ${i}: Year="${currentContext?.year}", Condition="${currentContext?.condition}"`);
      }
      
      contextsPerLine[i] = currentContext;
    }
    
    // Enhanced multi-PID detection for complex formats with various symbols
    // Don't clean message yet - work with original to detect symbols
    const symbols = ['🍁', '❤️', '⭐', '✅', '🔥', '💎', '🚀', '⚡', '🌹', '💝', '👑', '🎉', '💘', '🍎', '💗', '☃️'];
    let multiPidMatches: RegExpMatchArray[] = [];
    
    for (const symbol of symbols) {
      // Check original message for symbols
      if (message.includes(symbol)) {
        // BUG FIX: Only use symbol splitting when symbol is used as per-line prefix
        // not just as header decoration (e.g., emojis around "PP used fullset")
        const msgLines = message.split('\n');
        const linesWithSymbol = msgLines.filter(l => l.trim().startsWith(symbol)).length;
        const totalContentLines = msgLines.filter(l => l.trim().length > 5).length;

        if (linesWithSymbol < Math.max(3, totalContentLines * 0.3)) {
          debugLog('Symbol ' + symbol + ' in ' + linesWithSymbol + '/' + totalContentLines + ' lines - skipping (header decoration)');
          continue;
        }

        const parts = message.split(symbol).filter(part => part.trim().length > 0);
        debugLog(`🔍 Symbol ${symbol} found, split into ${parts.length} parts:`, parts.map(p => p.substring(0, 50)));
        if (parts.length > 1) {
          debugLog(`🔍 Multi-PID detected with ${symbol}: ${parts.length} parts`);
          // Skip first part if it's just header (like "🇭🇰 *PATEK* 🇭🇰" or "Test")
          const actualParts = parts.slice(1); // Skip header part
          multiPidMatches = actualParts.map((part, index) => [`${symbol}${part}`, symbol, part] as any);
          debugLog(`🔍 Processing ${actualParts.length} actual PID parts:`, actualParts.map(p => p.substring(0, 30)));
          break; // Use first symbol found
        }
      }
    }
    
    if (multiPidMatches.length > 0) {
      debugLog(`🔍 Multi-PID pattern detected: ${multiPidMatches.length} PIDs found`);
      
      for (const match of multiPidMatches) {
        const symbol = match[1];
        const content = match[2].trim();
        
        // Extract PID from the content after the symbol
        const extractedPid = this.extractPID(content);
        if (extractedPid) {
          const parsed = await this.parseChunkWithContext(content, currentContext);
          if (parsed && parsed.pid) {
            listings.push({
              ...parsed,
              rawLine: content.replace(/[\uD800-\uDFFF]/g, '').trim(),
              messageType
            });
          } else {
            // Create basic listing if parsing fails
            const enrichment = await this.enrichWithReference(extractedPid);
            const basicListing: ParsedWatchListing = {
              pid: extractedPid,
              rawLine: content.replace(/[\uD800-\uDFFF]/g, '').trim(),
              brand: enrichment.brand,
              family: enrichment.family,
              name: enrichment.name,
              condition: currentContext?.condition,
              year: currentContext?.year,
              month: this.extractMonth(content),
              messageType
            };
            listings.push(basicListing);
          }
        }
      }
      
      if (listings.length > 0) {
        debugLog(`✅ Multi-PID parsing successful: ${listings.length} listings`);
        return listings;
      }
    }
    
    // Enhanced line-by-line parsing for formats like A.Lange&Sohne
    const cleanMessage = message.replace(/[\uD800-\uDFFF]/g, '');
    const parseLines = cleanMessage.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 5);

    // Pre-split any line that packs multiple watches (≥2 price anchors) into
    // one segment per watch. Each expanded entry keeps a pointer back to its
    // original line index so it inherits the right header context.
    const expandedLines: { text: string; ctxIdx: number }[] = [];
    for (let i = 0; i < parseLines.length; i++) {
      const segs = this.splitLineByWatches(parseLines[i]);
      for (const seg of segs) expandedLines.push({ text: seg, ctxIdx: i });
    }

    debugLog(`🔍 Processing ${parseLines.length} lines (${expandedLines.length} watch segments) for parsing`);

    for (let j = 0; j < expandedLines.length; j++) {
      const line = expandedLines[j].text;
      debugLog(`🔍 Checking line: "${line}"`);

      // Get context for this specific line (via its original line index)
      const lineContext = contextsPerLine[expandedLines[j].ctxIdx];

      // Check if this line contains our A.Lange&Sohne pattern directly
      const langePattern = /\b(\d{3}\.\d{3})\b/;
      const langeMatch = line.match(langePattern);
      if (langeMatch) {
        debugLog(`✅ Found A.Lange&Sohne PID in line: ${langeMatch[1]}`);
      }

      // Handle cases where price is on separate line or multi-line format (2 or 3 lines per watch)
      let combinedLine = line;
      const nextLine = expandedLines[j + 1]?.text;
      const nextNextLine = expandedLines[j + 2]?.text;

      // If current line has PID but no price, try combining with next 1-2 lines
      if (this.extractPID(line) && !this.extractPrice(line) && nextLine) {
        const nextLinePid = this.extractPID(nextLine);

        // Only combine if next line doesn't have its own PID, or it's a price-only line
        const nextLineHasPrice = this.extractPrice(nextLine);
        if (!nextLinePid || nextLineHasPrice || /^\d{5,6}(hkd|usd|eur)?$/i.test(nextLine.trim())) {
          combinedLine = `${line} ${nextLine}`;
          debugLog(`Combining 2 lines: "${line}" + "${nextLine}"`);
          j++; // Skip the next line

          // Check if still no price, try adding third line (3-line format: PID / year+condition / price)
          if (!this.extractPrice(combinedLine) && nextNextLine) {
            const nextNextPid = this.extractPID(nextNextLine);
            const nextNextHasPrice = this.extractPrice(nextNextLine);
            // Combine if: no PID in next line, OR it has a price (e.g., "HKD 480000"), OR it's just a number+currency
            if (!nextNextPid || nextNextHasPrice || /^\d{5,6}(hkd|usd|eur)?$/i.test(nextNextLine.trim())) {
              combinedLine = `${combinedLine} ${nextNextLine}`;
              debugLog(`Combining 3rd line: + "${nextNextLine}"`);
              j++; // Skip the third line too
            }
          }
        }
      }

      const result = await this.parseChunkWithContext(combinedLine, lineContext);
      if (result && result.pid) {
        debugLog(`✅ Successfully parsed PID from line: ${result.pid} (Context: Year=${lineContext?.year}, Condition=${lineContext?.condition})`);
        result.messageType = messageType;
        listings.push(result);
      } else {
        debugLog(`❌ No PID found in line: "${line}"`);
      }
    }
    
    // If line parsing found results, return them
    if (listings.length > 0) {
      debugLog(`✅ Line-by-line parsing successful: ${listings.length} listings`);
      return listings;
    }
    
    // Fallback to chunk-based parsing
    const chunks = this.splitIntoChunks(cleanMessage);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const parsed = await this.parseChunkWithContext(chunk, currentContext);
      if (parsed && parsed.pid) {
        parsed.messageType = messageType;
        listings.push(parsed);
      }
    }
    
    return listings;
  }

  private isWatchMessage(message: string): boolean {
    // Hard indicators - brand names and watch models (including A.Lange&Sohne)
    const hardPattern = /\b(RM|AP|PATEK|ROLEX|OMEGA|CARTIER|VACHERON|LANGE|A\.LANGE|NAUTILUS|ROYAL\s*OAK|F\.?P\.?J|ZENITH|HUBLOT|BREITLING|PIAGET|IWC|TUDOR|JLC|BLANCPAIN|CHOPARD|TAG\s*HEUER)\b/i;
    
    // Enhanced PID pattern - handles 126505, 126506, 228238, 336938, 5159R, 4948R, 5270/1R, 5905P, 5905R, A.Lange&Sohne (363.608, 139.021), Q3523490, G0A45004
    const pidPattern = /\b\d{6,8}\b|\b\d{4}[A-Z]+\b|\b\d{4}[A-Z]?[-/]\d{1,3}[A-Z]?\b|\b\d{5}[A-Z]+\b|\b\d{3}\.\d{3}\b|\b[A-Z]\d{6,8}\b|\b[A-Z]\d[A-Z]\d{4,5}\b|\bQ\d{7}\b/i;
    
    // Currency and price indicators
    const currencyPattern = /\b(HKD|USD|EUR|CHF|GBP|USDT)\b/i;
    const pricePattern = /\d{2,}[k]\b|\d{5,}|\d+[,]\d{3}|\d+[.]?\d*[kmKM]/;
    
    // Multi-PID symbol patterns - messages with emoji symbols and multiple PIDs
    const multiPidSymbols = /[🍁❤️⭐✅🔥💎🚀⚡🌹]/;
    
    // Soft indicators - watch terms with numbers
    const softPattern = /(BNIB|LNIB|UNWORN|FULL\s?SET|PRICE|GMT|DAYTONA|SPEEDMASTER|SUBMARINER|ONLY\s?WATCH|USED|NEW|GOOD\s?CONDITION|STOCK|READY|DELIVERY|NOS)/i;
    const hasNumbers = /\d{4,8}/.test(message);
    
    // Check for multi-PID patterns with symbols
    if (multiPidSymbols.test(message) && pidPattern.test(message)) {
      debugLog("🔍 Multi-PID symbol pattern detected:", message);
      return true;
    }
    
    // A price anchor = a word-currency, a $-amount (incl. comma grouping), or a
    // number glued to a currency. Broader than pricePattern alone.
    const priceAnchor = currencyPattern.test(message) || pricePattern.test(message) ||
      /(?:hk\$|\$)\s*\d/i.test(message) ||
      /\d[\d.,]*\s*(?:hkd|usdt|usd|eur|chf|gbp|aed|rmb)\b/i.test(message) ||
      /\d[\d.,]*\$/.test(message);

    // Check for PID + currency/price combination
    if (pidPattern.test(message) && priceAnchor) {
      debugLog("🔍 PID + Currency/Price detected:", message);
      return true;
    }

    // BROADER: the gate's pidPattern is narrower than extractPID (it misses
    // "126234VI", "RM30-01", "WSBB0068", "126598TBR"...). If extractPID can find
    // a real reference AND there's a price anchor, it's a listing — accept it.
    if (priceAnchor && this.extractPID(message)) {
      debugLog("🔍 extractPID + price anchor detected:", message);
      return true;
    }

    // Check for hard brand indicators
    if (hardPattern.test(message)) {
      debugLog("🔍 Hard brand indicator detected:", message);
      return true;
    }
    
    // Check for soft indicators with numbers
    if (softPattern.test(message) && hasNumbers) {
      debugLog("🔍 Soft indicator + numbers detected:", message);
      return true;
    }
    
    debugLog("🔍 Message not recognized as watch message:", message);
    return false;
  }

  private splitIntoChunks(message: string): string[] {
    // Clean message first
    let text = message.replace(/\r/g, '').replace(/[•▪■]+/g, ' ').trim();
    
    // Method 1: Split by bullet symbols and watch symbols
    const bulletPattern = /[♨★⭐◆●▼⚡💎🔥✅→]/;
    let parts = text.split(bulletPattern)
                    .map(s => s.trim())
                    .filter(s => s.length > 10);
    
    if (parts.length > 1) {
      return parts;
    }
    
    // Method 2: Split by numbered patterns (1:, 2:, etc.)
    const numberedPattern = /^(\d+)[:\.]/;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let currentChunk = '';
    const chunks: string[] = [];
    
    for (const line of lines) {
      if (numberedPattern.test(line)) {
        // New numbered item
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = line;
      } else {
        // Continuation of current chunk
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    if (chunks.length > 1) {
      return chunks;
    }
    
    // Method 2.5: Split by various emoji/symbol patterns for multi-watch messages
    const symbolPattern = /[‼️⚡🔥💎✅🎯⭐🌟💫🏆🎉🎊🔔🚀💪👍🎁🎈🎀🎆🎇🌸🌺🌻🌼🌷🌹🌸]/;
    const symbolParts = text.split(symbolPattern).map(s => s.trim()).filter(s => s.length > 10);
    if (symbolParts.length > 1) {
      return symbolParts;
    }
    
    // Method 3: ENHANCED PID-based line splitting - each line with PID becomes separate chunk
    const enhancedPidPattern = /^(\d{5}[A-Z]{2}|\d{4}[A-Z]+|\d{4}\/\d{1,3}[A-Z]|\d{6}|[A-Z]{2,3}\d{4,})/i;
    const pidLines = lines.filter(line => {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 5) return false;
      
      // Check if line starts with or contains a PID pattern
      const hasPid = enhancedPidPattern.test(trimmedLine);
      const hasPrice = /\d{2,}[k]|\d{5,}|\d+[,]\d{3}/.test(trimmedLine);
      
      return hasPid || (hasPrice && /\d{4,6}/.test(trimmedLine));
    });
    
    if (pidLines.length > 1) {
      debugLog(`🔍 Found ${pidLines.length} lines with PIDs - splitting into chunks`);
      return pidLines;
    }
    
    // Method 3.5: Fallback - if we have multiple lines, try each one individually
    if (lines.length > 1) {
      const validLines = lines.filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 10 && (/\d{4,6}/.test(trimmed) || /hkd|usd|eur/i.test(trimmed));
      });
      
      if (validLines.length > 1) {
        debugLog(`🔍 Fallback multi-line parsing: ${validLines.length} lines`);
        return validLines;
      }
    }
    
    // Method 4: Split by multi-line watch entries (for tab-separated format)
    // Enhanced pattern to handle formats like:
    // 4010U/000R-B329\t\n2021y   HKD\t 191,000 \n\n4010T-000R-B344\t\n2021y   HKD\t 191,000
    
    // First, try to split by double newlines (common separator)
    const doubleNewlineChunks = text.split(/\n\s*\n/).map(chunk => chunk.trim()).filter(chunk => chunk.length > 5);
    if (doubleNewlineChunks.length > 1) {
      // Check if each chunk has a PID
      const validChunks = doubleNewlineChunks.filter(chunk => {
        const pidExists = /\d{4}[A-Z]?[-/]\d{3}[A-Z]?[-/][A-Z]\d{3}|\d{4}[A-Z]?[-/]\d{3}[A-Z]/.test(chunk);
        return pidExists;
      });
      if (validChunks.length > 1) {
        return validChunks;
      }
    }
    
    // Advanced pattern for complex formats
    const complexPattern = /(\d{4}[A-Z]?[-/]\d{3}[A-Z]?[-/][A-Z]\d{3}[\s\S]*?)(?=\n\s*\d{4}[A-Z]?[-/]\d{3}[A-Z]?[-/][A-Z]\d{3}|\s*$)/g;
    const complexMatches = [];
    let match;
    while ((match = complexPattern.exec(text)) !== null) {
      complexMatches.push(match[1].trim());
    }
    
    if (complexMatches.length > 1) {
      return complexMatches.filter(m => m.length > 5);
    }
    
    return [text];
  }

  private async parseChunk(chunk: string): Promise<ParsedWatchListing | null> {
    return this.parseChunkWithContext(chunk, null);
  }

  // ENHANCED: Parse chunk with contextual header information including year
  private async parseChunkWithContext(chunk: string, context: { condition?: string; brand?: string; year?: string } | null): Promise<ParsedWatchListing | null> {
    // Clean Unicode characters that cause JSON parsing issues
    const cleanChunk = chunk.replace(/[\uD800-\uDFFF]/g, '').trim();
    
    const result: ParsedWatchListing = {
      pid: '',
      rawLine: cleanChunk,
      messageType: 'selling' // Default, will be overridden by caller
    };

    // Extract PID
    result.pid = this.extractPID(chunk);
    if (!result.pid) return null;

    // Extract other fields
    result.year = this.extractYear(chunk);
    result.variant = this.extractVariant(chunk);
    result.month = this.extractMonth(chunk); // NEW: Extract month notation
    
    // CONTEXTUAL YEAR: Use header context if no explicit year found
    if (!result.year && context?.year) {
      result.year = context.year;
      debugLog(`📅 Applied contextual year: ${context.year} to PID: ${result.pid}`);
    }
    
    // CONTEXTUAL CONDITION: Use header context if no explicit condition found
    result.condition = this.extractCondition(chunk);
    if (!result.condition && context?.condition) {
      result.condition = context.condition;
      debugLog(`📋 Applied contextual condition: ${context.condition} to PID: ${result.pid}`);
    }
    
    const priceInfo = this.extractPrice(chunk, result.pid);
    if (priceInfo) {
      result.price = priceInfo.amount;
      result.currency = priceInfo.currency;
    }

    // Enrich with reference database
    if (result.pid) {
      const enrichment = await this.enrichWithReference(result.pid);
      result.brand = enrichment.brand || context?.brand; // Use header brand if no enrichment
      result.family = enrichment.family;
      result.name = enrichment.name;
    }

    return result;
  }

  private extractPID(text: string): string {
    // COMPLETELY REWRITTEN: Enhanced PID patterns to capture complete references (ordered by specificity)
    const patterns = [
      // CRITICAL FIX: Add 5-digit patterns (47040/000R-9666, 44000/000A-B437)
      /\b(\d{5}\/\d{3,4}[A-Z]+-\d{4})\b/i,                // 47040/000R-9666, 44000/000A-B437 (PRIORITY FIX)
      /\b(\d{5}\/\d{3,4}[A-Z]*)\b/i,                       // 47040/000R, 44000/000A format (PRIORITY FIX)
      
      // PRIORITY: Fix 7118/1200r format - needs to capture full PID
      /\b(\d{4}\/\d{3,4}[A-Z]*)\b/i,                       // 7118/1200R, 5267/200A format (priority fix)
      // Broader Patek-slash: 1-4 digits + 1-3 letters + optional "-NNN" — covers
      // 5980/1AR-001, 5235/50R-001, 5235/50R that the more-specific patterns miss.
      /\b(\d{4}\/\d{1,4}[A-Z]{1,3}(?:-\d{3})?)\b/i,
      
      // PRIORITY: Fix G0A45004 format - letter + digit + letter + 4-5 digits
      /\b([A-Z]\d[A-Z]\d{4,5})\b/i,                        // G0A45004 format (priority fix)
      /\b([A-Z]\d{6,8})\b/i,                               // A1234567 format 
      
      // Most specific patterns first - complete watch references
      /\b(\d{4}[A-Z]?[-/]\d{3}[A-Z]?[-/][A-Z]\d{3})\b/i,  // 4010U/000R-B329
      /\b(\d{4}[A-Z][-/]\d{3}[A-Z][-/][A-Z]\d{3})\b/i,    // 4010T-000R-B344
      
      // Brand-specific complete patterns
      /\b(RM\s*\d{2,3}(?:-\d{2,3})?)\b/i,                  // RM 65-01
      /\b(AP\s*\d{5}[A-Z]{0,2})\b/i,                       // AP 26730Ba
      // Hublot dotted reference: 541.NX.5170.VR, 431.NM.1337.RX, with optional
      // trailing edition codes (.UCL25, .UEL23, .OO.1180.RX ...)
      /\b(\d{3}\.[A-Z]{2}\.\d{3,4}\.[A-Z]{2}(?:\.[A-Z0-9]{2,7})*)\b/i,
      // Zenith reference: NN.NNNN.NNN[N][/NN.[A-Z]{0-2}NNN[N]] — e.g.
      // 03.9300.3620/78.I001, 10.9000.670/80.R795, 03.A3642.670/75.M3642,
      // 96.2437.693 (short form), 03.9200.670/01.MI001.
      /\b(\d{2}\.[A-Z]?\d{3,4}\.[A-Z]?\d{3,4}(?:\/\d{2}\.[A-Z]{0,2}\d{3,4})?)\b/i,

      // Medium specificity patterns
      /\b([A-Z0-9]{4,}-[A-Z0-9]{3,}-[A-Z0-9]{3,})\b/i,    // Complex formats
      /\b(\d{4}[A-Z]?\/\d{3}[A-Z]-[A-Z]\d{3})\b/i,        // 5990/1R-A001
      
      // A.Lange&Sohne specific format (xxx.xxx)
      /\b(\d{3}\.\d{3})\b/i,                               // 363.608, 139.021, 403.032 format
      
      // CRITICAL: Simple formats like 5159R, 4948R, 5905P, 5270/1R, 26609TI, 26120OR
      /\b(\d{5}[A-Z]{2})\b/i,                              // 26609TI, 26120OR  
      /\b(\d{4}[A-Z]+)\b/i,                                // 5159R format
      /\b(\d{4}\/\d[A-Z])\b/i,                             // 5270/1R format
      
      // Additional patterns for special formats
      /\b(Q\d{7})\b/i,                                     // Q3523490 format
      
      // Long numeric PIDs (7-8 digits, sometimes with trailing letter) e.g., 5267200A, 52684616
      /\b(\d{7,8}[A-Z]?)(?!\d)\b/i,

      // Generic patterns (least specific)
      /\b([A-Z0-9]{4,}-[A-Z0-9]{3,})\b/i,
      /\b(\d{5}[A-Z]{1,3})(?!\d)/i,
      /\b(\d{6})(?![0-9])/i,
      /\b(\d{4,6}[A-Z]{1,3})(?!\d)/i,
      /\b([A-Z]{2,4}\d{4,6}[A-Z]*)\b/i,
      /\b([A-Z]{2,4}\d{5,6})\b/i,
      /\b(\d{4}\/\d[A-Z]-\d{3})\b/i
    ];
    
    // Currency patterns to avoid false matches
    const currencyPatterns = [
      /(?:HKD|USD|EUR|CHF|GBP|USDT|AED|RMB)\d+/i,
      /\d+(?:HKD|USD|EUR|CHF|GBP|USDT|AED|RMB)/i,
      /\$\d+/,
      /\d+k\b/i,
      /\d+m\b/i
    ];
    
    for (const pattern of patterns) {
      const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
      for (const match of matches) {
        const candidate = match[1].replace(/\s+/g, '').toUpperCase(); // Use capture group [1]

        // CRITICAL FIX: Skip if this looks like a year (2020Y, 2024Y, etc.)
        if (/^(19|20)\d{2}Y?$/.test(candidate)) {
          debugLog(`🚫 Skipping year pattern as PID: ${candidate}`);
          continue; // Skip years disguised as PIDs
        }
        // Skip year+condition tokens misread as PIDs: "2026NEW", "2023USED",
        // "2025UNWORN", "2024NOS" — these are <year><condition>, not a model ref.
        if (/^(19|20)\d{2}(NEW|USED|UNWORN|NOS|FULLSET|MINT)$/i.test(candidate)) {
          debugLog(`🚫 Skipping year+condition as PID: ${candidate}`);
          continue;
        }
        // Skip a PURELY-NUMERIC token that is actually a price — i.e. it sits
        // immediately next to a currency marker ("455000$", "1430000 hkd",
        // "421000u"). Real model refs with letters (26730BA) are unaffected.
        // Skip purely-numeric ("1200000") OR euro-decimal ("101.000") candidates
        // when they're a price, not a model ref — i.e. immediately adjacent to a
        // currency marker. Real PIDs with letters (26730BA, RM07-01) unaffected.
        if (/^\d{4,8}$/.test(candidate) || /^\d{3}\.\d{3}$/.test(candidate)) {
          const off = (match.index ?? 0);
          const after = text.slice(off + match[0].length, off + match[0].length + 6);
          const before = text.slice(Math.max(0, off - 6), off);
          if (/^\s*(hkd|usdt|usd|eur|chf|gbp|aed|rmb|u|[km])\b/i.test(after) ||
              /^\s*\$/.test(after) ||
              /(?:hk\$|\$)\s*$/i.test(before) ||
              // Word currency immediately before the number ("HKD:1200000",
              // "HKD 130450", "USDT: 500000") — the number is a price, not PID.
              /(?:hkd|usdt|usd|eur|chf|gbp|aed|rmb)\s*:?\s*$/i.test(before)) {
            debugLog(`🚫 Skipping currency-adjacent number as PID: ${candidate}`);
            continue;
          }
        }

        // Check if it's not a currency amount
        let isCurrency = false;
        for (const cp of currencyPatterns) {
          if (cp.test(candidate)) {
            isCurrency = true;
            break;
          }
        }
        
        // CRITICAL FIX: Skip invalid PIDs like "SECOND-HAND", "ALL", etc.
        const invalidPidPatterns = [
          /^SECOND-HAND$/i,
          /^BRAND-?NEW$/i,
          /^FULL-?SET$/i,
          /^LIKE-?NEW$/i,
          /^WATCH-?ONLY$/i,
          /^SECOND$/i,
          /^HAND$/i,
          /^ALL$/i,
          /^CONFIRM$/i,
          /^ORDER$/i,
          /^THE$/i,
          /^AND$/i,
          /^YEAR$/i,
          /^BLUE$/i,
          /^BLACK$/i,
          /^WHITE$/i,
          /^SILVER$/i,
          /^GOLD$/i,
          /^STEEL$/i,
          /^PLEASE$/i,
          /^CONTACT$/i,
          /^ME$/i,
          /^IF$/i,
          /^YOU$/i,
          /^HAVE$/i
        ];
        
        let isInvalidPid = false;
        for (const invalidPattern of invalidPidPatterns) {
          if (invalidPattern.test(candidate)) {
            debugLog(`🚫 Skipping invalid PID pattern: ${candidate}`);
            isInvalidPid = true;
            break;
          }
        }
        
        if (!isCurrency && !isInvalidPid) {
          debugLog(`✅ Found valid PID: ${candidate}`);
          return candidate;
        }
      }
    }
    
    return '';
  }

  private extractYear(text: string): string | undefined {
    // Year patterns - handle full years with Y/Year suffix first (most specific)
    let match = text.match(/\b(20\d{2})\s*[yY](?:ear)?\b/i);
    if (match) return match[1];
    
    // Bare 4-digit year (2000-2099)
    match = text.match(/\b(20\d{2})\b/);
    if (match) return match[1];
    
    match = text.match(/\b(19\d{2})\s*[yY]?(?:ear)?\b/i);
    if (match) return match[1];
    
    match = text.match(/\b(20\d{2})\/\d{1,2}\b/);
    if (match) return match[1];
    
    // Short year with Y/Year suffix: 25Y, 25Year, 22y
    match = text.match(/\b(\d{1,2})\s*[yY](?:ear)?\b/);
    if (match) {
      const year = parseInt(match[1]);
      return year < 50 ? `20${year.toString().padStart(2, '0')}` : `19${year.toString().padStart(2, '0')}`;
    }
    
    // M/YY format (3/26 = March 2026, 8/24 = August 2024)
    match = text.match(/\b(\d{1,2})\/(\d{2})\b/);
    if (match) {
      const month = parseInt(match[1]);
      const yr = parseInt(match[2]);
      if (month >= 1 && month <= 12) {
        return yr < 50 ? `20${yr.toString().padStart(2, '0')}` : `19${yr}`;
      }
    }

    // N2/25, N3/25 notation (month/year from watch papers)
    match = text.match(/\bN\d{1,2}\/(\d{2})\b/);
    if (match) {
      const yr = parseInt(match[1]);
      return yr < 50 ? `20${yr.toString().padStart(2, '0')}` : `19${yr}`;
    }
    
    return undefined;
  }

  private extractVariant(text: string): string | undefined {
    const variants = [];
    const metals = text.match(/\b(steel|stainless|ss|gold|rose\s*gold|yellow\s*gold|white\s*gold|platinum|titanium|ceramic)\b/gi);
    if (metals) variants.push(...metals.map(m => m.toLowerCase().replace(/\s+/g, ' ')));
    
    const colors = text.match(/\b(black|white|blue|green|red|silver|champagne|slate|panda|pepsi|batman|hulk|kermit|brown|pink|grey|gray|salmon|choco|coffee|purple|tiffany|ice\s*blue|roman|sundust|olive|mete|onyx|carnelian|ombre|eisen|blk|champ|mop|pave)\b/gi);
    if (colors) variants.push(...colors.map(c => c.toLowerCase()));
    
    const bracelets = text.match(/\b(oyster|jubilee|president|nato|leather|rubber|milanese|mesh)\b/gi);
    if (bracelets) variants.push(...bracelets.map(b => b.toLowerCase()));
    
    return variants.length > 0 ? [...new Set(variants)].join(', ') : undefined;
  }

  private extractCondition(text: string): string | undefined {
    const lowerText = text.toLowerCase();

    // Combined conditions FIRST (most specific before general)
    if (/(?:brand\s*)?new\s+full\s*set/.test(lowerText)) return 'New Full Set';
    if (/100%\s*new/.test(lowerText)) return 'Brand New';
    if (/brand\s*new\s*in\s*box|bnib/.test(lowerText)) return 'Brand New';
    if (/like\s*new\s*in\s*box|lnib/.test(lowerText)) return 'Like New';
    if (/brand\s*new/.test(lowerText)) return 'Brand New';
    // Line that STARTS with "NEW" (possibly after leading emoji/punct) — a
    // common dealer convention prefixing the PID, e.g. "🍀NEW 03.9300.3620…".
    if (/^[^a-z0-9]*new\b/i.test(text.trim())) return 'Brand New';
    if (/\bnaked\b/i.test(text)) return 'Watch Only';   // dealer slang for no-box/no-papers
    if (/\b(unworn|unused)\b/.test(lowerText)) return 'Unworn';
    if (/like\s*new/.test(lowerText)) return 'Like New';
    if (/both\s*tags?/.test(lowerText)) return 'Both Tags';
    if (/\bnos\b/.test(lowerText)) return 'NOS';
    if (/full\s*set|fullset/.test(lowerText)) return 'Full Set';
    if (/watch\s*only|only\s*watch/.test(lowerText)) return 'Watch Only';
    if (/mint/.test(lowerText)) return 'Mint';
    if (/excellent/.test(lowerText)) return 'Excellent';
    if (/very\s*good/.test(lowerText)) return 'Very Good';
    if (/good/.test(lowerText)) return 'Good';
    if (/used/.test(lowerText)) return 'Used';
    if (/fair/.test(lowerText)) return 'Fair';
    
    return undefined;
  }

  /**
   * PID-aware price extraction. Rebuilt from real-message analysis (see
   * _partest.cjs harness — 41 cases + 1200-row DB validation).
   *
   * Handles: spaces between number and currency ("76500 USDT"), 5-digit
   * prices, shorthand ("hkd605" → 605000, "127 HKD" → 127000), European
   * decimals ("900.000", "1,49m"), "HK$" / "$" prefixes, "HKD:" colons,
   * dual-currency listings (prefers HKD), and excludes PID digits from being
   * read as a price. Collects ALL candidates then ranks (explicit currency >
   * standalone; HKD preferred; k/m preferred; earliest position).
   */
  private extractPrice(text: string, knownPid?: string): { amount: number; currency: string } | null {
    if (!text) return null;
    let work = text;

    // Normalize separators: Chinese/full-width comma & colon, zero-width.
    work = work.replace(/[，、]/g, ",").replace(/[：]/g, ":").replace(/​/g, "");
    // Collapse split decimals like "113. 5k" -> "113.5k".
    work = work.replace(/(\d+)\.\s+(\d+)\s*([kmKM])/g, "$1.$2$3");
    // PRICE-SEPARATOR COMMA: "N10/2025,3.45m hkd" — a comma between a number
    // and a small-decimal value (1-2 digits before the dot) is NEVER a US
    // thousands separator (which is always ",000"). Insert a space so the
    // number scanner doesn't merge "2025,3.45" into "2025.45" → 2 billion.
    work = work.replace(/(\d),(?=\d{1,2}\.\d)/g, "$1 ");

    // Currency lookaround helpers (also used for currency-aware PID removal).
    // Lead currency must be at window-start or preceded by a NON-digit, so a
    // currency that's really a suffix of a prior number ("600.000hkd 5231")
    // isn't mistaken for a prefix of the next number.
    const curBefore = (s: string): string | null => {
      const x = s.match(/(?:^|[^\d])(hk\$|\$|hkd|usdt|usd|eur|chf|gbp)[\s:]*$/i);
      return x ? x[1] : null;
    };
    const curAfter = (s: string): string | null => {
      const x = s.match(/^\s*(hkd|usdt|usd|eur|chf|gbp)/i);
      return x ? x[1] : null;
    };
    const normCur = (token: string | null): string | null => {
      if (!token) return null;
      const t = token.toLowerCase();
      if (t.includes("usdt")) return "USDT";
      if (t.includes("usd")) return "USD";
      if (t.includes("eur")) return "EUR";
      if (t.includes("chf")) return "CHF";
      if (t.includes("gbp")) return "GBP";
      if (t.includes("hkd") || t.includes("hk$")) return "HKD";
      return null; // bare "$" -> caller defaults to HKD
    };

    // Remove the known PID so its digits aren't read as a price — but KEEP any
    // occurrence sitting next to a currency marker (corrupt rows stored the
    // price as the pid, e.g. Hublot "645.QG.5217.RX" → pid "345000" with the
    // real price being "$345000"; removing it would delete the price).
    if (knownPid) {
      const pidEsc = knownPid.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
      work = work.replace(new RegExp(pidEsc, "ig"), (match: string, offset: number, full: string) => {
        const before = full.slice(Math.max(0, offset - 5), offset);
        const after = full.slice(offset + match.length, offset + match.length + 6);
        if (curBefore(before) || curAfter(after)) return match; // keep — it's a price
        return " ";
      });
    }

    const lower = work.toLowerCase();
    const pidDigits = knownPid ? knownPid.replace(/\D/g, "") : null;

    const candidates: { amount: number; currency: string; explicit: boolean; fromLead: boolean; km: boolean; pos: number }[] = [];

    // Scan NUMBERS only; detect currency via non-consuming lookaround windows
    // so a token like "hkd" is never "eaten" by an adjacent date/small number.
    const re = /(\d[\d.,]*)\s*([km])?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      let numRaw = m[1];
      const km = m[2];
      if (!numRaw) { if (re.lastIndex === m.index) re.lastIndex++; continue; }
      // Trim a trailing comma/dot ("400,") so it doesn't shift the after-window.
      numRaw = numRaw.replace(/[.,]+$/, "");
      if (!numRaw) continue;
      const start = m.index;
      // Currency-after window starts AFTER the digits and any k/m suffix, but
      // NOT after a trailing comma.
      const digitsEnd = start + numRaw.length;
      let end = digitsEnd;
      if (km) {
        const km2 = lower.slice(digitsEnd, digitsEnd + 4).match(/^\s*[km]/i);
        if (km2) end = digitsEnd + km2[0].length;
      }

      const lead = curBefore(lower.slice(Math.max(0, start - 5), start));
      const trail = curAfter(lower.slice(end, end + 6));
      const hasDollar = lead === "$" || lead === "hk$";
      let currency = normCur(lead) || normCur(trail);
      const explicit = !!currency || hasDollar;
      const fromLead = !!(normCur(lead) || hasDollar);
      if (!currency) currency = "HKD";
      // PARENTHETICAL CURRENCY OVERRIDE: "$2.55M（usdt）" — the $ defaults
      // currency to HKD, but a parenthesised "(usdt)" / "(usd)" right after
      // the amount tells us the real currency. Handle ASCII + full-width parens.
      {
        const parTail = lower.slice(end, end + 16);
        const pm = parTail.match(/[(（]\s*(usdt|usd|eur|chf|gbp)\s*[)）]/i);
        if (pm) {
          const c = pm[1].toLowerCase();
          currency = c === "usdt" ? "USDT" : c === "usd" ? "USD" : c.toUpperCase();
        }
      }

      const cleanedComma = numRaw.replace(/,/g, "");
      let amount: number;
      if (km) {
        // European sellers use comma as decimal ("1,49m" = 1.49m, "1,096m" =
        // 1.096m = 1,096,000). A single comma + 1-3 digits is a decimal here.
        const numStr = /^\d{1,3},\d{1,3}$/.test(numRaw) ? numRaw.replace(",", ".") : numRaw.replace(/,/g, "");
        const f = parseFloat(numStr);
        if (isNaN(f)) continue;
        const kmMul = km.toLowerCase() === "k" ? 1000 : 1000000;
        amount = Math.round(f * kmMul);
        // YEAR-GLUED-TO-K/M: one sender writes "<PID> <year><price>k" with no
        // separator — "2022105k" = 2022 + 105k = 105,000, "201926k" = 2019 +
        // 26k = 26,000. Peel a 19xx/20xx prefix when the remainder is a
        // plausible k/m price. (Without comma/decimal in numRaw.)
        const digitsOnly = numStr.replace(/[^0-9]/g, "");
        if (!numStr.includes(".") && /^(19|20)\d{2}\d{1,5}$/.test(digitsOnly)) {
          const rest = parseInt(digitsOnly.slice(4), 10);
          const restAmt = rest * kmMul;
          if (isFinite(restAmt) && restAmt >= 1000 && restAmt <= 300000000) {
            amount = restAmt;
          }
        }
      } else if (/^\d{1,3}\.\d{3}$/.test(numRaw)) {
        // European thousands: "900.000" -> 900000
        amount = parseInt(numRaw.replace(/\./g, ""), 10);
      } else if (/^\d{1,3}\.\d{3}[.,]\d{2,3}$/.test(numRaw)) {
        // European thousands with an extra group: "1.830,000" -> 1830000,
        // "1.472.00" -> 147200. Strip all separators.
        amount = parseInt(numRaw.replace(/[.,]/g, ""), 10);
      } else {
        const f = parseFloat(cleanedComma);
        if (isNaN(f)) continue;
        amount = Math.round(f);
        const plain = cleanedComma.replace(/\.\d+$/, "");
        // SHORTHAND: explicit currency + 3-digit value -> ×1000
        // ("hkd605" -> 605000, "127 HKD" -> 127000)
        if (explicit && amount >= 100 && amount <= 999 && /^\d{3}$/.test(plain)) {
          amount = amount * 1000;
        }
        // MILLION SHORTHAND: explicit currency + small decimal -> ×1,000,000.
        // In this market "1.32 USD" / "2.32 HKD" always means 1.32M / 2.32M;
        // no watch is ever priced at single/double digits.
        else if (explicit && amount < 50 && /^\d{1,2}\.\d{1,2}$/.test(numRaw)) {
          amount = Math.round(parseFloat(numRaw) * 1000000);
        }
      }

      if (!isFinite(amount)) continue;

      // YEAR-GLUED-TO-PRICE: a too-big number starting with a 19xx/20xx year is
      // usually "year + price" with no separator ("2024429000" = 2024 + 429000).
      if (!km && amount > 80000000 && /^(19|20)\d{2}\d{4,}$/.test(cleanedComma)) {
        const f2 = parseInt(cleanedComma.slice(4), 10);
        if (isFinite(f2) && f2 >= 1000 && f2 <= 80000000) amount = f2;
      }

      // Skip years/dates: 4-digit 19xx/20xx with no k/m is never a real price.
      if (!km && /^(19|20)\d{2}$/.test(cleanedComma)) continue;
      // Plausibility: watches ~1,000 to ~80,000,000 (higher for explicit k/m).
      const maxPlausible = km ? 300000000 : 80000000;
      if (amount < 1000 || amount > maxPlausible) continue;
      // Skip a non-explicit number that's just the PID repeated (model number).
      if (!explicit && !km && pidDigits && cleanedComma === pidDigits) continue;

      candidates.push({ amount, currency, explicit, fromLead, km: !!km, pos: start });
    }

    if (candidates.length === 0) return null;

    // Rank: explicit > standalone; prefer HKD; currency-before-number wins;
    // then k/m notation; then earliest position.
    const rankCur = (c: string) => (c === "HKD" ? 3 : c === "USDT" || c === "USD" ? 2 : 1);
    candidates.sort((a, b) => {
      if (a.explicit !== b.explicit) return a.explicit ? -1 : 1;
      const rc = rankCur(b.currency) - rankCur(a.currency);
      if (rc !== 0) return rc;
      if (a.fromLead !== b.fromLead) return a.fromLead ? -1 : 1;
      if (a.km !== b.km) return a.km ? -1 : 1;
      return a.pos - b.pos;
    });

    return { amount: candidates[0].amount, currency: candidates[0].currency };
  }

  private extractCurrency(text: string): string {
    const upperText = text.toUpperCase();
    
    if (/USDT/.test(upperText)) return 'USDT';
    if (/USD/.test(upperText)) return 'USD';
    if (/EUR/.test(upperText)) return 'EUR';
    if (/CHF/.test(upperText)) return 'CHF';
    if (/GBP/.test(upperText)) return 'GBP';
    
    return 'HKD';
  }
}

// Standalone function for webhook integration
export async function parseWatchMessage(
  messageContent: string, 
  options: {
    userId: string;
    source: string;
    sender: string;
    messageId: string;
  }
): Promise<ParsedWatchListing[]> {
  const parser = new WatchMessageParser();
  return await parser.parseMessage(messageContent, options.userId);
}