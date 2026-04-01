import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, MessageCircle, Phone, Plus, Pencil, Trash2, Copy } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EmailTemplate {
  id: string;
  org_id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  from_name: string | null;
  reply_to: string | null;
  category: string;
  variant_of: string | null;
  variant_label: string | null;
  variables: any;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface WhatsAppTemplate {
  id: string;
  org_id: string;
  name: string;
  template_name: string;
  language: string;
  body: string;
  header: string | null;
  footer: string | null;
  buttons: any;
  variables: any;
  category: string;
  approval_status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CallScript {
  id: string;
  org_id: string;
  name: string;
  objective: string;
  opening: string;
  key_points: any;
  objection_handling: any;
  closing: string;
  voice_id: string | null;
  language: string;
  max_duration_seconds: number;
  is_active: boolean;
  product_key: string | null;
  call_type: string;
  created_at: string;
  updated_at: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EMAIL_CATEGORIES = ["outreach", "follow_up", "nurture", "re_engagement", "announcement"] as const;
const WHATSAPP_CATEGORIES = ["marketing", "utility", "authentication"] as const;
const CALL_TYPES = ["intro", "follow_up", "demo", "closing", "reactivation"] as const;
const VARIANT_LABELS = ["A", "B", "C"] as const;

const categoryColors: Record<string, string> = {
  outreach: "bg-blue-100 text-blue-800",
  follow_up: "bg-yellow-100 text-yellow-800",
  nurture: "bg-green-100 text-green-800",
  re_engagement: "bg-purple-100 text-purple-800",
  announcement: "bg-indigo-100 text-indigo-800",
  marketing: "bg-blue-100 text-blue-800",
  utility: "bg-gray-100 text-gray-800",
  authentication: "bg-orange-100 text-orange-800",
};

const approvalColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

// ─── Default Form States ────────────────────────────────────────────────────

const defaultEmailForm = {
  name: "",
  subject: "",
  body_html: "",
  body_text: "",
  from_name: "",
  reply_to: "",
  category: "outreach" as string,
  variant_of: "" as string,
  variant_label: "" as string,
  variables: "[]",
  is_active: true,
};

const defaultWhatsAppForm = {
  name: "",
  template_name: "",
  language: "en",
  body: "",
  header: "",
  footer: "",
  buttons: "[]",
  variables: "[]",
  category: "marketing" as string,
  is_active: true,
};

const defaultCallScriptForm = {
  name: "",
  objective: "",
  opening: "",
  key_points: "[]",
  objection_handling: "{}",
  closing: "",
  voice_id: "",
  language: "en" as string,
  max_duration_seconds: 300,
  product_key: "",
  call_type: "intro" as string,
  is_active: true,
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TemplateEditor() {
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();

  // Tab state
  const [activeTab, setActiveTab] = useState("email");

  // Email dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<EmailTemplate | null>(null);
  const [emailForm, setEmailForm] = useState(defaultEmailForm);

  // WhatsApp dialog state
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [editingWhatsApp, setEditingWhatsApp] = useState<WhatsAppTemplate | null>(null);
  const [whatsappForm, setWhatsappForm] = useState(defaultWhatsAppForm);

  // Call script dialog state
  const [callScriptDialogOpen, setCallScriptDialogOpen] = useState(false);
  const [editingCallScript, setEditingCallScript] = useState<CallScript | null>(null);
  const [callScriptForm, setCallScriptForm] = useState(defaultCallScriptForm);

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type: string; id: string; name: string }>({
    open: false,
    type: "",
    id: "",
    name: "",
  });

  // ─── Queries ────────────────────────────────────────────────────────────

  const { data: emailTemplates = [], isLoading: emailLoading } = useQuery({
    queryKey: ["mkt_email_templates", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_email_templates" as any)
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as EmailTemplate[];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: whatsappTemplates = [], isLoading: whatsappLoading } = useQuery({
    queryKey: ["mkt_whatsapp_templates", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_whatsapp_templates" as any)
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WhatsAppTemplate[];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: callScripts = [], isLoading: callScriptsLoading } = useQuery({
    queryKey: ["mkt_call_scripts", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_call_scripts" as any)
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CallScript[];
    },
    enabled: !!effectiveOrgId,
  });

  // ─── Email Mutations ──────────────────────────────────────────────────

  const saveEmailMutation = useMutation({
    mutationFn: async (form: typeof emailForm) => {
      const session = (await supabase.auth.getSession()).data.session;
      let parsedVariables: any = [];
      try {
        parsedVariables = JSON.parse(form.variables);
      } catch { /* keep default */ }

      const payload: any = {
        org_id: effectiveOrgId,
        name: form.name,
        subject: form.subject,
        body_html: form.body_html,
        body_text: form.body_text || null,
        from_name: form.from_name || null,
        reply_to: form.reply_to || null,
        category: form.category,
        variant_of: form.variant_of || null,
        variant_label: form.variant_label || null,
        variables: parsedVariables,
        is_active: form.is_active,
      };

      if (editingEmail) {
        const { error } = await supabase
          .from("mkt_email_templates" as any)
          .update(payload)
          .eq("id", editingEmail.id);
        if (error) throw error;
      } else {
        payload.created_by = session?.user?.id || null;
        const { error } = await supabase
          .from("mkt_email_templates" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt_email_templates"] });
      setEmailDialogOpen(false);
      setEditingEmail(null);
      setEmailForm(defaultEmailForm);
      notify.success(editingEmail ? "Template updated" : "Template created");
    },
    onError: (err: any) => notify.error("Failed to save template", err),
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("mkt_email_templates" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt_email_templates"] });
      notify.success("Email template deleted");
    },
    onError: (err: any) => notify.error("Failed to delete template", err),
  });

  // ─── WhatsApp Mutations ───────────────────────────────────────────────

  const saveWhatsAppMutation = useMutation({
    mutationFn: async (form: typeof whatsappForm) => {
      let parsedButtons: any = [];
      let parsedVariables: any = [];
      try { parsedButtons = JSON.parse(form.buttons); } catch { /* keep default */ }
      try { parsedVariables = JSON.parse(form.variables); } catch { /* keep default */ }

      const payload: any = {
        org_id: effectiveOrgId,
        name: form.name,
        template_name: form.template_name,
        language: form.language,
        body: form.body,
        header: form.header || null,
        footer: form.footer || null,
        buttons: parsedButtons,
        variables: parsedVariables,
        category: form.category,
        is_active: form.is_active,
      };

      if (editingWhatsApp) {
        const { error } = await supabase
          .from("mkt_whatsapp_templates" as any)
          .update(payload)
          .eq("id", editingWhatsApp.id);
        if (error) throw error;
      } else {
        payload.approval_status = "pending";
        const { error } = await supabase
          .from("mkt_whatsapp_templates" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt_whatsapp_templates"] });
      setWhatsappDialogOpen(false);
      setEditingWhatsApp(null);
      setWhatsappForm(defaultWhatsAppForm);
      notify.success(editingWhatsApp ? "Template updated" : "Template created");
    },
    onError: (err: any) => notify.error("Failed to save template", err),
  });

  const deleteWhatsAppMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("mkt_whatsapp_templates" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt_whatsapp_templates"] });
      notify.success("WhatsApp template deleted");
    },
    onError: (err: any) => notify.error("Failed to delete template", err),
  });

  // ─── Call Script Mutations ────────────────────────────────────────────

  const saveCallScriptMutation = useMutation({
    mutationFn: async (form: typeof callScriptForm) => {
      let parsedKeyPoints: any = [];
      let parsedObjectionHandling: any = {};
      try { parsedKeyPoints = JSON.parse(form.key_points); } catch { /* keep default */ }
      try { parsedObjectionHandling = JSON.parse(form.objection_handling); } catch { /* keep default */ }

      const payload: any = {
        org_id: effectiveOrgId,
        name: form.name,
        objective: form.objective,
        opening: form.opening,
        key_points: parsedKeyPoints,
        objection_handling: parsedObjectionHandling,
        closing: form.closing,
        voice_id: form.voice_id || null,
        language: form.language,
        max_duration_seconds: form.max_duration_seconds,
        product_key: form.product_key || null,
        call_type: form.call_type,
        is_active: form.is_active,
      };

      if (editingCallScript) {
        const { error } = await supabase
          .from("mkt_call_scripts" as any)
          .update(payload)
          .eq("id", editingCallScript.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("mkt_call_scripts" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt_call_scripts"] });
      setCallScriptDialogOpen(false);
      setEditingCallScript(null);
      setCallScriptForm(defaultCallScriptForm);
      notify.success(editingCallScript ? "Script updated" : "Script created");
    },
    onError: (err: any) => notify.error("Failed to save script", err),
  });

  const deleteCallScriptMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("mkt_call_scripts" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt_call_scripts"] });
      notify.success("Call script deleted");
    },
    onError: (err: any) => notify.error("Failed to delete script", err),
  });

  // ─── Handlers ─────────────────────────────────────────────────────────

  const handleDeleteConfirm = () => {
    if (deleteConfirm.type === "email") deleteEmailMutation.mutate(deleteConfirm.id);
    else if (deleteConfirm.type === "whatsapp") deleteWhatsAppMutation.mutate(deleteConfirm.id);
    else if (deleteConfirm.type === "call_script") deleteCallScriptMutation.mutate(deleteConfirm.id);
  };

  // Email handlers
  const openNewEmail = () => {
    setEditingEmail(null);
    setEmailForm(defaultEmailForm);
    setEmailDialogOpen(true);
  };

  const openEditEmail = (t: EmailTemplate) => {
    setEditingEmail(t);
    setEmailForm({
      name: t.name,
      subject: t.subject,
      body_html: t.body_html,
      body_text: t.body_text || "",
      from_name: t.from_name || "",
      reply_to: t.reply_to || "",
      category: t.category,
      variant_of: t.variant_of || "",
      variant_label: t.variant_label || "",
      variables: JSON.stringify(t.variables || [], null, 2),
      is_active: t.is_active,
    });
    setEmailDialogOpen(true);
  };

  const duplicateEmail = (t: EmailTemplate) => {
    setEditingEmail(null);
    setEmailForm({
      name: `${t.name} (Copy)`,
      subject: t.subject,
      body_html: t.body_html,
      body_text: t.body_text || "",
      from_name: t.from_name || "",
      reply_to: t.reply_to || "",
      category: t.category,
      variant_of: t.variant_of || "",
      variant_label: "",
      variables: JSON.stringify(t.variables || [], null, 2),
      is_active: false,
    });
    setEmailDialogOpen(true);
  };

  // WhatsApp handlers
  const openNewWhatsApp = () => {
    setEditingWhatsApp(null);
    setWhatsappForm(defaultWhatsAppForm);
    setWhatsappDialogOpen(true);
  };

  const openEditWhatsApp = (t: WhatsAppTemplate) => {
    setEditingWhatsApp(t);
    setWhatsappForm({
      name: t.name,
      template_name: t.template_name,
      language: t.language,
      body: t.body,
      header: t.header || "",
      footer: t.footer || "",
      buttons: JSON.stringify(t.buttons || [], null, 2),
      variables: JSON.stringify(t.variables || [], null, 2),
      category: t.category,
      is_active: t.is_active,
    });
    setWhatsappDialogOpen(true);
  };

  const duplicateWhatsApp = (t: WhatsAppTemplate) => {
    setEditingWhatsApp(null);
    setWhatsappForm({
      name: `${t.name} (Copy)`,
      template_name: `${t.template_name}_copy`,
      language: t.language,
      body: t.body,
      header: t.header || "",
      footer: t.footer || "",
      buttons: JSON.stringify(t.buttons || [], null, 2),
      variables: JSON.stringify(t.variables || [], null, 2),
      category: t.category,
      is_active: false,
    });
    setWhatsappDialogOpen(true);
  };

  // Call script handlers
  const openNewCallScript = () => {
    setEditingCallScript(null);
    setCallScriptForm(defaultCallScriptForm);
    setCallScriptDialogOpen(true);
  };

  const openEditCallScript = (t: CallScript) => {
    setEditingCallScript(t);
    setCallScriptForm({
      name: t.name,
      objective: t.objective,
      opening: t.opening,
      key_points: JSON.stringify(t.key_points || [], null, 2),
      objection_handling: JSON.stringify(t.objection_handling || {}, null, 2),
      closing: t.closing,
      voice_id: t.voice_id || "",
      language: t.language,
      max_duration_seconds: t.max_duration_seconds,
      product_key: t.product_key || "",
      call_type: t.call_type,
      is_active: t.is_active,
    });
    setCallScriptDialogOpen(true);
  };

  const duplicateCallScript = (t: CallScript) => {
    setEditingCallScript(null);
    setCallScriptForm({
      name: `${t.name} (Copy)`,
      objective: t.objective,
      opening: t.opening,
      key_points: JSON.stringify(t.key_points || [], null, 2),
      objection_handling: JSON.stringify(t.objection_handling || {}, null, 2),
      closing: t.closing,
      voice_id: t.voice_id || "",
      language: t.language,
      max_duration_seconds: t.max_duration_seconds,
      product_key: t.product_key || "",
      call_type: t.call_type,
      is_active: false,
    });
    setCallScriptDialogOpen(true);
  };

  // ─── Render Helpers ───────────────────────────────────────────────────

  const formatLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Template Editor</h1>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="email" className="gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              <span className="text-xs">Email Templates</span>
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="text-xs">WhatsApp Templates</span>
            </TabsTrigger>
            <TabsTrigger value="call_scripts" className="gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              <span className="text-xs">Call Scripts</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Email Templates Tab ──────────────────────────────────── */}
          <TabsContent value="email" className="mt-4">
            <Card>
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Email Templates</CardTitle>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={openNewEmail}>
                  <Plus className="h-3.5 w-3.5" /> New Email Template
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {emailLoading ? (
                  <LoadingState />
                ) : emailTemplates.length === 0 ? (
                  <EmptyState
                    icon={<Mail className="h-10 w-10 text-muted-foreground" />}
                    title="No email templates"
                    message="Create your first email template to get started."
                    action={
                      <Button size="sm" onClick={openNewEmail}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> New Email Template
                      </Button>
                    }
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Subject</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs">Variant</TableHead>
                        <TableHead className="text-xs">Active</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emailTemplates.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs font-medium py-2">{t.name}</TableCell>
                          <TableCell className="text-xs py-2 max-w-[200px] truncate">{t.subject}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant="secondary" className={`text-[10px] ${categoryColors[t.category] || ""}`}>
                              {formatLabel(t.category)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-2">{t.variant_label || "—"}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant={t.is_active ? "default" : "outline"} className="text-[10px]">
                              {t.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditEmail(t)} title="Edit">
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => duplicateEmail(t)} title="Duplicate">
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => setDeleteConfirm({ open: true, type: "email", id: t.id, name: t.name })}
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── WhatsApp Templates Tab ───────────────────────────────── */}
          <TabsContent value="whatsapp" className="mt-4">
            <Card>
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">WhatsApp Templates</CardTitle>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={openNewWhatsApp}>
                  <Plus className="h-3.5 w-3.5" /> New WhatsApp Template
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {whatsappLoading ? (
                  <LoadingState />
                ) : whatsappTemplates.length === 0 ? (
                  <EmptyState
                    icon={<MessageCircle className="h-10 w-10 text-muted-foreground" />}
                    title="No WhatsApp templates"
                    message="Create your first WhatsApp template to get started."
                    action={
                      <Button size="sm" onClick={openNewWhatsApp}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> New WhatsApp Template
                      </Button>
                    }
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Template Name</TableHead>
                        <TableHead className="text-xs">Language</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs">Approval</TableHead>
                        <TableHead className="text-xs">Active</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {whatsappTemplates.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs font-medium py-2">{t.name}</TableCell>
                          <TableCell className="text-xs py-2 font-mono">{t.template_name}</TableCell>
                          <TableCell className="text-xs py-2">{t.language}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant="secondary" className={`text-[10px] ${categoryColors[t.category] || ""}`}>
                              {formatLabel(t.category)}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="secondary" className={`text-[10px] ${approvalColors[t.approval_status] || ""}`}>
                              {formatLabel(t.approval_status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant={t.is_active ? "default" : "outline"} className="text-[10px]">
                              {t.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditWhatsApp(t)} title="Edit">
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => duplicateWhatsApp(t)} title="Duplicate">
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => setDeleteConfirm({ open: true, type: "whatsapp", id: t.id, name: t.name })}
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Call Scripts Tab ──────────────────────────────────────── */}
          <TabsContent value="call_scripts" className="mt-4">
            <Card>
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Call Scripts</CardTitle>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={openNewCallScript}>
                  <Plus className="h-3.5 w-3.5" /> New Call Script
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {callScriptsLoading ? (
                  <LoadingState />
                ) : callScripts.length === 0 ? (
                  <EmptyState
                    icon={<Phone className="h-10 w-10 text-muted-foreground" />}
                    title="No call scripts"
                    message="Create your first call script to get started."
                    action={
                      <Button size="sm" onClick={openNewCallScript}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> New Call Script
                      </Button>
                    }
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Objective</TableHead>
                        <TableHead className="text-xs">Call Type</TableHead>
                        <TableHead className="text-xs">Product</TableHead>
                        <TableHead className="text-xs">Language</TableHead>
                        <TableHead className="text-xs">Max Duration</TableHead>
                        <TableHead className="text-xs">Active</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {callScripts.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs font-medium py-2">{t.name}</TableCell>
                          <TableCell className="text-xs py-2 max-w-[200px] truncate">{t.objective}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant="secondary" className="text-[10px]">
                              {formatLabel(t.call_type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-2">{t.product_key || "—"}</TableCell>
                          <TableCell className="text-xs py-2">{t.language.toUpperCase()}</TableCell>
                          <TableCell className="text-xs py-2">{t.max_duration_seconds}s</TableCell>
                          <TableCell className="py-2">
                            <Badge variant={t.is_active ? "default" : "outline"} className="text-[10px]">
                              {t.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditCallScript(t)} title="Edit">
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => duplicateCallScript(t)} title="Duplicate">
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => setDeleteConfirm({ open: true, type: "call_script", id: t.id, name: t.name })}
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Email Template Dialog ──────────────────────────────────────── */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingEmail ? "Edit Email Template" : "New Email Template"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editingEmail ? "Update the email template details below." : "Fill in the details for the new email template."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Name *</Label>
                <Input
                  className="h-8 text-xs"
                  value={emailForm.name}
                  onChange={(e) => setEmailForm({ ...emailForm, name: e.target.value })}
                  placeholder="e.g. Welcome Drip #1"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Subject *</Label>
                <Input
                  className="h-8 text-xs"
                  value={emailForm.subject}
                  onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                  placeholder="e.g. Welcome to {{company}}"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Body HTML *</Label>
              <Textarea
                className="text-xs min-h-[120px] font-mono"
                value={emailForm.body_html}
                onChange={(e) => setEmailForm({ ...emailForm, body_html: e.target.value })}
                placeholder="<html>...</html>"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Body Text (plain-text fallback)</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                value={emailForm.body_text}
                onChange={(e) => setEmailForm({ ...emailForm, body_text: e.target.value })}
                placeholder="Plain text version..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">From Name</Label>
                <Input
                  className="h-8 text-xs"
                  value={emailForm.from_name}
                  onChange={(e) => setEmailForm({ ...emailForm, from_name: e.target.value })}
                  placeholder="e.g. Sales Team"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reply To</Label>
                <Input
                  className="h-8 text-xs"
                  value={emailForm.reply_to}
                  onChange={(e) => setEmailForm({ ...emailForm, reply_to: e.target.value })}
                  placeholder="e.g. sales@company.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category *</Label>
                <Select value={emailForm.category} onValueChange={(v) => setEmailForm({ ...emailForm, category: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">{formatLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Variant Of</Label>
                <Select value={emailForm.variant_of || "_none"} onValueChange={(v) => setEmailForm({ ...emailForm, variant_of: v === "_none" ? "" : v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none" className="text-xs">None</SelectItem>
                    {emailTemplates
                      .filter((et) => et.id !== editingEmail?.id)
                      .map((et) => (
                        <SelectItem key={et.id} value={et.id} className="text-xs">{et.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Variant Label</Label>
                <Select value={emailForm.variant_label || "_none"} onValueChange={(v) => setEmailForm({ ...emailForm, variant_label: v === "_none" ? "" : v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none" className="text-xs">—</SelectItem>
                    {VARIANT_LABELS.map((l) => (
                      <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Variables (JSON array)</Label>
              <Textarea
                className="text-xs min-h-[40px] font-mono"
                value={emailForm.variables}
                onChange={(e) => setEmailForm({ ...emailForm, variables: e.target.value })}
                placeholder='["first_name", "company"]'
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="email-active"
                checked={emailForm.is_active}
                onCheckedChange={(checked) => setEmailForm({ ...emailForm, is_active: !!checked })}
              />
              <Label htmlFor="email-active" className="text-xs cursor-pointer">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setEmailDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs"
              disabled={!emailForm.name || !emailForm.subject || !emailForm.body_html || saveEmailMutation.isPending}
              onClick={() => saveEmailMutation.mutate(emailForm)}
            >
              {saveEmailMutation.isPending ? "Saving..." : editingEmail ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── WhatsApp Template Dialog ───────────────────────────────────── */}
      <Dialog open={whatsappDialogOpen} onOpenChange={setWhatsappDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingWhatsApp ? "Edit WhatsApp Template" : "New WhatsApp Template"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editingWhatsApp ? "Update the WhatsApp template details below." : "Fill in the details for the new WhatsApp template."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Name *</Label>
                <Input
                  className="h-8 text-xs"
                  value={whatsappForm.name}
                  onChange={(e) => setWhatsappForm({ ...whatsappForm, name: e.target.value })}
                  placeholder="e.g. Order Confirmation"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Template Name (Exotel ID) *</Label>
                <Input
                  className="h-8 text-xs font-mono"
                  value={whatsappForm.template_name}
                  onChange={(e) => setWhatsappForm({ ...whatsappForm, template_name: e.target.value })}
                  placeholder="e.g. order_confirm_v1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Language</Label>
                <Input
                  className="h-8 text-xs"
                  value={whatsappForm.language}
                  onChange={(e) => setWhatsappForm({ ...whatsappForm, language: e.target.value })}
                  placeholder="en"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category *</Label>
                <Select value={whatsappForm.category} onValueChange={(v) => setWhatsappForm({ ...whatsappForm, category: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WHATSAPP_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">{formatLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Body *</Label>
              <Textarea
                className="text-xs min-h-[100px]"
                value={whatsappForm.body}
                onChange={(e) => setWhatsappForm({ ...whatsappForm, body: e.target.value })}
                placeholder="Hello {{1}}, your order {{2}} has been confirmed."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Header</Label>
                <Input
                  className="h-8 text-xs"
                  value={whatsappForm.header}
                  onChange={(e) => setWhatsappForm({ ...whatsappForm, header: e.target.value })}
                  placeholder="Optional header text"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Footer</Label>
                <Input
                  className="h-8 text-xs"
                  value={whatsappForm.footer}
                  onChange={(e) => setWhatsappForm({ ...whatsappForm, footer: e.target.value })}
                  placeholder="Optional footer text"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Buttons (JSON array)</Label>
              <Textarea
                className="text-xs min-h-[40px] font-mono"
                value={whatsappForm.buttons}
                onChange={(e) => setWhatsappForm({ ...whatsappForm, buttons: e.target.value })}
                placeholder='[{"type": "QUICK_REPLY", "text": "Yes"}]'
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Variables (JSON array)</Label>
              <Textarea
                className="text-xs min-h-[40px] font-mono"
                value={whatsappForm.variables}
                onChange={(e) => setWhatsappForm({ ...whatsappForm, variables: e.target.value })}
                placeholder='["first_name", "order_id"]'
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="wa-active"
                checked={whatsappForm.is_active}
                onCheckedChange={(checked) => setWhatsappForm({ ...whatsappForm, is_active: !!checked })}
              />
              <Label htmlFor="wa-active" className="text-xs cursor-pointer">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setWhatsappDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs"
              disabled={!whatsappForm.name || !whatsappForm.template_name || !whatsappForm.body || saveWhatsAppMutation.isPending}
              onClick={() => saveWhatsAppMutation.mutate(whatsappForm)}
            >
              {saveWhatsAppMutation.isPending ? "Saving..." : editingWhatsApp ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Call Script Dialog ─────────────────────────────────────────── */}
      <Dialog open={callScriptDialogOpen} onOpenChange={setCallScriptDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingCallScript ? "Edit Call Script" : "New Call Script"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editingCallScript ? "Update the call script details below." : "Fill in the details for the new call script."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Name *</Label>
                <Input
                  className="h-8 text-xs"
                  value={callScriptForm.name}
                  onChange={(e) => setCallScriptForm({ ...callScriptForm, name: e.target.value })}
                  placeholder="e.g. Cold Call - SaaS Product"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Call Type *</Label>
                <Select value={callScriptForm.call_type} onValueChange={(v) => setCallScriptForm({ ...callScriptForm, call_type: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALL_TYPES.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">{formatLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Objective *</Label>
              <Textarea
                className="text-xs min-h-[50px]"
                value={callScriptForm.objective}
                onChange={(e) => setCallScriptForm({ ...callScriptForm, objective: e.target.value })}
                placeholder="What is the goal of this call?"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Opening *</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                value={callScriptForm.opening}
                onChange={(e) => setCallScriptForm({ ...callScriptForm, opening: e.target.value })}
                placeholder="Hi {{name}}, this is {{agent}} from..."
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Key Points (JSON array of strings)</Label>
              <Textarea
                className="text-xs min-h-[60px] font-mono"
                value={callScriptForm.key_points}
                onChange={(e) => setCallScriptForm({ ...callScriptForm, key_points: e.target.value })}
                placeholder='["Introduce product", "Highlight ROI", "Ask about pain points"]'
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Objection Handling (JSON object)</Label>
              <Textarea
                className="text-xs min-h-[60px] font-mono"
                value={callScriptForm.objection_handling}
                onChange={(e) => setCallScriptForm({ ...callScriptForm, objection_handling: e.target.value })}
                placeholder='{"too expensive": "Let me show you the ROI...", "not interested": "I understand, but..."}'
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Closing *</Label>
              <Textarea
                className="text-xs min-h-[50px]"
                value={callScriptForm.closing}
                onChange={(e) => setCallScriptForm({ ...callScriptForm, closing: e.target.value })}
                placeholder="Thank you for your time..."
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Language *</Label>
                <Select value={callScriptForm.language} onValueChange={(v) => setCallScriptForm({ ...callScriptForm, language: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en" className="text-xs">English</SelectItem>
                    <SelectItem value="hi" className="text-xs">Hindi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Duration (seconds)</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  value={callScriptForm.max_duration_seconds}
                  onChange={(e) => setCallScriptForm({ ...callScriptForm, max_duration_seconds: parseInt(e.target.value) || 300 })}
                  min={30}
                  max={3600}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Product Key</Label>
                <Input
                  className="h-8 text-xs"
                  value={callScriptForm.product_key}
                  onChange={(e) => setCallScriptForm({ ...callScriptForm, product_key: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Voice ID</Label>
              <Input
                className="h-8 text-xs"
                value={callScriptForm.voice_id}
                onChange={(e) => setCallScriptForm({ ...callScriptForm, voice_id: e.target.value })}
                placeholder="Optional voice ID for TTS"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="cs-active"
                checked={callScriptForm.is_active}
                onCheckedChange={(checked) => setCallScriptForm({ ...callScriptForm, is_active: !!checked })}
              />
              <Label htmlFor="cs-active" className="text-xs cursor-pointer">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setCallScriptDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs"
              disabled={
                !callScriptForm.name ||
                !callScriptForm.objective ||
                !callScriptForm.opening ||
                !callScriptForm.closing ||
                saveCallScriptMutation.isPending
              }
              onClick={() => saveCallScriptMutation.mutate(callScriptForm)}
            >
              {saveCallScriptMutation.isPending ? "Saving..." : editingCallScript ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ────────────────────────────────────────── */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Delete Template"
        description={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        confirmText="Delete"
        variant="destructive"
      />
    </DashboardLayout>
  );
}
