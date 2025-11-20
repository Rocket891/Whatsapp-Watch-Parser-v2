import { useState } from "react";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TestTube, Play, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ParsedListing {
  pid: string;
  year?: string;
  variant?: string;
  condition?: string;
  price?: number;
  currency?: string;
  brand?: string;
  family?: string;
  name?: string;
  month?: string; // N1-N12 month notation
  rawLine: string;
}

interface ParseResult {
  success: boolean;
  listings: ParsedListing[];
  parsedCount: number;
  referenceMatches: number;
  message?: string;
}

export default function MessageTesting() {
  const [testMessage, setTestMessage] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleTestParsing = async () => {
    if (!testMessage.trim()) {
      toast({
        title: "Error",
        description: "Please enter a message to test",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/test/parse-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: testMessage }),
      });

      if (!response.ok) {
        throw new Error("Failed to parse message");
      }

      const result = await response.json();
      setParseResult(result);
      
      toast({
        title: "Parsing Complete",
        description: `Found ${result.parsedCount} PIDs with ${result.referenceMatches} reference matches`,
      });
    } catch (error) {
      console.error("Error parsing message:", error);
      toast({
        title: "Error",
        description: "Failed to parse message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSampleMessage = () => {
    const sample = `🇭🇰 *PATEK* 🇭🇰 🍁7118/1R Champ 05/2025 New $798 000HKD 🍁5712/1A 2016 (New Style Certificate) Used $805,000HKD 🍁6119R 09/2024 New $200 000HKD 🍁6007G Blue 04/2025 New $228 000HKD 🍁5226G 05/2025 New $288 000HKD 🍁5738R 04/2025 New $255 000HKD 🍁5396G Blue 07/2025 New $382 000HKD 🍁5231G 2024 Used $758 000HKD 🍁4910/1201R 07/2025 New $288 000HKD 🍁7128/1R 05/2025 New $1 128 000HKD`;
    setTestMessage(sample);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar 
          title="Message Testing" 
          subtitle="Test watch message parsing and PID extraction"
        />
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Input Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TestTube className="mr-2" size={20} />
                  Test Message Input
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Paste your WhatsApp message here..."
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
                
                <div className="flex gap-2">
                  <Button 
                    onClick={handleTestParsing}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    <Play className="mr-2" size={16} />
                    {isLoading ? "Parsing..." : "Test Parsing"}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={loadSampleMessage}
                  >
                    Load Multi-PID Sample
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Stats Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="mr-2" size={20} />
                  Parsing Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                {parseResult ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {parseResult.parsedCount}
                        </div>
                        <div className="text-sm text-blue-800">PIDs Found</div>
                      </div>
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {parseResult.referenceMatches}
                        </div>
                        <div className="text-sm text-green-800">Reference Matches</div>
                      </div>
                    </div>
                    
                    {parseResult.success ? (
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        Parsing Successful
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        Parsing Failed
                      </Badge>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    No parsing results yet. Enter a message and click "Test Parsing" to see results.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Results Table */}
          {parseResult && parseResult.listings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Parsed Watch Listings</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PID</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Family</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>Raw Line</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parseResult.listings.map((listing, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono font-medium">
                          {listing.pid}
                        </TableCell>
                        <TableCell>
                          {listing.brand ? (
                            <Badge variant="outline">{listing.brand}</Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>{listing.family || "-"}</TableCell>
                        <TableCell>{listing.year || "-"}</TableCell>
                        <TableCell>{listing.month || "-"}</TableCell>
                        <TableCell>{listing.condition || "-"}</TableCell>
                        <TableCell>
                          {listing.price ? (
                            `${listing.currency || 'HKD'} ${listing.price.toLocaleString()}`
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{listing.variant || "-"}</TableCell>
                        <TableCell className="font-mono text-xs max-w-xs truncate">
                          {listing.rawLine}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}