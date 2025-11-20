import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Search from "@/pages/search";
import SearchPIDs from "@/pages/search-pids-new";
import Records from "@/pages/records";
import AllRecords from "@/pages/all-records";
import IncomingMessages from "@/pages/incoming-messages";
import Errors from "@/pages/errors";
import GoogleSheets from "@/pages/google-sheets";
import WhatsAppIntegration from "@/pages/whatsapp-integration";
import AIConfiguration from "@/pages/ai-configuration";
import Settings from "@/pages/settings";
import ReferenceDatabase from "@/pages/reference-database";
import PidAlerts from "@/pages/pid-alerts";
import MessageTesting from "@/pages/message-testing";
import Requirements from "@/pages/requirements-new";
import InventoryPage from "@/pages/inventory";

function Router() {
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
      <Route path="/google-sheets" component={GoogleSheets} />
      <Route path="/whatsapp-integration" component={WhatsAppIntegration} />
      <Route path="/ai-configuration" component={AIConfiguration} />
      <Route path="/reference-database" component={ReferenceDatabase} />
      <Route path="/pid-alerts" component={PidAlerts} />
      <Route path="/message-testing" component={MessageTesting} />
      <Route path="/requirements" component={Requirements} />
      <Route path="/inventory" component={InventoryPage} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
