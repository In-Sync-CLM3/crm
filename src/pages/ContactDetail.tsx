import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { mirrorContactsToDexie } from "@/services/sync/contactsSync";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNotification } from "@/hooks/useNotification";
import { 
  ArrowLeft, Mail, Phone as PhoneIcon, Building, MapPin, Calendar,
  Edit, Plus, MessageSquare, PhoneCall, Video, FileText, Linkedin, MessageCircle, Sparkles
} from "lucide-react";
import { CustomerJourney } from "@/components/Contact/CustomerJourney";
import { LogActivityDialog } from "@/components/Contact/LogActivityDialog";
import { EditContactDialog } from "@/components/Contact/EditContactDialog";
import { ContactEmails } from "@/components/Contact/ContactEmails";
import { ContactPhones } from "@/components/Contact/ContactPhones";
import { FillFormDialog } from "@/components/Contact/FillFormDialog";
import { SendWhatsAppDialog } from "@/components/Contact/SendWhatsAppDialog";
import { SendEmailDialog } from "@/components/Contact/SendEmailDialog";
import { SendSMSDialog } from "@/components/Contact/SendSMSDialog";
import { WhatsAppHistory } from "@/components/Contact/WhatsAppHistory";
import { SMSHistory } from "@/components/Contact/SMSHistory";
import { ClickToCall } from "@/components/Contact/ClickToCall";
import { NativeContactActions } from "@/components/Contact/NativeContactActions";
import { EmailAutomationJourney } from "@/components/Contact/EmailAutomationJourney";
import { LeadScoreCard } from "@/components/Contact/LeadScoreCard";
import { EnrichedFieldsSection } from "@/components/Contact/EnrichedFieldsSection";
import { ConvertToClientButton } from "@/components/Clients/ConvertToClientButton";

interface Contact {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  city: string | null;
  industry_type: string | null;
  nature_of_business: string | null;
  status: string;
  source: string | null;
  address: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  website: string | null;
  linkedin_url: string | null;
  twitter_url?: string | null;
  github_url?: string | null;
  facebook_url?: string | null;
  photo_url?: string | null;
  headline?: string | null;
  seniority?: string | null;
  departments?: string[] | null;
  person_locations?: any;
  employment_history?: any[] | null;
  education?: any[] | null;
  phone_numbers?: any[] | null;
  organization_name?: string | null;
  organization_founded_year?: number | null;
  organization_industry?: string | null;
  organization_keywords?: string[] | null;
  last_enriched_at?: string | null;
  enrichment_status?: string | null;
  apollo_person_id?: string | null;
  notes: string | null;
  pipeline_stage_id: string | null;
  created_at: string;
  pipeline_stages: { name: string; color: string } | null;
  profiles: { first_name: string; last_name: string } | null;
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notify = useNotification();
  const queryClient = useQueryClient();
  const [isLogActivityOpen, setIsLogActivityOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isFillFormOpen, setIsFillFormOpen] = useState(false);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [isSMSOpen, setIsSMSOpen] = useState(false);
  const [activityType, setActivityType] = useState<string>("note");
  const [enriching, setEnriching] = useState(false);

  // Auto-sync stale calls on page load (fire and forget)
  useQuery({
    queryKey: ['auto-sync-stale-calls', id],
    queryFn: async () => {
      try {
        await supabase.functions.invoke('auto-sync-stale-calls');
      } catch (error) {
        console.log('Auto-sync stale calls failed (non-critical):', error);
      }
      return null;
    },
    enabled: !!id,
    staleTime: 60000, // Only run once per minute
    refetchOnWindowFocus: false,
  });

  // Fetch contact with React Query (server-first, mirrors to Dexie)
  const { data: serverContact, isLoading: serverLoading, isError: serverError } = useQuery({
    queryKey: ['contact-detail', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("contacts")
        .select(`
          *,
          pipeline_stages (name, color),
          assigned_profile:profiles!assigned_to (first_name, last_name)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;

      const transformedData = {
        ...data,
        profiles: data.assigned_profile,
      };
      delete (transformedData as any).assigned_profile;

      // Mirror to Dexie for offline reads.
      mirrorContactsToDexie([data as any]).catch(() => undefined);

      return transformedData as Contact;
    },
    enabled: !!id,
    retry: 0,
    meta: {
      onError: () => {
        notify.error("Error loading contact", new Error("Failed to load contact"));
        navigate("/contacts");
      },
    },
  });

  // Offline fallback: read from Dexie when server fetch fails or device offline.
  const localContact = useLiveQuery(
    async () => {
      if (!id) return null;
      const c = await db.contacts.get(id);
      if (!c) return null;
      return {
        id: c.id,
        org_id: c.orgId ?? "",
        first_name: c.firstName,
        last_name: c.lastName,
        email: c.email,
        phone: c.phone,
        company: c.company,
        job_title: c.jobTitle,
        city: c.city,
        industry_type: null,
        nature_of_business: null,
        status: c.status ?? "new",
        source: c.source,
        address: null,
        state: c.state,
        country: c.country,
        postal_code: null,
        website: null,
        linkedin_url: null,
        notes: c.notes,
        pipeline_stage_id: c.pipelineStageId,
        created_at: c.createdAt.toISOString(),
        pipeline_stages: null,
        profiles: null,
      } as unknown as Contact;
    },
    [id]
  );

  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  const contact: Contact | null | undefined =
    serverContact ?? (isOffline || serverError ? localContact ?? undefined : undefined);
  const loading = serverLoading && !localContact;

  const refreshContact = () => {
    queryClient.invalidateQueries({ queryKey: ['contact-detail', id] });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-blue-500",
      contacted: "bg-yellow-500",
      qualified: "bg-green-500",
      converted: "bg-purple-500",
      lost: "bg-red-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const handleActivityLogged = () => {
    // Refresh the activity timeline
    setIsLogActivityOpen(false);
  };

  const handleContactUpdated = () => {
    refreshContact();
    setIsEditOpen(false);
  };

  const handleFormFilled = () => {
    // Refresh contact data after form is filled
    refreshContact();
  };

  const handleEnrichContact = async () => {
    if (!id) return;
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-contact', {
        body: { contactId: id },
      });

      if (error) throw error;

      if (data.error) {
        notify.error("Enrichment failed", data.error);
      } else {
        notify.success(
          "Contact enriched successfully",
          `Updated ${data.fieldsEnriched} fields`
        );
        refreshContact(); // Refresh contact data
      }
    } catch (error: any) {
      notify.error("Enrichment failed", error.message);
    } finally {
      setEnriching(false);
    }
  };

  if (loading && !contact) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!contact) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">
                {contact.first_name} {contact.last_name}
              </h1>
              {contact.job_title && contact.company && (
                <p className="text-muted-foreground">
                  {contact.job_title} at {contact.company}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <ConvertToClientButton 
              contact={contact}
              isWonStage={contact.pipeline_stages?.name?.toLowerCase() === 'won'}
              onConverted={() => refreshContact()}
            />
            <Button 
              variant="outline" 
              onClick={handleEnrichContact}
              disabled={enriching || !contact.email}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {enriching ? "Enriching..." : "Enrich with Apollo"}
            </Button>
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setIsFillFormOpen(true)}>
              <FileText className="mr-2 h-4 w-4" />
              Fill Form
            </Button>
            <Button onClick={() => { setActivityType("note"); setIsLogActivityOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Log Activity
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-6">
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
              <div>
                {contact.pipeline_stages && (
                  <Badge 
                    style={{ 
                      backgroundColor: contact.pipeline_stages.color,
                      color: '#ffffff',
                      borderColor: contact.pipeline_stages.color
                    }}
                  >
                    {contact.pipeline_stages.name}
                  </Badge>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Email Addresses</p>
                <ContactEmails contactId={id!} orgId={contact.org_id} readOnly />
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Phone Numbers</p>
                <ContactPhones contactId={id!} orgId={contact.org_id} readOnly />
              </div>

              {contact.linkedin_url && (
                <div className="flex items-center gap-2">
                  <Linkedin className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={contact.linkedin_url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-sm hover:underline"
                  >
                    LinkedIn Profile
                  </a>
                </div>
              )}

              {contact.company && (
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{contact.company}</span>
                </div>
              )}

              {(contact.city || contact.state || contact.country) && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {[contact.city, contact.state, contact.country].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}

              {contact.profiles && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-1">Assigned to</p>
                  <p className="text-sm font-medium">
                    {contact.profiles.first_name} {contact.profiles.last_name}
                  </p>
                </div>
              )}

              {contact.source && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-1">Source</p>
                  <p className="text-sm font-medium">{contact.source}</p>
                </div>
              )}

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-1">Created</p>
                <p className="text-sm">{new Date(contact.created_at).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>

          <LeadScoreCard contactId={id!} orgId={contact.org_id} />
          
          <EnrichedFieldsSection contact={contact} />
        </div>

        <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Activities & Notes</CardTitle>
                <div className="flex gap-2">
                  {contact.phone && (
                    <ClickToCall
                      contactId={id!}
                      phoneNumber={contact.phone}
                      contactName={`${contact.first_name} ${contact.last_name || ''}`}
                    />
                  )}
                  <NativeContactActions phone={contact.phone} />
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => { setActivityType("meeting"); setIsLogActivityOpen(true); }}
                  >
                    <Video className="h-4 w-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setIsEmailOpen(true)}
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setIsWhatsAppOpen(true)}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  {contact.phone && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => setIsSMSOpen(true)}
                      title="Send SMS"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="journey">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="journey">Journey</TabsTrigger>
                  <TabsTrigger value="sms">SMS</TabsTrigger>
                  <TabsTrigger value="automation">Automation</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                </TabsList>
                <TabsContent value="journey" className="space-y-4">
                  <CustomerJourney contactId={id!} />
                </TabsContent>
                <TabsContent value="sms" className="space-y-4">
                  <SMSHistory contactId={id!} />
                </TabsContent>
                <TabsContent value="automation" className="space-y-4">
                  <EmailAutomationJourney contactId={id!} orgId={contact.org_id} />
                </TabsContent>
                <TabsContent value="notes">
                  {contact.notes ? (
                    <div className="prose prose-sm max-w-none">
                      <p className="whitespace-pre-wrap">{contact.notes}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No notes yet</p>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <LogActivityDialog
        open={isLogActivityOpen}
        onOpenChange={setIsLogActivityOpen}
        contactId={id!}
        defaultActivityType={activityType}
        onActivityLogged={handleActivityLogged}
      />

      <EditContactDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        contact={contact}
        onContactUpdated={handleContactUpdated}
      />

      <FillFormDialog
        open={isFillFormOpen}
        onOpenChange={setIsFillFormOpen}
        contactId={id!}
        onFormFilled={handleFormFilled}
      />

      {contact.phone && (
        <SendWhatsAppDialog
          open={isWhatsAppOpen}
          onOpenChange={setIsWhatsAppOpen}
          contactId={id!}
          contactName={`${contact.first_name} ${contact.last_name || ''}`}
          phoneNumber={contact.phone}
          onMessageSent={() => {
            setIsWhatsAppOpen(false);
            refreshContact();
          }}
        />
      )}

      <SendEmailDialog
        open={isEmailOpen}
        onOpenChange={setIsEmailOpen}
        contactId={id!}
        contactName={`${contact.first_name} ${contact.last_name || ''}`}
        onEmailSent={() => {
          setIsEmailOpen(false);
          refreshContact();
        }}
      />

      {contact.phone && (
        <SendSMSDialog
          open={isSMSOpen}
          onOpenChange={setIsSMSOpen}
          contactId={id!}
          contactName={`${contact.first_name} ${contact.last_name || ''}`}
          phoneNumber={contact.phone}
        />
      )}
    </DashboardLayout>
  );
}
