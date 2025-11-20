import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, Upload, CheckCircle, AlertCircle } from "lucide-react";

const googleSheetsSchema = z.object({
  spreadsheetId: z.string().min(1, "Spreadsheet ID is required"),
  serviceAccountKey: z.string().min(1, "Service account key is required"),
});

type GoogleSheetsForm = z.infer<typeof googleSheetsSchema>;

export default function GoogleSheets() {
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const { toast } = useToast();

  const form = useForm<GoogleSheetsForm>({
    resolver: zodResolver(googleSheetsSchema),
    defaultValues: {
      spreadsheetId: "1dGVGgIEuaymXQGiJAQ3mye4HiGV69ivQnu927n_3ngI",
      serviceAccountKey: JSON.stringify({
        "type": "service_account",
        "project_id": "whatsapp-watch-log-new",
        "private_key_id": "be378569774ebbc85b6c0510e769e742c7b436a4",
        "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCn1v7FDSnZe5RP\nwenqPu7DqjnneDBw4JbrryHOsrosF+NLyKwMww340GUB2LZeMd6S0qaxt3bJ44rV\nJX2k0oazkhZFdVs8VhI4JrY2gnSJ/NWCqA/XV6V+28kA6DvJxBQLVNJq8OpbJDV6\nxl8h/GrYBM1IwKwHmozZEqO0BhdjjA6XXwxg8XKTD2D4VXNP8oMpI2I9eyfKohvz\nydG/gJQ2r9h++fx6TlRUlvIB+ki63laAvQSeI3S6x88lH6n6diqs792Wbnb5Dptq\nGEMJKr51qeiwa2wZEqCIhLRAMr44PQPQsJMpzSbJ6ECKrQnWLqQEHPxtVAmzXL9i\na6fepyQ5AgMBAAECggEABolfovxCId2XnzsTwXsZuK5ZoreKOG0wx4VKtWZ9zG+S\nOz55n+YdVlBEbMvcP2MlElYIprF424BEhQxYnjmSRC5XdnVNfDY0b7InRMx0Hjcl\n+BiURFxeHkiQRZwlzvP3XWEccEyJbgsFF67f396ZKShXt+KEGKg23dHlZQKbONXY\nemV0b7zSFKG2CM5hxQ1nwcP5r7Zj+Tsyx6Uz2SMHeZoNy9UjtxBI+90Ko/UFkJ3c\nOlcp57Pry3kY4gaz3mzIPnzC8pnZsIIBNPSl4RG0JWndq642ZUhyQwmRH4HKL9oM\n+/KXWXzshSA68Fzg9yKGiCjDv17TcFwsg1/euSEDYQKBgQDilVu4q8lW1wtLzKVe\n/pj+aec24LgYjXLlBzsBspQKebOd/eTo8QsHLUbCWTiH+UbPDcRt9+gMRA/oz4Ub\noPQvzkUF713Hr9AN2iToEmqC8b8lQIbQ16AjsIS+WTn037agdkuqs6b55dSjUgTZ\nhJqc1ayTh+Brpqe/NROmLIuB2QKBgQC9oUGquPrXeTAPQFUp2dnriT0NRDTEYPyD\nLed9btcjW5E1HK1c1Y13sL66P0OP+Nn65dyRZaUCpWSnWNE3hAgjPPKWbAwN627Z\nsWowM8lzbsC3n0u+WR78BjEqg5jYBn6OYaVOwh+BMxZAxi8rpA/0m4wDh+c0qsqn\nIc8AVErZYQKBgQDWjUlp57jh8wTuRJz/A6QJnGxlSYrpLN9zwVH9fIS0GqObYjQk\n40JnDFdpZqSiFMgY/ddXrhxbqQNLl11aWSGANxii0xMBKBihVUQHQJD85z7xXlWK\nYfNweBBqUgEQP9olvX5O6IifLyMXd23CLs9c3PPqSwqVxRwocXDmtF1xmQKBgBVX\noNxmFVVK/m24/9zF+BDaUVS86HNxtvnMoNEtOGlyVNV1dM2N+24NJmov1JrPlzj1\nxe1XU0sI8lsjU+i7o27T3Tmwz2qBpOg7X4gtS+8B+A6yjwPNY/9Zcw8l4H3vvS6p\nLsG+d21DIq4HoCd5P5J4Lzn2gb8budM1quaOlh4BAoGABQKoyLDsMExtAXlM5Yu+\njBzaUtDZp00pboIiF7lWOM9Me6hQ0MdIEVO55N710R1Ki75roqNaz0Fsm6y4OSUh\njiH67km2C39LlIoVBlIQrgr2Zw/5akkU2aDLtC7IpN/CYq63wmGzzI4dCy1Um82G\nRmQocX/uBgeXGaayCxWuSfw=\n-----END PRIVATE KEY-----\n",
        "client_email": "whatsapp-logger-new@whatsapp-watch-log-new.iam.gserviceaccount.com",
        "client_id": "115659386905085222193",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/whatsapp-logger-new%40whatsapp-watch-log-new.iam.gserviceaccount.com",
        "universe_domain": "googleapis.com"
      }, null, 2),
    },
  });

  const onSubmit = async (data: GoogleSheetsForm) => {
    setIsLoading(true);
    setSyncStatus('idle');
    
    try {
      const response = await apiRequest('POST', '/api/process-sheets', data);
      const result = await response.json();
      
      setSyncStatus('success');
      toast({
        title: "Processing complete",
        description: `Processed ${result.processed} messages and found ${result.listings} watch listings`,
      });
    } catch (error) {
      setSyncStatus('error');
      toast({
        title: "Processing failed",
        description: "Failed to process Google Sheets data. Please check your settings.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const testParser = async () => {
    if (!testMessage.trim()) return;
    
    try {
      const response = await apiRequest('POST', '/api/test-parser', { message: testMessage });
      const result = await response.json();
      setTestResult(result);
      
      toast({
        title: "Test complete",
        description: `Found ${result.listings.length} watch listings in the message`,
      });
    } catch (error) {
      toast({
        title: "Test failed",
        description: "Failed to parse the test message",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <Topbar 
          title="Google Sheets Integration" 
          subtitle="Connect your watch database to Google Sheets"
        />
        
        <div className="p-6 max-w-4xl mx-auto space-y-6">
          {/* Instructions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Sheet className="mr-2" size={20} />
                Watch Message Processing System
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">What This Does</h3>
                <p className="text-blue-800 text-sm">
                  This system reads raw WhatsApp messages from your "LogRaw" sheet, extracts watch listings using smart parsing,
                  enriches them with data from your "Database" sheet, and saves the results to your "Watch Id" sheet.
                </p>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-2">Your Google Sheet Setup</h3>
                <p className="text-green-800 text-sm">
                  Your sheet is already configured with the right structure:
                  <br />• <strong>LogRaw</strong>: Contains raw WhatsApp messages
                  <br />• <strong>Database</strong>: Your watch reference database for enrichment
                  <br />• <strong>Watch Id</strong>: Where processed listings will be saved
                </p>
              </div>
              
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="font-semibold text-yellow-900 mb-2">How It Works</h3>
                <p className="text-yellow-800 text-sm">
                  The system automatically finds watch references (PIDs) in messages, extracts details like price, condition, and year,
                  then matches them with your database to add brand, family, and model names.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Test Parser Card */}
          <Card>
            <CardHeader>
              <CardTitle>Test Message Parser</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Test WhatsApp Message</label>
                <Textarea
                  placeholder='Paste a WhatsApp message like: "4600E/000R-B576 23Y fullset 130000hkd ♨F.P.J CHRONOMÈTRE Ã RÉSONANCE platinum 2023 NEW Full Set HKD 2.30m"'
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="min-h-20"
                />
              </div>
              
              <Button onClick={testParser} variant="outline" disabled={!testMessage.trim()}>
                Test Parser
              </Button>

              {testResult && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Parse Results:</h4>
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(testResult.listings, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sync Form */}
          <Card>
            <CardHeader>
              <CardTitle>Sync Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="spreadsheetId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Spreadsheet ID</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />



                  <FormField
                    control={form.control}
                    name="serviceAccountKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Account Key (JSON)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Paste your Google Service Account JSON key here..."
                            className="min-h-32 font-mono text-sm"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center space-x-4">
                    <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
                      {isLoading ? (
                        <>
                          <Upload className="mr-2 animate-spin" size={16} />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2" size={16} />
                          Process Raw Messages
                        </>
                      )}
                    </Button>

                    {syncStatus === 'success' && (
                      <div className="flex items-center text-green-600">
                        <CheckCircle className="mr-2" size={16} />
                        <span className="text-sm">Sync completed successfully</span>
                      </div>
                    )}

                    {syncStatus === 'error' && (
                      <div className="flex items-center text-red-600">
                        <AlertCircle className="mr-2" size={16} />
                        <span className="text-sm">Sync failed</span>
                      </div>
                    )}
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle>Processing Status</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                This processes all raw messages from your LogRaw sheet and extracts watch listings.
                Each run adds new processed listings to your Watch Id sheet.
              </p>
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>Your Sheet Structure:</strong>
                  <br />• LogRaw: Timestamp, Group ID, Sender, Sender Number, Message
                  <br />• Database: Brand, Family, Reference, Name
                  <br />• Watch Id: Series, Chat, Date, Time, Sender, Sender Number, PID, Year, Variant, Condition, Price, Currency, Raw Line, raw_gemini_response, Brand, Family, Name
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}