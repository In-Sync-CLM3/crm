import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/common/LoadingState";
import { useNotification } from "@/hooks/useNotification";
import { Mail, Phone as PhoneIcon, Building, LayoutGrid, Table as TableIcon, Loader2, Phone, MapPin, Factory, MessageSquare, MoreHorizontal, Pencil, Trash2, UserPlus, MessageCircle, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePagination } from "@/hooks/usePagination";
import PaginationControls from "@/components/common/PaginationControls";
import { ConvertToClientButton } from "@/components/Clients/ConvertToClientButton";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PipelineFilters, PipelineFiltersState, emptyFilters } from "@/components/Pipeline/PipelineFilters";
import { SendEmailDialog } from "@/components/Contact/SendEmailDialog";
import { SendWhatsAppDialog } from "@/components/Contact/SendWhatsAppDialog";
import { SendSMSDialog } from "@/components/Contact/SendSMSDialog";
import { EditContactDialog } from "@/components/Contact/EditContactDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { UserSelector } from "@/components/Tasks/UserSelector";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuickDial } from "@/components/Contact/QuickDial";
import { CreateContactDialog } from "@/components/Contact/CreateContactDialog";
import { useUrlFilterState } from "@/hooks/useUrlFilterState";
interface PipelineStage {
  id: string;
  name: string;
  color: string;
  stage_order: number;
  probability: number;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  pipeline_stage_id: string | null;
  job_title?: string | null;
  source?: string | null;
  status?: string | null;
  notes?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  updated_at?: string | null;
  industry_type?: string | null;
  nature_of_business?: string | null;
  created_by?: string | null;
  primaryPhone?: string | null;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
}

// Org ID that should see enhanced pipeline fields
const ENHANCED_PIPELINE_ORG_ID = 'bfdb6856-6756-40d6-9e43-8a60f878bc0c';

export default function PipelineBoard() {
  const [filteredContacts, setFilteredContacts] = useState<Contact[] | null>(null);
  const [draggedContact, setDraggedContact] = useState<string | null>(null);
  
  // Use URL-based filter state for persistence across navigation
  const [urlFilters, setUrlFilters, clearUrlFilters] = useUrlFilterState<PipelineFiltersState>(
    emptyFilters,
    "pf"
  );
  const [filters, setFilters] = useState<PipelineFiltersState>(urlFilters);
  const [isSearching, setIsSearching] = useState(false);
  
  // Sync local filters with URL filters when URL changes (e.g., back button)
  useEffect(() => {
    setFilters(urlFilters);
    // Don't manipulate filteredContacts here - let the auto-apply effect handle it
  }, [urlFilters]);
  const [activeTab, setActiveTab] = useState("table");
  const [callingContactId, setCallingContactId] = useState<string | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [selectedContactForEmail, setSelectedContactForEmail] = useState<Contact | null>(null);
  
  // WhatsApp dialog state
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [selectedContactForWhatsapp, setSelectedContactForWhatsapp] = useState<Contact | null>(null);
  
  // SMS dialog state
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [selectedContactForSms, setSelectedContactForSms] = useState<Contact | null>(null);
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedContactForEdit, setSelectedContactForEdit] = useState<Contact | null>(null);
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedContactForDelete, setSelectedContactForDelete] = useState<Contact | null>(null);
  
  // Assign dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedContactForAssign, setSelectedContactForAssign] = useState<Contact | null>(null);
  const [assignToUserId, setAssignToUserId] = useState("");
  
  // Create contact dialog state
  const [createContactDialogOpen, setCreateContactDialogOpen] = useState(false);
  
  const notify = useNotification();
  const navigate = useNavigate();
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();
  
  const tablePagination = usePagination({ defaultPageSize: 50 });

  const { data: stagesData } = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("is_active", true)
        .order("stage_order");
      if (error) throw error;
      return data as PipelineStage[];
    },
  });

  // Fetch contact IDs that have been converted to clients
  const { data: clientContactIds } = useQuery({
    queryKey: ['client-contact-ids', effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("contact_id");
      if (error) throw error;
      return data.map(c => c.contact_id);
    },
    enabled: !!effectiveOrgId,
  });

  // Fetch users for Created By filter - only system users with roles in the org
  const { data: usersData } = useQuery({
    queryKey: ['pipeline-users', effectiveOrgId],
    queryFn: async () => {
      // First get user IDs that have roles in this org
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("org_id", effectiveOrgId)
        .eq("is_active", true);
      
      if (roleError) throw roleError;
      
      if (!roleData || roleData.length === 0) {
        return [] as User[];
      }
      
      const userIds = roleData.map(r => r.user_id);
      
      // Then fetch profiles for those users
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds)
        .order("first_name");
      
      if (error) throw error;
      return data as User[];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: contactsData } = useQuery({
    queryKey: ['pipeline-contacts', effectiveOrgId, activeTab, tablePagination.currentPage, tablePagination.pageSize],
    queryFn: async () => {
      const selectFields = "id, first_name, last_name, email, phone, company, pipeline_stage_id, job_title, source, status, notes, website, address, city, state, country, created_at, updated_at, industry_type, nature_of_business, created_by, contact_phones(phone, is_primary)";

      if (activeTab === "board") {
        // Board view: load contacts with primary phones in one query
        const { data, error } = await supabase
          .from("contacts")
          .select(selectFields)
          .order("updated_at", { ascending: false })
          .limit(500);

        if (error) throw error;
        return { data: data as (Contact & { contact_phones?: { phone: string; is_primary: boolean }[] })[], count: data?.length || 0 };
      } else {
        // Table view: use pagination
        const offset = (tablePagination.currentPage - 1) * tablePagination.pageSize;
        const { data, error, count } = await supabase
          .from("contacts")
          .select(selectFields, { count: 'exact' })
          .order("updated_at", { ascending: false })
          .range(offset, offset + tablePagination.pageSize - 1);

        if (error) throw error;
        return { data: data as (Contact & { contact_phones?: { phone: string; is_primary: boolean }[] })[], count: count || 0 };
      }
    },
    enabled: !!effectiveOrgId,
  });

  // Memoize contacts excluding those converted to clients, with primary phones attached
  const baseContacts = useMemo(() => {
    if (!contactsData?.data) return [];
    const excludeIds = new Set(clientContactIds || []);
    return contactsData.data
      .filter(c => !excludeIds.has(c.id))
      .map(c => ({
        ...c,
        primaryPhone: (c as any).contact_phones?.find((p: any) => p.is_primary)?.phone || null,
      }));
  }, [contactsData?.data, clientContactIds]);

  // Update pagination when data changes
  useEffect(() => {
    if (contactsData && activeTab === "table") {
      tablePagination.setTotalRecords(contactsData.count);
    }
  }, [contactsData?.count, activeTab]);

  // Derive contacts from filteredContacts or baseContacts
  const contacts = filteredContacts ?? baseContacts;

  const stages = stagesData || [];
  const loading = !stagesData || !contactsData;
  const showEnhancedFields = effectiveOrgId === ENHANCED_PIPELINE_ORG_ID;

  const handleDragStart = (contactId: string) => {
    setDraggedContact(contactId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (stageId: string) => {
    if (!draggedContact) return;

    try {
      const { error } = await supabase
        .from("contacts")
        .update({ pipeline_stage_id: stageId })
        .eq("id", draggedContact);

      if (error) throw error;

      // Invalidate query to refresh data
      queryClient.invalidateQueries({ queryKey: ['pipeline-contacts'] });

      notify.success("Contact moved", "Contact has been moved to new stage");
    } catch (error: any) {
      notify.error("Error", error);
    } finally {
      setDraggedContact(null);
    }
  };

  const getContactsInStage = (stageId: string) => {
    return contacts.filter(contact => contact.pipeline_stage_id === stageId);
  };

  const getContactsWithoutStage = () => {
    return contacts.filter(contact => !contact.pipeline_stage_id);
  };

  const handleCall = async (contact: Contact, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    // Use primary phone from contact_phones table, fallback to contact.phone
    const phoneToCall = contact.primaryPhone || contact.phone;

    if (!phoneToCall) {
      notify.error("No phone number", "This contact doesn't have a phone number");
      return;
    }

    setCallingContactId(contact.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user.id)
        .single();

      if (!profile?.phone) {
        notify.error("Phone number required", "Please add your phone number in profile settings");
        return;
      }

      const { data, error } = await supabase.functions.invoke('exotel-make-call', {
        body: {
          contactId: contact.id,
          agentPhoneNumber: profile.phone,
          customerPhoneNumber: phoneToCall,
        },
      });

      if (error) throw error;

      notify.success("Call initiated", `Calling ${contact.first_name} ${contact.last_name || ''}`);
    } catch (error: any) {
      notify.error("Call failed", error.message);
    } finally {
      setCallingContactId(null);
    }
  };

  const handleEmailClick = (contact: Contact, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedContactForEmail(contact);
    setEmailDialogOpen(true);
  };

  const handleWhatsAppClick = (contact: Contact, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedContactForWhatsapp(contact);
    setWhatsappDialogOpen(true);
  };

  const handleSmsClick = (contact: Contact, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedContactForSms(contact);
    setSmsDialogOpen(true);
  };

  const handleEditClick = (contact: Contact, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedContactForEdit(contact);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (contact: Contact, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedContactForDelete(contact);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedContactForDelete) return;
    try {
      const { error } = await supabase
        .from("contacts")
        .delete()
        .eq("id", selectedContactForDelete.id);
      if (error) throw error;
      notify.success("Contact deleted", "Contact has been deleted successfully");
      queryClient.invalidateQueries({ queryKey: ['pipeline-contacts'] });
    } catch (error: any) {
      notify.error("Error", error.message);
    } finally {
      setDeleteDialogOpen(false);
      setSelectedContactForDelete(null);
    }
  };

  const handleAssignClick = (contact: Contact, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedContactForAssign(contact);
    setAssignToUserId("");
    setAssignDialogOpen(true);
  };

  const handleAssignConfirm = async () => {
    if (!selectedContactForAssign || !assignToUserId) return;
    try {
      const { error } = await supabase
        .from("contacts")
        .update({ assigned_to: assignToUserId })
        .eq("id", selectedContactForAssign.id);
      if (error) throw error;
      notify.success("Contact assigned", "Contact has been assigned successfully");
      queryClient.invalidateQueries({ queryKey: ['pipeline-contacts'] });
    } catch (error: any) {
      notify.error("Error", error.message);
    } finally {
      setAssignDialogOpen(false);
      setSelectedContactForAssign(null);
    }
  };

  // Handle inline stage change from table view
  const handleStageChange = async (contactId: string, newStageId: string) => {
    try {
      const { error } = await supabase
        .from("contacts")
        .update({ pipeline_stage_id: newStageId })
        .eq("id", contactId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['pipeline-contacts'] });
      notify.success("Stage updated", "Contact stage has been updated");
    } catch (error: any) {
      notify.error("Error", error.message);
    }
  };

  // Apply field-based filters to contacts
  const applyFilters = useCallback(() => {
    setIsSearching(true);
    
    const filtered = baseContacts.filter((contact) => {
      const fullName = `${contact.first_name} ${contact.last_name || ""}`.toLowerCase();
      
      if (filters.name && !fullName.includes(filters.name.toLowerCase())) return false;
      if (filters.company && !contact.company?.toLowerCase().includes(filters.company.toLowerCase())) return false;
      if (filters.jobTitle && !contact.job_title?.toLowerCase().includes(filters.jobTitle.toLowerCase())) return false;
      if (filters.industryType && !contact.industry_type?.toLowerCase().includes(filters.industryType.toLowerCase())) return false;
      if (filters.source && !contact.source?.toLowerCase().includes(filters.source.toLowerCase())) return false;
      if (filters.city && !contact.city?.toLowerCase().includes(filters.city.toLowerCase())) return false;
      if (filters.state && !contact.state?.toLowerCase().includes(filters.state.toLowerCase())) return false;
      if (filters.country && !contact.country?.toLowerCase().includes(filters.country.toLowerCase())) return false;
      
      if (filters.stageId && contact.pipeline_stage_id !== filters.stageId) {
        return false;
      }
      
      if (filters.createdBy && contact.created_by !== filters.createdBy) return false;
      
      return true;
    });
    
    setFilteredContacts(filtered);
    setUrlFilters(filters); // Persist to URL
    setIsSearching(false);
    notify.success("Filters applied", `Found ${filtered.length} matching contacts`);
  }, [baseContacts, filters, setUrlFilters, notify]);

  // Auto-apply filters from URL when base contacts load and URL has filters
  useEffect(() => {
    const hasUrlFilters = Object.values(urlFilters).some(v => v !== "");
    
    if (!hasUrlFilters) {
      // No URL filters - show all contacts
      setFilteredContacts(null);
      return;
    }
    
    if (baseContacts.length === 0) {
      // Data not loaded yet - wait
      return;
    }
    
    // Apply URL filters silently (without notification)
    const filtered = baseContacts.filter((contact) => {
      const fullName = `${contact.first_name} ${contact.last_name || ""}`.toLowerCase();
      
      if (urlFilters.name && !fullName.includes(urlFilters.name.toLowerCase())) return false;
      if (urlFilters.company && !contact.company?.toLowerCase().includes(urlFilters.company.toLowerCase())) return false;
      if (urlFilters.jobTitle && !contact.job_title?.toLowerCase().includes(urlFilters.jobTitle.toLowerCase())) return false;
      if (urlFilters.industryType && !contact.industry_type?.toLowerCase().includes(urlFilters.industryType.toLowerCase())) return false;
      if (urlFilters.source && !contact.source?.toLowerCase().includes(urlFilters.source.toLowerCase())) return false;
      if (urlFilters.city && !contact.city?.toLowerCase().includes(urlFilters.city.toLowerCase())) return false;
      if (urlFilters.state && !contact.state?.toLowerCase().includes(urlFilters.state.toLowerCase())) return false;
      if (urlFilters.country && !contact.country?.toLowerCase().includes(urlFilters.country.toLowerCase())) return false;
      if (urlFilters.stageId && contact.pipeline_stage_id !== urlFilters.stageId) return false;
      if (urlFilters.createdBy && contact.created_by !== urlFilters.createdBy) return false;
      
      return true;
    });
    setFilteredContacts(filtered);
  }, [baseContacts, urlFilters]);

  const handleClearFilters = () => {
    setFilters(emptyFilters);
    clearUrlFilters(); // Clear URL params
    setFilteredContacts(null);
  };

  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some((v) => v !== "");
  }, [filters]);

  if (loading) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading pipeline..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Pipeline Board</h1>
            <p className="text-muted-foreground">View and manage your sales pipeline</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => setCreateContactDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Contact
            </Button>
            <QuickDial />
          </div>
        </div>

        {/* Field-Based Filters */}
        <PipelineFilters
          filters={filters}
          stages={stages}
          users={usersData || []}
          onFiltersChange={setFilters}
          onSearch={applyFilters}
          onClear={handleClearFilters}
          isSearching={isSearching}
          resultCount={hasActiveFilters ? contacts.length : undefined}
          totalCount={hasActiveFilters ? baseContacts.length : undefined}
        />
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === "table") tablePagination.reset(); }} className="w-full">
          <TabsList>
            <TabsTrigger value="board">
              <LayoutGrid className="h-4 w-4 mr-2" />
              Board View
            </TabsTrigger>
            <TabsTrigger value="table">
              <TableIcon className="h-4 w-4 mr-2" />
              Table View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="board" className="mt-6">
            <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map(stage => (
            <div
              key={stage.id}
              className="flex-shrink-0 w-80"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(stage.id)}
            >
              <Card className="h-full" style={{ borderTopColor: stage.color, borderTopWidth: 3 }}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span>{stage.name}</span>
                    <Badge variant="secondary">{getContactsInStage(stage.id).length}</Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {stage.probability}% probability
                  </p>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto">
                  {getContactsInStage(stage.id).map(contact => (
                    <Card
                       key={contact.id}
                       draggable
                       onDragStart={() => handleDragStart(contact.id)}
                       className="cursor-move hover:shadow-md transition-shadow animate-fade-in"
                       onClick={() => navigate(`/contacts/${contact.id}`)}
                     >
                       <CardContent className="p-3">
                         <p className="font-medium text-sm">
                           {contact.first_name} {contact.last_name}
                         </p>
                         {contact.company && (
                           <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                             <Building className="h-3 w-3" />
                             {contact.company}
                           </div>
                         )}
                         {showEnhancedFields && (
                           <div className="space-y-0.5 mt-1">
                             {contact.city && (
                               <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                 <MapPin className="h-3 w-3" />
                                 {contact.city}
                               </div>
                             )}
                             {contact.industry_type && (
                               <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                 <Factory className="h-3 w-3" />
                                 {contact.industry_type}
                               </div>
                             )}
                             {contact.nature_of_business && (
                               <p className="text-xs text-muted-foreground truncate" title={contact.nature_of_business}>
                                 {contact.nature_of_business}
                               </p>
                             )}
                           </div>
                         )}
                          <div className="flex items-center justify-between mt-2">
                           <div className="flex gap-2">
                             {contact.email && (
                               <Mail className="h-3 w-3 text-muted-foreground" />
                             )}
                             {(contact.primaryPhone || contact.phone) && (
                               <PhoneIcon className="h-3 w-3 text-muted-foreground" />
                             )}
                           </div>
                           {stage.name?.toLowerCase() === 'won' && effectiveOrgId && (
                             <div onClick={(e) => e.stopPropagation()}>
                               <ConvertToClientButton
                                 contact={{
                                   id: contact.id,
                                   org_id: effectiveOrgId,
                                   first_name: contact.first_name,
                                   last_name: contact.last_name,
                                   email: contact.email,
                                   phone: contact.primaryPhone || contact.phone,
                                   company: contact.company,
                                   job_title: contact.job_title,
                                   address: contact.address,
                                   city: contact.city,
                                   state: contact.state,
                                   country: contact.country,
                                   notes: contact.notes,
                                 }}
                                 isWonStage={true}
                                 onConverted={() => queryClient.invalidateQueries({ queryKey: ['pipeline-contacts'] })}
                               />
                             </div>
                           )}
                         </div>
                         <p className="text-[10px] text-muted-foreground mt-1">
                           Updated: {contact.updated_at ? format(new Date(contact.updated_at), 'MMM d, h:mm a') : '-'}
                         </p>
                       </CardContent>
                     </Card>
                  ))}
                </CardContent>
              </Card>
            </div>
            ))}
            </div>
          </TabsContent>

          <TabsContent value="table" className="mt-4">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">All Pipeline Contacts</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="py-2 text-xs h-8">Name / Title</TableHead>
                      <TableHead className="py-2 text-xs h-8">Company</TableHead>
                      {showEnhancedFields && <TableHead className="py-2 text-xs h-8">Industry</TableHead>}
                      <TableHead className="py-2 text-xs h-8">Location</TableHead>
                      <TableHead className="py-2 text-xs h-8">Contact</TableHead>
                      <TableHead className="py-2 text-xs h-8">Stage</TableHead>
                      <TableHead className="py-2 text-xs h-8">Updated</TableHead>
                      <TableHead className="py-2 text-xs h-8 w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((contact, index) => {
                      const stage = stages.find(s => s.id === contact.pipeline_stage_id);
                      return (
                        <TableRow
                          key={contact.id}
                          className={`hover:bg-muted/50 ${index % 2 === 0 ? 'bg-muted/20' : ''}`}
                        >
                          <TableCell 
                            className="py-1.5 cursor-pointer"
                            onClick={() => navigate(`/contacts/${contact.id}`)}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-xs">
                                {contact.first_name} {contact.last_name}
                              </span>
                              {contact.job_title && (
                                <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                  {contact.job_title}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell onClick={() => navigate(`/contacts/${contact.id}`)} className="py-1.5 cursor-pointer text-xs">
                            {contact.company || '-'}
                          </TableCell>
                          {showEnhancedFields && (
                            <TableCell onClick={() => navigate(`/contacts/${contact.id}`)} className="py-1.5 cursor-pointer text-xs">
                              <span className="truncate max-w-[100px] block" title={contact.industry_type || ''}>
                                {contact.industry_type || '-'}
                              </span>
                            </TableCell>
                          )}
                          <TableCell onClick={() => navigate(`/contacts/${contact.id}`)} className="py-1.5 cursor-pointer text-xs">
                            <span className="truncate max-w-[120px] block" title={[contact.city, contact.state, contact.country].filter(Boolean).join(', ')}>
                              {[contact.city, contact.state].filter(Boolean).join(', ') || '-'}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <div className="flex flex-col gap-0.5 text-xs">
                              {contact.email && (
                                <button
                                  onClick={(e) => handleEmailClick(contact, e)}
                                  className="flex items-center gap-1 text-muted-foreground hover:text-primary truncate max-w-[180px] transition-colors"
                                  title={contact.email}
                                >
                                  <Mail className="h-3 w-3 flex-shrink-0" />
                                  {contact.email}
                                </button>
                              )}
                              {(contact.primaryPhone || contact.phone) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCall(contact);
                                  }}
                                  disabled={callingContactId === contact.id}
                                  className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                                >
                                  <PhoneIcon className="h-3 w-3 flex-shrink-0" />
                                  {contact.primaryPhone || contact.phone}
                                </button>
                              )}
                              {!contact.email && !contact.primaryPhone && !contact.phone && '-'}
                            </div>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  onClick={(e) => e.stopPropagation()}
                                  className="cursor-pointer focus:outline-none"
                                >
                                  {stage ? (
                                    <Badge 
                                      className="text-[10px] px-1.5 py-0 hover:opacity-80 transition-opacity cursor-pointer" 
                                      style={{ backgroundColor: stage.color }}
                                    >
                                      {stage.name}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 hover:opacity-80 transition-opacity cursor-pointer">
                                      No Stage
                                    </Badge>
                                  )}
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-40">
                                {stages.map((s) => (
                                  <DropdownMenuItem
                                    key={s.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStageChange(contact.id, s.id);
                                    }}
                                    className="flex items-center gap-2"
                                  >
                                    <div
                                      className="w-3 h-3 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: s.color }}
                                    />
                                    <span className={s.id === contact.pipeline_stage_id ? "font-semibold" : ""}>
                                      {s.name}
                                    </span>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                          <TableCell onClick={() => navigate(`/contacts/${contact.id}`)} className="py-1.5 cursor-pointer text-muted-foreground text-[10px]">
                            {contact.updated_at ? format(new Date(contact.updated_at), 'MMM d, h:mm a') : '-'}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <div className="flex gap-1">
                              {stage?.name?.toLowerCase() === 'won' && effectiveOrgId && (
                                <ConvertToClientButton
                                  contact={{
                                    id: contact.id,
                                    org_id: effectiveOrgId,
                                    first_name: contact.first_name,
                                    last_name: contact.last_name,
                                    email: contact.email,
                                    phone: contact.primaryPhone || contact.phone,
                                    company: contact.company,
                                    job_title: contact.job_title,
                                    address: contact.address,
                                    city: contact.city,
                                    state: contact.state,
                                    country: contact.country,
                                    notes: contact.notes,
                                  }}
                                  isWonStage={true}
                                  onConverted={() => queryClient.invalidateQueries({ queryKey: ['pipeline-contacts'] })}
                                />
                              )}
                              
                              {/* Email Button */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={(e) => handleEmailClick(contact, e)}
                                      disabled={!contact.email}
                                      className="h-6 w-6"
                                    >
                                      <Mail className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Send Email</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              
                              {/* Call Button */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={(e) => handleCall(contact, e)}
                                      disabled={callingContactId === contact.id || (!contact.primaryPhone && !contact.phone)}
                                      className="h-6 w-6"
                                    >
                                      {callingContactId === contact.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Phone className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Call</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              
                              {/* WhatsApp Button */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={(e) => handleWhatsAppClick(contact, e)}
                                      disabled={!contact.primaryPhone && !contact.phone}
                                      className="h-6 w-6"
                                    >
                                      <MessageSquare className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Send WhatsApp</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              
                              {/* SMS Button */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={(e) => handleSmsClick(contact, e)}
                                      disabled={!contact.primaryPhone && !contact.phone}
                                      className="h-6 w-6"
                                    >
                                      <MessageCircle className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Send SMS</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              
                              {/* More Actions Dropdown */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => e.stopPropagation()}>
                                    <MoreHorizontal className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={(e) => handleEditClick(contact, e as unknown as React.MouseEvent)}>
                                    <Pencil className="h-4 w-4 mr-2" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => handleAssignClick(contact, e as unknown as React.MouseEvent)}>
                                    <UserPlus className="h-4 w-4 mr-2" /> Assign
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-destructive focus:text-destructive" 
                                    onClick={(e) => handleDeleteClick(contact, e as unknown as React.MouseEvent)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {tablePagination.totalRecords > tablePagination.pageSize && activeTab === "table" && (
          <PaginationControls
            currentPage={tablePagination.currentPage}
            totalPages={tablePagination.totalPages}
            pageSize={tablePagination.pageSize}
            totalRecords={tablePagination.totalRecords}
            startRecord={tablePagination.startRecord}
            endRecord={tablePagination.endRecord}
            onPageChange={tablePagination.setPage}
            onPageSizeChange={tablePagination.setPageSize}
          />
        )}

        {selectedContactForEmail && (
          <SendEmailDialog
            open={emailDialogOpen}
            onOpenChange={setEmailDialogOpen}
            contactId={selectedContactForEmail.id}
            contactName={`${selectedContactForEmail.first_name} ${selectedContactForEmail.last_name || ''}`.trim()}
          />
        )}

        {/* WhatsApp Dialog */}
        {selectedContactForWhatsapp && (
          <SendWhatsAppDialog
            open={whatsappDialogOpen}
            onOpenChange={setWhatsappDialogOpen}
            contactId={selectedContactForWhatsapp.id}
            contactName={`${selectedContactForWhatsapp.first_name} ${selectedContactForWhatsapp.last_name || ''}`.trim()}
            phoneNumber={selectedContactForWhatsapp.phone || ""}
            onMessageSent={() => queryClient.invalidateQueries({ queryKey: ['pipeline-contacts'] })}
          />
        )}

        {/* SMS Dialog */}
        {selectedContactForSms && (
          <SendSMSDialog
            open={smsDialogOpen}
            onOpenChange={setSmsDialogOpen}
            contactId={selectedContactForSms.id}
            contactName={`${selectedContactForSms.first_name} ${selectedContactForSms.last_name || ''}`.trim()}
            phoneNumber={selectedContactForSms.phone || ""}
          />
        )}
        {selectedContactForEdit && effectiveOrgId && (
          <EditContactDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            contact={{ 
              id: selectedContactForEdit.id,
              org_id: effectiveOrgId,
              first_name: selectedContactForEdit.first_name,
              last_name: selectedContactForEdit.last_name ?? null,
              email: selectedContactForEdit.email ?? null,
              phone: selectedContactForEdit.phone ?? null,
              company: selectedContactForEdit.company ?? null,
              job_title: selectedContactForEdit.job_title ?? null,
              city: selectedContactForEdit.city ?? null,
              industry_type: selectedContactForEdit.industry_type ?? null,
              nature_of_business: selectedContactForEdit.nature_of_business ?? null,
              status: selectedContactForEdit.status || "new",
              source: selectedContactForEdit.source ?? null,
              linkedin_url: null,
              notes: selectedContactForEdit.notes ?? null,
              pipeline_stage_id: selectedContactForEdit.pipeline_stage_id ?? null
            }}
            onContactUpdated={() => queryClient.invalidateQueries({ queryKey: ['pipeline-contacts'] })}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Delete Contact"
          description={`Are you sure you want to delete ${selectedContactForDelete?.first_name} ${selectedContactForDelete?.last_name || ''}? This action cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          confirmText="Delete"
          variant="destructive"
        />

        {/* Assign Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Assign Contact</DialogTitle>
              <DialogDescription>
                Assign {selectedContactForAssign?.first_name} {selectedContactForAssign?.last_name || ''} to a team member
              </DialogDescription>
            </DialogHeader>
            <UserSelector selectedUserId={assignToUserId} onChange={setAssignToUserId} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAssignConfirm} disabled={!assignToUserId}>Assign</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Contact Dialog */}
        <CreateContactDialog
          open={createContactDialogOpen}
          onOpenChange={setCreateContactDialogOpen}
          onContactCreated={() => queryClient.invalidateQueries({ queryKey: ['pipeline-contacts'] })}
        />
      </div>
    </DashboardLayout>
  );
}
