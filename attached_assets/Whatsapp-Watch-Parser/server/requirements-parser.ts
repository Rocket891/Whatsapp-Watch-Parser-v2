/**
 * Requirements Parser for WhatsApp Watch Trading Messages
 * Detects "Looking for" and WTB (Want To Buy) requests
 */

interface RequirementMatch {
  pid: string;
  variant?: string;
  condition?: string;
  rawLine: string;
  brand?: string;
  family?: string;
}

interface ParsedRequirements {
  requirements: RequirementMatch[];
  isRequirementMessage: boolean;
  messageType: 'wtb' | 'looking_for' | 'requirement' | 'none';
}

// Keywords that indicate a requirement/WTB message
const REQUIREMENT_KEYWORDS = [
  'looking for',
  'wtb',
  'want to buy',
  'need',
  'seeking',
  'require',
  'searching for',
  'in search of',
  'interested in',
  'buying',
  'purchase',
  'acquire',
];

// Condition keywords
const CONDITION_KEYWORDS = {
  new: ['new', 'brand new', 'bnib', 'unworn', 'mint'],
  used: ['used', 'pre-owned', 'preowned', 'worn', 'second hand', 'secondhand'],
  both: ['new/used', 'used/new', 'new | used', 'used | new', 'any condition']
};

/**
 * Check if a message contains requirement indicators
 */
function isRequirementMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  // Check for requirement keywords
  const hasRequirementKeyword = REQUIREMENT_KEYWORDS.some(keyword => 
    lowerMessage.includes(keyword.toLowerCase())
  );
  
  // Check for WTB-style formatting (emoji patterns)
  const hasWTBFormatting = /❤‍🔥|restock\s+wtb|wtb.*restock/i.test(message);
  
  return hasRequirementKeyword || hasWTBFormatting;
}

/**
 * Extract condition from text
 */
function extractCondition(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  
  for (const [condition, keywords] of Object.entries(CONDITION_KEYWORDS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return condition === 'both' ? 'new/used' : condition;
    }
  }
  
  return undefined;
}

/**
 * Enhanced PID extraction for requirements
 */
function extractPIDsFromRequirementLine(line: string): RequirementMatch[] {
  const requirements: RequirementMatch[] = [];
  
  // Remove common prefixes and clean the line
  let cleanLine = line
    .replace(/^looking\s+for\s*/i, '')
    .replace(/^wtb\s*/i, '')
    .replace(/^want\s+to\s+buy\s*/i, '')
    .replace(/^need\s*/i, '')
    .replace(/^seeking\s*/i, '')
    .trim();
  
  // Extract condition from the line
  const condition = extractCondition(cleanLine);
  
  // PID patterns - enhanced for requirements
  const pidPatterns = [
    // Rolex patterns
    /\b(\d{6}[A-Z]{1,2})\b/g, // 126610LN, 116500LN
    /\b(\d{5}[A-Z]{1,2})\b/g,  // 16610LV, 14060M
    
    // Patek Philippe patterns
    /\b([45]\d{3}[A-Z]?(?:\/\d+[A-Z]?)?)\b/g, // 5711/1A, 5164R, 5980/60G
    
    // Audemars Piguet patterns
    /\b(\d{5}[A-Z]{2}\.\d{2}\.\d{4}[A-Z]{2})\b/g, // 15202ST.OO.1240ST.01
    /\b(\d{5}[A-Z]{2})\b/g, // 26331ST, 15400ST
    
    // Richard Mille patterns
    /\bRM\s*(\d{2,3}(?:-\d{2})?(?:\s+\w+)?)\b/gi, // RM72-01, RM65-01 ntpt, RM055 white
    /\bRM(\d{2,3})\b/gi, // RM030, RM055
    
    // A. Lange & Söhne patterns
    /\b(\d{3}\.\d{3}[A-Z]?)\b/g, // 363.608, 139.021
    
    // Cartier patterns
    /\b([A-Z]{4}\d{4})\b/g, // WSSA0013, CRWSBB0073
    
    // Generic alphanumeric patterns
    /\b([A-Z]\d{1}[A-Z]\d{5})\b/g, // G0A45004 format
    /\b([A-Z]{2,4}\d{3,5}[A-Z]?)\b/g, // WGBB0029, WSPN0007
    /\b(\d{4,5}\/\d{1,4}[A-Z]?)\b/g, // 7118/1200A, 5811/1G
  ];
  
  // Split line by common separators for multiple PIDs
  const separators = /\s*[&,+]\s*|\s+and\s+|\s*\|\s*/i;
  const segments = cleanLine.split(separators);
  
  segments.forEach(segment => {
    const trimmedSegment = segment.trim();
    
    if (trimmedSegment.length < 3) return; // Skip very short segments
    
    let foundPID = false;
    
    // Try each pattern
    for (const pattern of pidPatterns) {
      pattern.lastIndex = 0; // Reset regex state
      const matches = [...trimmedSegment.matchAll(pattern)];
      
      matches.forEach(match => {
        let pid = match[1] || match[0];
        
        // Clean and validate PID
        pid = pid.replace(/[^\w\/\-\.]/g, '').trim();
        
        if (pid.length >= 3) {
          // Extract variant from the segment (text after the PID)
          const afterPID = trimmedSegment.substring(match.index! + match[0].length).trim();
          const variant = afterPID.split(/\s+/).slice(0, 3).join(' ').trim() || undefined;
          
          requirements.push({
            pid,
            variant: variant && variant.length > 0 ? variant : undefined,
            condition,
            rawLine: line.trim(),
            brand: inferBrand(pid),
            family: inferFamily(pid)
          });
          
          foundPID = true;
        }
      });
    }
    
    // If no PID pattern matched but segment looks like a watch reference, add it anyway
    if (!foundPID && trimmedSegment.length >= 4 && /[A-Z0-9]/.test(trimmedSegment)) {
      // Extract potential PID (first word/alphanumeric sequence)
      const potentialPID = trimmedSegment.split(/\s+/)[0];
      
      if (potentialPID.length >= 4 && /\d/.test(potentialPID) && /[A-Z]/i.test(potentialPID)) {
        const variant = trimmedSegment.substring(potentialPID.length).trim() || undefined;
        
        requirements.push({
          pid: potentialPID,
          variant: variant && variant.length > 0 ? variant : undefined,
          condition,
          rawLine: line.trim(),
          brand: inferBrand(potentialPID),
          family: inferFamily(potentialPID)
        });
      }
    }
  });
  
  return requirements;
}

/**
 * Infer brand from PID pattern
 */
function inferBrand(pid: string): string | undefined {
  const upperPID = pid.toUpperCase();
  
  if (/^RM\d+/.test(upperPID)) return 'Richard Mille';
  if (/^[45]\d{3}/.test(upperPID)) return 'Patek Philippe';
  if (/^\d{5,6}[A-Z]*$/.test(upperPID)) return 'Rolex';
  if (/^\d{5}[A-Z]{2}/.test(upperPID)) return 'Audemars Piguet';
  if (/^\d{3}\.\d{3}/.test(upperPID)) return 'A. Lange & Söhne';
  if (/^W[A-Z]{3}\d{4}/.test(upperPID)) return 'Cartier';
  if (/^[A-Z]{2,4}\d{3,5}/.test(upperPID)) return 'Cartier';
  
  return undefined;
}

/**
 * Infer family from PID pattern
 */
function inferFamily(pid: string): string | undefined {
  const upperPID = pid.toUpperCase();
  
  // Rolex families
  if (/^116500/.test(upperPID)) return 'Daytona';
  if (/^126710/.test(upperPID)) return 'GMT-Master II';
  if (/^126610/.test(upperPID)) return 'Submariner';
  if (/^116610/.test(upperPID)) return 'Submariner';
  if (/^126334/.test(upperPID)) return 'Datejust';
  
  // Patek Philippe families
  if (/^5711/.test(upperPID)) return 'Nautilus';
  if (/^5712/.test(upperPID)) return 'Nautilus';
  if (/^5980/.test(upperPID)) return 'Nautilus';
  if (/^5164/.test(upperPID)) return 'Aquanaut';
  if (/^5167/.test(upperPID)) return 'Aquanaut';
  if (/^5811/.test(upperPID)) return 'Calatrava';
  
  // Audemars Piguet families
  if (/^15/.test(upperPID)) return 'Royal Oak';
  if (/^26/.test(upperPID)) return 'Royal Oak';
  
  return undefined;
}

/**
 * Main function to parse requirements from WhatsApp message
 */
export function parseRequirements(
  message: string,
  sender?: string,
  groupName?: string,
  chatId?: string,
  messageId?: string,
  senderNumber?: string,
  date?: string,
  time?: string
): ParsedRequirements {
  
  if (!isRequirementMessage(message)) {
    return {
      requirements: [],
      isRequirementMessage: false,
      messageType: 'none'
    };
  }
  
  const requirements: RequirementMatch[] = [];
  const lines = message.split('\n').map(line => line.trim()).filter(Boolean);
  
  // Determine message type
  let messageType: 'wtb' | 'looking_for' | 'requirement' = 'requirement';
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('wtb') || /❤‍🔥.*restock.*wtb/i.test(message)) {
    messageType = 'wtb';
  } else if (lowerMessage.includes('looking for')) {
    messageType = 'looking_for';
  }
  
  // Extract global condition from message header
  const globalCondition = extractCondition(message);
  
  lines.forEach(line => {
    // Skip header lines and non-requirement lines
    if (line.length < 4) return;
    if (/^❤‍🔥|restock\s+wtb/i.test(line) && !line.toLowerCase().includes('looking for')) return;
    if (/^new\s*\|\s*used$/i.test(line)) return;
    if (/can\s+confirm.*price.*deal/i.test(line)) return;
    
    // Check if line contains requirement indicator
    const hasRequirementIndicator = REQUIREMENT_KEYWORDS.some(keyword =>
      line.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (hasRequirementIndicator) {
      const lineRequirements = extractPIDsFromRequirementLine(line);
      
      // Apply global condition if line doesn't have specific condition
      lineRequirements.forEach(req => {
        if (!req.condition && globalCondition) {
          req.condition = globalCondition;
        }
      });
      
      requirements.push(...lineRequirements);
    }
  });
  
  return {
    requirements,
    isRequirementMessage: true,
    messageType
  };
}

/**
 * Store requirements in database
 */
export async function storeRequirements(
  requirements: RequirementMatch[],
  messageData: {
    sender?: string;
    groupName?: string;
    chatId?: string;
    messageId?: string;
    senderNumber?: string;
    date?: string;
    time?: string;
    originalMessage: string;
  }
): Promise<void> {
  if (requirements.length === 0) return;
  
  try {
    const { db } = await import('./db');
    const { watchRequirements } = await import('../shared/schema');
    
    const insertsData = requirements.map(req => ({
      pid: req.pid,
      variant: req.variant,
      condition: req.condition,
      chatId: messageData.chatId,
      groupName: messageData.groupName,
      sender: messageData.sender,
      senderNumber: messageData.senderNumber,
      date: messageData.date,
      time: messageData.time,
      rawLine: req.rawLine,
      originalMessage: messageData.originalMessage,
      messageId: messageData.messageId,
      brand: req.brand,
      family: req.family,
    }));
    
    await db.insert(watchRequirements).values(insertsData);
    
    console.log(`✅ Stored ${requirements.length} watch requirements from ${messageData.sender}`);
    
  } catch (error) {
    console.error('❌ Error storing requirements:', error);
  }
}