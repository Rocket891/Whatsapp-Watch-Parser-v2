import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/theme-context";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Home from "@/pages/home";
import Search from "@/pages/search";
import SearchPIDs from "@/pages/search-pids-new";
import Records from "@/pages/records";
import AllRecords from "@/pages/all-records";
import IncomingMessages from "@/pages/incoming-messages";
import Errors from "@/pages/errors";
import MessageLog from "@/pages/message-log";
import WhatsAppIntegration from "@/pages/whatsapp-integration";
import AIConfiguration from "@/pages/ai-configuration";
import Settings from "@/pages/settings";
import Requirements from "@/pages/requirements";
import Inventory from "@/pages/inventory";
import Contacts from "@/pages/contacts";
import ReferenceDatabase from "@/pages/reference-database";
import PidAlerts from "@/pages/pid-alerts";
import MessageTesting from "@/pages/message-testing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Profile from "@/pages/profile";
import Admin from "@/pages/admin";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="*">
          {() => <Login />}
        </Route>
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/search" component={Search} />
      <Route path="/search-pids" component={SearchPIDs} />
      <Route path="/records" component={Records} />
      <Route path="/all-records" component={AllRecords} />
      <Route path="/incoming-messages" component={IncomingMessages} />
      <Route path="/errors" component={Errors} />
      <Route path="/message-log" component={MessageLog} />
      <Route path="/whatsapp-integration" component={WhatsAppIntegration} />
      <Route path="/ai-configuration" component={AIConfiguration} />
      <Route path="/reference-database" component={ReferenceDatabase} />
      <Route path="/pid-alerts" component={PidAlerts} />
      <Route path="/message-testing" component={MessageTesting} />
      <Route path="/requirements" component={Requirements} />
      <Route path="/inventory" component={Inventory} />
      <Route path="/contacts" component={Contacts} />
      <Route path="/profile" component={Profile} />
      <Route path="/admin" component={Admin} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
