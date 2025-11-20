import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Search, MessageCircle, Clock, TrendingUp, Eye, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";

interface RequirementMatch {
  requirement: {
    id: number;
    pid: string;
    variant?: string;
    condition?: string;
    sender?: string;
    senderNumber?: string;
    groupName?: string;
    createdAt: string;
  };
  matches: Array<{
    id: number;
    pid: string;
    variant?: string;
    condition?: string;
    price?: number;
    currency?: string;
    sender?: string;
    senderNumber?: string;
    groupName?: string;
    matchScore: number;
    matchReasons: string[];
    daysSince: number;
    createdAt: string;
  }>;
  totalMatches: number;
}

export default function Matches() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { data: matches, isLoading, error, refetch, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ["/api/requirement-matches"],
    staleTime: 1 * 60 * 1000, // Cache for 1 minute for fresh data
    gcTime: 3 * 60 * 1000, // Keep in memory for 3 minutes
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: true, // Auto-refresh when window gains focus
    refetchInterval: 2 * 60 * 1000, // Auto-refresh every 2 minutes
  });

  // Fix: Handle the response properly - matches could be an array directly
  const matchesData = Array.isArray(matches) ? (matches as RequirementMatch[]) : [];
  
  // Debug logging
  console.log('Raw matches response:', matches);
  console.log('Is array:', Array.isArray(matches));
  console.log('Matches array length:', matchesData.length);
  
  // If still empty, try to log the actual response structure
  if (matchesData.length === 0 && matches) {
    console.log('Response keys:', Object.keys(matches));
    console.log('Full response:', JSON.stringify(matches, null, 2));
  }

  // Filter matches based on search term
  const filteredMatches = matchesData.filter(match =>
    match.requirement.pid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    match.requirement.sender?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    match.matches.some(listing => 
      listing.sender?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      listing.groupName?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // Pagination logic
  const totalPages = Math.ceil(filteredMatches.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentMatches = filteredMatches.slice(startIndex, endIndex);

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const getScoreColor = (score: number) => {
    if (score >= 140) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (score >= 120) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  };

  const getConditionBadge = (condition?: string) => {
    if (!condition) return null;
    const color = condition.toLowerCase().includes('new') ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800';
    return <Badge className={color}>{condition}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Requirement Matches</h1>
        </div>
        <div className="text-center py-8">Finding trading opportunities...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Requirement Matches</h1>
        </div>
        <Card>
          <CardContent className="text-center py-8">
            <div className="text-red-500 mb-2">Failed to load matches</div>
            <p className="text-gray-600">Please try refreshing the page</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Requirement Matches</h1>
        <div className="ml-auto flex items-center gap-3">
          <Button
            variant="default"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <RefreshCw className={`h-4 w-4 ${(isLoading || isFetching) ? 'animate-spin' : ''}`} />
            {isLoading || isFetching ? "Updating..." : "Refresh"}
          </Button>
          <Badge variant="secondary" className="text-sm px-3 py-1">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredMatches.length)} of {filteredMatches.length}
          </Badge>
        </div>
      </div>

      <div className="mb-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search by PID, buyer, or seller..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        {dataUpdatedAt && (
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last updated: {new Date(dataUpdatedAt).toLocaleString()}
            {isFetching && <span className="text-blue-500 ml-2">• Refreshing...</span>}
          </div>
        )}
      </div>

      {filteredMatches.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <TrendingUp className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">No matches found</h3>
            <p className="text-gray-600 mb-4">
              {searchTerm ? "Try adjusting your search terms" : "No active requirements have matching inventory yet"}
            </p>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading || isFetching}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${(isLoading || isFetching) ? 'animate-spin' : ''}`} />
              Check for New Matches
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {currentMatches.map((matchGroup) => (
            <Card key={matchGroup.requirement.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg mb-2">
                      Looking for: {matchGroup.requirement.pid}
                      {matchGroup.requirement.variant && ` ${matchGroup.requirement.variant}`}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>Buyer: {matchGroup.requirement.sender}</span>
                      <span>Group: {matchGroup.requirement.groupName}</span>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{new Date(matchGroup.requirement.createdAt).toLocaleDateString()}</span>
                      </div>
                      {matchGroup.requirement.condition && getConditionBadge(matchGroup.requirement.condition)}
                    </div>
                  </div>
                  <Badge className="bg-blue-100 text-blue-800">
                    {matchGroup.totalMatches} match{matchGroup.totalMatches !== 1 ? 'es' : ''}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-4">
                  {matchGroup.matches.map((match, index) => (
                    <div key={match.id}>
                      <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium">
                              {match.pid}
                              {match.variant && ` ${match.variant}`}
                            </h4>
                            {match.price && (
                              <Badge variant="outline">
                                {match.price.toLocaleString()} {match.currency}
                              </Badge>
                            )}
                            {getConditionBadge(match.condition)}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                            <span>Seller: {match.sender}</span>
                            <span>Group: {match.groupName}</span>
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              <span>{match.daysSince} days ago</span>
                            </div>
                          </div>
                          
                          {match.matchReasons.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {match.matchReasons.map((reason, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Badge className={getScoreColor(match.matchScore)}>
                            Score: {match.matchScore}
                          </Badge>
                          
                          <div className="flex gap-1">
                            <Link href={`/all-records?search=${encodeURIComponent(match.pid)}`}>
                              <Button variant="outline" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            
                            {match.senderNumber && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  // TODO: Implement WhatsApp messaging
                                  console.log('Send message to:', match.senderNumber);
                                }}
                              >
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {index < matchGroup.matches.length - 1 && (
                        <Separator className="my-2" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-8">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="w-10 h-10"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  
                  {totalPages > 5 && currentPage < totalPages - 2 && (
                    <>
                      <span className="px-2 text-gray-500">...</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(totalPages)}
                        className="w-10 h-10"
                      >
                        {totalPages}
                      </Button>
                    </>
                  )}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="text-sm text-gray-500">
                Page {currentPage} of {totalPages}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}