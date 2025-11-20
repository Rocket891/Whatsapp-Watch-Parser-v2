import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, Search, Database, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ReferenceRecord {
  id: number;
  pid: string;
  brand: string;
  family: string;
  reference: string;
  name: string;
  createdAt: string;
}

import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";

export default function ReferenceDatabase() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50); // Show 50 items per page
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: database, isLoading } = useQuery({
    queryKey: ['/api/reference-database'],
    queryFn: async () => {
      const response = await fetch('/api/reference-database');
      if (!response.ok) {
        throw new Error('Failed to fetch reference database');
      }
      const data = await response.json();
      return data;
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/reference-database/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Upload Successful",
        description: `Processed ${data.processed} records successfully`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/reference-database'] });
      setSelectedFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed", 
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const filteredRecords = database?.records?.filter((record: ReferenceRecord) =>
    record.pid.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.family.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];
  
  // Pagination
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentRecords = filteredRecords.slice(startIndex, endIndex);
  
  // Reset page when search changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Topbar />
        <div className="p-6 space-y-6 overflow-auto h-full">
          <div className="flex items-center space-x-3">
            <Database className="text-blue-600" size={28} />
            <h1 className="text-3xl font-bold text-gray-900">Reference Database</h1>
          </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Upload className="mr-2 text-green-600" size={20} />
              Upload Excel Database
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="mb-4"
              />
              {selectedFile && (
                <div className="text-sm text-gray-600 mb-4">
                  Selected: {selectedFile.name}
                </div>
              )}
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploadMutation.isPending}
                className="w-full"
              >
                {uploadMutation.isPending ? (
                  <>
                    <RefreshCw className="mr-2 animate-spin" size={16} />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2" size={16} />
                    Upload Database
                  </>
                )}
              </Button>
            </div>
            <div className="text-xs text-gray-500">
              Expected format: Column A=Brand, B=Family, C=Reference, D=Name (no URL column)
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="mr-2 text-blue-600" size={20} />
              Database Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {database?.total || 0}
                </div>
                <div className="text-sm text-gray-600">Total Records</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {filteredRecords.length}
                </div>
                <div className="text-sm text-gray-600">Filtered Results</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <Search className="mr-2 text-purple-600" size={20} />
              Search Database
            </span>
            <Badge variant="outline" className="text-xs">
              {filteredRecords.length} / {database?.total || 0} records
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search by PID, brand, family, or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>

          {isLoading ? (
            <div className="animate-pulse">
              <div className="h-64 bg-gray-100 rounded"></div>
            </div>
          ) : currentRecords.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Brand</TableHead>
                    <TableHead className="w-40">Family</TableHead>
                    <TableHead className="w-48">Reference</TableHead>
                    <TableHead className="flex-1 min-w-96">Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentRecords.map((record: ReferenceRecord) => (
                    <TableRow key={record.id}>

                      <TableCell className="w-40">
                        <span className="font-medium text-gray-900 break-words">
                          {record.brand}
                        </span>
                      </TableCell>
                      <TableCell className="w-40">
                        <span className="text-gray-700 break-words">
                          {record.family}
                        </span>
                      </TableCell>
                      <TableCell className="w-48">
                        <span className="font-mono text-xs text-gray-600 break-all">
                          {record.reference}
                        </span>
                      </TableCell>
                      <TableCell className="flex-1 min-w-96">
                        <span className="text-gray-800 break-words">
                          {record.name}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Database className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? 'No matches found' : 'No database records'}
              </h3>
              <p className="text-gray-500">
                {searchTerm 
                  ? 'Try adjusting your search terms'
                  : 'Upload an Excel file to populate the reference database'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
}