import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Bell, Trash2, Edit } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const pidAlertSchema = z.object({
  pid: z.string().min(1, "PID is required"),
  variant: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  currency: z.string().default("USD"),
  notificationPhone: z.string().min(1, "Notification phone is required"),
});

type PidAlertForm = z.infer<typeof pidAlertSchema>;

interface PidAlert {
  id: number;
  pid: string;
  variant?: string;
  minPrice?: string;
  maxPrice?: string;
  currency: string;
  notificationPhone: string;
  isActive: boolean;
  triggeredCount: number;
  lastTriggered?: string;
  createdAt: string;
}

export default function PidAlerts() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<PidAlert | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<PidAlertForm>({
    resolver: zodResolver(pidAlertSchema),
    defaultValues: {
      pid: "",
      variant: "",
      minPrice: "",
      maxPrice: "",
      currency: "USD",
      notificationPhone: "",
    },
  });

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['/api/pid-alerts'],
    queryFn: async () => {
      const response = await fetch('/api/pid-alerts');
      if (!response.ok) throw new Error('Failed to fetch alerts');
      return response.json() as Promise<PidAlert[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PidAlertForm) => {
      const response = await fetch('/api/pid-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create alert');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pid-alerts'] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Alert Created",
        description: "PID alert has been created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create PID alert",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: PidAlertForm }) => {
      const response = await fetch(`/api/pid-alerts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update alert');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pid-alerts'] });
      setIsDialogOpen(false);
      setEditingAlert(null);
      form.reset();
      toast({
        title: "Alert Updated",
        description: "PID alert has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update PID alert",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/pid-alerts/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete alert');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pid-alerts'] });
      toast({
        title: "Alert Deleted",
        description: "PID alert has been deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete PID alert",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PidAlertForm) => {
    if (editingAlert) {
      updateMutation.mutate({ id: editingAlert.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (alert: PidAlert) => {
    setEditingAlert(alert);
    form.reset({
      pid: alert.pid,
      variant: alert.variant || "",
      minPrice: alert.minPrice || "",
      maxPrice: alert.maxPrice || "",
      currency: alert.currency,
      notificationPhone: alert.notificationPhone,
    });
    setIsDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingAlert(null);
    form.reset();
    setIsDialogOpen(true);
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* Header */}
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">PID Alerts</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                  Get instant WhatsApp notifications when specific PIDs with your criteria are detected
                </p>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={handleAdd}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Alert
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {editingAlert ? 'Edit PID Alert' : 'Create PID Alert'}
                    </DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="pid"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>PID</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. 5267/200A" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="variant"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Variant (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. black" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="minPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Min Price</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="420000" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="maxPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Max Price</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="430000" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <FormField
                        control={form.control}
                        name="currency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Currency</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select currency" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="HKD">HKD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="CHF">CHF</SelectItem>
                                <SelectItem value="USDT">USDT</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="notificationPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notification Phone</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. 919876543210" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="flex justify-end space-x-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                          {editingAlert ? 'Update' : 'Create'} Alert
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Bell className="h-8 w-8 text-blue-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Alerts</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {alerts?.length || 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Bell className="h-8 w-8 text-green-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Alerts</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {alerts?.filter(a => a.isActive).length || 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Bell className="h-8 w-8 text-purple-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Unique PIDs</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {new Set(alerts?.map(a => a.pid) || []).size}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Alerts Table */}
            <Card>
              <CardHeader>
                <CardTitle>Your PID Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">Loading alerts...</div>
                ) : alerts && alerts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>PID</TableHead>
                          <TableHead>Variant</TableHead>
                          <TableHead>Price Range</TableHead>
                          <TableHead>Currency</TableHead>
                          <TableHead>Notification Phone</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Triggered (Count)</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {alerts.map((alert) => (
                          <TableRow key={alert.id}>
                            <TableCell className="font-medium">{alert.pid}</TableCell>
                            <TableCell>{alert.variant || '-'}</TableCell>
                            <TableCell>
                              {alert.minPrice && alert.maxPrice 
                                ? `${alert.minPrice} - ${alert.maxPrice}`
                                : '-'
                              }
                            </TableCell>
                            <TableCell>{alert.currency}</TableCell>
                            <TableCell>{alert.notificationPhone}</TableCell>
                            <TableCell>
                              <Badge variant={alert.isActive ? "default" : "secondary"}>
                                {alert.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium text-lg">{alert.triggeredCount || 0}</span>
                                {alert.lastTriggered && (
                                  <span className="text-xs text-gray-500">
                                    Last: {new Date(alert.lastTriggered).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {new Date(alert.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEdit(alert)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deleteMutation.mutate(alert.id)}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No alerts yet</h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Create your first PID alert to get notified when matching watches are posted
                    </p>
                    <Button onClick={handleAdd}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Your First Alert
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}