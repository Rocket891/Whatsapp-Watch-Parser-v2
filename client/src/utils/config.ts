export interface WhatsAppConfig {
  accessToken?: string;
  instanceId?: string;
  receivingInstanceId?: string;
  receivingAccessToken?: string;
  receivingMobileNumber?: string;
  sendingInstanceId?: string;
  sendingAccessToken?: string;
  sendingMobileNumber?: string;
  webhookUrl?: string;
  whitelistedGroups?: string;
  autoProcess?: boolean;
}

export function loadConfig(): WhatsAppConfig {
  try {
    const stored = localStorage.getItem('whatsapp-config');
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function saveConfig(config: Partial<WhatsAppConfig>): void {
  try {
    const existing = loadConfig();
    const updated = { ...existing, ...config };
    localStorage.setItem('whatsapp-config', JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

export function loadQRCode(): string | null {
  try {
    return localStorage.getItem('whatsapp-qr-code');
  } catch {
    return null;
  }
}

export function saveQRCode(qrCode: string): void {
  try {
    localStorage.setItem('whatsapp-qr-code', qrCode);
  } catch (error) {
    console.error('Failed to save QR code:', error);
  }
}

export function clearQRCode(): void {
  try {
    localStorage.removeItem('whatsapp-qr-code');
  } catch (error) {
    console.error('Failed to clear QR code:', error);
  }
}

export function clearConfig(): void {
  try {
    localStorage.removeItem('whatsapp-config');
    localStorage.removeItem('whatsapp-qr-code');
  } catch (error) {
    console.error('Failed to clear config:', error);
  }
}