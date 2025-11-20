// server/inventory-parser.ts
export interface InventoryItem {
  pid: string;
  brand?: string;
  family?: string;
  variant?: string;
  condition?: string;
  price?: number;
  currency?: string;
  year?: string;
  month?: string;
  rawLine: string;
  notes?: string;
}

export function parseInventoryMessage(message: string): InventoryItem[] {
  const lines = message.split('\n').map(line => line.trim()).filter(Boolean);
  const items: InventoryItem[] = [];
  
  console.log(`📦 INVENTORY PARSER: Processing ${lines.length} lines`);
  
  for (const line of lines) {
    const item = parseInventoryLine(line);
    if (item) {
      items.push(item);
      console.log(`📦 Found inventory item: ${item.pid} - ${item.price} ${item.currency}`);
    }
  }
  
  return items;
}

function parseInventoryLine(line: string): InventoryItem | null {
  const originalLine = line;
  
  // Skip non-watch lines
  if (line.includes('only') && line.includes('usd') && !hasWatchPid(line)) {
    return null;
  }
  
  // Common patterns for inventory items:
  // "5261R N6 1.22M" 
  // "126519 mete N8 840k"
  // "RM 67-02 white 12/2024 410k usd or 3.2M Hkd"
  // "FPJ platinum vertical tourb 2022 425k usd or 3.31M Hkd"
  // "*5726/1A blue N1 965k*"
  
  let pid = "";
  let brand = "";
  let family = "";
  let variant = "";
  let condition = "";
  let price: number | undefined;
  let currency = "";
  let year = "";
  let month = "";
  let notes = "";
  
  // Remove bold markers
  line = line.replace(/\*/g, '');
  
  // Extract Rolex PIDs (6 digits, possibly with suffix)
  const rolexMatch = line.match(/\b(\d{6}[A-Z]*)\b/);
  if (rolexMatch) {
    pid = rolexMatch[1];
    brand = "Rolex";
  }
  
  // Extract Patek Philippe PIDs (4 digits with slash and suffix)
  const patekMatch = line.match(/\b(\d{4}\/\d+[A-Z]*)\b/);
  if (patekMatch) {
    pid = patekMatch[1];
    brand = "Patek Philippe";
  }
  
  // Extract Audemars Piguet PIDs
  const apMatch = line.match(/\b(\d{5}[A-Z]{2})\b/);
  if (apMatch) {
    pid = apMatch[1];
    brand = "Audemars Piguet";
  }
  
  // Extract Richard Mille PIDs
  const rmMatch = line.match(/\bRM[\s-]?(\d{2,3}[-\/]?\d{0,3}[A-Z]*)\b/i);
  if (rmMatch) {
    pid = `RM${rmMatch[1]}`;
    brand = "Richard Mille";
  }
  
  // Extract FPJ (F.P. Journe)
  if (line.toLowerCase().includes('fpj')) {
    brand = "F.P. Journe";
    // Try to extract model from context
    if (line.toLowerCase().includes('resonance')) {
      family = "Resonance";
      pid = "Resonance";
    } else if (line.toLowerCase().includes('vertical')) {
      family = "Chronometre Vertical";
      pid = "Vertical";
    } else if (line.toLowerCase().includes('elegante')) {
      family = "Elegante";
      pid = "Elegante";
    }
  }
  
  // Extract Cartier
  if (line.toLowerCase().includes('cartier')) {
    brand = "Cartier";
    if (line.toLowerCase().includes('crash')) {
      family = "Crash";
      pid = "Crash";
    } else if (line.toLowerCase().includes('tank')) {
      family = "Tank";
      pid = "Tank";
    }
  }
  
  // Extract Vacheron Constantin
  if (line.match(/\bVC\b|\b4520V\b/)) {
    brand = "Vacheron Constantin";
    const vcMatch = line.match(/\b(4520V[^\s]*)\b/);
    if (vcMatch) {
      pid = vcMatch[1];
    }
  }
  
  // If no PID found, skip
  if (!pid) {
    return null;
  }
  
  // Extract month notation (N1, N2, etc.)
  const monthMatch = line.match(/\bN(\d{1,2})\b/);
  if (monthMatch) {
    month = `N${monthMatch[1]}`;
  }
  
  // Extract year
  const yearMatch = line.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    year = yearMatch[1];
  }
  
  // Extract condition
  if (line.toLowerCase().includes('new') && !line.toLowerCase().includes('like new')) {
    condition = "new";
  } else if (line.toLowerCase().includes('like new')) {
    condition = "like new";
  } else if (line.toLowerCase().includes('used')) {
    condition = "used";
  } else if (line.toLowerCase().includes('nos')) {
    condition = "nos";
  } else if (line.toLowerCase().includes('good')) {
    condition = "good";
  }
  
  // Extract variant/color
  const colors = ['blue', 'black', 'white', 'green', 'grey', 'gray', 'silver', 'gold', 'rose', 'yellow', 'red', 'brown', 'salmon', 'purple', 'pink'];
  for (const color of colors) {
    if (line.toLowerCase().includes(color)) {
      variant = color;
      break;
    }
  }
  
  // Special variants
  if (line.toLowerCase().includes('tiffany')) {
    variant = 'tiffany';
  }
  if (line.toLowerCase().includes('arabic')) {
    variant = 'arabic';
  }
  if (line.toLowerCase().includes('pave')) {
    variant = 'pave';
  }
  
  // Extract price and currency
  const priceMatches = [
    line.match(/(\d+(?:\.\d+)?)\s*M\s*[Hh]kd/i), // "1.22M Hkd"
    line.match(/(\d+(?:\.\d+)?)\s*M/), // "1.22M"
    line.match(/(\d+)k\s*usd/i), // "425k usd"
    line.match(/(\d+)k\s*[Hh]kd/i), // "840k Hkd"
    line.match(/(\d+)k/), // "965k"
  ];
  
  for (const match of priceMatches) {
    if (match) {
      const value = parseFloat(match[1]);
      if (match[0].toLowerCase().includes('usd')) {
        price = value * (match[0].includes('M') ? 1000000 : 1000);
        currency = 'USD';
      } else if (match[0].toLowerCase().includes('hkd')) {
        price = value * (match[0].includes('M') ? 1000000 : 1000);
        currency = 'HKD';
      } else {
        // Default to HKD for prices without explicit currency
        price = value * (match[0].includes('M') ? 1000000 : 1000);
        currency = 'HKD';
      }
      break;
    }
  }
  
  return {
    pid,
    brand: brand || undefined,
    family: family || undefined,
    variant: variant || undefined,
    condition: condition || undefined,
    price,
    currency: currency || undefined,
    year: year || undefined,
    month: month || undefined,
    rawLine: originalLine,
    notes: notes || undefined
  };
}

function hasWatchPid(line: string): boolean {
  // Check if line contains any watch-like PID patterns
  return !!(
    line.match(/\b\d{6}[A-Z]*\b/) || // Rolex
    line.match(/\b\d{4}\/\d+[A-Z]*\b/) || // Patek
    line.match(/\b\d{5}[A-Z]{2}\b/) || // AP
    line.match(/\bRM[\s-]?\d{2,3}/i) || // RM
    line.toLowerCase().includes('fpj') ||
    line.toLowerCase().includes('cartier') ||
    line.match(/\bVC\b|\b4520V\b/)
  );
}