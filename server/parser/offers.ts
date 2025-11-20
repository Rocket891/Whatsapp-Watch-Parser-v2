/**
 * Offer parser for watch dealer listings
 * Parses lines like "RM72-01 White ... HKD 3.12m" and "5712/1R ... HKD 1.79m"
 */

const CURRENCY = /\b([A-Z]{3})\b/;           // e.g., HKD
const PRICE = /\b(\d{1,3}(?:[\d.,]*\d)?)(\s*[km])?\b/i; // 908k, 1.205m
const REF = /\b(\d{3,4}\/?\d*[A-Z]?)\b/i;    // 5712/1R, 5990/1R
const YM  = /\b(\d{1,2})\/(20\d{2})\b/;      // 7/2025
const COLOR = /\b(blue|white|green|black|salmon|grey|choco|coffee)\b/i;

export type OfferMatch = {
  ref: string | null;
  color: string | null;
  yearMonth: string | null;
  currency: string | null;
  priceRaw: string | null;
  priceValue: number | null;
};

export function parseOfferLine(line: string): OfferMatch {
  const ref = line.match(REF)?.[1] || null;
  const color = line.match(COLOR)?.[1]?.toLowerCase() || null;
  const ym = line.match(YM);
  const currency = line.match(CURRENCY)?.[1] || null;
  const price = line.match(PRICE);
  
  let priceValue: number | null = null;
  let priceRaw: string | null = null;
  
  if (price) {
    priceRaw = price[0];
    const n = parseFloat(price[1].replace(/,/g, ""));
    const unit = (price[2] || "").trim().toLowerCase();
    priceValue = unit === "k" ? n * 1_000 : unit === "m" ? n * 1_000_000 : n;
  }
  
  return {
    ref,
    color,
    yearMonth: ym ? `${ym[2]}-${ym[1].padStart(2,"0")}` : null,
    currency,
    priceRaw,
    priceValue,
  };
}

export function parseOffers(text: string): OfferMatch[] {
  return text.split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(parseOfferLine)
    .filter(r => r.ref && (r.priceValue || r.currency)); // keep likely offers
}

// Enhanced version that works with our existing PID patterns
export function parseWatchOffers(text: string): OfferMatch[] {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  
  // Only parse if we have multiple lines (dealer list behavior)
  if (lines.length < (process.env.OFFER_PARSE_MIN_LINES ? parseInt(process.env.OFFER_PARSE_MIN_LINES) : 3)) {
    return [];
  }
  
  return lines.map(parseOfferLine)
    .filter(r => r.ref && (r.priceValue || r.currency));
}