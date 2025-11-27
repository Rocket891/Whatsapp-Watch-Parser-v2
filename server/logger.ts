const isProduction = process.env.NODE_ENV === 'production';
const isDebugMode = process.env.DEBUG_LOGGING === 'true';

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(message, ...args);
  },
  
  error: (message: string, ...args: any[]) => {
    console.error(message, ...args);
  },
  
  warn: (message: string, ...args: any[]) => {
    console.warn(message, ...args);
  },
  
  debug: (message: string, ...args: any[]) => {
    if (!isProduction || isDebugMode) {
      console.log(message, ...args);
    }
  },
  
  verbose: (message: string, ...args: any[]) => {
    if (isDebugMode) {
      console.log(message, ...args);
    }
  }
};

export function summarizeResults(results: any[], label: string): void {
  if (results.length === 0) return;
  
  if (isProduction && !isDebugMode) {
    console.log(`${label}: ${results.length} items processed`);
  } else {
    console.log(`${label}:`, results.slice(0, 3), results.length > 3 ? `... and ${results.length - 3} more` : '');
  }
}
