// server/waConfig.ts
import { promises as fs } from 'fs';
import path from 'path';

export type WaMode = 'webhook_only' | 'full_api';

interface Config {
  accessToken?: string;
  instanceId?: string;
  whitelistedGroups?: string;
  autoProcess?: boolean;
  paused?: boolean;
  mode?: WaMode; // NEW: default to webhook_only
}

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

// Initialize config object
export const waConfig: Config = {};

// Load config from file
export async function loadConfig(): Promise<void> {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    const loaded = JSON.parse(data);
    Object.assign(waConfig, loaded);
    console.log('🔧 Configuration loaded from file:', waConfig);
  } catch (error) {
    console.log('📝 No existing config file found, starting fresh');
  }
}

// Save config to file
export async function saveConfig(updates: Partial<Config>): Promise<void> {
  try {
    Object.assign(waConfig, updates);
    await fs.writeFile(CONFIG_PATH, JSON.stringify(waConfig, null, 2));
    console.log('💾 Configuration saved to file:', waConfig);
  } catch (error) {
    console.error('❌ Failed to save config:', error);
  }
}

// Initialize config on startup
loadConfig();
