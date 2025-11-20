// server/waConfig.ts
import { promises as fs } from 'fs';
import path from 'path';

interface Config {
  accessToken?: string;
  instanceId?: string;
  whitelistedGroups?: string;
  autoProcess?: boolean;
  paused?: boolean;
  mobileNumber?: string;
}

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

// Initialize config object
export const waConfig: Config = {
  mobileNumber: '+919821822960' // Default mobile number
};

// Load config from file
export async function loadConfig(): Promise<void> {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    const loaded = JSON.parse(data);
    Object.assign(waConfig, loaded);
    // SECURITY: Hide sensitive data in logs
    const safeConfig = {
      ...waConfig,
      accessToken: waConfig.accessToken ? '***HIDDEN***' : undefined,
      mobileNumber: waConfig.mobileNumber ? '***HIDDEN***' : undefined
    };
    console.log('🔧 Configuration loaded from file:', safeConfig);
  } catch (error) {
    console.log('📝 No existing config file found, starting fresh');
  }
}

// Save config to file
export async function saveConfig(updates: Partial<Config>): Promise<void> {
  try {
    Object.assign(waConfig, updates);
    await fs.writeFile(CONFIG_PATH, JSON.stringify(waConfig, null, 2));
    // SECURITY: Hide sensitive data in logs
    const safeConfig = {
      ...waConfig,
      accessToken: waConfig.accessToken ? '***HIDDEN***' : undefined,
      mobileNumber: waConfig.mobileNumber ? '***HIDDEN***' : undefined
    };
    console.log('💾 Configuration saved to file:', safeConfig);
  } catch (error) {
    console.error('❌ Failed to save config:', error);
  }
}

// Initialize config on startup
loadConfig();
