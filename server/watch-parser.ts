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
      console.log(`Loaded ${references.length} reference records into cache`);
    } catch (error) {
      console.error('Failed to load reference database:', error);
    }
  }
  
  private async enrichWithReference(pid: string, userId?: string): Promise<{ brand?: string; family?: string; name?: string }> {
    await this.loadReferenceDatabase(userId);
    
    const pidLower = pid.toLowerCase();
    console.log(`🔍 Enriching PID: ${pidLower}`);
    
    // Try exact match first
    let match = this.referenceCache.get(pidLower);
    if (match) {
      console.log(`✅ Exact match found for ${pidLower}:`, match.brand, match.family);
      return {
        brand: match.brand,
        family: match.family,
        name: match.name
      };
    }
    
    // Try pattern matching - look for references that start with the PID
    for (const [key, value] of this.referenceCache.entries()) {
      if (key.startsWith(pidLower)) {
        console.log(`✅ Pattern match found for ${pidLower} -> ${key}:`, value.brand, value.family);
        return {
          brand: value.brand,
          family: value.family,
          name: value.name
        };
      }
    }
    
    console.log(`❌ No match found for PID: ${pidLower}`);
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
        
        console.log(`🏷️ Emoji + Brand + Condition header detected: Brand="${brand}", Condition="${condition}", Accessories="${accessories}"`);
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
        
        console.log(`🏷️ Year + Condition header detected: Year="${year}", Condition="${condition}"`);
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
        
        console.log(`🏷️ Brand + Condition header detected: Brand="${brand}", Condition="${condition}"`);
        return { condition, brand };
      }
      
      // Detect simple condition headers like "New", "Preowned"
      if (line.toLowerCase() === 'new') {
        console.log(`🏷️ Simple header context: "New"`);
        return { condition: 'New' };
      }
      if (line.toLowerCase() === 'preowned' || line.toLowerCase() === 'used') {
        console.log(`🏷️ Simple header context: "Used"`);
        return { condition: 'Used' };
      }
    }
    
    return null;
  }

  // MONTH EXTRACTION: Extract N1-N12 month notation
  private extractMonth(text: string): string | undefined {
    const monthPattern = /\bN(\d{1,2})\b/i;
    const match = text.match(monthPattern);
    
    if (match) {
      const monthNum = parseInt(match[1]);
      if (monthNum >= 1 && monthNum <= 12) {
        console.log(`📅 Month extracted: N${monthNum}`);
        return `N${monthNum}`;
      }
    }
    
    return undefined;
  }

  // NEW: Detect if message is "looking for" vs "selling"
  private detectMessageType(message: string): 'selling' | 'looking_for' {
    const lowerMessage = message.toLowerCase();
    
    // Strong selling indicators - if present, it's definitely a selling message
    const sellingPatterns = [
      /\b\d+[a-z]*[\s\/]*\d*[a-z]*\s*[-–]\s*\d+k?\b/i, // PID-price patterns like "126334 - 120k"
      /\b[a-z]*\d+[a-z]*\s+\d+k?\b/i, // PID space price like "126334 120k"
      /\bfs\b/i, // "fs" indicates for sale
      /\bboth\s+tags?\b/i, // "both tags" is selling terminology
      /\b(n\d+|used|new)\s*\d+k?\b/i, // condition with price
      /https?:\/\/[^\s]+/i, // URLs in selling messages
      /\b\d+\/\d+\b/i, // Date patterns in selling messages
    ];

    // Check for strong selling indicators first
    for (const pattern of sellingPatterns) {
      if (pattern.test(lowerMessage)) {
        return 'selling';
      }
    }
    
    // More specific looking for indicators (avoid false positives)
    const lookingForPatterns = [
      /\blooking\s+for\s+[a-z0-9]/i, // "looking for" followed by model/PID
      /\bwant\s+to\s+buy\s+[a-z0-9]/i, // "want to buy" followed by model
      /\binterested\s+in\s+[a-z0-9]/i, // "interested in" followed by model
      /\bsearching\s+for\s+[a-z0-9]/i, // "searching for" followed by model
      /\bneed\s+[a-z0-9]/i, // "need" followed by model
      /\bdemand\s+[a-z0-9]/i, // "demand" followed by model (like the diamond message)
      /\bif\s+you\s+have\s+[a-z0-9]/i, // "if you have" followed by model
      /\bplease\s+contact\s+me/i,
      /\bcan\s+confirm/i,
      /\bgood\s+price.*confirm/i,
      /\bcash\s+ready/i,
      /\bbuy.*urgent/i
    ];
    
    // Only classify as looking_for if no selling indicators and has specific looking patterns
    for (const pattern of lookingForPatterns) {
      if (pattern.test(lowerMessage)) {
        return 'looking_for';
      }
    }
    
    // Default to selling for traditional listing messages
    return 'selling';
  }
  
  async parseMessage(message: string): Promise<ParsedWatchListing[]> {
    const listings: ParsedWatchListing[] = [];
    
    // Quick gate check - is this likely a watch message?
    if (!this.isWatchMessage(message)) {
      return listings;
    }

    // Detect message type - "looking for" vs "selling"
    const messageType = this.detectMessageType(message);
    console.log(`🔍 Message type detected: ${messageType}`);
    
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
        console.log(`🔄 Context changed at line ${i}: Year="${currentContext?.year}", Condition="${currentContext?.condition}"`);
      }
      
      contextsPerLine[i] = currentContext;
    }
    
    // Enhanced multi-PID detection for complex formats with various symbols
    // Don't clean message yet - work with original to detect symbols
    const symbols = ['🍁', '❤️', '⭐', '✅', '🔥', '💎', '🚀', '⚡', '🌹'];
    let multiPidMatches: RegExpMatchArray[] = [];
    
    for (const symbol of symbols) {
      // Check original message for symbols
      if (message.includes(symbol)) {
        const parts = message.split(symbol).filter(part => part.trim().length > 0);
        console.log(`🔍 Symbol ${symbol} found, split into ${parts.length} parts:`, parts.map(p => p.substring(0, 50)));
        if (parts.length > 1) {
          console.log(`🔍 Multi-PID detected with ${symbol}: ${parts.length} parts`);
          // Skip first part if it's just header (like "🇭🇰 *PATEK* 🇭🇰" or "Test")
          const actualParts = parts.slice(1); // Skip header part
          multiPidMatches = actualParts.map((part, index) => [`${symbol}${part}`, symbol, part] as any);
          console.log(`🔍 Processing ${actualParts.length} actual PID parts:`, actualParts.map(p => p.substring(0, 30)));
          break; // Use first symbol found
        }
      }
    }
    
    if (multiPidMatches.length > 0) {
      console.log(`🔍 Multi-PID pattern detected: ${multiPidMatches.length} PIDs found`);
      
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
        console.log(`✅ Multi-PID parsing successful: ${listings.length} listings`);
        return listings;
      }
    }
    
    // Enhanced line-by-line parsing for formats like A.Lange&Sohne
    const cleanMessage = message.replace(/[\uD800-\uDFFF]/g, '');
    const parseLines = cleanMessage.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 5);

    console.log(`🔍 Processing ${parseLines.length} lines for parsing`);
    
    for (let i = 0; i < parseLines.length; i++) {
      const line = parseLines[i];
      console.log(`🔍 Checking line: "${line}"`);
      
      // Get context for this specific line
      const lineContext = contextsPerLine[i];
      
      // Check if this line contains our A.Lange&Sohne pattern directly
      const langePattern = /\b(\d{3}\.\d{3})\b/;
      const langeMatch = line.match(langePattern);
      if (langeMatch) {
        console.log(`✅ Found A.Lange&Sohne PID in line: ${langeMatch[1]}`);
      }
      
      // Handle cases where price is on separate line (like Q3523490 + 258000hkd)
      let combinedLine = line;
      const nextLine = parseLines[i + 1];
      
      // If current line has PID but no price, and next line has price/currency
      if (this.extractPID(line) && !this.extractPrice(line) && nextLine) {
        const nextLinePrice = this.extractPrice(nextLine);
        const nextLinePid = this.extractPID(nextLine);
        
        // If next line has price but no PID (or only a price-like number), combine them
        if (nextLinePrice && (!nextLinePid || /^\d{5,6}(hkd|usd|eur)?$/i.test(nextLine.trim()))) {
          combinedLine = `${line} ${nextLine}`;
          console.log(`🔗 Combining lines: "${line}" + "${nextLine}"`);
          i++; // Skip the next line since we've processed it
        }
      }
      
      const result = await this.parseChunkWithContext(combinedLine, lineContext);
      if (result && result.pid) {
        console.log(`✅ Successfully parsed PID from line: ${result.pid} (Context: Year=${lineContext?.year}, Condition=${lineContext?.condition})`);
        result.messageType = messageType;
        listings.push(result);
      } else {
        console.log(`❌ No PID found in line: "${line}"`);
      }
    }
    
    // If line parsing found results, return them
    if (listings.length > 0) {
      console.log(`✅ Line-by-line parsing successful: ${listings.length} listings`);
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
    const hardPattern = /\b(RM|AP|PATEK|ROLEX|OMEGA|CARTIER|VACHERON|LANGE|A\.LANGE|NAUTILUS|ROYAL\s*OAK|F\.?P\.?J)\b/i;
    
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
      console.log("🔍 Multi-PID symbol pattern detected:", message);
      return true;
    }
    
    // Check for PID + currency/price combination
    if (pidPattern.test(message) && (currencyPattern.test(message) || pricePattern.test(message))) {
      console.log("🔍 PID + Currency/Price detected:", message);
      return true;
    }
    
    // Check for hard brand indicators
    if (hardPattern.test(message)) {
      console.log("🔍 Hard brand indicator detected:", message);
      return true;
    }
    
    // Check for soft indicators with numbers
    if (softPattern.test(message) && hasNumbers) {
      console.log("🔍 Soft indicator + numbers detected:", message);
      return true;
    }
    
    console.log("🔍 Message not recognized as watch message:", message);
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
      console.log(`🔍 Found ${pidLines.length} lines with PIDs - splitting into chunks`);
      return pidLines;
    }
    
    // Method 3.5: Fallback - if we have multiple lines, try each one individually
    if (lines.length > 1) {
      const validLines = lines.filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 10 && (/\d{4,6}/.test(trimmed) || /hkd|usd|eur/i.test(trimmed));
      });
      
      if (validLines.length > 1) {
        console.log(`🔍 Fallback multi-line parsing: ${validLines.length} lines`);
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
      console.log(`📅 Applied contextual year: ${context.year} to PID: ${result.pid}`);
    }
    
    // CONTEXTUAL CONDITION: Use header context if no explicit condition found
    result.condition = this.extractCondition(chunk);
    if (!result.condition && context?.condition) {
      result.condition = context.condition;
      console.log(`📋 Applied contextual condition: ${context.condition} to PID: ${result.pid}`);
    }
    
    const priceInfo = this.extractPrice(chunk);
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
      // PRIORITY: Fix 7118/1200r format - needs to capture full PID
      /\b(\d{4}\/\d{3,4}[A-Z]*)\b/i,                       // 7118/1200R, 5267/200A format (priority fix)
      
      // PRIORITY: Fix G0A45004 format - letter + digit + letter + 4-5 digits
      /\b([A-Z]\d[A-Z]\d{4,5})\b/i,                        // G0A45004 format (priority fix)
      /\b([A-Z]\d{6,8})\b/i,                               // A1234567 format 
      
      // Most specific patterns first - complete watch references
      /\b(\d{4}[A-Z]?[-/]\d{3}[A-Z]?[-/][A-Z]\d{3})\b/i,  // 4010U/000R-B329
      /\b(\d{4}[A-Z][-/]\d{3}[A-Z][-/][A-Z]\d{3})\b/i,    // 4010T-000R-B344
      
      // Brand-specific complete patterns
      /\b(RM\s*\d{2,3}(?:-\d{2,3})?)\b/i,                  // RM 65-01
      /\b(AP\s*\d{5}[A-Z]{0,2})\b/i,                       // AP 26730Ba
      
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
      /(?:HKD|USD|EUR|CHF|GBP|USDT)\d+/i,
      /\d+(?:HKD|USD|EUR|CHF|GBP|USDT)/i,
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
          console.log(`🚫 Skipping year pattern as PID: ${candidate}`);
          continue; // Skip years disguised as PIDs
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
            console.log(`🚫 Skipping invalid PID pattern: ${candidate}`);
            isInvalidPid = true;
            break;
          }
        }
        
        if (!isCurrency && !isInvalidPid) {
          console.log(`✅ Found valid PID: ${candidate}`);
          return candidate;
        }
      }
    }
    
    return '';
  }

  private extractYear(text: string): string | undefined {
    // Year patterns - handle full years with Y suffix first
    let match = text.match(/\b(20\d{2})[yY]?\b/i);
    if (match) return match[1];
    
    match = text.match(/\b(19\d{2})[yY]?\b/i);
    if (match) return match[1];
    
    match = text.match(/\b(20\d{2})\/\d{1,2}\b/);
    if (match) return match[1];
    
    match = text.match(/\b(\d{1,2})[yY]\b/);
    if (match) {
      const year = parseInt(match[1]);
      return year < 50 ? `20${year.toString().padStart(2, '0')}` : `19${year.toString().padStart(2, '0')}`;
    }
    
    return undefined;
  }

  private extractVariant(text: string): string | undefined {
    const variants = [];
    const metals = text.match(/\b(steel|stainless|ss|gold|rose\s*gold|yellow\s*gold|white\s*gold|platinum|titanium|ceramic)\b/gi);
    if (metals) variants.push(...metals.map(m => m.toLowerCase().replace(/\s+/g, ' ')));
    
    const colors = text.match(/\b(black|white|blue|green|red|silver|champagne|slate|panda|pepsi|batman|hulk|kermit|brown|pink)\b/gi);
    if (colors) variants.push(...colors.map(c => c.toLowerCase()));
    
    const bracelets = text.match(/\b(oyster|jubilee|president|nato|leather|rubber|milanese|mesh)\b/gi);
    if (bracelets) variants.push(...bracelets.map(b => b.toLowerCase()));
    
    return variants.length > 0 ? [...new Set(variants)].join(', ') : undefined;
  }

  private extractCondition(text: string): string | undefined {
    const lowerText = text.toLowerCase();
    
    if (/brand\s*new\s*in\s*box|bnib/.test(lowerText)) return 'Brand New';
    if (/like\s*new\s*in\s*box|lnib/.test(lowerText)) return 'Like New';
    if (/brand\s*new|new/.test(lowerText)) return 'Brand New';
    if (/\b(unworn|unused)\b/.test(lowerText)) return 'Unworn';
    if (/like\s*new/.test(lowerText)) return 'Like New';
    if (/full\s*set|fullset/.test(lowerText)) return 'Full Set';
    if (/only\s*watch/.test(lowerText)) return 'Only Watch';
    if (/mint/.test(lowerText)) return 'Mint';
    if (/excellent/.test(lowerText)) return 'Excellent';
    if (/very\s*good/.test(lowerText)) return 'Very Good';
    if (/good/.test(lowerText)) return 'Good';
    if (/used/.test(lowerText)) return 'Used';
    if (/fair/.test(lowerText)) return 'Fair';
    
    return undefined;
  }

  private extractPrice(text: string): { amount: number; currency: string } | null {
    // Based on reference code parse_price function
    const t = text.replace(',', '').toLowerCase();
    
    // Handle decimal + k/m formats
    let match = t.match(/(\d+\.\d+)\s*k/);
    if (match) {
      return {
        amount: Math.round(parseFloat(match[1]) * 1000),
        currency: this.extractCurrency(text)
      };
    }
    
    match = t.match(/(\d+\.\d+)\s*m/);
    if (match) {
      return {
        amount: Math.round(parseFloat(match[1]) * 1000000),
        currency: this.extractCurrency(text)
      };
    }
    
    // Handle integer + k/m formats
    match = t.match(/(\d+)\s*k\b/);
    if (match) {
      return {
        amount: parseInt(match[1]) * 1000,
        currency: this.extractCurrency(text)
      };
    }
    
    match = t.match(/(\d+)\s*m\b/);
    if (match) {
      return {
        amount: parseInt(match[1]) * 1000000,
        currency: this.extractCurrency(text)
      };
    }
    
    // Handle million spelled out
    match = t.match(/(\d+\.\d+)\s*mill/);
    if (match) {
      return {
        amount: Math.round(parseFloat(match[1]) * 1000000),
        currency: this.extractCurrency(text)
      };
    }
    
    // Handle currency prefixed prices with colon/space
    match = t.match(/(?:hkd|usd|eur|chf|usdt)[: ]\s*(\d{5,})/);
    if (match) {
      return {
        amount: parseInt(match[1]),
        currency: this.extractCurrency(text)
      };
    }
    
    // Handle currency suffixed prices (most common format: 123000hkd)
    match = t.match(/(\d{5,})(?:hkd|usd|eur|chf|usdt)/);
    if (match) {
      return {
        amount: parseInt(match[1]),
        currency: this.extractCurrency(text)
      };
    }
    
    // Handle currency directly attached to price (old format)
    match = t.match(/(?:hkd|usd|eur|chf|usdt)(\d{5,})/);
    if (match) {
      return {
        amount: parseInt(match[1]),
        currency: this.extractCurrency(text)
      };
    }
    
    // Handle standalone large numbers (6+ digits) - but avoid PID numbers  
    // PIDs like 116508, 126508 should not be treated as prices
    match = t.match(/\b(\d{6,})\b/);
    if (match) {
      const number = match[1];
      // Skip if it looks like a Rolex PID (starts with specific patterns)
      if (/^(11|12|13|22|32|33|11650[0-9]|12650[0-9]|22823[0-9])/.test(number)) {
        return null;
      }
      return {
        amount: parseInt(match[1]),
        currency: this.extractCurrency(text)
      };
    }
    
    return null;
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