import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  serviceAccountKey: string; // JSON string
}

export interface RawMessage {
  timestamp: string;
  groupId: string;
  sender: string;
  senderNumber: string;
  message: string;
}

export interface WatchListing {
  series: string;
  chat: string;
  date: string;
  time: string;
  sender: string;
  senderNumber: string;
  pid: string;
  year: string;
  variant: string;
  condition: string;
  price: string;
  currency: string;
  rawLine: string;
  rawGeminiResponse: string;
  brand: string;
  family: string;
  name: string;
}

export interface DatabaseEntry {
  brand: string;
  family: string;
  reference: string;
  name: string;
}

export class GoogleSheetsService {
  private sheets: any;
  private auth: JWT;
  private databaseCache: Map<string, DatabaseEntry> = new Map();
  private lastDatabaseUpdate: number = 0;

  constructor(private config: GoogleSheetsConfig) {
    // Parse the service account key
    const credentials = JSON.parse(config.serviceAccountKey);
    
    // Create JWT auth
    this.auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    // Initialize Sheets API
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  async getRawMessages(): Promise<RawMessage[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.config.spreadsheetId,
        range: 'LogRaw!A:E',
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) return [];

      const dataRows = rows.slice(1); // Skip header
      return dataRows.map(row => ({
        timestamp: row[0] || '',
        groupId: row[1] || '',
        sender: row[2] || '',
        senderNumber: row[3] || '',
        message: row[4] || '',
      }));
    } catch (error) {
      console.error('Error reading raw messages:', error);
      throw new Error('Failed to read raw messages from Google Sheets');
    }
  }

  async getDatabase(): Promise<DatabaseEntry[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.config.spreadsheetId,
        range: 'Database!A:D',
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) return [];

      const dataRows = rows.slice(1); // Skip header
      return dataRows.map(row => ({
        brand: row[0] || '',
        family: row[1] || '',
        reference: row[2] || '',
        name: row[3] || '',
      }));
    } catch (error) {
      console.error('Error reading database:', error);
      throw new Error('Failed to read database from Google Sheets');
    }
  }

  async loadDatabaseCache(): Promise<void> {
    const now = Date.now();
    // Refresh cache every 10 minutes
    if (now - this.lastDatabaseUpdate < 10 * 60 * 1000 && this.databaseCache.size > 0) {
      return;
    }

    const database = await this.getDatabase();
    this.databaseCache.clear();
    
    database.forEach(entry => {
      if (entry.reference) {
        // Store with normalized reference as key
        const normalizedRef = entry.reference.toUpperCase().trim();
        this.databaseCache.set(normalizedRef, entry);
      }
    });
    
    this.lastDatabaseUpdate = now;
    console.log(`Loaded ${this.databaseCache.size} database entries into cache`);
  }

  enrichWithDatabase(pid: string): DatabaseEntry | null {
    if (!pid) return null;
    
    const normalizedPid = pid.toUpperCase().trim();
    return this.databaseCache.get(normalizedPid) || null;
  }

  async appendWatchListings(listings: WatchListing[]): Promise<void> {
    try {
      if (listings.length === 0) return;

      // Convert listings to array format for Google Sheets
      const rows = listings.map(listing => [
        listing.series,
        listing.chat,
        listing.date,
        listing.time,
        listing.sender,
        listing.senderNumber,
        listing.pid,
        listing.year,
        listing.variant,
        listing.condition,
        listing.price,
        listing.currency,
        listing.rawLine,
        listing.rawGeminiResponse,
        listing.brand,
        listing.family,
        listing.name,
      ]);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.config.spreadsheetId,
        range: 'Watch Id!A:Q',
        valueInputOption: 'RAW',
        requestBody: {
          values: rows,
        },
      });
    } catch (error) {
      console.error('Error appending watch listings:', error);
      throw new Error('Failed to append watch listings to Google Sheets');
    }
  }

  async processRawMessages(): Promise<{ processed: number; listings: number }> {
    console.log('Starting to process raw messages from Google Sheets...');
    
    // Load database cache for enrichment
    await this.loadDatabaseCache();
    
    // Get raw messages
    const rawMessages = await this.getRawMessages();
    console.log(`Found ${rawMessages.length} raw messages to process`);
    
    if (rawMessages.length === 0) {
      return { processed: 0, listings: 0 };
    }

    const allListings: WatchListing[] = [];
    let processedCount = 0;

    for (const message of rawMessages) {
      try {
        // Parse the message using our watch parser
        const { WatchMessageParser } = await import('./watch-parser');
        const parser = new WatchMessageParser();
        const parsedListings = parser.parseMessage(message.message);

        // Convert parsed listings to our format
        for (const parsed of parsedListings) {
          const enrichment = this.enrichWithDatabase(parsed.pid);
          
          // Extract date and time from timestamp
          const timestamp = new Date(message.timestamp);
          const date = timestamp.toISOString().split('T')[0];
          const time = timestamp.toTimeString().split(' ')[0];

          const listing: WatchListing = {
            series: '1', // Default series
            chat: message.groupId,
            date: date,
            time: time,
            sender: message.sender,
            senderNumber: message.senderNumber,
            pid: parsed.pid,
            year: parsed.year || '',
            variant: parsed.variant || '',
            condition: parsed.condition || '',
            price: parsed.price?.toString() || '',
            currency: parsed.currency || '',
            rawLine: parsed.rawLine,
            rawGeminiResponse: '', // Not using Gemini in this implementation
            brand: enrichment?.brand || '',
            family: enrichment?.family || '',
            name: enrichment?.name || '',
          };

          allListings.push(listing);
        }

        processedCount++;
      } catch (error) {
        console.error(`Error processing message: ${error}`);
      }
    }

    // Append all listings to the Watch Id sheet
    if (allListings.length > 0) {
      await this.appendWatchListings(allListings);
      console.log(`Successfully processed ${allListings.length} watch listings`);
    }

    return { processed: processedCount, listings: allListings.length };
  }
}