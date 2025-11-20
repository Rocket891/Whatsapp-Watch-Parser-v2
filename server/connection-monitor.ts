import { loadConfig } from './waConfig';

interface ConnectionStatus {
  connected: boolean;
  lastPing: Date;
  instanceId: string;
  accessToken: string;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

class ConnectionMonitor {
  private status: ConnectionStatus = {
    connected: false,
    lastPing: new Date(),
    instanceId: '',
    accessToken: '',
    reconnectAttempts: 0,
    maxReconnectAttempts: 3
  };

  private pingInterval: NodeJS.Timer | null = null;
  private lastReceivedMessage: Date = new Date();

  constructor() {
    this.initializeMonitoring();
  }

  private async initializeMonitoring() {
    // Load configuration
    await loadConfig();
    const config = await import('./waConfig');
    
    this.status.instanceId = config.waConfig.instanceId || '';
    this.status.accessToken = config.waConfig.accessToken || '';

    // Start ping monitoring every 15 seconds for immediate status updates
    this.pingInterval = setInterval(() => {
      this.checkConnection();
    }, 15000); // 15 seconds

    // Initial connection check
    this.checkConnection();
  }

  private async checkConnection() {
    if (!this.status.instanceId || !this.status.accessToken) {
      this.status.connected = false;
      return;
    }

    // Primary indicator: Check if we've received messages recently
    // This is more reliable than API calls which fail when instances expire
    const timeSinceLastMessage = Date.now() - this.lastReceivedMessage.getTime();
    
    if (timeSinceLastMessage < 2 * 60 * 1000) { // Within last 2 minutes
      // If we're receiving webhook messages, we're definitely connected
      this.status.connected = true;
      this.status.lastPing = new Date();
      this.status.reconnectAttempts = 0;
      return;
    }

    try {
      // Secondary check: Try to get groups list (proves connection works)
      const groupsResponse = await fetch(`https://mblaster.in/api/get_groups?instance_id=${this.status.instanceId}&access_token=${this.status.accessToken}`, {
        method: 'GET',
        timeout: 8000
      });
      
      if (groupsResponse.ok) {
        const groupsText = await groupsResponse.text();
        
        if (!groupsText.includes('<!DOCTYPE html>')) {
          try {
            const groupsData = JSON.parse(groupsText);
            
            // If we can get groups, we're definitely connected
            if (groupsData.groups && Array.isArray(groupsData.groups)) {
              console.log(`✅ Connection verified via groups API: ${this.status.instanceId} (${groupsData.groups.length} groups)`);
              this.status.connected = true;
              this.status.lastPing = new Date();
              this.status.reconnectAttempts = 0;
              return;
            }
          } catch (parseError) {
            // Fall through to status check
          }
        }
      }

      // Tertiary check: Instance status (least reliable due to invalidation)
      const statusResponse = await fetch(`https://mblaster.in/api/get_instance_status?instance_id=${this.status.instanceId}&access_token=${this.status.accessToken}`, {
        method: 'GET',
        timeout: 5000
      });
      
      if (statusResponse.ok) {
        const statusText = await statusResponse.text();
        
        if (!statusText.includes('<!DOCTYPE html>')) {
          try {
            const statusData = JSON.parse(statusText);
            
            const isConnected = statusData.status === 'connected' || 
                               statusData.status === 'open' || 
                               statusData.connected === true || 
                               statusData.state === 'open' ||
                               statusData.status === 'success';
            
            this.status.connected = isConnected;
            this.status.lastPing = new Date();
            
            if (isConnected) {
              console.log(`✅ Connection status via API: ${this.status.instanceId} -> ${statusData.status}`);
              this.status.reconnectAttempts = 0;
            }
            
            return;
          } catch (parseError) {
            // JSON parse failed
          }
        }
      }
      
      // All API checks failed, but if we had recent messages, consider it a temporary API issue
      if (timeSinceLastMessage < 10 * 60 * 1000) { // Within last 10 minutes
        this.status.connected = true; // Keep connected status
        return;
      }
      
      // No recent messages and all API checks failed
      this.status.connected = false;
      this.status.reconnectAttempts++;
      
    } catch (error) {
      // API error, but if we had very recent messages, maintain connected status
      if (timeSinceLastMessage < 5 * 60 * 1000) {
        this.status.connected = true;
      } else {
        this.status.connected = false;
      }
    }
  }

  private async handleDisconnection() {
    this.status.connected = false;
    console.log('🔴 WhatsApp connection lost - attempting reconnection...');

    if (this.status.reconnectAttempts < this.status.maxReconnectAttempts) {
      this.status.reconnectAttempts++;
      await this.attemptReconnection();
    } else {
      console.log('❌ Max reconnection attempts reached. Manual intervention required.');
    }
  }

  private async attemptReconnection() {
    try {
      // Try to create a new instance or reconnect
      const response = await fetch(`https://mblaster.in/api/create_instance?access_token=${this.status.accessToken}&instance_name=auto_reconnect_${Date.now()}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.data?.instance_id) {
          console.log('🔄 New instance created for reconnection:', data.data.instance_id);
          
          // Update the instance ID
          this.status.instanceId = data.data.instance_id;
          
          // Update the configuration
          const { saveConfig } = await import('./waConfig');
          await saveConfig({ instanceId: data.data.instance_id });
          
          console.log('✅ Instance ID updated in configuration');
          
          // Wait a bit then check connection again
          setTimeout(() => {
            this.checkConnection();
          }, 10000); // Wait 10 seconds before checking
        } else {
          console.log('❌ Failed to create new instance:', data);
        }
      } else {
        console.log('❌ Failed to reconnect instance');
      }
    } catch (error) {
      console.log('❌ Reconnection failed:', error);
    }
  }

  public updateLastMessageTime() {
    this.lastReceivedMessage = new Date();
    
    // If we're receiving webhook messages, we're definitely connected
    // This is more reliable than API status checks which can fail due to instance invalidation
    const timeSinceLastMessage = Date.now() - this.lastReceivedMessage.getTime();
    if (timeSinceLastMessage < 30000) { // Within last 30 seconds
      this.status.connected = true;
      this.status.lastPing = new Date();
      this.status.reconnectAttempts = 0;
    }
  }

  public getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  public isConnected(): boolean {
    return this.status.connected;
  }

  public destroy() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

// Global instance
let connectionMonitor: ConnectionMonitor | null = null;

export function getConnectionMonitor(): ConnectionMonitor {
  if (!connectionMonitor) {
    connectionMonitor = new ConnectionMonitor();
  }
  return connectionMonitor;
}

export function updateLastMessageTime() {
  getConnectionMonitor().updateLastMessageTime();
}