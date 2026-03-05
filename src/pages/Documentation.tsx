import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { 
  BookOpen, 
  Database, 
  Code, 
  FileText, 
  Workflow,
  Shield,
  Zap,
  ArrowLeft
} from "lucide-react";

const Documentation = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("overview");

  const sections = [
    { id: "overview", label: "System Overview", icon: BookOpen },
    { id: "architecture", label: "Architecture", icon: Workflow },
    { id: "database", label: "Database Schema", icon: Database },
    { id: "api", label: "API Reference", icon: Code },
    { id: "authentication", label: "Authentication", icon: Shield },
    { id: "integrations", label: "Integrations", icon: Zap },
    { id: "deployment", label: "Deployment", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container py-6">
          <div className="flex items-center gap-4 mb-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate(-1)}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold">Technical Documentation</h1>
          </div>
          <p className="text-muted-foreground ml-12">
            Complete technical reference for the CRM system
          </p>
        </div>
      </div>

      <div className="container py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar Navigation */}
          <Card className="col-span-3 p-4 h-fit sticky top-6">
            <nav className="space-y-1">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeSection === section.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </Card>

          {/* Main Content */}
          <div className="col-span-9">
            <ScrollArea className="h-[calc(100vh-200px)]">
              {activeSection === "overview" && <SystemOverview />}
              {activeSection === "architecture" && <Architecture />}
              {activeSection === "database" && <DatabaseSchema />}
              {activeSection === "api" && <ApiReference />}
              {activeSection === "authentication" && <Authentication />}
              {activeSection === "integrations" && <Integrations />}
              {activeSection === "deployment" && <Deployment />}
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
};

const SystemOverview = () => (
  <div className="space-y-8">
    <div>
      <h2 className="text-2xl font-bold mb-4">System Overview</h2>
      <p className="text-muted-foreground mb-6">
        A comprehensive multi-tenant CRM platform built with React, TypeScript, and Supabase,
        designed for sales teams to manage contacts, communications, and campaigns.
      </p>
    </div>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Tech Stack</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="font-medium mb-2">Frontend</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• React 18.3</li>
            <li>• TypeScript</li>
            <li>• Vite</li>
            <li>• Tailwind CSS</li>
            <li>• shadcn/ui components</li>
            <li>• TanStack Query (React Query)</li>
            <li>• React Router v6</li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium mb-2">Backend</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• Supabase (PostgreSQL)</li>
            <li>• Row Level Security (RLS)</li>
            <li>• Edge Functions (Deno)</li>
            <li>• Supabase Auth</li>
            <li>• Supabase Storage</li>
            <li>• Realtime subscriptions</li>
          </ul>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Core Modules</h3>
      <div className="space-y-4">
        {[
          {
            title: "Contact Management",
            desc: "Comprehensive contact database with custom fields, activities, and pipeline stages. Supports email/phone management, assignment, and filtering.",
            lines: "~3,500 LOC"
          },
          {
            title: "Communication Hub",
            desc: "Unified inbox for WhatsApp and Email communications. Template-based messaging with variable substitution.",
            lines: "~2,800 LOC"
          },
          {
            title: "Calling System",
            desc: "Exotel integration for outbound/inbound calling, call logging, recording, and dispositions with sub-dispositions.",
            lines: "~2,200 LOC"
          },
          {
            title: "Campaign Management",
            desc: "Bulk email and WhatsApp campaigns with recipient management, analytics, and AI-powered insights.",
            lines: "~3,100 LOC"
          },
          {
            title: "Forms & Connectors",
            desc: "Dynamic form builder with webhook integrations (IndiaMART, generic webhooks) and rate limiting.",
            lines: "~1,900 LOC"
          },
          {
            title: "User Management",
            desc: "Multi-tenant organization structure with role-based access control, teams, designations, and reporting hierarchy.",
            lines: "~2,400 LOC"
          },
          {
            title: "Analytics & Reports",
            desc: "Campaign performance tracking, call analytics, and AI-generated insights with trend visualization.",
            lines: "~1,600 LOC"
          }
        ].map((module) => (
          <div key={module.title} className="border-l-2 border-primary pl-4">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-medium">{module.title}</h4>
              <span className="text-xs text-muted-foreground">{module.lines}</span>
            </div>
            <p className="text-sm text-muted-foreground">{module.desc}</p>
          </div>
        ))}
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Key Features</h3>
      <div className="grid grid-cols-2 gap-3">
        {[
          "Multi-tenant architecture",
          "Role-based access control",
          "Real-time data sync",
          "Custom field system",
          "Pipeline management",
          "Email campaigns",
          "WhatsApp campaigns",
          "Click-to-call (Exotel)",
          "Call recording & dispositions",
          "Template builder",
          "Webhook integrations",
          "AI-powered insights",
          "Activity timeline",
          "Advanced search & filters",
          "Export functionality",
          "Platform admin controls"
        ].map((feature) => (
          <div key={feature} className="flex items-center gap-2 text-sm">
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            {feature}
          </div>
        ))}
      </div>
    </Card>

    <Card className="p-6 bg-muted/50">
      <h3 className="text-xl font-semibold mb-4">Statistics</h3>
      <div className="grid grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-3xl font-bold text-primary">~36.5K</div>
          <div className="text-sm text-muted-foreground">Lines of Code</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-primary">150+</div>
          <div className="text-sm text-muted-foreground">Components</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-primary">50+</div>
          <div className="text-sm text-muted-foreground">Database Tables</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-primary">15+</div>
          <div className="text-sm text-muted-foreground">Edge Functions</div>
        </div>
      </div>
    </Card>
  </div>
);

const Architecture = () => (
  <div className="space-y-8">
    <div>
      <h2 className="text-2xl font-bold mb-4">System Architecture</h2>
      <p className="text-muted-foreground mb-6">
        The system follows a modern serverless architecture with clear separation of concerns.
      </p>
    </div>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Architecture Overview</h3>
      <div className="space-y-4">
        <div className="border-l-4 border-primary pl-4">
          <h4 className="font-semibold mb-2">Frontend Layer</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Single Page Application (SPA) built with React and TypeScript
          </p>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• Component-based architecture using React 18</li>
            <li>• State management with TanStack Query (server state) and React hooks (local state)</li>
            <li>• Routing via React Router v6</li>
            <li>• UI components from shadcn/ui (Radix UI primitives)</li>
            <li>• Styling with Tailwind CSS utility classes</li>
          </ul>
        </div>

        <div className="border-l-4 border-blue-500 pl-4">
          <h4 className="font-semibold mb-2">Backend Layer (Supabase)</h4>
          <p className="text-sm text-muted-foreground mb-2">
            PostgreSQL database with Row Level Security and serverless functions
          </p>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• PostgreSQL 15+ with PostGIS extensions</li>
            <li>• Row Level Security (RLS) for multi-tenant data isolation</li>
            <li>• Database functions and triggers for business logic</li>
            <li>• Realtime subscriptions via PostgreSQL LISTEN/NOTIFY</li>
            <li>• Storage buckets for file management</li>
          </ul>
        </div>

        <div className="border-l-4 border-green-500 pl-4">
          <h4 className="font-semibold mb-2">Edge Functions Layer</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Deno-based serverless functions for external integrations
          </p>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• Exotel calling integration (make-call, webhooks, recordings, sync)</li>
            <li>• Email sending via Resend API (bulk & single)</li>
            <li>• WhatsApp messaging via Exotel API</li>
            <li>• Webhook receivers (IndiaMART, generic webhooks)</li>
            <li>• AI-powered analytics and insights</li>
            <li>• Queue processing for campaigns</li>
          </ul>
        </div>

        <div className="border-l-4 border-orange-500 pl-4">
          <h4 className="font-semibold mb-2">External Integrations</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• <strong>Exotel</strong> - Cloud telephony & WhatsApp Business API</li>
            <li>• <strong>Resend</strong> - Transactional email delivery</li>
            <li>• <strong>IndiaMART</strong> - Lead generation webhook</li>
          </ul>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Data Flow</h3>
      <div className="space-y-3 text-sm">
        <div className="p-3 bg-muted rounded-lg">
          <strong>1. User Authentication Flow:</strong>
          <p className="text-muted-foreground mt-1">
            User → Frontend → Supabase Auth → JWT Token → RLS Policies → Database Access
          </p>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <strong>2. Contact Creation Flow:</strong>
          <p className="text-muted-foreground mt-1">
            User Input → Frontend Validation → Supabase Client → RLS Check → contacts table → 
            Trigger → contact_emails/phones tables → Activity Log
          </p>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <strong>3. Campaign Execution Flow:</strong>
          <p className="text-muted-foreground mt-1">
            Campaign Creation → Recipients Upload → Edge Function Trigger → Queue Processing → 
            External API (Exotel/Resend) → Status Update → Analytics Recording
          </p>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <strong>4. Calling Flow:</strong>
          <p className="text-muted-foreground mt-1">
            Click-to-Call → Edge Function → Exotel API → Call Initiated → 
            Webhook Updates → Call Log → Activity Timeline
          </p>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Security Architecture</h3>
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
          <div>
            <strong className="text-sm">Row Level Security (RLS):</strong>
            <p className="text-sm text-muted-foreground">All tables enforce org_id isolation with RLS policies</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
          <div>
            <strong className="text-sm">Role-Based Access Control:</strong>
            <p className="text-sm text-muted-foreground">Separate user_roles table with security definer functions</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
          <div>
            <strong className="text-sm">API Key Protection:</strong>
            <p className="text-sm text-muted-foreground">Secrets stored in Supabase Vault, accessed only by edge functions</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
          <div>
            <strong className="text-sm">JWT Authentication:</strong>
            <p className="text-sm text-muted-foreground">Short-lived tokens with automatic refresh</p>
          </div>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Scalability Considerations</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="font-medium mb-2 text-sm">Horizontal Scaling</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• Serverless edge functions auto-scale</li>
            <li>• PostgreSQL connection pooling</li>
            <li>• CDN for static assets</li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium mb-2 text-sm">Performance Optimization</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• Database indexes on foreign keys</li>
            <li>• Query result caching with React Query</li>
            <li>• Lazy loading of routes and components</li>
          </ul>
        </div>
      </div>
    </Card>
  </div>
);

const DatabaseSchema = () => (
  <div className="space-y-8">
    <div>
      <h2 className="text-2xl font-bold mb-4">Database Schema</h2>
      <p className="text-muted-foreground mb-6">
        PostgreSQL database with 50+ tables organized around multi-tenant architecture
      </p>
    </div>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Core Tables</h3>
      
      <div className="space-y-6">
        <div className="border-l-4 border-primary pl-4">
          <h4 className="font-semibold mb-2">organizations</h4>
          <p className="text-sm text-muted-foreground mb-2">Root tenant isolation table</p>
          <div className="bg-muted p-3 rounded text-xs font-mono">
            <div>id: uuid (PK)</div>
            <div>name: text</div>
            <div>slug: text (unique)</div>
            <div>logo_url: text</div>
            <div>primary_color: text</div>
            <div>settings: jsonb</div>
            <div>usage_limits: jsonb</div>
          </div>
        </div>

        <div className="border-l-4 border-blue-500 pl-4">
          <h4 className="font-semibold mb-2">profiles</h4>
          <p className="text-sm text-muted-foreground mb-2">Extended user information (linked to auth.users)</p>
          <div className="bg-muted p-3 rounded text-xs font-mono">
            <div>id: uuid (PK, FK → auth.users)</div>
            <div>org_id: uuid (FK → organizations)</div>
            <div>first_name: text</div>
            <div>last_name: text</div>
            <div>designation_id: uuid (FK → designations)</div>
            <div>calling_enabled: boolean</div>
            <div>is_platform_admin: boolean</div>
            <div>onboarding_completed: boolean</div>
          </div>
        </div>

        <div className="border-l-4 border-green-500 pl-4">
          <h4 className="font-semibold mb-2">user_roles</h4>
          <p className="text-sm text-muted-foreground mb-2">Role-based access control (separate table for security)</p>
          <div className="bg-muted p-3 rounded text-xs font-mono">
            <div>id: uuid (PK)</div>
            <div>user_id: uuid (FK → auth.users)</div>
            <div>org_id: uuid (FK → organizations)</div>
            <div>role: app_role enum</div>
            <div className="mt-1 text-muted-foreground">• Roles: admin, super_admin, sales_agent, sales_manager, support_agent, support_manager</div>
          </div>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Contact Management</h3>
      <div className="space-y-4">
        {[
          {
            table: "contacts",
            desc: "Main contact records with pipeline tracking",
            cols: ["id", "org_id", "first_name", "last_name", "email", "phone", "company", "job_title", "pipeline_stage_id", "assigned_to", "assigned_team_id", "status", "source"]
          },
          {
            table: "contact_emails",
            desc: "Multiple email addresses per contact",
            cols: ["id", "contact_id", "org_id", "email", "email_type", "is_primary"]
          },
          {
            table: "contact_phones",
            desc: "Multiple phone numbers per contact",
            cols: ["id", "contact_id", "org_id", "phone", "phone_type", "is_primary"]
          },
          {
            table: "contact_activities",
            desc: "Activity timeline (calls, emails, meetings, notes)",
            cols: ["id", "org_id", "contact_id", "activity_type", "subject", "description", "created_by", "scheduled_at", "completed_at", "call_disposition_id"]
          },
          {
            table: "contact_custom_fields",
            desc: "Dynamic custom field values",
            cols: ["id", "contact_id", "custom_field_id", "field_value"]
          }
        ].map((item) => (
          <div key={item.table} className="border-l-2 border-muted pl-4">
            <h4 className="font-medium text-sm">{item.table}</h4>
            <p className="text-xs text-muted-foreground mb-2">{item.desc}</p>
            <div className="text-xs text-muted-foreground">
              {item.cols.join(", ")}
            </div>
          </div>
        ))}
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Campaign System</h3>
      <div className="space-y-4">
        {[
          {
            table: "email_bulk_campaigns",
            desc: "Email campaign metadata and stats",
            cols: ["id", "org_id", "name", "subject", "html_content", "template_id", "status", "total_recipients", "sent_count", "failed_count", "pending_count", "variable_mappings"]
          },
          {
            table: "email_campaign_recipients",
            desc: "Campaign recipient tracking",
            cols: ["id", "campaign_id", "contact_id", "email", "status", "sent_at", "error_message", "custom_data"]
          },
          {
            table: "whatsapp_bulk_campaigns",
            desc: "WhatsApp campaign metadata",
            cols: ["id", "org_id", "name", "template_id", "status", "total_recipients", "sent_count", "failed_count", "variable_mappings"]
          },
          {
            table: "campaign_analytics",
            desc: "Daily campaign performance metrics",
            cols: ["id", "org_id", "campaign_id", "campaign_type", "date", "open_count", "click_count", "bounce_count", "conversions", "revenue", "spend", "cpa", "roas"]
          },
          {
            table: "campaign_insights",
            desc: "AI-generated campaign recommendations",
            cols: ["id", "org_id", "campaign_id", "insight_type", "priority", "title", "description", "suggested_action", "supporting_data", "status"]
          }
        ].map((item) => (
          <div key={item.table} className="border-l-2 border-muted pl-4">
            <h4 className="font-medium text-sm">{item.table}</h4>
            <p className="text-xs text-muted-foreground mb-2">{item.desc}</p>
            <div className="text-xs text-muted-foreground">
              {item.cols.join(", ")}
            </div>
          </div>
        ))}
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Communication Tables</h3>
      <div className="space-y-4">
        {[
          {
            table: "email_conversations",
            desc: "Email thread tracking (inbound/outbound)",
            cols: ["id", "org_id", "contact_id", "conversation_id", "direction", "subject", "email_content", "from_email", "to_email", "sent_by", "is_read", "status"]
          },
          {
            table: "whatsapp_messages",
            desc: "WhatsApp message history",
            cols: ["id", "org_id", "contact_id", "conversation_id", "direction", "message_content", "phone_number", "sender_name", "status", "read_at"]
          },
          {
            table: "call_logs",
            desc: "Call records with Exotel integration",
            cols: ["id", "org_id", "agent_id", "contact_id", "direction", "call_type", "from_number", "to_number", "status", "call_duration", "recording_url", "disposition_id", "sub_disposition_id", "exotel_call_sid"]
          },
          {
            table: "communication_templates",
            desc: "Reusable message templates (email/WhatsApp)",
            cols: ["id", "org_id", "template_type", "template_name", "template_id", "content", "status", "variables", "category", "language"]
          }
        ].map((item) => (
          <div key={item.table} className="border-l-2 border-muted pl-4">
            <h4 className="font-medium text-sm">{item.table}</h4>
            <p className="text-xs text-muted-foreground mb-2">{item.desc}</p>
            <div className="text-xs text-muted-foreground">
              {item.cols.join(", ")}
            </div>
          </div>
        ))}
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Organization Structure</h3>
      <div className="space-y-4">
        {[
          {
            table: "teams",
            desc: "Team hierarchy",
            cols: ["id", "org_id", "name", "description", "manager_id"]
          },
          {
            table: "team_members",
            desc: "Team membership",
            cols: ["id", "team_id", "user_id"]
          },
          {
            table: "designations",
            desc: "Job roles with permissions",
            cols: ["id", "org_id", "name", "role", "description", "is_active"]
          },
          {
            table: "reporting_hierarchy",
            desc: "Manager-reportee relationships",
            cols: ["id", "org_id", "designation_id", "reports_to_designation_id"]
          }
        ].map((item) => (
          <div key={item.table} className="border-l-2 border-muted pl-4">
            <h4 className="font-medium text-sm">{item.table}</h4>
            <p className="text-xs text-muted-foreground mb-2">{item.desc}</p>
            <div className="text-xs text-muted-foreground">
              {item.cols.join(", ")}
            </div>
          </div>
        ))}
      </div>
    </Card>

    <Card className="p-6 bg-muted/50">
      <h3 className="text-xl font-semibold mb-4">Key Design Patterns</h3>
      <div className="space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <div className="h-2 w-2 rounded-full bg-primary mt-1" />
          <div>
            <strong>Multi-tenancy:</strong> Every table has org_id for tenant isolation via RLS
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="h-2 w-2 rounded-full bg-primary mt-1" />
          <div>
            <strong>Soft Deletes:</strong> is_active flags instead of hard deletes
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="h-2 w-2 rounded-full bg-primary mt-1" />
          <div>
            <strong>Audit Trail:</strong> created_at, updated_at, created_by on most tables
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="h-2 w-2 rounded-full bg-primary mt-1" />
          <div>
            <strong>JSONB Fields:</strong> Flexible data storage (settings, custom_data, variables)
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="h-2 w-2 rounded-full bg-primary mt-1" />
          <div>
            <strong>Enums:</strong> app_role, activity_type for type safety
          </div>
        </div>
      </div>
    </Card>
  </div>
);

const ApiReference = () => (
  <div className="space-y-8">
    <div>
      <h2 className="text-2xl font-bold mb-4">API Reference</h2>
      <p className="text-muted-foreground mb-6">
        Edge Functions serve as the backend API layer for external integrations
      </p>
    </div>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Calling Functions (Exotel)</h3>
      <div className="space-y-4">
        <div className="border-l-4 border-primary pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-green-500/20 text-green-700 dark:text-green-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/exotel-make-call</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Initiate an outbound call via Exotel</p>
          <div className="bg-muted p-3 rounded text-xs">
            <div className="font-semibold mb-1">Request Body:</div>
            <pre>{`{
  "contactId": "uuid",
  "agentPhoneNumber": "string"
}`}</pre>
            <div className="font-semibold mt-2 mb-1">Response:</div>
            <pre>{`{
  "success": true,
  "callLog": { ... },
  "exotelResponse": { ... }
}`}</pre>
          </div>
        </div>

        <div className="border-l-4 border-blue-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/exotel-webhook</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Receive call status updates from Exotel</p>
          <div className="bg-muted p-3 rounded text-xs">
            <div className="font-semibold mb-1">Webhook Payload (Form Data):</div>
            <pre>{`CallSid, Status, Duration, RecordingUrl, etc.`}</pre>
          </div>
        </div>

        <div className="border-l-4 border-purple-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-purple-500/20 text-purple-700 dark:text-purple-300 rounded text-xs font-mono">GET</span>
            <code className="text-sm">/exotel-get-recording</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Stream call recording audio</p>
          <div className="bg-muted p-3 rounded text-xs">
            <div className="font-semibold mb-1">Query Params:</div>
            <pre>callLogId=uuid</pre>
            <div className="font-semibold mt-2 mb-1">Response:</div>
            <pre>Audio stream (audio/mpeg)</pre>
          </div>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Communication Functions</h3>
      <div className="space-y-4">
        <div className="border-l-4 border-green-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-green-500/20 text-green-700 dark:text-green-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/send-email</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Send transactional email via Resend</p>
          <div className="bg-muted p-3 rounded text-xs">
            <div className="font-semibold mb-1">Request Body:</div>
            <pre>{`{
  "to": "email@example.com",
  "subject": "string",
  "htmlContent": "string",
  "contactId": "uuid" (optional)
}`}</pre>
          </div>
        </div>

        <div className="border-l-4 border-green-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-green-500/20 text-green-700 dark:text-green-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/send-bulk-email</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Process email campaign batch</p>
          <div className="bg-muted p-3 rounded text-xs">
            <div className="font-semibold mb-1">Request Body:</div>
            <pre>{`{ "campaignId": "uuid" }`}</pre>
          </div>
        </div>

        <div className="border-l-4 border-teal-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-teal-500/20 text-teal-700 dark:text-teal-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/send-whatsapp-message</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Send WhatsApp message via Exotel</p>
          <div className="bg-muted p-3 rounded text-xs">
            <div className="font-semibold mb-1">Request Body:</div>
            <pre>{`{
  "phoneNumber": "string",
  "message": "string",
  "contactId": "uuid",
  "templateId": "string" (optional)
}`}</pre>
          </div>
        </div>

        <div className="border-l-4 border-teal-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-teal-500/20 text-teal-700 dark:text-teal-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/bulk-whatsapp-sender</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Process WhatsApp campaign batch</p>
          <div className="bg-muted p-3 rounded text-xs">
            <div className="font-semibold mb-1">Request Body:</div>
            <pre>{`{ "campaignId": "uuid" }`}</pre>
          </div>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Webhook Receivers</h3>
      <div className="space-y-4">
        <div className="border-l-4 border-orange-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-orange-500/20 text-orange-700 dark:text-orange-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/indiamart-webhook</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Receive leads from IndiaMART</p>
          <div className="bg-muted p-3 rounded text-xs">
            <div className="font-semibold mb-1">Expected Payload:</div>
            <pre>{`IndiaMART lead JSON format`}</pre>
          </div>
        </div>

        <div className="border-l-4 border-orange-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-orange-500/20 text-orange-700 dark:text-orange-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/webhook-receiver</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Generic webhook endpoint for form submissions</p>
          <div className="bg-muted p-3 rounded text-xs">
            <div className="font-semibold mb-1">Query Params:</div>
            <pre>token=webhook_token</pre>
          </div>
        </div>

        <div className="border-l-4 border-purple-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-purple-500/20 text-purple-700 dark:text-purple-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/email-inbound-webhook</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Receive inbound emails from Resend</p>
        </div>

        <div className="border-l-4 border-blue-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/whatsapp-webhook</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Receive WhatsApp messages and delivery reports from Exotel</p>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">AI & Analytics Functions</h3>
      <div className="space-y-4">
        <div className="border-l-4 border-pink-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-pink-500/20 text-pink-700 dark:text-pink-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/analyze-campaign-performance</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Generate AI insights for campaign</p>
          <div className="bg-muted p-3 rounded text-xs">
            <div className="font-semibold mb-1">Request Body:</div>
            <pre>{`{ "campaignId": "uuid" }`}</pre>
          </div>
        </div>

        <div className="border-l-4 border-pink-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-pink-500/20 text-pink-700 dark:text-pink-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/chat-campaign-assistant</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">AI chatbot for campaign optimization</p>
        </div>

        <div className="border-l-4 border-indigo-500 pl-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded text-xs font-mono">POST</span>
            <code className="text-sm">/analyze-lead</code>
          </div>
          <p className="text-sm text-muted-foreground mb-2">AI lead scoring and qualification</p>
        </div>
      </div>
    </Card>

    <Card className="p-6 bg-muted/50">
      <h3 className="text-xl font-semibold mb-4">Authentication</h3>
      <p className="text-sm mb-3">All edge functions require authentication via Bearer token:</p>
      <div className="bg-background p-3 rounded text-xs font-mono">
        <pre>{`Authorization: Bearer <jwt_token>`}</pre>
      </div>
      <p className="text-sm mt-3 text-muted-foreground">
        JWT tokens are obtained from Supabase Auth and contain user_id and org_id claims
      </p>
    </Card>
  </div>
);

const Authentication = () => (
  <div className="space-y-8">
    <div>
      <h2 className="text-2xl font-bold mb-4">Authentication & Authorization</h2>
      <p className="text-muted-foreground mb-6">
        Multi-layered security with Supabase Auth, RLS, and role-based access control
      </p>
    </div>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Authentication Flow</h3>
      <div className="space-y-3">
        <div className="p-4 bg-muted rounded-lg">
          <h4 className="font-semibold mb-2">1. User Sign-In</h4>
          <pre className="text-xs bg-background p-3 rounded mt-2">{`const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})`}</pre>
          <p className="text-sm text-muted-foreground mt-2">
            Returns JWT token with user claims (sub, email, role)
          </p>
        </div>

        <div className="p-4 bg-muted rounded-lg">
          <h4 className="font-semibold mb-2">2. Session Management</h4>
          <pre className="text-xs bg-background p-3 rounded mt-2">{`supabase.auth.onAuthStateChange((event, session) => {
  setSession(session);
  setUser(session?.user ?? null);
})`}</pre>
          <p className="text-sm text-muted-foreground mt-2">
            Automatic token refresh every hour
          </p>
        </div>

        <div className="p-4 bg-muted rounded-lg">
          <h4 className="font-semibold mb-2">3. Protected Routes</h4>
          <pre className="text-xs bg-background p-3 rounded mt-2">{`<Route path="/dashboard" element={
  <ProtectedRoute>
    <Dashboard />
  </ProtectedRoute>
} />`}</pre>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Row Level Security (RLS)</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Every table enforces data isolation at the database level
      </p>
      <div className="space-y-3">
        <div className="border-l-4 border-primary pl-4">
          <h4 className="font-semibold text-sm mb-2">Organization Isolation</h4>
          <pre className="text-xs bg-muted p-3 rounded">{`CREATE POLICY "Users can view contacts in their org"
ON contacts FOR SELECT
USING (org_id = get_user_org_id(auth.uid()))`}</pre>
        </div>

        <div className="border-l-4 border-blue-500 pl-4">
          <h4 className="font-semibold text-sm mb-2">User-Specific Data</h4>
          <pre className="text-xs bg-muted p-3 rounded">{`CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
USING (id = auth.uid())`}</pre>
        </div>

        <div className="border-l-4 border-green-500 pl-4">
          <h4 className="font-semibold text-sm mb-2">Role-Based Access</h4>
          <pre className="text-xs bg-muted p-3 rounded">{`CREATE POLICY "Admins can manage users"
ON user_roles FOR ALL
USING (
  org_id = get_user_org_id(auth.uid()) AND
  (has_role(auth.uid(), 'admin') OR 
   has_role(auth.uid(), 'super_admin'))
)`}</pre>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Role System</h3>
      <div className="space-y-3">
        <div>
          <h4 className="font-semibold mb-2">Available Roles</h4>
          <div className="grid grid-cols-2 gap-3">
            {[
              { role: "super_admin", desc: "Full system access, org management" },
              { role: "admin", desc: "User management, settings, reports" },
              { role: "sales_manager", desc: "Team oversight, pipeline management" },
              { role: "sales_agent", desc: "Contact management, calling, campaigns" },
              { role: "support_manager", desc: "Support team oversight" },
              { role: "support_agent", desc: "Customer support operations" }
            ].map((item) => (
              <div key={item.role} className="p-3 bg-muted rounded">
                <div className="font-mono text-xs font-semibold text-primary">{item.role}</div>
                <div className="text-xs text-muted-foreground mt-1">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <h4 className="font-semibold mb-2">Security Definer Function</h4>
          <pre className="text-xs bg-muted p-3 rounded">{`CREATE FUNCTION has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;`}</pre>
          <p className="text-xs text-muted-foreground mt-2">
            Prevents recursive RLS policy checks
          </p>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Feature Permissions</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Granular feature access control at org and designation level
      </p>
      <div className="space-y-3">
        <div className="border-l-4 border-purple-500 pl-4">
          <h4 className="font-semibold text-sm mb-2">Organization Level</h4>
          <pre className="text-xs bg-muted p-3 rounded">{`// Check if feature is enabled for org
is_feature_enabled_for_org(org_id, 'campaigns')`}</pre>
          <p className="text-xs text-muted-foreground mt-2">
            Platform admins can enable/disable features per organization
          </p>
        </div>

        <div className="border-l-4 border-orange-500 pl-4">
          <h4 className="font-semibold text-sm mb-2">Designation Level</h4>
          <pre className="text-xs bg-muted p-3 rounded">{`// Check designation permissions
designation_has_feature_access(
  designation_id, 
  'contacts', 
  'edit'
)`}</pre>
          <p className="text-xs text-muted-foreground mt-2">
            Fine-grained permissions: view, create, edit, delete per feature
          </p>
        </div>
      </div>
    </Card>

    <Card className="p-6 bg-red-500/10 border-red-500/50">
      <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <span className="text-red-600">⚠️</span> Security Best Practices
      </h3>
      <ul className="space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <span className="text-red-600">•</span>
          <div><strong>Never expose service role key</strong> - Only use anon key in frontend</div>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-red-600">•</span>
          <div><strong>RLS on all tables</strong> - Every table must have RLS policies enabled</div>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-red-600">•</span>
          <div><strong>Separate roles table</strong> - Never store roles in profiles table</div>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-red-600">•</span>
          <div><strong>Validate in backend</strong> - Don't trust client-side role checks</div>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-red-600">•</span>
          <div><strong>Use security definer</strong> - For functions that bypass RLS</div>
        </li>
      </ul>
    </Card>
  </div>
);

const Integrations = () => (
  <div className="space-y-8">
    <div>
      <h2 className="text-2xl font-bold mb-4">External Integrations</h2>
      <p className="text-muted-foreground mb-6">
        Third-party service integrations for calling, messaging, and lead generation
      </p>
    </div>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Exotel (Cloud Telephony)</h3>
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">Overview</h4>
          <p className="text-sm text-muted-foreground">
            Cloud-based calling platform for outbound/inbound calls with recording and tracking
          </p>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Configuration</h4>
          <div className="bg-muted p-4 rounded text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><strong>Account SID:</strong> Required</div>
              <div><strong>API Key:</strong> Required</div>
              <div><strong>API Token:</strong> Required</div>
              <div><strong>Caller ID:</strong> Virtual number</div>
              <div><strong>Subdomain:</strong> api.exotel.com</div>
              <div><strong>Recording:</strong> Optional</div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Features Used</h4>
          <div className="grid grid-cols-2 gap-2">
            {["Click-to-call", "Call logging", "Call recording", "Call duration tracking", "Webhook updates", "Call disposition"].map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {feature}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Webhook Events</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• <code>free</code> - Call initiated</li>
            <li>• <code>ringing</code> - Ringing</li>
            <li>• <code>in-progress</code> - Call connected</li>
            <li>• <code>completed</code> - Call ended successfully</li>
            <li>• <code>failed</code> - Call failed</li>
            <li>• <code>busy</code> - Number busy</li>
            <li>• <code>no-answer</code> - No answer</li>
          </ul>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Exotel WhatsApp Business API</h3>
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">Overview</h4>
          <p className="text-sm text-muted-foreground">
            Unified communication platform - Exotel provides both cloud telephony and WhatsApp Business API through a single integration
          </p>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Configuration</h4>
          <div className="bg-muted p-4 rounded text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><strong>Account SID:</strong> Exotel account identifier</div>
              <div><strong>API Key:</strong> Required</div>
              <div><strong>API Token:</strong> Required</div>
              <div><strong>WhatsApp Source Number:</strong> Registered number</div>
              <div><strong>WABA ID:</strong> WhatsApp Business Account ID</div>
              <div><strong>Webhook URL:</strong> For delivery reports & incoming messages</div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Template Management</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Sync approved templates from Exotel dashboard
          </p>
          <div className="bg-muted p-3 rounded text-xs font-mono">
            <pre>{`POST /sync-exotel-whatsapp-templates`}</pre>
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Message Types</h4>
          <div className="grid grid-cols-2 gap-2">
            {["Template messages", "Session messages (24hr window)", "Text messages", "Media messages", "Interactive buttons", "CTA buttons"].map((type) => (
              <div key={type} className="flex items-center gap-2 text-sm">
                <div className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                {type}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Delivery Status Tracking</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• <code>sent</code> - Message sent to Exotel</li>
            <li>• <code>delivered</code> - Delivered to recipient</li>
            <li>• <code>read</code> - Recipient read the message</li>
            <li>• <code>failed</code> - Delivery failed</li>
          </ul>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Resend (Email Delivery)</h3>
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">Overview</h4>
          <p className="text-sm text-muted-foreground">
            Modern email API for transactional and bulk email sending
          </p>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Configuration</h4>
          <div className="bg-muted p-4 rounded text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><strong>API Key:</strong> Required</div>
              <div><strong>Domain:</strong> Verified sending domain</div>
              <div><strong>DNS Records:</strong> SPF, DKIM, DMARC</div>
              <div><strong>Inbound Route:</strong> For email replies</div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Domain Verification</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Add DNS records to verify domain ownership
          </p>
          <div className="bg-muted p-3 rounded text-xs">
            <div className="mb-2"><strong>SPF Record:</strong> TXT</div>
            <div className="mb-2"><strong>DKIM Keys:</strong> TXT (public key)</div>
            <div><strong>DMARC Policy:</strong> TXT</div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Features</h4>
          <div className="grid grid-cols-2 gap-2">
            {["Single email sending", "Bulk campaigns", "HTML templates", "Email tracking", "Inbound routing", "Reply handling"].map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm">
                <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">IndiaMART (Lead Generation)</h3>
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">Overview</h4>
          <p className="text-sm text-muted-foreground">
            B2B marketplace integration for automatic lead capture
          </p>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Webhook Integration</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Configure IndiaMART to send leads to webhook endpoint
          </p>
          <div className="bg-muted p-3 rounded text-xs font-mono">
            <pre>POST https://your-domain.com/functions/v1/indiamart-webhook</pre>
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Lead Data Captured</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {["Name", "Email", "Phone", "Company", "Product interest", "Message", "Location", "Lead timestamp"].map((field) => (
              <div key={field} className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                {field}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Auto-Processing</h4>
          <p className="text-sm text-muted-foreground">
            Leads automatically create contacts and assign to pipeline stage
          </p>
        </div>
      </div>
    </Card>

    <Card className="p-6 bg-muted/50">
      <h3 className="text-xl font-semibold mb-4">Integration Security</h3>
      <ul className="space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <span className="text-primary">•</span>
          <div><strong>API keys stored in Supabase Vault</strong> - Never in codebase</div>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-primary">•</span>
          <div><strong>Edge functions only</strong> - Backend-to-backend communication</div>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-primary">•</span>
          <div><strong>Rate limiting</strong> - Prevent API abuse</div>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-primary">•</span>
          <div><strong>Webhook token validation</strong> - Verify request authenticity</div>
        </li>
      </ul>
    </Card>
  </div>
);

const Deployment = () => (
  <div className="space-y-8">
    <div>
      <h2 className="text-2xl font-bold mb-4">Deployment Guide</h2>
      <p className="text-muted-foreground mb-6">
        Production deployment on Azure Static Web Apps with Supabase backend
      </p>
    </div>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Architecture Overview</h3>
      <div className="space-y-3">
        <div className="p-4 bg-muted rounded">
          <h4 className="font-semibold mb-2">Frontend</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• <strong>Platform:</strong> Azure Static Web Apps</li>
            <li>• <strong>Build:</strong> Vite (production build)</li>
            <li>• <strong>CDN:</strong> Global edge network</li>
            <li>• <strong>SSL:</strong> Auto-provisioned</li>
          </ul>
        </div>
        
        <div className="p-4 bg-muted rounded">
          <h4 className="font-semibold mb-2">Backend</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• <strong>Database:</strong> Supabase (PostgreSQL)</li>
            <li>• <strong>Functions:</strong> Supabase Edge Functions (Deno)</li>
            <li>• <strong>Auth:</strong> Supabase Auth</li>
            <li>• <strong>Storage:</strong> Supabase Storage</li>
          </ul>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Prerequisites</h3>
      <div className="space-y-2">
        {[
          { item: "Azure Account", desc: "With Static Web Apps access" },
          { item: "Supabase Project", desc: "Production-ready instance" },
          { item: "GitHub Repository", desc: "For CI/CD pipeline" },
          { item: "Custom Domain (Optional)", desc: "DNS management access" }
        ].map((prereq) => (
          <div key={prereq.item} className="flex items-start gap-3 p-3 bg-muted rounded">
            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold">✓</span>
            </div>
            <div>
              <div className="font-semibold text-sm">{prereq.item}</div>
              <div className="text-xs text-muted-foreground">{prereq.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Deployment Steps</h3>
      <div className="space-y-4">
        <div className="border-l-4 border-primary pl-4">
          <h4 className="font-semibold mb-2">1. Frontend Deployment (Azure)</h4>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">Create Azure Static Web App resource</p>
            <div className="bg-muted p-3 rounded font-mono text-xs">
              <pre>{`# Build settings in Azure portal
Build command: npm run build
Output location: dist
App location: /`}</pre>
            </div>
            <p className="text-muted-foreground mt-2">GitHub Actions workflow auto-generated at:</p>
            <code className="text-xs">.github/workflows/azure-static-web-apps-*.yml</code>
          </div>
        </div>

        <div className="border-l-4 border-blue-500 pl-4">
          <h4 className="font-semibold mb-2">2. Supabase Configuration</h4>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">Set environment variables in Azure:</p>
            <div className="bg-muted p-3 rounded font-mono text-xs">
              <pre>{`VITE_SUPABASE_URL=your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id`}</pre>
            </div>
          </div>
        </div>

        <div className="border-l-4 border-green-500 pl-4">
          <h4 className="font-semibold mb-2">3. Deploy Edge Functions</h4>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">Deploy via Supabase CLI:</p>
            <div className="bg-muted p-3 rounded font-mono text-xs">
              <pre>{`supabase login
supabase link --project-ref your-project-id
supabase functions deploy`}</pre>
            </div>
          </div>
        </div>

        <div className="border-l-4 border-orange-500 pl-4">
          <h4 className="font-semibold mb-2">4. Configure Secrets</h4>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">Set secrets in Supabase dashboard:</p>
            <div className="bg-muted p-3 rounded text-xs">
              {["RESEND_API_KEY", "EXOTEL_API_KEY", "EXOTEL_API_TOKEN", "EXOTEL_ACCOUNT_SID", "GEMINI_API_KEY"].map((secret) => (
                <div key={secret} className="font-mono">• {secret}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-l-4 border-purple-500 pl-4">
          <h4 className="font-semibold mb-2">5. Database Migrations</h4>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">Apply all migrations:</p>
            <div className="bg-muted p-3 rounded font-mono text-xs">
              <pre>{`supabase db push`}</pre>
            </div>
          </div>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Custom Domain Setup</h3>
      <div className="space-y-3">
        <div>
          <h4 className="font-semibold text-sm mb-2">Azure Static Web Apps</h4>
          <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
            <li>Navigate to Custom domains in Azure portal</li>
            <li>Add your domain (e.g., app.yourdomain.com)</li>
            <li>Add CNAME record to your DNS:
              <div className="bg-muted p-2 rounded mt-1 font-mono text-xs">
                CNAME app → [generated-url].azurestaticapps.net
              </div>
            </li>
            <li>Wait for SSL certificate (auto-provisioned)</li>
          </ol>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Post-Deployment Checklist</h3>
      <div className="space-y-2">
        {[
          "Verify all environment variables are set",
          "Test authentication flow (sign-up, login, logout)",
          "Verify RLS policies are active",
          "Test edge functions (calling, email, WhatsApp)",
          "Check webhook endpoints are accessible",
          "Verify domain SSL certificate",
          "Test CORS configuration",
          "Monitor edge function logs",
          "Set up error tracking (error_logs table)",
          "Configure backup strategy"
        ].map((item, idx) => (
          <div key={idx} className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" />
            <span className="text-muted-foreground">{item}</span>
          </div>
        ))}
      </div>
    </Card>

    <Card className="p-6 bg-blue-500/10 border-blue-500/50">
      <h3 className="text-xl font-semibold mb-4">Monitoring & Maintenance</h3>
      <div className="space-y-3 text-sm">
        <div>
          <h4 className="font-semibold mb-1">Application Logs</h4>
          <p className="text-muted-foreground">Azure Portal → Log Stream for frontend errors</p>
        </div>
        <div>
          <h4 className="font-semibold mb-1">Edge Function Logs</h4>
          <p className="text-muted-foreground">Supabase Dashboard → Edge Functions → Logs</p>
        </div>
        <div>
          <h4 className="font-semibold mb-1">Database Monitoring</h4>
          <p className="text-muted-foreground">Supabase Dashboard → Database → Query Performance</p>
        </div>
        <div>
          <h4 className="font-semibold mb-1">Error Tracking</h4>
          <p className="text-muted-foreground">Query error_logs table for client-side errors</p>
        </div>
      </div>
    </Card>

    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Scaling Considerations</h3>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <h4 className="font-semibold mb-2">Database</h4>
          <ul className="space-y-1 text-muted-foreground">
            <li>• Connection pooling (pgBouncer)</li>
            <li>• Read replicas for reports</li>
            <li>• Partition large tables by org_id</li>
            <li>• Index optimization</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Edge Functions</h4>
          <ul className="space-y-1 text-muted-foreground">
            <li>• Auto-scale with demand</li>
            <li>• Implement caching strategies</li>
            <li>• Queue processing for campaigns</li>
            <li>• Rate limiting per org</li>
          </ul>
        </div>
      </div>
    </Card>
  </div>
);

export default Documentation;
