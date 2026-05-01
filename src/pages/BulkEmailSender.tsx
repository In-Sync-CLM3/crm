import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { requireOnline } from "@/lib/offline";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";
import { LoadingState } from "@/components/common/LoadingState";
import { Loader2, Send, ArrowRight, ArrowLeft } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { VariableMappingStep } from "@/components/Campaigns/VariableMappingStep";
import { TemplateVariable, VariableMapping, detectTemplateVariables } from "@/utils/templateVariables";
import { ParsedCSVData } from "@/utils/csvParser";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { format } from "date-fns";

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  phone: string;
}

interface Template {
  id: string;
  name: string;
  subject: string;
  html_content: string;
}

const BulkEmailSender = () => {
  const navigate = useNavigate();
  const notify = useNotification();
  const { effectiveOrgId } = useOrgContext();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Campaign Setup
  const [campaignName, setCampaignName] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  
  // Scheduling
  const [sendImmediately, setSendImmediately] = useState(true);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);

  // Step 2: Recipients
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  // Variable mapping and CSV
  const [templateVariables, setTemplateVariables] = useState<TemplateVariable[]>([]);
  const [variableMappings, setVariableMappings] = useState<Record<string, VariableMapping>>({});
  const [csvData, setCsvData] = useState<ParsedCSVData | null>(null);

  useEffect(() => {
    fetchTemplates();
    fetchContacts();
  }, [effectiveOrgId]);

  const fetchTemplates = async () => {
    if (!effectiveOrgId || effectiveOrgId === "null") {
      console.log("No valid org_id available");
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      console.error("Error fetching templates:", error);
      notify.error("Error", new Error("Failed to load templates"));
    }
  };

  const fetchContacts = async () => {
    if (!effectiveOrgId || effectiveOrgId === "null") {
      console.log("No valid org_id available");
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, company, phone")
        .eq("org_id", effectiveOrgId)
        .not("email", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setContacts(data || []);
    } catch (error: any) {
      console.error("Error fetching contacts:", error);
      notify.error("Error", new Error("Failed to load contacts"));
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      // Use body_content if available (new templates), otherwise fall back to html_content (old templates)
      const content = (template as any).body_content || template.html_content;
      setHtmlContent(content);
      
      // Detect variables in template (subject and body separately)
      const vars = detectTemplateVariables(
        content,
        template.subject
      );
      setTemplateVariables(vars);
    }
  };

  const handleContactToggle = (contactId: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId);
    } else {
      newSelected.add(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedContacts.size === contacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(contacts.map((c) => c.id)));
    }
  };

  const handleVariableMappingComplete = (
    mappings: Record<string, VariableMapping>,
    csv: ParsedCSVData | null
  ) => {
    setVariableMappings(mappings);
    setCsvData(csv);
    setStep(3);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!campaignName.trim()) {
        notify.error("Validation Error", new Error("Please enter a campaign name"));
        return;
      }
      if (!selectedTemplateId) {
        notify.error("Validation Error", new Error("Please select a template"));
        return;
      }
      setStep(2);
    } else if (step === 3) {
      const finalRecipients = csvData?.rows.length 
        ? csvData.rows 
        : contacts.filter(c => selectedContacts.has(c.id));
      
      if (finalRecipients.length === 0) {
        notify.error("Validation Error", new Error("Please select at least one recipient"));
        return;
      }
      setStep(4);
    }
  };

  const handleSendCampaign = async () => {
    if (!requireOnline("Bulk email send", notify)) return;
    setLoading(true);

    try {
      const { data: session } = await supabase.auth.getSession();

      const finalRecipients = csvData?.rows.length 
        ? csvData.rows 
        : contacts.filter(c => selectedContacts.has(c.id));

      // Get template details for buttons and attachments
      const { data: templateData } = await supabase
        .from("email_templates")
        .select("body_content, buttons, attachments")
        .eq("id", selectedTemplateId)
        .single();

      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from("email_bulk_campaigns")
        .insert([{
          name: campaignName,
          template_id: selectedTemplateId,
          subject: subject,
          html_content: htmlContent,
          body_content: templateData?.body_content || htmlContent,
          buttons: templateData?.buttons || [],
          attachments: templateData?.attachments || [],
          total_recipients: finalRecipients.length,
          pending_count: finalRecipients.length,
          status: sendImmediately ? "sending" : "scheduled",
          scheduled_at: sendImmediately ? null : scheduledAt?.toISOString(),
          org_id: effectiveOrgId,
          created_by: session.session?.user.id,
          started_at: sendImmediately ? new Date().toISOString() : null,
          variable_mappings: variableMappings as any,
        }])
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Create recipients with custom data from CSV if available
      let recipients;
      if (csvData) {
        const identifierCol = csvData.identifierColumn;
        recipients = csvData.rows.map(row => {
          const identifier = row[identifierCol];
          const contact = contacts.find(c => c.email === identifier);
          
          // Extract custom data
          const customData: Record<string, any> = {};
          Object.keys(row).forEach(key => {
            if (key !== identifierCol) {
              customData[key] = row[key];
            }
          });
          
          return {
            campaign_id: campaign.id,
            contact_id: contact?.id || null,
            email: identifier,
            status: "pending",
            custom_data: customData as any,
          };
        });
      } else {
        recipients = Array.from(selectedContacts).map((contactId) => {
          const contact = contacts.find((c) => c.id === contactId);
          return {
            campaign_id: campaign.id,
            contact_id: contactId,
            email: contact?.email || "",
            status: "pending",
            custom_data: {} as any,
          };
        });
      }

      const { error: recipientsError } = await supabase
        .from("email_campaign_recipients")
        .insert(recipients);

      if (recipientsError) throw recipientsError;

      // Trigger edge function to send emails only if sending immediately
      if (sendImmediately) {
        const { error: functionError } = await supabase.functions.invoke(
          "send-bulk-email",
          {
            body: { campaignId: campaign.id },
          }
        );

        if (functionError) throw functionError;

        notify.success("Success", "Campaign started! Emails are being sent.");
      } else {
        notify.success("Campaign Scheduled", `Campaign will be sent on ${scheduledAt?.toLocaleDateString()} at ${scheduledAt?.toLocaleTimeString()}`);
      }

      navigate(`/email-campaigns/${campaign.id}`);
    } catch (error: any) {
      console.error("Error sending campaign:", error);
      notify.error("Error", error);
    } finally {
      setLoading(false);
    }
  };

  const replaceVariables = (html: string, contact: Contact) => {
    return html
      .replace(/\{\{first_name\}\}/g, contact.first_name || "")
      .replace(/\{\{last_name\}\}/g, contact.last_name || "")
      .replace(/\{\{email\}\}/g, contact.email || "")
      .replace(/\{\{company\}\}/g, contact.company || "")
      .replace(/\{\{phone\}\}/g, contact.phone || "");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Bulk Email Sender</h1>
            <p className="text-muted-foreground">
              Send personalized emails to multiple recipients
            </p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center space-x-4">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s}
              </div>
              {s < 4 && (
                <div
                  className={`w-20 h-1 ${
                    step > s ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Campaign Setup */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Campaign Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Campaign Name</Label>
                <Input
                  id="campaign-name"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g., November Newsletter"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template">Select Template</Label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplateId && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="subject">Email Subject</Label>
                    <Input
                      id="subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Preview</Label>
                    <div className="border rounded-lg p-4 max-h-60 overflow-auto">
                      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
                    </div>
                  </div>

                  <div className="space-y-4 border-t pt-4 mt-4">
                    <Label>Sending Schedule</Label>
                    <RadioGroup value={sendImmediately ? "now" : "scheduled"} onValueChange={(v) => setSendImmediately(v === "now")}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="now" id="send-now" />
                        <Label htmlFor="send-now" className="cursor-pointer font-normal">Send immediately</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="scheduled" id="send-scheduled" />
                        <Label htmlFor="send-scheduled" className="cursor-pointer font-normal">Schedule for later</Label>
                      </div>
                    </RadioGroup>
                    
                    {!sendImmediately && (
                      <DateTimePicker
                        value={scheduledAt}
                        onChange={setScheduledAt}
                        minDate={new Date()}
                        label="Select date and time"
                      />
                    )}
                  </div>
                </>
              )}

              <div className="flex justify-end">
                <Button onClick={handleNext}>
                  Next: Variable Mapping
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Variable Mapping */}
        {step === 2 && (
          <VariableMappingStep
            templateVariables={templateVariables}
            identifierType="email"
            orgId={effectiveOrgId}
            onComplete={handleVariableMappingComplete}
            onBack={() => setStep(1)}
          />
        )}

        {/* Step 3: Select Recipients */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Select Recipients</CardTitle>
              <p className="text-sm text-muted-foreground">
                {csvData 
                  ? `Using ${csvData.rows.length} recipients from CSV upload (promotional list - not added to CRM)` 
                  : `${selectedContacts.size} of ${contacts.length} contacts selected from CRM`}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {csvData ? (
                // CSV Upload Mode
                <div className="space-y-4">
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">CSV List Uploaded</h3>
                        <p className="text-sm text-muted-foreground">
                          {csvData.rows.length} recipients • These contacts will NOT be added to your CRM
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setCsvData(null);
                          setVariableMappings({});
                        }}
                      >
                        Clear & Use CRM Contacts
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      ✓ Variables mapped • ✓ Ready to send
                    </div>
                  </div>

                  <div className="border rounded-lg p-4 max-h-[300px] overflow-auto">
                    <p className="text-sm font-medium mb-2">Preview (first 5 rows):</p>
                    <div className="space-y-2">
                      {csvData.rows.slice(0, 5).map((row, idx) => (
                        <div key={idx} className="text-sm border-b pb-2">
                          <span className="font-medium">{row[csvData.identifierColumn]}</span>
                          {Object.keys(row).filter(k => k !== csvData.identifierColumn).length > 0 && (
                            <span className="text-muted-foreground ml-2">
                              + {Object.keys(row).filter(k => k !== csvData.identifierColumn).length} custom fields
                            </span>
                          )}
                        </div>
                      ))}
                      {csvData.rows.length > 5 && (
                        <p className="text-xs text-muted-foreground">
                          ...and {csvData.rows.length - 5} more
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                // CRM Selection Mode
                <>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="select-all"
                      checked={selectedContacts.size === contacts.length}
                      onCheckedChange={handleSelectAll}
                    />
                    <Label htmlFor="select-all" className="cursor-pointer">
                      Select All
                    </Label>
                  </div>

                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Company</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contacts.map((contact) => (
                          <TableRow key={contact.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedContacts.has(contact.id)}
                                onCheckedChange={() => handleContactToggle(contact.id)}
                              />
                            </TableCell>
                            <TableCell>
                              {contact.first_name} {contact.last_name}
                            </TableCell>
                            <TableCell>{contact.email}</TableCell>
                            <TableCell>{contact.company}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={handleNext}>
                  Next: Review & Send
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Review & Send */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Review & Send</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold">Campaign Name</h3>
                  <p className="text-muted-foreground">{campaignName}</p>
                </div>

                <div>
                  <h3 className="font-semibold">Subject</h3>
                  <p className="text-muted-foreground">{subject}</p>
                </div>

                <div>
                  <h3 className="font-semibold">Recipients</h3>
                  <p className="text-muted-foreground">
                    {csvData?.rows.length || selectedContacts.size} contacts
                    {csvData && ' (from CSV upload)'}
                  </p>
                  {csvData && (
                    <p className="text-sm text-muted-foreground mt-1">
                      ℹ️ These recipients will NOT be added to your CRM
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="font-semibold">Schedule</h3>
                  <p className="text-muted-foreground">
                    {sendImmediately ? 'Send immediately' : `Scheduled for ${scheduledAt?.toLocaleDateString()} at ${scheduledAt?.toLocaleTimeString()}`}
                  </p>
                  {!sendImmediately && scheduledAt && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                      ⏰ Campaign will be sent on {format(scheduledAt, "PPP 'at' p")}
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Email Preview (with sample data)</h3>
                  <div className="border rounded-lg p-4 max-h-60 overflow-auto">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: replaceVariables(htmlContent, contacts[0] || {} as Contact),
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={handleSendCampaign} disabled={loading}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {sendImmediately ? 'Send Campaign' : 'Schedule Campaign'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default BulkEmailSender;
