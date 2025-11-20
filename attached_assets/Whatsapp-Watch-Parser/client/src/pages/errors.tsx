import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, XCircle, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

export default function Errors() {
  const { data: errors, isLoading } = useQuery({
    queryKey: ['/api/processing-logs'],
    queryFn: () => api.getProcessingLogs(100),
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'success':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'error':
        return <XCircle className="text-red-600" size={16} />;
      case 'partial':
        return <AlertCircle className="text-yellow-600" size={16} />;
      case 'success':
        return <AlertTriangle className="text-green-600" size={16} />;
      default:
        return <AlertTriangle className="text-gray-600" size={16} />;
    }
  };

  const errorLogs = errors?.filter(log => log.status === 'error' || log.status === 'partial') || [];
  const successLogs = errors?.filter(log => log.status === 'success') || [];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <Topbar 
          title="Error Logs" 
          subtitle="Processing errors and system logs"
        />

        <div className="p-6 space-y-6">
          {/* Error Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <XCircle className="text-red-600 mr-3" size={24} />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Errors</p>
                    <p className="text-2xl font-bold text-red-600">
                      {errors?.filter(e => e.status === 'error').length || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <AlertCircle className="text-yellow-600 mr-3" size={24} />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Partial Errors</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {errors?.filter(e => e.status === 'partial').length || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <AlertTriangle className="text-green-600 mr-3" size={24} />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Successful</p>
                    <p className="text-2xl font-bold text-green-600">
                      {successLogs.length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Error Logs Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="mr-2" size={20} />
                Processing Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="animate-pulse">
                  <div className="h-96 bg-gray-100 rounded"></div>
                </div>
              ) : errors?.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Message ID</TableHead>
                        <TableHead>Error Message</TableHead>
                        <TableHead>Raw Message</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {errors.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              {getStatusIcon(log.status)}
                              <Badge className={`text-xs font-medium rounded-full ${getStatusColor(log.status)}`}>
                                {log.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {log.messageId || '-'}
                          </TableCell>
                          <TableCell className="max-w-md">
                            <div className="text-sm text-gray-900">
                              {log.errorMessage || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="text-sm text-gray-600 truncate">
                              {log.rawMessage || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <AlertTriangle className="mx-auto mb-2" size={24} />
                  <p>No processing logs found.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
