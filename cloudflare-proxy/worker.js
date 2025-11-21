/* ================================================================
   CLOUDFLARE WORKER - mBlaster API Proxy
   ================================================================
   This proxy solves IP blocking by routing all mBlaster traffic 
   through Cloudflare's network instead of Replit's blocked IP.
   ================================================================ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      /* ========== WEBHOOK RELAY: mBlaster → Your Replit App ========== */
      if (url.pathname === '/webhook') {
        // Get webhook payload from mBlaster
        const payload = await request.json();
        
        console.log('📨 Webhook received from mBlaster, forwarding to Replit...');
        
        // Forward to your Replit app
        const replitResponse = await fetch(`${env.REPLIT_APP_URL}/api/whatsapp/webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const result = await replitResponse.json();
        
        return new Response(JSON.stringify(result), {
          status: replitResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      /* ========== API PROXY: Your Replit App → mBlaster ========== */
      if (url.pathname.startsWith('/api/')) {
        // Extract the mBlaster API endpoint
        const mblasterEndpoint = url.pathname.replace('/api/', '');
        
        // Build mBlaster URL with all query parameters
        const mblasterUrl = new URL(`https://mblaster.in/api/${mblasterEndpoint}`);
        
        // Copy all query parameters
        url.searchParams.forEach((value, key) => {
          mblasterUrl.searchParams.set(key, value);
        });

        console.log(`🔄 Proxying API call to mBlaster: ${mblasterEndpoint}`);

        // Forward the request to mBlaster
        const mblasterResponse = await fetch(mblasterUrl.toString(), {
          method: request.method,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Content-Type': request.headers.get('Content-Type') || 'application/json',
          },
          body: request.method !== 'GET' ? await request.text() : undefined,
        });

        // Get response from mBlaster
        const responseText = await mblasterResponse.text();
        
        // Check if mBlaster returned HTML (IP block indicator)
        if (responseText.includes('<!DOCTYPE html') || responseText.includes('<html')) {
          console.error('❌ mBlaster returned HTML - possible IP block on Cloudflare too');
          return new Response(JSON.stringify({ 
            error: 'MBLASTER_BLOCKED',
            message: 'mBlaster returned HTML instead of JSON' 
          }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Parse and return JSON response
        try {
          const jsonResponse = JSON.parse(responseText);
          return new Response(JSON.stringify(jsonResponse), {
            status: mblasterResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (parseError) {
          console.error('Failed to parse mBlaster response:', responseText);
          return new Response(JSON.stringify({ 
            error: 'INVALID_RESPONSE',
            message: 'mBlaster response is not valid JSON' 
          }), {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      /* ========== HEALTH CHECK ========== */
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ 
          status: 'healthy',
          timestamp: new Date().toISOString(),
          message: 'Cloudflare Worker proxy is running'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Unknown endpoint
      return new Response(JSON.stringify({ 
        error: 'NOT_FOUND',
        message: 'Endpoint not found. Use /webhook, /api/*, or /health'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('Proxy error:', error);
      return new Response(JSON.stringify({ 
        error: 'PROXY_ERROR',
        message: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
