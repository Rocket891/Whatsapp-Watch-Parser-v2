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
  messageType?: 'selling' | 'looking_for';
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

  // Real chat format sample messages for testing
  const sampleMessages: Record<string, { label: string; description: string; message: string }> = {
    pp_list: {
      label: "PP List (line-per-watch)",
      description: "Patek Philippe fullset list - tests header emoji + line-by-line format",
      message: `🔥🔥PP used fullset🔥🔥
5146J white 2007Y 188k
5146J white 2011Y 197k
5167A 2017 270k
5712R salmon 2020 650k
5968A blue N3/25 New full set HKD935k
5224R N3/25 $345,000.00HKD
5396G blue 2022 382k
5205R white 2019 255k
5960/01G 2013 used 420k
7234R rose 2024 210k`
    },
    rolex_emoji: {
      label: "Rolex Emoji List",
      description: "Emoji-prefixed Rolex listings - tests symbol splitting",
      message: `💝126528LN-Lemans Both Tag N2/25Year $1,820,000HKD
💝126710BLNR Batman jubilee 2024 fullset 118k
💝126610LV Green sub 2023 used 105k
💝116500LN Panda 2022 fullset 198k
💝126334 blue jubilee 41mm N1/25 new 79k
💝228235 sundust roman 2024 new 258k
💝126710BLRO Pepsi oyster NOS 135k`
    },
    multiline: {
      label: "Multi-line Format",
      description: "3-line-per-watch AP format - tests multi-line combining",
      message: `AP Used Full Set
15400OR white gold
2017 fullset
HKD 480000
15500ST blue
2022 both tags
HKD 398000
26331OR panda
2020 full set
HKD 520000
26606TI skeleton
2024 brand new
HKD 1280000`
    },
    multi_brand: {
      label: "Multi-Brand Mixed",
      description: "Mixed brands with various formats - stress test",
      message: `👑5968G Blue N3/25 New full set HKD935k
RM055 white ceramic 2023 mint $880,000USD
116500LN white panda 22y fullset 198k
15202ST blue 2019 watch only 650000hkd
5711/1A Tiffany 2022 NOS 3.8m
326934 pepsi jubilee 100%New N2/25 HKD145000`
    }
  };

  const loadSampleMessage = (key?: string) => {
    const msgKey = key || 'pp_list';
    const sample = sampleMessages[msgKey];
    if (sample) {
      setTestMessage(sample.message);
    }
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
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase">Load Real Chat Samples</div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(sampleMessages).map(([key, sample]) => (
                      <Button
                        key={key}
                        variant="outline"
                        size="sm"
                        className="text-xs h-auto py-2 justify-start"
                        onClick={() => loadSampleMessage(key)}
                        title={sample.description}
                      >
                        {sample.label}
                      </Button>
                    ))}
                  </div>
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
                    
                    <div className="flex gap-2 flex-wrap">
                      {parseResult.success ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          Parsing Successful
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          Parsing Failed
                        </Badge>
                      )}
                      {parseResult.listings.length > 0 && parseResult.listings[0].messageType && (
                        <Badge variant="outline" className={
                          parseResult.listings[0].messageType === 'selling'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-orange-50 text-orange-700 border-orange-200'
                        }>
                          {parseResult.listings[0].messageType === 'selling' ? 'Selling' : 'Looking For'}
                        </Badge>
                      )}
                    </div>
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
                        <TableCell className="font-mono text-xs max-w-xs">
                          <div className="cursor-pointer group" title={listing.rawLine}>
                            <span className="block truncate group-hover:whitespace-normal group-hover:break-all">
                              {listing.rawLine}
                            </span>
                          </div>
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