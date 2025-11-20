import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableIcon, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

export default function RecentDataTable() {
  const [, navigate] = useLocation();
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  
  const { data: listings, isLoading } = useQuery({
    queryKey: ['/api/watch-listings/recent'],
    queryFn: () => api.getRecentWatchListings(20),
    refetchInterval: 60000, // Refetch every minute
  });

  const getConditionColor = (condition: string) => {
    switch (condition?.toLowerCase()) {
      case 'brand new':
      case 'new':
        return 'bg-green-100 text-green-800';
      case 'used':
        return 'bg-yellow-100 text-yellow-800';
      case 'full set':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getVariantColor = (variant: string) => {
    switch (variant?.toLowerCase()) {
      case 'pink':
        return 'bg-pink-100 text-pink-800';
      case 'blue':
        return 'bg-blue-100 text-blue-800';
      case 'black':
        return 'bg-gray-100 text-gray-800';
      case 'white':
        return 'bg-gray-50 text-gray-800';
      case 'gold':
        return 'bg-yellow-100 text-yellow-800';
      case 'platinum':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredListings = listings?.filter(listing => {
    if (currencyFilter === 'all') return true;
    return listing.currency === currencyFilter;
  });

  if (isLoading) {
    return (
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader className="pb-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <TableIcon className="text-gray-600 mr-2" size={20} />
              <h3 className="text-lg font-semibold text-gray-900">Recently Parsed Data</h3>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-64 bg-gray-100 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white shadow-sm border border-gray-200">
      <CardHeader className="pb-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <TableIcon className="text-gray-600 mr-2" size={20} />
            <h3 className="text-lg font-semibold text-gray-900">Recently Parsed Data</h3>
          </div>
          <div className="flex items-center space-x-3">
            <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Currencies</SelectItem>
                <SelectItem value="HKD">HKD</SelectItem>
                <SelectItem value="USDT">USDT</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              onClick={() => navigate('/records')}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              View All <ExternalLink className="ml-1" size={14} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs font-medium text-gray-500 uppercase tracking-wider">PID</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase tracking-wider">Year</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase tracking-wider">Variant</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase tracking-wider">Condition</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase tracking-wider">Price</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase tracking-wider">Sender</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase tracking-wider">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-white divide-y divide-gray-200">
            {filteredListings && filteredListings.length > 0 ? (
              filteredListings.map((listing) => (
                <TableRow key={listing.id} className="hover:bg-gray-50 transition-colors">
                  <TableCell className="whitespace-nowrap">
                    <span className="font-mono text-sm font-medium text-blue-600">
                      {listing.pid || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-gray-900">
                    {listing.year || '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge className={`text-xs font-medium rounded-full ${getVariantColor(listing.variant || '')}`}>
                      {listing.variant || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge className={`text-xs font-medium rounded-full ${getConditionColor(listing.condition || '')}`}>
                      {listing.condition || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm font-semibold text-gray-900">
                    {listing.price && listing.currency 
                      ? `${listing.price.toLocaleString()} ${listing.currency}`
                      : '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-gray-600">
                    {listing.sender}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-gray-500">
                    {formatDistanceToNow(new Date(listing.createdAt), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  No recent data available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
