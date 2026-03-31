import { useState } from "react";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/Support/TicketStatusBadge";
import { CreateTicketDialog } from "@/components/Support/CreateTicketDialog";
import { TicketDetailDialog } from "@/components/Support/TicketDetailDialog";
import { useSupportTickets, type SupportTicket } from "@/hooks/useSupportTickets";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgContext } from "@/hooks/useOrgContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Plus, LifeBuoy, Search, AlertTriangle, Ticket, Clock, CheckCircle2, AlertCircle, Flame, Bell, BellOff } from "lucide-react";
import { format, isPast } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { TicketDashboardCharts } from "@/components/Support/TicketDashboardCharts";

export default function SupportTickets() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  const { isAdmin } = useUserRole();
  const { effectiveOrgId: orgId } = useOrgContext();

  const { ticketsQuery, createTicket, updateTicket, deleteTicket } = useSupportTickets({
    status: statusFilter,
    priority: priorityFilter,
    category: categoryFilter,
    source: sourceFilter,
    search: searchQuery || undefined,
  });

  // Fetch team members for assignment
  const teamQuery = useQuery({
    queryKey: ["team-members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data as { id: string; first_name: string; last_name: string }[];
    },
    enabled: !!orgId,
  });

  const handleCreate = (data: {
    subject: string;
    description: string;
    category: string;
    priority: string;
    contact_name: string;
    contact_phone: string;
    contact_email: string;
    company_name: string;
    attachments?: File[];
  }) => {
    createTicket.mutate(data, {
      onSuccess: () => setCreateOpen(false),
    });
  };

  const handleUpdateStatus = (id: string, status: string, resolution_notes?: string) => {
    updateTicket.mutate({ id, status, resolution_notes });
  };

  const handleAssign = (id: string, userId: string | null) => {
    updateTicket.mutate({ id, assigned_to: userId });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LifeBuoy className="h-6 w-6 text-primary" />
              Support Tickets
            </h1>
            <p className="text-sm text-muted-foreground">Raise and track support requests</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Ticket
          </Button>
        </div>

        {/* Admin Dashboard Stats */}
        {(() => {
          const tickets = ticketsQuery.data || [];
          const total = tickets.length;
          const openCount = tickets.filter(t => ["new", "assigned", "in_progress", "awaiting_client"].includes(t.status)).length;
          const resolvedCount = tickets.filter(t => ["resolved", "closed"].includes(t.status)).length;
          const overdueCount = tickets.filter(t => t.due_at && isPast(new Date(t.due_at)) && !["resolved", "closed"].includes(t.status)).length;
          const criticalCount = tickets.filter(t => t.priority === "critical" && !["resolved", "closed"].includes(t.status)).length;

          const stats = [
            { label: "Total Tickets", value: total, icon: Ticket, color: "text-primary", onClick: () => { setStatusFilter("all"); setPriorityFilter("all"); } },
            { label: "Open", value: openCount, icon: Clock, color: "text-blue-500", onClick: () => { setStatusFilter("in_progress"); setPriorityFilter("all"); } },
            { label: "Resolved", value: resolvedCount, icon: CheckCircle2, color: "text-green-500", onClick: () => { setStatusFilter("resolved"); setPriorityFilter("all"); } },
            { label: "Overdue", value: overdueCount, icon: AlertCircle, color: "text-destructive", onClick: () => { setStatusFilter("all"); setPriorityFilter("all"); } },
            { label: "Critical", value: criticalCount, icon: Flame, color: "text-orange-500", onClick: () => { setPriorityFilter("critical"); setStatusFilter("all"); } },
          ];

          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {stats.map((s) => (
                <Card
                  key={s.label}
                  className="cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-primary/20"
                  onClick={s.onClick}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <s.icon className={`h-8 w-8 ${s.color} shrink-0`} />
                    <div>
                      <p className="text-2xl font-bold">{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })()}

        {/* Dashboard Charts */}
        <TicketDashboardCharts
          tickets={ticketsQuery.data || []}
          onSourceClick={(sourceKey) => {
            setSourceFilter(sourceKey);
            setStatusFilter("all");
            setPriorityFilter("all");
            setCategoryFilter("all");
            setSearchQuery("");
            // Scroll to the ticket table
            setTimeout(() => {
              document.getElementById("tickets-table-section")?.scrollIntoView({ behavior: "smooth" });
            }, 100);
          }}
        />

        {/* Search & Filters */}
        <div id="tickets-table-section" className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ticket # or subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-56"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="awaiting_client">Awaiting Client</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="feature_request">Feature Request</SelectItem>
              <SelectItem value="billing">Billing</SelectItem>
              <SelectItem value="technical">Technical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="crm">CRM</SelectItem>
              <SelectItem value="rmpl">RMPL</SelectItem>
              <SelectItem value="paisaa_saarthi">Paisaa Saarthi</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="in_sync_website">In-Sync Website</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {ticketsQuery.isLoading ? (
          <LoadingState />
        ) : !ticketsQuery.data?.length ? (
          <EmptyState icon={<LifeBuoy className="h-12 w-12" />} message="No support tickets found" />
        ) : (
          <div className="rounded-md border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket #</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Assigned To</TableHead>
                    <TableHead className="hidden lg:table-cell">Created</TableHead>
                    <TableHead className="hidden md:table-cell">Due Date</TableHead>
                    <TableHead>Notified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ticketsQuery.data.map((ticket) => {
                    const overdue = ticket.due_at && isPast(new Date(ticket.due_at)) && !["resolved", "closed"].includes(ticket.status);
                    return (
                      <TableRow
                        key={ticket.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedTicket(ticket)}
                      >
                        <TableCell className="font-mono text-xs">{ticket.ticket_number}</TableCell>
                        <TableCell className="text-sm">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground capitalize">
                            {(ticket.source || "crm").replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate font-medium">{ticket.subject}</TableCell>
                        <TableCell className="hidden sm:table-cell capitalize text-sm">{ticket.category.replace("_", " ")}</TableCell>
                        <TableCell><TicketPriorityBadge priority={ticket.priority} /></TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={ticket.status}
                            onValueChange={(value) => handleUpdateStatus(ticket.id, value)}
                          >
                            <SelectTrigger className="h-7 w-[130px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="assigned">Assigned</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="awaiting_client">Awaiting Client</SelectItem>
                              <SelectItem value="resolved">Resolved</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm" onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={ticket.assigned_to || "unassigned"}
                            onValueChange={(value) => handleAssign(ticket.id, value === "unassigned" ? null : value)}
                          >
                            <SelectTrigger className="h-7 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {teamQuery.data?.map((member) => (
                                <SelectItem key={member.id} value={member.id}>
                                  {member.first_name} {member.last_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {format(new Date(ticket.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className={`hidden md:table-cell text-sm ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {ticket.due_at ? (
                            <span className="flex items-center gap-1">
                              {overdue && <AlertTriangle size={14} />}
                              {format(new Date(ticket.due_at), "MMM d, h:mm a")}
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {ticket.client_notified ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                              <Bell size={14} /> Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <BellOff size={14} /> No
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isLoading={createTicket.isPending}
      />

      <TicketDetailDialog
        ticket={selectedTicket ? (ticketsQuery.data?.find((t: any) => t.id === selectedTicket.id) as SupportTicket ?? selectedTicket) : null}
        open={!!selectedTicket}
        onOpenChange={(open) => !open && setSelectedTicket(null)}
        onUpdateStatus={handleUpdateStatus}
        onAssign={handleAssign}
        onDelete={(id) => {
          deleteTicket.mutate(id, {
            onSuccess: () => {
              setSelectedTicket(null);
            },
          });
        }}
        isDeleting={deleteTicket.isPending}
        isAdmin={isAdmin}
        teamMembers={teamQuery.data}
      />
    </DashboardLayout>
  );
}
