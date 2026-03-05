import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Copy, Key, Plus, Trash2, Eye, EyeOff, BookOpen, FileDown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { useOrgData } from "@/hooks/useOrgData";
import { useNotification } from "@/hooks/useNotification";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataTable, Column } from "@/components/common/DataTable";

export default function ApiKeys() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyDescription, setNewKeyDescription] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showGeneratedKey, setShowGeneratedKey] = useState(false);
  const [selectedKeyForDocs, setSelectedKeyForDocs] = useState<any>(null);
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const notification = useNotification();

  // Print documentation as PDF
  const handleExportPDF = () => {
    window.print();
  };

  // Fetch API keys
  const { data: apiKeys, isLoading } = useOrgData<any>('api_keys', {
    orderBy: { column: 'created_at', ascending: false },
  });

  // Fetch usage logs
  const { data: usageLogs } = useOrgData<any>('api_key_usage_logs', {
    select: '*, api_keys(key_name)',
    orderBy: { column: 'created_at', ascending: false },
  });

  // Create API key mutation
  const createKeyMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single();

      if (!profile?.org_id) throw new Error('No organization found');

      // Generate API key
      const { data: keyData, error: keyError } = await supabase.rpc('generate_api_key');
      if (keyError) throw keyError;

      const apiKey = keyData as string;
      const keyPrefix = apiKey.substring(0, 15) + '...';

      // Insert API key
      const { data, error } = await supabase
        .from('api_keys')
        .insert({
          org_id: profile.org_id,
          key_name: newKeyName,
          api_key: apiKey,
          key_prefix: keyPrefix,
          permissions: {
            endpoints: ['contacts', 'activities', 'pipeline-stages', 'custom-fields'],
            description: newKeyDescription
          },
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      return { ...data, full_api_key: apiKey };
    },
    onSuccess: (data) => {
      setGeneratedKey(data.full_api_key);
      setShowGeneratedKey(true);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      notification.success("API Key Created", "Your API key has been generated. Make sure to copy it now!");
      setNewKeyName("");
      setNewKeyDescription("");
    },
    onError: (error) => {
      notification.error("Error creating API key", error);
    },
  });

  // Delete API key mutation
  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      notification.success("API key deleted successfully");
      setDeleteKeyId(null);
    },
    onError: (error) => {
      notification.error("Error deleting API key", error);
    },
  });

  // Toggle API key status
  const toggleKeyMutation = useMutation({
    mutationFn: async ({ keyId, isActive }: { keyId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: !isActive })
        .eq('id', keyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      notification.success("API key status updated");
    },
    onError: (error) => {
      notification.error("Error updating API key", error);
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    notification.success("Copied!", "API key copied to clipboard");
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) {
      notification.error("Please enter a key name");
      return;
    }
    createKeyMutation.mutate();
  };

  const handleCloseCreateDialog = () => {
    setIsCreateDialogOpen(false);
    setGeneratedKey(null);
    setShowGeneratedKey(false);
  };

  return (
    <DashboardLayout>
      <style>
{`
@media print {
  /* Hide navigation and non-documentation elements */
  .no-print, nav, aside, header, footer, button {
    display: none !important;
  }
  
  /* Reset page layout for print */
  body, html {
    margin: 0;
    padding: 0;
  }
  
  /* Show only documentation content */
  .print-content {
    display: block !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 20px !important;
  }
  
  /* Better code block styling for print */
  pre {
    background: #f5f5f5 !important;
    border: 1px solid #ddd !important;
    padding: 12px !important;
    page-break-inside: avoid;
    font-size: 11px !important;
    line-height: 1.4 !important;
  }
  
  code {
    background: #f5f5f5 !important;
    border: 1px solid #ddd !important;
    padding: 2px 4px !important;
    font-size: 11px !important;
  }
  
  /* Improve heading hierarchy for print */
  h1 { font-size: 24px !important; margin-top: 0 !important; }
  h2 { font-size: 20px !important; margin-top: 16px !important; }
  h3 { font-size: 18px !important; margin-top: 14px !important; }
  h4 { font-size: 16px !important; margin-top: 12px !important; }
  
  p, li {
    font-size: 12px !important;
    line-height: 1.5 !important;
  }
  
  /* Avoid page breaks inside important elements */
  .border, .rounded-lg, h1, h2, h3, h4 {
    page-break-inside: avoid;
  }
  
  /* Add page breaks between major sections */
  h3 {
    page-break-before: auto;
  }
  
  /* Remove shadows and backgrounds that don't print well */
  * {
    box-shadow: none !important;
    text-shadow: none !important;
  }
}
`}
      </style>
      <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Manage secure API access to your CRM data
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
              <DialogDescription>
                Generate a new API key for external access to your CRM data
              </DialogDescription>
            </DialogHeader>

            {!generatedKey ? (
              <>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="keyName">Key Name *</Label>
                    <Input
                      id="keyName"
                      placeholder="e.g., Production Bridge"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="What will this key be used for?"
                      value={newKeyDescription}
                      onChange={(e) => setNewKeyDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreateKey}
                    disabled={createKeyMutation.isPending}
                  >
                    {createKeyMutation.isPending ? "Generating..." : "Generate Key"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Make sure to copy your API key now. You won't be able to see it again!
                  </AlertDescription>
                </Alert>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Your API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        value={showGeneratedKey ? generatedKey : '•'.repeat(50)}
                        readOnly
                        className="font-mono"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowGeneratedKey(!showGeneratedKey)}
                      >
                        {showGeneratedKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(generatedKey)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button onClick={handleCloseCreateDialog}>Done</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="keys" className="space-y-4">
        <TabsList>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="usage">Usage Logs</TabsTrigger>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active API Keys</CardTitle>
              <CardDescription>
                Manage your API keys for external integrations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <LoadingState message="Loading API keys..." />
              ) : !apiKeys || apiKeys.length === 0 ? (
                <EmptyState
                  icon={<Key className="h-12 w-12 opacity-50" />}
                  title="No API keys created yet"
                  message="Create your first API key to get started"
                />
              ) : (
                <DataTable
                  data={apiKeys}
                  columns={[
                    { header: 'Name', accessor: 'key_name' },
                    { header: 'Key Prefix', accessor: 'key_prefix', className: 'font-mono text-sm' },
                    {
                      header: 'Status',
                      accessor: (key) => (
                        <StatusBadge 
                          status={key.is_active ? 'active' : 'inactive'} 
                        />
                      ),
                    },
                    {
                      header: 'Last Used',
                      accessor: (key) => (
                        <span className="text-sm">
                          {key.last_used_at
                            ? format(new Date(key.last_used_at), 'MMM dd, yyyy HH:mm')
                            : 'Never'}
                        </span>
                      ),
                    },
                    {
                      header: 'Created',
                      accessor: (key) => (
                        <span className="text-sm">
                          {format(new Date(key.created_at), 'MMM dd, yyyy')}
                        </span>
                      ),
                    },
                  ]}
                  renderActions={(key) => (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedKeyForDocs(key)}
                      >
                        <BookOpen className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          toggleKeyMutation.mutate({
                            keyId: key.id,
                            isActive: key.is_active,
                          })
                        }
                      >
                        {key.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteKeyId(key.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent API Usage</CardTitle>
              <CardDescription>
                Monitor API requests and responses
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!usageLogs || usageLogs.length === 0 ? (
                <EmptyState
                  title="No API usage yet"
                  message="API usage logs will appear here once you start making requests"
                />
              ) : (
                <DataTable
                  data={usageLogs}
                  columns={[
                    {
                      header: 'Timestamp',
                      accessor: (log) => (
                        <span className="text-sm">
                          {format(new Date(log.created_at), 'MMM dd HH:mm:ss')}
                        </span>
                      ),
                    },
                    {
                      header: 'API Key',
                      accessor: (log) => (
                        <span className="text-sm">
                          {log.api_keys?.key_name || 'Unknown'}
                        </span>
                      ),
                    },
                    { header: 'Endpoint', accessor: 'endpoint', className: 'font-mono text-sm' },
                    {
                      header: 'Method',
                      accessor: (log) => <Badge variant="outline">{log.method}</Badge>,
                    },
                    {
                      header: 'Status',
                      accessor: (log) => (
                        <Badge
                          variant={
                            log.status_code >= 200 && log.status_code < 300
                              ? 'default'
                              : 'destructive'
                          }
                        >
                          {log.status_code}
                        </Badge>
                      ),
                    },
                    {
                      header: 'Response Time',
                      accessor: (log) => (
                        <span className="text-sm">
                          {log.response_time_ms ? `${log.response_time_ms}ms` : '-'}
                        </span>
                      ),
                    },
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>API Documentation</CardTitle>
                  <CardDescription>
                    Learn how to use the CRM Bridge API
                  </CardDescription>
                </div>
                <Button
                  onClick={handleExportPDF}
                  variant="outline"
                  className="no-print"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Export as PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <div className="max-w-[1000px] mx-auto">
                <h3 className="text-2xl font-bold mb-6 mt-0 text-foreground">Authentication</h3>
                <p className="text-[15px] leading-relaxed mb-6 text-foreground">Include your API key in the <code className="bg-muted px-2 py-0.5 rounded text-[13px] font-mono text-foreground">X-API-Key</code> header:</p>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`curl -H "X-API-Key: your_api_key_here" \\
  ${supabaseUrl}/functions/v1/crm-bridge-api/contacts`}
                </pre>

                <h3 className="text-2xl font-bold mb-6 mt-8 text-foreground">Base URL</h3>
                <div className="flex items-center gap-2 mb-8">
                  <p className="font-mono text-[14px] bg-[#f4f4f4] dark:bg-[#1e1e1e] p-3 rounded flex-1 text-foreground border border-border">
                    {supabaseUrl}/functions/v1/crm-bridge-api
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(`${supabaseUrl}/functions/v1/crm-bridge-api`)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <h3 className="text-2xl font-bold mb-6 mt-8 text-foreground">Complete Endpoint URLs</h3>
                <div className="space-y-3 mb-8">
                {[
                  { method: 'GET', path: '/contacts', desc: 'List all contacts with filters' },
                  { method: 'GET', path: '/contacts/{id}', desc: 'Get single contact details' },
                  { method: 'POST', path: '/contacts', desc: 'Create new contact' },
                  { method: 'PATCH', path: '/contacts/{id}', desc: 'Update contact' },
                  { method: 'GET', path: '/contacts/{id}/activities', desc: 'Get contact activities' },
                  { method: 'POST', path: '/contacts/{id}/activities', desc: 'Log new activity' },
                  { method: 'GET', path: '/pipeline-stages', desc: 'Get pipeline stages' },
                  { method: 'GET', path: '/custom-fields', desc: 'Get custom fields' },
                  { method: 'GET', path: '/approval-types', desc: 'List approval types' },
                  { method: 'GET', path: '/approval-types/{id}', desc: 'Get single approval type' },
                  { method: 'GET', path: '/approval-rules', desc: 'List approval rules' },
                  { method: 'GET', path: '/approval-rules/{id}', desc: 'Get single approval rule' },
                  { method: 'GET', path: '/approval-rules/evaluate', desc: 'Evaluate approval rule for amount' },
                  { method: 'GET', path: '/users', desc: 'List all users with filters' },
                  { method: 'GET', path: '/users/{id}', desc: 'Get single user details' },
                  { method: 'PATCH', path: '/users/{id}', desc: 'Update user profile' },
                  { method: 'GET', path: '/users/{id}/roles', desc: 'Get user roles' },
                  { method: 'GET', path: '/roles', desc: 'List all user roles in org' },
                  { method: 'POST', path: '/users/{id}/roles', desc: 'Assign role to user' },
                  { method: 'DELETE', path: '/users/{id}/roles/{role_id}', desc: 'Remove role from user' },
                  { method: 'GET', path: '/designations', desc: 'List all designations' },
                  { method: 'GET', path: '/designations/{id}', desc: 'Get single designation' },
                  { method: 'POST', path: '/designations', desc: 'Create new designation' },
                  { method: 'PATCH', path: '/designations/{id}', desc: 'Update designation' },
                  { method: 'DELETE', path: '/designations/{id}', desc: 'Deactivate designation' },
                  { method: 'GET', path: '/designations/{id}/features', desc: 'Get designation feature access' },
                  { method: 'PATCH', path: '/designations/{id}/features', desc: 'Update designation feature access' },
                  { method: 'GET', path: '/blog-posts', desc: 'List or check blog posts' },
                  { method: 'POST', path: '/blog-posts', desc: 'Create new blog post entry' },
                  { method: 'PUT', path: '/blog-posts/{id}', desc: 'Update blog post details' },
                  { method: 'GET', path: '/organizations', desc: 'Get organization details for mobile sync' },
                ].map((endpoint, idx) => (
                    <div key={idx} className="border rounded-lg p-4 bg-muted/20">
                      <div className="flex items-start gap-2 mb-1">
                        <Badge variant="outline" className="mt-0.5">
                          {endpoint.method}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-[13px] break-all text-foreground leading-relaxed">
                            {supabaseUrl}/functions/v1/crm-bridge-api{endpoint.path}
                          </p>
                          <p className="text-[14px] text-foreground mt-2 leading-relaxed">{endpoint.desc}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(`${supabaseUrl}/functions/v1/crm-bridge-api${endpoint.path}`)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                ))}
                </div>

                <h3 className="text-2xl font-bold mb-6 mt-8 text-foreground">API Usage Examples</h3>
                
                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">List Contacts</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`GET /contacts?limit=50&offset=0&status=new&search=john

Response:
{
  "success": true,
  "data": {
    "contacts": [...],
    "pagination": {
      "total": 100,
      "limit": 50,
      "offset": 0,
      "has_more": true
    }
  }
}`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Get Single Contact</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`GET /contacts/{contact_id}`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Create Contact</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`POST /contacts
Content-Type: application/json

{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "company": "Acme Corp"
}`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Update Contact</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`PATCH /contacts/{contact_id}
Content-Type: application/json

{
  "status": "qualified",
  "notes": "Updated information"
}`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Other Endpoints</h4>
                <ul className="space-y-2 mb-8 text-[15px] leading-relaxed text-foreground">
                  <li><code className="bg-muted px-2 py-0.5 rounded text-[13px] font-mono text-foreground">GET /contacts/{"{contact_id}"}/activities</code> - Get contact activities</li>
                  <li><code className="bg-muted px-2 py-0.5 rounded text-[13px] font-mono text-foreground">POST /contacts/{"{contact_id}"}/activities</code> - Log new activity</li>
                  <li><code className="bg-muted px-2 py-0.5 rounded text-[13px] font-mono text-foreground">GET /pipeline-stages</code> - Get all pipeline stages</li>
                  <li><code className="bg-muted px-2 py-0.5 rounded text-[13px] font-mono text-foreground">GET /custom-fields</code> - Get custom field definitions</li>
                </ul>

                <h3 className="text-2xl font-bold mb-6 mt-8 text-foreground">Approval Matrix Endpoints</h3>
                
                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">List Approval Types</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`GET /approval-types?is_active=true

Response:
{
  "success": true,
  "data": {
    "approval_types": [
      {
        "id": "uuid",
        "org_id": "uuid",
        "name": "Purchase Order",
        "description": "Approval for purchase orders",
        "is_active": true,
        "created_at": "2025-01-15T10:30:00Z",
        "updated_at": "2025-10-15T14:20:00Z"
      }
    ]
  }
}`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">List Approval Rules</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`GET /approval-rules?approval_type_id=uuid&limit=50&offset=0

Response:
{
  "success": true,
  "data": {
    "approval_rules": [
      {
        "id": "uuid",
        "approval_type_id": "uuid",
        "name": "Small Purchase",
        "description": "Orders under $1000",
        "threshold_amount": 1000.00,
        "required_roles": ["sales_agent"],
        "approval_flow": [
          {
            "step": 1,
            "role": "sales_agent",
            "role_label": "Sales Agent"
          }
        ],
        "is_active": true,
        "approval_types": {
          "id": "uuid",
          "name": "Purchase Order"
        }
      }
    ],
    "pagination": {
      "total": 5,
      "limit": 50,
      "offset": 0,
      "has_more": false
    }
  }
}`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Evaluate Approval Rule</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`GET /approval-rules/evaluate?approval_type_id=uuid&amount=5000

Response:
{
  "success": true,
  "data": {
    "matched": true,
    "rule": {
      "id": "uuid",
      "name": "Medium Purchase",
      "threshold_amount": 5000.00,
      "approval_flow": [
        {
          "step": 1,
          "role": "sales_manager",
          "role_label": "Sales Manager"
        },
        {
          "step": 2,
          "role": "admin",
          "role_label": "Admin"
        }
      ]
    },
    "approval_type_id": "uuid",
    "amount": 5000
  }
}`}
                </pre>

                <h3 className="text-2xl font-bold mb-6 mt-8 text-foreground">Users & Roles Endpoints</h3>
                
                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">List Users</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`GET /users?limit=50&offset=0&designation_id=uuid&is_active=true&search=john

Response:
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "first_name": "John",
        "last_name": "Doe",
        "phone": "+1234567890",
        "designation_id": "uuid",
        "is_active": true,
        "calling_enabled": true,
        "whatsapp_enabled": true,
        "email_enabled": true,
        "sms_enabled": true,
        "created_at": "2025-01-15T10:30:00Z",
        "updated_at": "2025-10-15T14:20:00Z",
        "roles": [
          {
            "id": "uuid",
            "role": "sales_agent",
            "role_label": "Sales Agent"
          }
        ],
        "designations": {
          "id": "uuid",
          "name": "Senior Sales Executive",
          "role": "sales_agent"
        }
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 50,
      "offset": 0,
      "has_more": false
    }
  }
}`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Get Single User</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`GET /users/{user_id}

Response includes full profile with roles and designation details`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Update User Profile</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`PATCH /users/{user_id}
Content-Type: application/json

{
  "first_name": "Jane",
  "designation_id": "uuid",
  "calling_enabled": true,
  "is_active": true
}

Allowed fields: first_name, last_name, phone, designation_id, is_active,
calling_enabled, whatsapp_enabled, email_enabled, sms_enabled`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">User Roles Management</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`# Get user's roles
GET /users/{user_id}/roles

# List all roles in organization
GET /roles

# Assign role to user
POST /users/{user_id}/roles
Content-Type: application/json

{
  "role": "sales_manager"
}

Available roles: super_admin, admin, sales_manager, sales_agent,
support_manager, support_agent, analyst

# Remove role from user
DELETE /users/{user_id}/roles/{role_id}`}
                </pre>

                <h3 className="text-2xl font-bold mb-6 mt-8 text-foreground">Blog Posts Endpoints</h3>
                
                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Check if Blog Exists</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`GET /blog-posts?blog_url=https://yoursite.com/blog/post-title

Response:
{
  "success": true,
  "data": {
    "blog_posts": [
      {
        "id": "uuid",
        "org_id": "uuid",
        "blog_url": "https://yoursite.com/blog/post-title",
        "blog_title": "Post Title",
        "blog_excerpt": "Post excerpt...",
        "publish_date": "2025-10-20",
        "social_posted": true,
        "email_campaign_sent": true,
        "twitter_url": "https://twitter.com/...",
        "linkedin_url": "https://linkedin.com/...",
        "facebook_url": "https://facebook.com/...",
        "campaign_id": "uuid",
        "status": "posted",
        "created_at": "2025-10-20T10:00:00Z"
      }
    ]
  }
}`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Create Blog Post</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`POST /blog-posts
Content-Type: application/json

{
  "blog_url": "https://yoursite.com/blog/post-title",
  "blog_title": "Your Blog Post Title",
  "blog_excerpt": "Brief excerpt of the blog post...",
  "publish_date": "2025-10-20",
  "social_posted": true,
  "email_campaign_sent": false,
  "twitter_url": "https://twitter.com/status/...",
  "linkedin_url": "https://linkedin.com/post/...",
  "facebook_url": "https://facebook.com/post/...",
  "featured_image_url": "https://yoursite.com/image.jpg",
  "status": "posted"
}

Response (201 Created):
{
  "success": true,
  "data": {
    "id": "uuid",
    "org_id": "uuid",
    "blog_url": "https://yoursite.com/blog/post-title",
    "blog_title": "Your Blog Post Title",
    ... (blog post details)
  }
}

Note: Database trigger will automatically create email campaign and send to all contacts`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Update Blog Post</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`PUT /blog-posts/{blog_id}
Content-Type: application/json

{
  "campaign_id": "uuid",
  "email_campaign_sent": true,
  "status": "completed"
}`}
                </pre>

                <h3 className="text-2xl font-bold mb-6 mt-8 text-foreground">Designations Endpoints</h3>
                
                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">List Designations</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`GET /designations?is_active=true

Response:
{
  "success": true,
  "data": {
    "designations": [
      {
        "id": "uuid",
        "org_id": "uuid",
        "name": "Senior Sales Executive",
        "description": "Handles major accounts",
        "role": "sales_agent",
        "role_label": "Sales Agent",
        "is_active": true,
        "created_at": "2025-01-15T10:30:00Z",
        "updated_at": "2025-10-15T14:20:00Z"
      }
    ]
  }
}`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Create Designation</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`POST /designations
Content-Type: application/json

{
  "name": "Sales Executive",
  "description": "Handles sales operations",
  "role": "sales_agent",
  "is_active": true
}`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Update Designation</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`PATCH /designations/{designation_id}
Content-Type: application/json

{
  "name": "Senior Sales Executive",
  "description": "Updated description"
}`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-6 text-foreground">Designation Feature Access</h4>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`# Get feature access for designation
GET /designations/{designation_id}/features

Response:
{
  "success": true,
  "data": {
    "feature_access": [
      {
        "id": "uuid",
        "designation_id": "uuid",
        "feature_key": "contacts",
        "can_view": true,
        "can_create": true,
        "can_edit": true,
        "can_delete": false,
        "custom_permissions": {},
        "feature_permissions": {
          "feature_key": "contacts",
          "feature_name": "Contacts",
          "category": "core"
        }
      }
    ]
  }
}

# Update feature access
PATCH /designations/{designation_id}/features
Content-Type: application/json

{
  "feature_key": "contacts",
  "can_view": true,
  "can_create": true,
  "can_edit": true,
  "can_delete": false,
  "custom_permissions": {}
}`}
              </pre>

              <div className="max-w-4xl">
                <h3 className="text-2xl font-bold mb-4 mt-8 text-foreground">Organizations Endpoint</h3>
                <p className="mb-6 text-foreground leading-relaxed text-[15px]">
                  Retrieve organization configuration data for mobile app synchronization and offline caching. This endpoint is designed specifically for mobile applications to fetch organization settings, branding, and feature flags.
                </p>

                <h4 className="text-xl font-semibold mb-3 mt-8 text-foreground">Get Organization Details</h4>
                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground">
{`GET /organizations

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "logo_url": "https://example.com/logo.png",
    "primary_color": "#3B82F6",
    "settings": {
      "timezone": "Asia/Kolkata",
      "date_format": "DD/MM/YYYY",
      "currency": "INR"
    },
    "usage_limits": {
      "max_users": 50,
      "max_contacts": 10000,
      "max_storage_gb": 10
    },
    "subscription_active": true,
    "services_enabled": {
      "calling": true,
      "whatsapp": true,
      "email": true,
      "apollo": false
    },
    "max_automation_emails_per_day": 1000,
    "apollo_config": {
      "api_key": null,
      "enabled": false,
      "daily_credit_limit": 0
    },
    "created_at": "2025-01-10T08:00:00Z",
    "updated_at": "2025-10-15T12:30:00Z"
  }
}`}
                </pre>

                <h4 className="text-xl font-semibold mb-4 mt-8 text-foreground">Field Descriptions</h4>
                <div className="space-y-4 my-6">
                  <div className="border-l-4 border-primary pl-4 py-2 bg-muted/30">
                    <p className="font-mono text-[14px] font-bold text-foreground">id</p>
                    <p className="text-[15px] text-foreground leading-relaxed mt-1">Unique organization identifier (UUID)</p>
                  </div>
                  <div className="border-l-4 border-primary pl-4 py-2 bg-muted/30">
                    <p className="font-mono text-[14px] font-bold text-foreground">name</p>
                    <p className="text-[15px] text-foreground leading-relaxed mt-1">Organization display name</p>
                  </div>
                  <div className="border-l-4 border-primary pl-4 py-2 bg-muted/30">
                    <p className="font-mono text-[14px] font-bold text-foreground">slug</p>
                    <p className="text-[15px] text-foreground leading-relaxed mt-1">URL-friendly organization identifier</p>
                  </div>
                  <div className="border-l-4 border-primary pl-4 py-2 bg-muted/30">
                    <p className="font-mono text-[14px] font-bold text-foreground">logo_url</p>
                    <p className="text-[15px] text-foreground leading-relaxed mt-1">Organization logo URL for branding (nullable)</p>
                  </div>
                  <div className="border-l-4 border-primary pl-4 py-2 bg-muted/30">
                    <p className="font-mono text-[14px] font-bold text-foreground">primary_color</p>
                    <p className="text-[15px] text-foreground leading-relaxed mt-1">Brand color in hex format (nullable)</p>
                  </div>
                  <div className="border-l-4 border-primary pl-4 py-2 bg-muted/30">
                    <p className="font-mono text-[14px] font-bold text-foreground">settings</p>
                    <p className="text-[15px] text-foreground leading-relaxed mt-1">Organization preferences (timezone, date format, currency)</p>
                  </div>
                  <div className="border-l-4 border-primary pl-4 py-2 bg-muted/30">
                    <p className="font-mono text-[14px] font-bold text-foreground">usage_limits</p>
                    <p className="text-[15px] text-foreground leading-relaxed mt-1">Subscription tier limits for users, contacts, and storage</p>
                  </div>
                  <div className="border-l-4 border-primary pl-4 py-2 bg-muted/30">
                    <p className="font-mono text-[14px] font-bold text-foreground">subscription_active</p>
                    <p className="text-[15px] text-foreground leading-relaxed mt-1">Boolean indicating if subscription is active</p>
                  </div>
                  <div className="border-l-4 border-primary pl-4 py-2 bg-muted/30">
                    <p className="font-mono text-[14px] font-bold text-foreground">services_enabled</p>
                    <p className="text-[15px] text-foreground leading-relaxed mt-1">Object showing which services are enabled (calling, WhatsApp, email, Apollo)</p>
                  </div>
                  <div className="border-l-4 border-primary pl-4 py-2 bg-muted/30">
                    <p className="font-mono text-[14px] font-bold text-foreground">max_automation_emails_per_day</p>
                    <p className="text-[15px] text-foreground leading-relaxed mt-1">Daily limit for automated email campaigns</p>
                  </div>
                  <div className="border-l-4 border-primary pl-4 py-2 bg-muted/30">
                    <p className="font-mono text-[14px] font-bold text-foreground">apollo_config</p>
                    <p className="text-[15px] text-foreground leading-relaxed mt-1">Apollo.io integration settings and credit limits</p>
                  </div>
                </div>

                <h4 className="text-xl font-semibold mb-3 mt-8 text-foreground">Mobile Integration Example</h4>
                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground">
{`// React Native / JavaScript Example
const syncOrganization = async () => {
  try {
    const response = await fetch(
      '${supabaseUrl}/functions/v1/crm-bridge-api/organizations',
      {
        method: 'GET',
        headers: {
          'x-api-key': 'your_api_key_here',
          'Content-Type': 'application/json'
        }
      }
    );
    
    const result = await response.json();
    
    if (result.success) {
      // Cache organization config for 24 hours
      await AsyncStorage.setItem(
        'org_config', 
        JSON.stringify(result.data)
      );
      await AsyncStorage.setItem(
        'org_config_timestamp', 
        Date.now().toString()
      );
      
      // Apply branding
      if (result.data.primary_color) {
        applyThemeColor(result.data.primary_color);
      }
      
      // Configure available features
      configureAppFeatures(result.data.services_enabled);
      
      return result.data;
    }
  } catch (error) {
    console.error('Organization sync failed:', error);
    // Fall back to cached data
    const cached = await AsyncStorage.getItem('org_config');
    return cached ? JSON.parse(cached) : null;
  }
};

// Call on app startup
useEffect(() => {
  syncOrganization();
}, []);`}
              </pre>

                <h4 className="text-xl font-semibold mb-4 mt-8 text-foreground">Use Cases</h4>
                <ul className="list-disc list-inside space-y-3 my-6 text-foreground leading-relaxed text-[15px]">
                  <li><strong className="font-semibold">App Startup Configuration:</strong> Load organization branding, colors, and logo on app launch</li>
                  <li><strong className="font-semibold">Subscription Validation:</strong> Check subscription_active before enabling premium features</li>
                  <li><strong className="font-semibold">Feature Availability:</strong> Use services_enabled to show/hide calling, WhatsApp, email features</li>
                  <li><strong className="font-semibold">Theme Synchronization:</strong> Apply primary_color to app theme for consistent branding</li>
                  <li><strong className="font-semibold">Settings Display:</strong> Show organization preferences (timezone, currency, date format)</li>
                  <li><strong className="font-semibold">Usage Limits:</strong> Display current plan limits to users</li>
                  <li><strong className="font-semibold">Offline Support:</strong> Cache data locally for offline access with periodic syncing</li>
                </ul>

                <h4 className="text-xl font-semibold mb-4 mt-8 text-foreground">Best Practices</h4>
                <ul className="list-disc list-inside space-y-3 my-6 text-foreground leading-relaxed text-[15px]">
                  <li><strong className="font-semibold">Cache Duration:</strong> Cache organization data locally for 24 hours to minimize API calls</li>
                  <li><strong className="font-semibold">Sync Timing:</strong> Refresh on app startup, after user login, or on manual refresh</li>
                  <li><strong className="font-semibold">Error Handling:</strong> Fall back to cached data if sync fails (offline mode)</li>
                  <li><strong className="font-semibold">Feature Gating:</strong> Check subscription_active and services_enabled before showing features</li>
                  <li><strong className="font-semibold">Branding Application:</strong> Apply logo_url and primary_color immediately after sync</li>
                  <li><strong className="font-semibold">Security:</strong> Store API keys securely using platform-specific secure storage (Keychain/Keystore)</li>
                  <li><strong className="font-semibold">Background Sync:</strong> Consider background refresh to keep data current without user intervention</li>
                </ul>

                <h3 className="text-2xl font-bold mb-6 mt-12 text-foreground border-t-2 border-border pt-8">API Schema Reference</h3>
                <p className="mb-8 text-foreground leading-relaxed text-[15px]">
                  Complete JSON response schemas for all API endpoints, organized by implementation priority for mobile app development.
                </p>

                {/* HIGH PRIORITY SCHEMAS - PHASE 0 */}
                <div className="bg-accent/5 border-l-4 border-accent p-6 mb-8 rounded-r-lg">
                  <h4 className="text-xl font-bold mb-2 text-foreground">Phase 0: High Priority Schemas</h4>
                  <p className="text-[14px] text-muted-foreground">Essential endpoints needed immediately for mobile app core functionality</p>
                </div>

                {/* GET /organizations */}
                <h4 className="text-xl font-semibold mb-4 mt-8 text-foreground">GET /organizations</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">Retrieve a list of all organizations in the platform (cross-tenant access for org selection).</p>
                
                <div className="overflow-x-auto mb-6">
                  <table className="min-w-full border border-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Field</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Type</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Required</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Unique organization identifier</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">name</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Organization display name</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">slug</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">URL-friendly identifier</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">logo_url</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Organization logo URL</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">primary_color</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Brand color (hex format)</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">settings</td><td className="border border-border px-4 py-2">json</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Organization preferences</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">usage_limits</td><td className="border border-border px-4 py-2">json</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Subscription tier limits</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">subscription_active</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Subscription status</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">services_enabled</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Services activation flag</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">max_automation_emails_per_day</td><td className="border border-border px-4 py-2">integer</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Daily email limit</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">apollo_config</td><td className="border border-border px-4 py-2">json</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Apollo integration settings</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">created_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Creation timestamp</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">updated_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Last update timestamp</td></tr>
                    </tbody>
                  </table>
                </div>

                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": true,
  "data": {
    "organizations": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Acme Corporation",
        "slug": "acme-corp",
        "logo_url": "https://example.com/logo.png",
        "primary_color": "#3B82F6",
        "settings": {
          "timezone": "Asia/Kolkata",
          "date_format": "DD/MM/YYYY",
          "currency": "INR"
        },
        "usage_limits": {
          "users": 50,
          "storage_gb": 10
        },
        "subscription_active": true,
        "services_enabled": true,
        "max_automation_emails_per_day": 1000,
        "apollo_config": {
          "enrich_on_create": false,
          "auto_enrich_enabled": false
        },
        "created_at": "2025-01-10T08:00:00Z",
        "updated_at": "2025-11-10T12:30:00Z"
      },
      {
        "id": "660f9511-f3ac-42e5-b827-557766551111",
        "name": "TechStart Inc",
        "slug": "techstart",
        "logo_url": "https://example.com/techstart-logo.png",
        "primary_color": "#10B981",
        "settings": {
          "timezone": "America/New_York",
          "date_format": "MM/DD/YYYY",
          "currency": "USD"
        },
        "usage_limits": {
          "users": 25,
          "storage_gb": 5
        },
        "subscription_active": true,
        "services_enabled": true,
        "max_automation_emails_per_day": 500,
        "apollo_config": null,
        "created_at": "2025-02-15T10:00:00Z",
        "updated_at": "2025-11-08T14:20:00Z"
      }
    ]
  },
  "meta": {
    "timestamp": "2025-11-12T10:00:00Z",
    "request_id": "req_abc123xyz"
  }
}`}
                </pre>

                {/* GET /contacts */}
                <h4 className="text-xl font-semibold mb-4 mt-10 text-foreground">GET /contacts</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">List all contacts with optional filtering and pagination.</p>
                <p className="mb-4 text-[14px] text-muted-foreground"><strong>Query Parameters:</strong> limit, offset, status, assigned_to, pipeline_stage_id, search</p>
                
                <div className="overflow-x-auto mb-6">
                  <table className="min-w-full border border-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Field</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Type</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Required</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Contact identifier</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">first_name</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">First name</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">last_name</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Last name</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">email</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Primary email address</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">phone</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Primary phone number</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">company</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Company name</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">job_title</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Job title</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">status</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Contact status (new, contacted, qualified, etc.)</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">pipeline_stage_id</td><td className="border border-border px-4 py-2">uuid | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Current pipeline stage</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">assigned_to</td><td className="border border-border px-4 py-2">uuid | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Assigned user ID</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">address</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Street address</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">city</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">City</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">state</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">State/Province</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">country</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Country</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">postal_code</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Postal/ZIP code</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">latitude</td><td className="border border-border px-4 py-2">number | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Geographic latitude</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">longitude</td><td className="border border-border px-4 py-2">number | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Geographic longitude</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">linkedin_url</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">LinkedIn profile URL</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">website</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Website URL</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">notes</td><td className="border border-border px-4 py-2">text | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Internal notes</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">source</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Lead source</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">enrichment_status</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Apollo enrichment status</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">last_enriched_at</td><td className="border border-border px-4 py-2">timestamp | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Last enrichment date</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">organization_name</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Organization name (enriched)</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">created_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Creation timestamp</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">updated_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Last update timestamp</td></tr>
                    </tbody>
                  </table>
                </div>

                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": true,
  "data": {
    "contacts": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "first_name": "John",
        "last_name": "Doe",
        "email": "john.doe@example.com",
        "phone": "+1234567890",
        "company": "Acme Corp",
        "job_title": "Sales Manager",
        "status": "qualified",
        "pipeline_stage_id": "550e8400-e29b-41d4-a716-446655440001",
        "assigned_to": "660f9511-f39c-52e5-b827-557766551111",
        "address": "123 Main St",
        "city": "New York",
        "state": "NY",
        "country": "USA",
        "postal_code": "10001",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "linkedin_url": "https://linkedin.com/in/johndoe",
        "website": "https://example.com",
        "notes": "Interested in enterprise plan",
        "source": "Website",
        "enrichment_status": "enriched",
        "last_enriched_at": "2025-11-01T10:00:00Z",
        "organization_name": "Acme Corporation",
        "created_at": "2025-10-15T09:30:00Z",
        "updated_at": "2025-11-10T14:20:00Z"
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 50,
      "offset": 0,
      "has_more": true
    }
  }
}`}
                </pre>

                {/* GET /contacts/{id} */}
                <h4 className="text-xl font-semibold mb-4 mt-10 text-foreground">GET /contacts/{"{id}"}</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">Get detailed contact information including related emails, phones, and custom fields.</p>
                
                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "+1234567890",
    "company": "Acme Corp",
    "job_title": "Sales Manager",
    "status": "qualified",
    "pipeline_stage_id": "550e8400-e29b-41d4-a716-446655440001",
    "emails": [
      {
        "id": "770g0622-g40d-63f6-c938-668877662222",
        "email": "john.doe@example.com",
        "email_type": "work",
        "is_primary": true
      },
      {
        "id": "880h1733-h51e-74g7-d049-779988773333",
        "email": "john.personal@gmail.com",
        "email_type": "personal",
        "is_primary": false
      }
    ],
    "phones": [
      {
        "id": "990i2844-i62f-85h8-e150-880099884444",
        "phone": "+1234567890",
        "phone_type": "mobile",
        "is_primary": true
      }
    ],
    "custom_fields": {
      "industry": "Technology",
      "company_size": "50-200",
      "budget": "$50000"
    },
    "pipeline_stage": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Qualified",
      "stage_order": 2,
      "probability": 50
    },
    "created_at": "2025-10-15T09:30:00Z",
    "updated_at": "2025-11-10T14:20:00Z"
  }
}`}
                </pre>

                {/* GET /users */}
                <h4 className="text-xl font-semibold mb-4 mt-10 text-foreground">GET /users</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">List all users with roles and designation details.</p>
                <p className="mb-4 text-[14px] text-muted-foreground"><strong>Query Parameters:</strong> limit, offset, is_active, designation_id, search</p>
                
                <div className="overflow-x-auto mb-6">
                  <table className="min-w-full border border-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Field</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Type</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Required</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">User identifier</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">email</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">User email address</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">first_name</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">First name</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">last_name</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Last name</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">phone</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Phone number</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">avatar_url</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Profile picture URL</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">designation_id</td><td className="border border-border px-4 py-2">uuid | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Designation reference</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">org_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Organization ID</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">is_active</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Account active status</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">is_platform_admin</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Platform admin flag</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">calling_enabled</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Voice calling permission</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">email_enabled</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Email sending permission</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">whatsapp_enabled</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">WhatsApp permission</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">sms_enabled</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">SMS permission</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">onboarding_completed</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Onboarding status</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">created_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Creation timestamp</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">updated_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Last update timestamp</td></tr>
                    </tbody>
                  </table>
                </div>

                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": true,
  "data": {
    "users": [
      {
        "id": "660f9511-f39c-52e5-b827-557766551111",
        "email": "jane.smith@acme.com",
        "first_name": "Jane",
        "last_name": "Smith",
        "phone": "+1234567891",
        "avatar_url": "https://example.com/avatar.jpg",
        "designation_id": "aa0g0622-g40d-63f6-c938-668877662222",
        "org_id": "550e8400-e29b-41d4-a716-446655440000",
        "is_active": true,
        "is_platform_admin": false,
        "calling_enabled": true,
        "email_enabled": true,
        "whatsapp_enabled": true,
        "sms_enabled": false,
        "onboarding_completed": true,
        "roles": [
          {
            "id": "bb1h1733-h51e-74g7-d049-779988773333",
            "role": "sales_agent",
            "is_active": true
          }
        ],
        "designation": {
          "id": "aa0g0622-g40d-63f6-c938-668877662222",
          "name": "Senior Sales Executive",
          "role": "sales_agent"
        },
        "created_at": "2025-10-01T08:00:00Z",
        "updated_at": "2025-11-10T10:15:00Z"
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 50,
      "offset": 0,
      "has_more": false
    }
  }
}`}
                </pre>

                {/* GET /roles */}
                <h4 className="text-xl font-semibold mb-4 mt-10 text-foreground">GET /roles</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">List all user roles in the organization.</p>
                
                <div className="overflow-x-auto mb-6">
                  <table className="min-w-full border border-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Field</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Type</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Required</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Role assignment ID</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">user_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Associated user ID</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">org_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Organization ID</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">role</td><td className="border border-border px-4 py-2">enum</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Role type (super_admin, admin, sales_manager, sales_agent, support_manager, support_agent, analyst)</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">is_active</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Role active status</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">created_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Role assignment date</td></tr>
                    </tbody>
                  </table>
                </div>

                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": true,
  "data": {
    "roles": [
      {
        "id": "bb1h1733-h51e-74g7-d049-779988773333",
        "user_id": "660f9511-f39c-52e5-b827-557766551111",
        "org_id": "550e8400-e29b-41d4-a716-446655440000",
        "role": "sales_agent",
        "is_active": true,
        "created_at": "2025-10-01T08:00:00Z"
      }
    ]
  }
}`}
                </pre>

                {/* MEDIUM PRIORITY SCHEMAS - PHASE 1 */}
                <div className="bg-primary/5 border-l-4 border-primary p-6 mb-8 mt-12 rounded-r-lg">
                  <h4 className="text-xl font-bold mb-2 text-foreground">Phase 1: Medium Priority Schemas</h4>
                  <p className="text-[14px] text-muted-foreground">Required for full CRM functionality and workflow management</p>
                </div>

                {/* GET /pipeline-stages */}
                <h4 className="text-xl font-semibold mb-4 mt-8 text-foreground">GET /pipeline-stages</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">List all pipeline stages for opportunity management.</p>
                
                <div className="overflow-x-auto mb-6">
                  <table className="min-w-full border border-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Field</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Type</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Required</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Stage identifier</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">name</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Stage display name</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">description</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Stage description</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">stage_order</td><td className="border border-border px-4 py-2">integer</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Order in pipeline (0-based)</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">color</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">UI color indicator</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">probability</td><td className="border border-border px-4 py-2">number | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Win probability (0-100)</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">is_active</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Active status</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">org_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Organization ID</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">created_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Creation timestamp</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">updated_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Last update timestamp</td></tr>
                    </tbody>
                  </table>
                </div>

                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": true,
  "data": {
    "pipeline_stages": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "name": "New Lead",
        "description": "Initial contact stage",
        "stage_order": 0,
        "color": "#6366F1",
        "probability": 10,
        "is_active": true,
        "org_id": "550e8400-e29b-41d4-a716-446655440000",
        "created_at": "2025-10-01T08:00:00Z",
        "updated_at": "2025-10-05T12:30:00Z"
      },
      {
        "id": "550e8400-e29b-41d4-a716-446655440002",
        "name": "Qualified",
        "description": "Qualified prospect",
        "stage_order": 1,
        "color": "#8B5CF6",
        "probability": 50,
        "is_active": true,
        "org_id": "550e8400-e29b-41d4-a716-446655440000",
        "created_at": "2025-10-01T08:00:00Z",
        "updated_at": "2025-10-05T12:30:00Z"
      }
    ]
  }
}`}
                </pre>

                {/* GET /custom-fields */}
                <h4 className="text-xl font-semibold mb-4 mt-10 text-foreground">GET /custom-fields</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">Get custom field definitions for extending contact data.</p>
                
                <div className="overflow-x-auto mb-6">
                  <table className="min-w-full border border-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Field</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Type</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Required</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Custom field identifier</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">field_name</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">System name (snake_case)</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">field_label</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Display label</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">field_type</td><td className="border border-border px-4 py-2">enum</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Field type (text, number, date, select, multiselect, checkbox)</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">field_options</td><td className="border border-border px-4 py-2">json | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Options for select fields</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">applies_to_table</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Target table (contacts, leads)</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">field_order</td><td className="border border-border px-4 py-2">integer</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Display order</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">is_required</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Required field flag</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">is_active</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Active status</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">org_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Organization ID</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">created_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Creation timestamp</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">updated_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Last update timestamp</td></tr>
                    </tbody>
                  </table>
                </div>

                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": true,
  "data": {
    "custom_fields": [
      {
        "id": "cc2i3955-i73g-96i9-f261-991100995555",
        "field_name": "industry",
        "field_label": "Industry",
        "field_type": "select",
        "field_options": [
          { "value": "technology", "label": "Technology" },
          { "value": "finance", "label": "Finance" },
          { "value": "healthcare", "label": "Healthcare" }
        ],
        "applies_to_table": "contacts",
        "field_order": 1,
        "is_required": false,
        "is_active": true,
        "org_id": "550e8400-e29b-41d4-a716-446655440000",
        "created_at": "2025-10-01T08:00:00Z",
        "updated_at": "2025-10-15T10:20:00Z"
      }
    ]
  }
}`}
                </pre>

                {/* GET /contacts/{id}/activities */}
                <h4 className="text-xl font-semibold mb-4 mt-10 text-foreground">GET /contacts/{"{id}"}/activities</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">Get all activities for a specific contact.</p>
                
                <div className="overflow-x-auto mb-6">
                  <table className="min-w-full border border-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Field</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Type</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Required</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Activity identifier</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">contact_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Associated contact</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">activity_type</td><td className="border border-border px-4 py-2">enum</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Type (call, meeting, email, task, note, checkin)</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">subject</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Activity title/subject</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">description</td><td className="border border-border px-4 py-2">text | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Detailed description</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">scheduled_at</td><td className="border border-border px-4 py-2">timestamp | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Scheduled time</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">completed_at</td><td className="border border-border px-4 py-2">timestamp | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Completion time</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">duration_minutes</td><td className="border border-border px-4 py-2">integer | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Activity duration</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">call_disposition_id</td><td className="border border-border px-4 py-2">uuid | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Call outcome (for calls)</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">call_duration</td><td className="border border-border px-4 py-2">integer | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Call duration (seconds)</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">meeting_link</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Meeting URL (for meetings)</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">meeting_platform</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Platform (zoom, google_meet, teams)</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">check_in_latitude</td><td className="border border-border px-4 py-2">number | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Check-in location latitude</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">check_in_longitude</td><td className="border border-border px-4 py-2">number | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Check-in location longitude</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">created_by</td><td className="border border-border px-4 py-2">uuid | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Creator user ID</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">org_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Organization ID</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">created_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Creation timestamp</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">updated_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Last update timestamp</td></tr>
                    </tbody>
                  </table>
                </div>

                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": true,
  "data": {
    "activities": [
      {
        "id": "dd3j4066-j84h-07j0-g372-002211006666",
        "contact_id": "123e4567-e89b-12d3-a456-426614174000",
        "activity_type": "call",
        "subject": "Initial Discovery Call",
        "description": "Discussed project requirements and budget",
        "scheduled_at": "2025-11-10T10:00:00Z",
        "completed_at": "2025-11-10T10:30:00Z",
        "duration_minutes": 30,
        "call_disposition_id": "ee4k5177-k95i-18k1-h483-113322117777",
        "call_duration": 1800,
        "meeting_link": null,
        "meeting_platform": null,
        "check_in_latitude": null,
        "check_in_longitude": null,
        "created_by": "660f9511-f39c-52e5-b827-557766551111",
        "org_id": "550e8400-e29b-41d4-a716-446655440000",
        "created_at": "2025-11-10T09:45:00Z",
        "updated_at": "2025-11-10T10:30:00Z"
      },
      {
        "id": "ff5l6288-l06j-29l2-i594-224433228888",
        "contact_id": "123e4567-e89b-12d3-a456-426614174000",
        "activity_type": "meeting",
        "subject": "Product Demo",
        "description": "Demo of CRM features",
        "scheduled_at": "2025-11-15T14:00:00Z",
        "completed_at": null,
        "duration_minutes": 60,
        "call_disposition_id": null,
        "call_duration": null,
        "meeting_link": "https://meet.google.com/abc-defg-hij",
        "meeting_platform": "google_meet",
        "check_in_latitude": null,
        "check_in_longitude": null,
        "created_by": "660f9511-f39c-52e5-b827-557766551111",
        "org_id": "550e8400-e29b-41d4-a716-446655440000",
        "created_at": "2025-11-10T16:20:00Z",
        "updated_at": "2025-11-10T16:20:00Z"
      }
    ]
  }
}`}
                </pre>

                {/* POST /contacts/{id}/activities */}
                <h4 className="text-xl font-semibold mb-4 mt-10 text-foreground">POST /contacts/{"{id}"}/activities</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">Create a new activity for a contact.</p>
                <p className="mb-4 text-[14px] text-muted-foreground"><strong>Required Fields:</strong> activity_type, contact_id</p>
                <p className="mb-4 text-[14px] text-muted-foreground"><strong>Optional by Type:</strong></p>
                <ul className="list-disc list-inside mb-6 text-[14px] text-muted-foreground space-y-1">
                  <li><strong>Calls:</strong> call_disposition_id, call_duration, subject, description</li>
                  <li><strong>Meetings:</strong> scheduled_at, meeting_link, meeting_platform, duration_minutes, subject, description</li>
                  <li><strong>Tasks:</strong> subject, description, scheduled_at</li>
                  <li><strong>Notes:</strong> description, subject</li>
                  <li><strong>Check-ins:</strong> check_in_latitude, check_in_longitude, description</li>
                </ul>

                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`// Request Body - Call Activity
{
  "activity_type": "call",
  "subject": "Follow-up Call",
  "description": "Discussed pricing options",
  "call_disposition_id": "ee4k5177-k95i-18k1-h483-113322117777",
  "call_duration": 900,
  "completed_at": "2025-11-10T15:30:00Z"
}

// Request Body - Meeting Activity
{
  "activity_type": "meeting",
  "subject": "Quarterly Business Review",
  "scheduled_at": "2025-11-20T10:00:00Z",
  "meeting_link": "https://zoom.us/j/123456789",
  "meeting_platform": "zoom",
  "duration_minutes": 60
}

// Response (201 Created)
{
  "success": true,
  "data": {
    "id": "gg6m7399-m17k-30m3-j605-335544339999",
    "contact_id": "123e4567-e89b-12d3-a456-426614174000",
    "activity_type": "call",
    "subject": "Follow-up Call",
    "description": "Discussed pricing options",
    "completed_at": "2025-11-10T15:30:00Z",
    "created_at": "2025-11-10T15:35:00Z",
    "updated_at": "2025-11-10T15:35:00Z"
  }
}`}
                </pre>

                {/* LOWER PRIORITY SCHEMAS - PHASE 2 */}
                <div className="bg-secondary/30 border-l-4 border-secondary p-6 mb-8 mt-12 rounded-r-lg">
                  <h4 className="text-xl font-bold mb-2 text-foreground">Phase 2: Lower Priority Schemas</h4>
                  <p className="text-[14px] text-muted-foreground">Additional features for advanced workflow and permissions management</p>
                </div>

                {/* GET /approval-types */}
                <h4 className="text-xl font-semibold mb-4 mt-8 text-foreground">GET /approval-types</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">List approval type definitions for workflow automation.</p>
                
                <div className="overflow-x-auto mb-6">
                  <table className="min-w-full border border-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Field</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Type</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Required</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Approval type identifier</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">name</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Type name</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">description</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Type description</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">is_active</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Active status</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">org_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Organization ID</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">created_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Creation timestamp</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">updated_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Last update timestamp</td></tr>
                    </tbody>
                  </table>
                </div>

                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": true,
  "data": {
    "approval_types": [
      {
        "id": "hh7n8400-n28l-41n4-k716-446655440000",
        "name": "Purchase Order",
        "description": "Approval workflow for purchase orders",
        "is_active": true,
        "org_id": "550e8400-e29b-41d4-a716-446655440000",
        "created_at": "2025-10-01T08:00:00Z",
        "updated_at": "2025-10-15T12:30:00Z"
      }
    ]
  }
}`}
                </pre>

                {/* GET /approval-rules */}
                <h4 className="text-xl font-semibold mb-4 mt-10 text-foreground">GET /approval-rules</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">List approval rules with threshold amounts and required roles.</p>
                
                <div className="overflow-x-auto mb-6">
                  <table className="min-w-full border border-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Field</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Type</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Required</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Rule identifier</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">approval_type_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Associated approval type</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">name</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Rule name</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">description</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Rule description</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">threshold_amount</td><td className="border border-border px-4 py-2">number | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Trigger amount threshold</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">required_roles</td><td className="border border-border px-4 py-2">array</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Roles that can approve</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">approval_flow</td><td className="border border-border px-4 py-2">json</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Multi-step approval flow</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">is_active</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Active status</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">org_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Organization ID</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">created_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Creation timestamp</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">updated_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Last update timestamp</td></tr>
                    </tbody>
                  </table>
                </div>

                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": true,
  "data": {
    "approval_rules": [
      {
        "id": "ii8o9511-o39m-52o5-l827-557766551111",
        "approval_type_id": "hh7n8400-n28l-41n4-k716-446655440000",
        "name": "Small Purchase",
        "description": "Orders under $1000",
        "threshold_amount": 1000.00,
        "required_roles": ["sales_agent"],
        "approval_flow": [
          {
            "step": 1,
            "role": "sales_agent",
            "role_label": "Sales Agent"
          }
        ],
        "is_active": true,
        "org_id": "550e8400-e29b-41d4-a716-446655440000",
        "created_at": "2025-10-01T08:00:00Z",
        "updated_at": "2025-10-15T12:30:00Z"
      }
    ]
  }
}`}
                </pre>

                {/* GET /designations */}
                <h4 className="text-xl font-semibold mb-4 mt-10 text-foreground">GET /designations</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">List all designations (job roles) in the organization.</p>
                
                <div className="overflow-x-auto mb-6">
                  <table className="min-w-full border border-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Field</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Type</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Required</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Designation identifier</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">name</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Designation name</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">description</td><td className="border border-border px-4 py-2">string | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Description</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">role</td><td className="border border-border px-4 py-2">enum</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Associated role type</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">is_active</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Active status</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">org_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Organization ID</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">created_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Creation timestamp</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">updated_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Last update timestamp</td></tr>
                    </tbody>
                  </table>
                </div>

                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": true,
  "data": {
    "designations": [
      {
        "id": "aa0g0622-g40d-63f6-c938-668877662222",
        "name": "Senior Sales Executive",
        "description": "Handles major accounts and enterprise clients",
        "role": "sales_agent",
        "is_active": true,
        "org_id": "550e8400-e29b-41d4-a716-446655440000",
        "created_at": "2025-10-01T08:00:00Z",
        "updated_at": "2025-10-15T12:30:00Z"
      }
    ]
  }
}`}
                </pre>

                {/* GET /designations/{id}/features */}
                <h4 className="text-xl font-semibold mb-4 mt-10 text-foreground">GET /designations/{"{id}"}/features</h4>
                <p className="mb-4 text-[15px] text-foreground leading-relaxed">Get feature access permissions for a specific designation.</p>
                
                <div className="overflow-x-auto mb-6">
                  <table className="min-w-full border border-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Field</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Type</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Required</th>
                        <th className="border border-border px-4 py-2 text-left font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Feature access identifier</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">designation_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Associated designation</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">feature_key</td><td className="border border-border px-4 py-2">string</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Feature identifier (contacts, reports, etc.)</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">can_view</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">View permission</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">can_create</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Create permission</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">can_edit</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Edit permission</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">can_delete</td><td className="border border-border px-4 py-2">boolean</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Delete permission</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">custom_permissions</td><td className="border border-border px-4 py-2">json | null</td><td className="border border-border px-4 py-2 text-muted-foreground">No</td><td className="border border-border px-4 py-2">Additional custom permissions</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">org_id</td><td className="border border-border px-4 py-2">uuid</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Organization ID</td></tr>
                      <tr className="bg-muted/20"><td className="border border-border px-4 py-2 font-mono text-xs">created_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Creation timestamp</td></tr>
                      <tr><td className="border border-border px-4 py-2 font-mono text-xs">updated_at</td><td className="border border-border px-4 py-2">timestamp</td><td className="border border-border px-4 py-2 text-accent font-semibold">Yes</td><td className="border border-border px-4 py-2">Last update timestamp</td></tr>
                    </tbody>
                  </table>
                </div>

                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[13px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": true,
  "data": {
    "feature_access": [
      {
        "id": "jj9p0622-p40n-63p6-m938-668877662222",
        "designation_id": "aa0g0622-g40d-63f6-c938-668877662222",
        "feature_key": "contacts",
        "can_view": true,
        "can_create": true,
        "can_edit": true,
        "can_delete": false,
        "custom_permissions": {
          "can_export": true,
          "can_import": false
        },
        "org_id": "550e8400-e29b-41d4-a716-446655440000",
        "created_at": "2025-10-01T08:00:00Z",
        "updated_at": "2025-10-15T12:30:00Z"
      },
      {
        "id": "kk0q1733-q51o-74q7-n049-779988773333",
        "designation_id": "aa0g0622-g40d-63f6-c938-668877662222",
        "feature_key": "reports",
        "can_view": true,
        "can_create": false,
        "can_edit": false,
        "can_delete": false,
        "custom_permissions": {},
        "org_id": "550e8400-e29b-41d4-a716-446655440000",
        "created_at": "2025-10-01T08:00:00Z",
        "updated_at": "2025-10-15T12:30:00Z"
      }
    ]
  }
}`}
                </pre>

                <h4 className="text-xl font-semibold mb-3 mt-8 text-foreground">Error Responses</h4>
                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground">
{`// 401 Unauthorized - Invalid API Key
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key"
  }
}

// 404 Not Found - Organization Not Found
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Organization not found"
  }
}

// 429 Rate Limit Exceeded
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later."
  },
  "meta": {
    "retry_after": 60
  }
}`}
              </pre>

                <h4 className="text-xl font-semibold mb-3 mt-8 text-foreground">cURL Example</h4>
                <pre className="bg-[#f5f5f5] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground">
{`curl -X GET \\
  ${supabaseUrl}/functions/v1/crm-bridge-api/organizations \\
  -H "x-api-key: your_api_key_here" \\
  -H "Content-Type: application/json"`}
                </pre>
              </div>

              <h3 className="text-2xl font-bold mb-6 mt-8 text-foreground">Rate Limits</h3>
                <p className="text-[15px] leading-relaxed mb-6 text-foreground">100 requests per minute per API key</p>

                <h3 className="text-2xl font-bold mb-6 mt-8 text-foreground">Error Handling</h3>
                <p className="text-[15px] leading-relaxed mb-6 text-foreground">All errors follow this format:</p>
                <pre className="bg-[#f4f4f4] dark:bg-[#1e1e1e] p-4 rounded-lg overflow-x-auto border border-border text-[14px] leading-relaxed font-mono text-foreground mb-8">
{`{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key"
  },
  "meta": {
    "timestamp": "2025-10-15T11:00:00Z",
    "request_id": "uuid"
  }
}`}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* API Key Documentation Dialog */}
      <Dialog open={!!selectedKeyForDocs} onOpenChange={() => setSelectedKeyForDocs(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>API Documentation - {selectedKeyForDocs?.key_name}</DialogTitle>
            <DialogDescription>
              Integration guide for the {selectedKeyForDocs?.key_name} API
            </DialogDescription>
          </DialogHeader>

          {selectedKeyForDocs?.key_name?.toLowerCase().includes('blog') ? (
            // Blog Webhook Documentation
            <div className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This is a webhook endpoint for automatically creating blog posts and triggering email campaigns
                </AlertDescription>
              </Alert>

              <div>
                <h3 className="text-lg font-semibold mb-2">Endpoint URL</h3>
                <div className="flex items-center gap-2 bg-muted p-3 rounded-lg">
                  <code className="flex-1 text-sm">
                    {supabaseUrl}/functions/v1/blog-webhook
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${supabaseUrl}/functions/v1/blog-webhook`)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Request Format</h3>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`POST /functions/v1/blog-webhook
Content-Type: application/json

{
  "blog_url": "https://yoursite.com/blog/post-title",
  "blog_title": "Your Blog Post Title",
  "blog_excerpt": "Brief summary...",
  "publish_date": "2025-10-20",
  "featured_image_url": "https://yoursite.com/image.jpg",
  "status": "posted",
  "social_posted": true
}`}
                </pre>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Required Fields</h3>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li><code>org_id</code> (UUID) - Organization ID: <code>65e22e43-f23d-4c0a-9d84-2eba65ad0e12</code></li>
                  <li><code>blog_url</code> (URL) - Full URL of the blog post</li>
                  <li><code>blog_title</code> (string, max 500 chars) - Title of the blog post</li>
                  <li><code>status</code> (string) - Must be "posted" to trigger email campaign</li>
                  <li><code>social_posted</code> (boolean) - Must be true to trigger email campaign</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Optional Fields</h3>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li><code>blog_excerpt</code> (string, max 1000 chars) - Brief summary of the post</li>
                  <li><code>featured_image_url</code> (URL) - Main image for the blog post</li>
                  <li><code>publish_date</code> (YYYY-MM-DD) - Defaults to today if not provided</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Success Response (200)</h3>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`{
  "success": true,
  "message": "Blog post created and email campaign initiated",
  "blog_post_id": "uuid",
  "campaign_id": "uuid",
  "request_id": "req_1729418426000_a1b2c3d4",
  "timestamp": "2025-10-20T12:00:00.000Z"
}`}
                </pre>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Error Responses</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium mb-1">400 Bad Request - Validation Error</p>
                    <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
{`{
  "success": false,
  "error": "Validation failed: Missing required field 'blog_title'",
  "request_id": "req_1729418426000_a1b2c3d4",
  "timestamp": "2025-10-20T12:00:00.000Z"
}`}
                    </pre>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1">404 Not Found - Invalid Organization</p>
                    <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
{`{
  "success": false,
  "error": "Organization not found",
  "request_id": "req_1729418426000_a1b2c3d4",
  "timestamp": "2025-10-20T12:00:00.000Z"
}`}
                    </pre>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Example cURL Request</h3>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`curl -X POST ${supabaseUrl}/functions/v1/blog-webhook \\
  -H "Content-Type: application/json" \\
  -d '{
    "org_id": "65e22e43-f23d-4c0a-9d84-2eba65ad0e12",
    "blog_url": "https://example.com/my-blog-post",
    "blog_title": "Amazing New Feature Launch",
    "blog_excerpt": "We are excited to announce...",
    "featured_image_url": "https://example.com/featured.jpg",
    "status": "posted",
    "social_posted": true
  }'`}
                </pre>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">What Happens Next?</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Blog post is created in the database</li>
                  <li>Email campaign is automatically created</li>
                  <li>All subscribers from <code>platform_email_sending_list</code> are added as recipients</li>
                  <li>Emails are sent using the "Blog Announcement" template</li>
                  <li>Template variables are populated: <code>blog_title</code>, <code>blog_url</code>, <code>blog_excerpt</code>, <code>featured_image_url</code></li>
                </ol>
              </div>
            </div>
          ) : (
            // Default CRM Bridge API Documentation
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Authentication</h3>
                <p className="text-sm mb-2">Include your API key in the <code>X-API-Key</code> header:</p>
                <div className="flex items-center gap-2 bg-muted p-3 rounded-lg">
                  <code className="flex-1 text-sm">{selectedKeyForDocs?.key_prefix}...</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(selectedKeyForDocs?.key_prefix || '')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Base URL</h3>
                <div className="flex items-center gap-2 bg-muted p-3 rounded-lg">
                  <code className="flex-1 text-sm">
                    {supabaseUrl}/functions/v1/crm-bridge-api
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${supabaseUrl}/functions/v1/crm-bridge-api`)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Example Request</h3>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`curl -H "X-API-Key: ${selectedKeyForDocs?.key_prefix}..." \\
  ${supabaseUrl}/functions/v1/crm-bridge-api/contacts`}
                </pre>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  For complete API documentation, visit the Documentation tab above
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setSelectedKeyForDocs(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteKeyId}
        onOpenChange={(open) => !open && setDeleteKeyId(null)}
        title="Delete API Key"
        description="Are you sure you want to delete this API key? This action cannot be undone and any applications using this key will stop working."
        onConfirm={() => deleteKeyId && deleteKeyMutation.mutate(deleteKeyId)}
        confirmText="Delete"
        variant="destructive"
      />
      </div>
    </DashboardLayout>
  );
}
