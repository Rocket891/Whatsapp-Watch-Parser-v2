/* ------------------------------------------------------------------
   TEST ENDPOINT - Test mBlaster connectivity from Replit
   ------------------------------------------------------------------ */
import type { Express } from "express";

export function registerTestMBlasterRoute(app: Express) {
  app.get("/api/test-mblaster", async (req, res) => {
    try {
      console.log("🧪 Testing mBlaster connectivity from Replit...");

      const testPayload = {
        number: "917021542840",
        type: "text",
        message: "Test from Replit SaaS app",
        instance_id: "691AAD3AACBF7",
        access_token: "6823295cdd694"
      };

      // Make POST request to mBlaster
      const response = await fetch("https://mblaster.in/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        body: JSON.stringify(testPayload)
      });

      const statusCode = response.status;
      const rawText = await response.text();

      console.log(`📊 mBlaster response status: ${statusCode}`);
      console.log(`📄 Response preview: ${rawText.substring(0, 200)}`);

      // Check if response is HTML
      if (rawText.trim().startsWith("<") && rawText.includes("<html")) {
        return res.json({
          ok: false,
          reason: "HTML_RESPONSE",
          statusCode,
          bodySample: rawText.substring(0, 200)
        });
      }

      // Try to parse as JSON
      try {
        const parsedJson = JSON.parse(rawText);
        return res.json({
          ok: true,
          statusCode,
          parsedJson,
          rawSample: rawText.length > 200 ? rawText.substring(0, 200) : undefined
        });
      } catch (parseError) {
        // Not HTML, not JSON
        return res.json({
          ok: true,
          statusCode,
          parsedJson: null,
          rawSample: rawText.substring(0, 200)
        });
      }

    } catch (error: any) {
      console.error("❌ Test endpoint error:", error);
      return res.status(500).json({
        ok: false,
        reason: "FETCH_ERROR",
        error: error.message
      });
    }
  });
}
