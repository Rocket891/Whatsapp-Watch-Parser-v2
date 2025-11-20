import { saveConfig } from './waConfig';

export async function checkAndRecoverInstance(accessToken: string, instanceId: string) {
  try {
    // Test if the instance exists
    const response = await fetch(`https://mblaster.in/api/get_status?access_token=${accessToken}&instance_id=${instanceId}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const data = await response.text();
    
    // If we get HTML, the instance doesn't exist
    if (data.includes('<!DOCTYPE html>')) {
      console.log(`❌ Instance ${instanceId} has been deleted/expired`);
      
      // Try to create a new instance
      console.log(`🔄 Attempting to create new instance with token: ${accessToken}`);
      
      const createResponse = await fetch(`https://mblaster.in/api/create_instance?access_token=${accessToken}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const createData = await createResponse.text();
      
      try {
        const jsonData = JSON.parse(createData);
        if (jsonData.instance_id) {
          console.log(`✅ New instance created: ${jsonData.instance_id}`);
          
          // Auto-configure webhook
          const publicUrl = process.env.PUBLIC_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
          const webhookUrl = `${publicUrl}/api/whatsapp/webhook`;
          
          try {
            await fetch(`https://mblaster.in/api/set_webhook?webhook_url=${encodeURIComponent(webhookUrl)}&enable=true&instance_id=${jsonData.instance_id}&access_token=${accessToken}`, {
              method: 'GET'
            });
            console.log(`🔗 Webhook configured for new instance: ${jsonData.instance_id}`);
          } catch (webhookError) {
            console.error('Webhook configuration failed:', webhookError);
          }
          
          // Save new instance to config
          await saveConfig({
            instanceId: jsonData.instance_id,
            accessToken
          });
          
          return {
            success: true,
            newInstanceId: jsonData.instance_id,
            message: `Old instance expired. Created new instance: ${jsonData.instance_id}`
          };
        }
      } catch (parseError) {
        console.error('Failed to parse create instance response:', parseError);
      }
      
      return {
        success: false,
        error: 'Failed to create new instance'
      };
    }
    
    // Instance exists, check if it's connected
    try {
      const jsonData = JSON.parse(data);
      return {
        success: true,
        instanceExists: true,
        status: jsonData.state || jsonData.status || 'unknown'
      };
    } catch (parseError) {
      return {
        success: false,
        error: 'Failed to parse instance status'
      };
    }
    
  } catch (error) {
    console.error('Instance recovery error:', error);
    return {
      success: false,
      error: 'Failed to check instance status'
    };
  }
}