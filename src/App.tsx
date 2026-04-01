import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/contexts/AuthProvider";
import { OrgContextProvider } from "@/contexts/OrgContextProvider";

// Static imports - public/auth pages only
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import ResetPassword from "./pages/ResetPassword";
import PublicForm from "./pages/PublicForm";
import GoogleCalendarCallback from "./pages/GoogleCalendarCallback";
import ProtectedRoute from "./components/Auth/ProtectedRoute";
import Install from "./pages/Install";

// Page loader component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Lazy loaded pages - CRM
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Contacts = lazy(() => import("./pages/Contacts"));
const ContactDetail = lazy(() => import("./pages/ContactDetail"));
const PipelineBoard = lazy(() => import("./pages/PipelineBoard"));
const PipelineAdvancedSearch = lazy(() => import("./pages/PipelineAdvancedSearch"));
const ClientHub = lazy(() => import("./pages/ClientHub"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));

// Lazy loaded pages - Reports & Analytics
const Reports = lazy(() => import("./pages/Reports"));
const ReportBuilder = lazy(() => import("./pages/ReportBuilder"));
const SavedReports = lazy(() => import("./pages/SavedReports"));
const CallingDashboard = lazy(() => import("./pages/CallingDashboard"));
const CallLogs = lazy(() => import("./pages/CallLogs"));

// Lazy loaded pages - Campaigns
const Templates = lazy(() => import("./pages/Templates"));
const TemplateBuilder = lazy(() => import("./pages/TemplateBuilder"));
const WhatsAppDashboard = lazy(() => import("./pages/WhatsAppDashboard"));
const BulkWhatsAppSender = lazy(() => import("./pages/BulkWhatsAppSender"));
const WhatsAppCampaigns = lazy(() => import("./pages/WhatsAppCampaigns"));
const WhatsAppCampaignDetail = lazy(() => import("./pages/WhatsAppCampaignDetail"));
const SMSCampaigns = lazy(() => import("./pages/SMSCampaigns"));
const SMSCampaignDetail = lazy(() => import("./pages/SMSCampaignDetail"));
const BulkSMSSender = lazy(() => import("./pages/BulkSMSSender"));
const EmailCampaigns = lazy(() => import("./pages/EmailCampaigns"));
const EmailCampaignDetail = lazy(() => import("./pages/EmailCampaignDetail"));
const BulkEmailSender = lazy(() => import("./pages/BulkEmailSender"));
const EmailAutomations = lazy(() => import("./pages/EmailAutomations"));
const EmailAutomationSettings = lazy(() => import("./pages/EmailAutomationSettings"));
const CampaignOverview = lazy(() => import("./pages/Campaigns/CampaignOverview"));
const AIInsightsDashboard = lazy(() => import("./pages/Campaigns/AIInsightsDashboard"));
const MarketingDashboard = lazy(() => import("./pages/MarketingDashboard"));
const Communications = lazy(() => import("./pages/Communications"));
const QueueStatus = lazy(() => import("./pages/QueueStatus"));

// Lazy loaded pages - Admin
const TechAdmin = lazy(() => import("./pages/TechAdmin"));
const Users = lazy(() => import("./pages/Users"));
const Teams = lazy(() => import("./pages/Teams"));
const PipelineStages = lazy(() => import("./pages/PipelineStages"));
const CallDispositions = lazy(() => import("./pages/CallDispositions"));
const ApprovalMatrix = lazy(() => import("./pages/ApprovalMatrix"));
const Designations = lazy(() => import("./pages/Designations"));
const CustomFields = lazy(() => import("./pages/CustomFields"));
const Forms = lazy(() => import("./pages/Forms"));
const Connectors = lazy(() => import("./pages/Connectors"));
const ApiKeys = lazy(() => import("./pages/ApiKeys"));
const OutboundWebhooks = lazy(() => import("./pages/OutboundWebhooks"));
const CommunicationSettings = lazy(() => import("./pages/CommunicationSettings"));
const WhatsAppSettings = lazy(() => import("./pages/WhatsAppSettings"));
const ExotelSettings = lazy(() => import("./pages/ExotelSettings"));
const ApolloSettings = lazy(() => import("./pages/ApolloSettings"));
const EmailSettings = lazy(() => import("./pages/EmailSettings"));

// Lazy loaded pages - Other
const DataExport = lazy(() => import("./pages/admin/DataExport"));
const OrgChart = lazy(() => import("./pages/OrgChart"));
const PlatformAdmin = lazy(() => import("./pages/PlatformAdmin"));
const Documentation = lazy(() => import("./pages/Documentation"));
const RedefineDataRepository = lazy(() => import("./pages/RedefineDataRepository"));
const Subscriptions = lazy(() => import("./pages/Subscriptions"));
const Inventory = lazy(() => import("./pages/Inventory"));
const BillingSystem = lazy(() => import("./pages/BillingSystem"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Chat = lazy(() => import("./pages/Chat"));
const SupportTickets = lazy(() => import("./pages/SupportTickets"));
// GSTDashboard is now integrated into main Dashboard

const App = () => (
  <AuthProvider>
    <OrgContextProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
          {/* Public routes - static imports */}
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/install" element={<Install />} />
          <Route path="/form/:formId" element={<PublicForm />} />
          <Route path="/google-calendar-callback" element={<GoogleCalendarCallback />} />
          
          {/* CRM Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/contacts" element={
            <ProtectedRoute>
              <Contacts />
            </ProtectedRoute>
          } />
          
          <Route path="/contacts/:id" element={
            <ProtectedRoute>
              <ContactDetail />
            </ProtectedRoute>
          } />
          
          <Route path="/pipeline" element={
            <ProtectedRoute>
              <PipelineBoard />
            </ProtectedRoute>
          } />
          
          <Route path="/pipeline/advanced-search" element={
            <ProtectedRoute>
              <PipelineAdvancedSearch />
            </ProtectedRoute>
          } />
          
          <Route path="/clients" element={
            <ProtectedRoute>
              <ClientHub />
            </ProtectedRoute>
          } />
          
          <Route path="/clients/:id" element={
            <ProtectedRoute>
              <ClientDetail />
            </ProtectedRoute>
          } />
          
          {/* Reports & Analytics Routes */}
          <Route path="/reports" element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          } />
          
          <Route path="/reports/builder" element={
            <ProtectedRoute>
              <ReportBuilder />
            </ProtectedRoute>
          } />
          
          <Route path="/reports/saved" element={
            <ProtectedRoute>
              <SavedReports />
            </ProtectedRoute>
          } />
          
          <Route path="/calling-dashboard" element={
            <ProtectedRoute>
              <CallingDashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/call-logs" element={
            <ProtectedRoute>
              <CallLogs />
            </ProtectedRoute>
          } />
          
          {/* Campaign Routes */}
          <Route path="/templates" element={
            <ProtectedRoute>
              <Templates />
            </ProtectedRoute>
          } />
          
          <Route path="/templates/create" element={
            <ProtectedRoute>
              <TemplateBuilder />
            </ProtectedRoute>
          } />
          
          <Route path="/whatsapp-messages" element={
            <ProtectedRoute>
              <WhatsAppDashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/whatsapp/bulk-send" element={
            <ProtectedRoute>
              <BulkWhatsAppSender />
            </ProtectedRoute>
          } />
          
          <Route path="/whatsapp/campaigns" element={
            <ProtectedRoute>
              <WhatsAppCampaigns />
            </ProtectedRoute>
          } />
          
          <Route path="/whatsapp/campaigns/:id" element={
            <ProtectedRoute>
              <WhatsAppCampaignDetail />
            </ProtectedRoute>
          } />
          
          <Route path="/sms-campaigns" element={
            <ProtectedRoute>
              <SMSCampaigns />
            </ProtectedRoute>
          } />
          
          <Route path="/sms-campaigns/:id" element={
            <ProtectedRoute>
              <SMSCampaignDetail />
            </ProtectedRoute>
          } />
          
          <Route path="/bulk-sms" element={
            <ProtectedRoute>
              <BulkSMSSender />
            </ProtectedRoute>
          } />
          
          <Route path="/email-campaigns" element={
            <ProtectedRoute>
              <EmailCampaigns />
            </ProtectedRoute>
          } />
          
          <Route path="/email-campaigns/:id" element={
            <ProtectedRoute>
              <EmailCampaignDetail />
            </ProtectedRoute>
          } />
          
          <Route path="/bulk-email" element={
            <ProtectedRoute>
              <BulkEmailSender />
            </ProtectedRoute>
          } />
          
          <Route path="/email-automations" element={
            <ProtectedRoute requiredRole="admin">
              <EmailAutomations />
            </ProtectedRoute>
          } />
          
          <Route path="/email-automations/settings" element={
            <ProtectedRoute requiredRole="admin">
              <EmailAutomationSettings />
            </ProtectedRoute>
          } />
          
          <Route path="/campaigns/overview" element={
            <ProtectedRoute>
              <CampaignOverview />
            </ProtectedRoute>
          } />
          
          <Route path="/campaigns/insights" element={
            <ProtectedRoute>
              <AIInsightsDashboard />
            </ProtectedRoute>
          } />

          <Route path="/marketing" element={
            <ProtectedRoute>
              <MarketingDashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/communications" element={
            <ProtectedRoute>
              <Communications />
            </ProtectedRoute>
          } />
          
          <Route path="/queue-status" element={
            <ProtectedRoute>
              <QueueStatus />
            </ProtectedRoute>
          } />
          
          {/* Admin Routes */}
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="admin">
              <TechAdmin />
            </ProtectedRoute>
          } />
          
          <Route path="/users" element={
            <ProtectedRoute requiredRole="admin">
              <Users />
            </ProtectedRoute>
          } />
          
          <Route path="/teams" element={
            <ProtectedRoute requiredRole="admin">
              <Teams />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/pipeline-stages" element={
            <ProtectedRoute requiredRole="admin">
              <PipelineStages />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/call-dispositions" element={
            <ProtectedRoute requiredRole="admin">
              <CallDispositions />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/approval-matrix" element={
            <ProtectedRoute requiredRole="admin">
              <ApprovalMatrix />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/designations" element={
            <ProtectedRoute requiredRole="admin">
              <Designations />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/custom-fields" element={
            <ProtectedRoute requiredRole="admin">
              <CustomFields />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/forms" element={
            <ProtectedRoute requiredRole="admin">
              <Forms />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/connectors" element={
            <ProtectedRoute requiredRole="admin">
              <Connectors />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/api-keys" element={
            <ProtectedRoute requiredRole="admin">
              <ApiKeys />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/outbound-webhooks" element={
            <ProtectedRoute requiredRole="admin">
              <OutboundWebhooks />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/communication-settings" element={
            <ProtectedRoute requiredRole="admin">
              <CommunicationSettings />
            </ProtectedRoute>
          } />
          
          <Route path="/whatsapp-settings" element={
            <ProtectedRoute requiredRole="admin">
              <WhatsAppSettings />
            </ProtectedRoute>
          } />
          
          <Route path="/exotel-settings" element={
            <ProtectedRoute requiredRole="admin">
              <ExotelSettings />
            </ProtectedRoute>
          } />
          
          <Route path="/apollo-settings" element={
            <ProtectedRoute requiredRole="admin">
              <ApolloSettings />
            </ProtectedRoute>
          } />
          
          {/* Other Routes */}
          <Route path="/org-chart" element={
            <ProtectedRoute>
              <OrgChart />
            </ProtectedRoute>
          } />
          
          <Route path="/platform-admin" element={
            <ProtectedRoute>
              <PlatformAdmin />
            </ProtectedRoute>
          } />
          
          <Route path="/platform-admin/subscriptions" element={
            <ProtectedRoute>
              <Subscriptions />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/data-export" element={
            <ProtectedRoute>
              <DataExport />
            </ProtectedRoute>
          } />
          
          <Route path="/documentation" element={
            <ProtectedRoute>
              <Documentation />
            </ProtectedRoute>
          } />
          
          <Route path="/redefine-repository" element={
            <ProtectedRoute>
              <RedefineDataRepository />
            </ProtectedRoute>
          } />
          
          <Route path="/inventory" element={
            <ProtectedRoute>
              <Inventory />
            </ProtectedRoute>
          } />

          <Route path="/billing-system" element={
            <ProtectedRoute>
              <BillingSystem />
            </ProtectedRoute>
          } />
          
          <Route path="/tasks" element={
            <ProtectedRoute>
              <Tasks />
            </ProtectedRoute>
          } />
          
          <Route path="/calendar" element={
            <ProtectedRoute>
              <Calendar />
            </ProtectedRoute>
          } />
          
           <Route path="/chat" element={
             <ProtectedRoute>
               <Chat />
             </ProtectedRoute>
           } />
           
           <Route path="/chat/:conversationId" element={
             <ProtectedRoute>
               <Chat />
             </ProtectedRoute>
           } />
           
          {/* GST Dashboard is now integrated into main Dashboard */}
          
          <Route path="/support-tickets" element={
            <ProtectedRoute>
              <SupportTickets />
            </ProtectedRoute>
          } />
          
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </OrgContextProvider>
</AuthProvider>
);

export default App;
