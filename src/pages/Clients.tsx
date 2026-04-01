import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, Receipt, RefreshCw, UserCheck, UserX, AlertTriangle, Trash2, X } from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ClientStatusBadge } from "@/components/ClientHub/ClientStatusBadge";
import { DuplicateClientsManager } from "@/components/ClientHub/DuplicateClientsManager";
import { usePagination } from "@/hooks/usePagination";
import PaginationControls from "@/components/common/PaginationControls";
import { format } from "date-fns";

type StatusFilter = 'all' | 'active' | 'inactive' | 'churned';

export default function Clients() {
  const navigate = useNavigate();
  const { effectiveOrgId } = useOrgContext();
  const notify = useNotification();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDuplicatesManager, setShowDuplicatesManager] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const pagination = usePagination({ defaultPageSize: 25 });

  // Debounce search to avoid query on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset to page 1 when filters change
  useEffect(() => {
    pagination.setPage(1);
  }, [statusFilter, companyFilter, cityFilter, stateFilter, debouncedSearch]);

  // Server-side paginated query with filters
  const { data: clientsData, isLoading, refetch } = useQuery({
    queryKey: ["clients", effectiveOrgId, pagination.currentPage, pagination.pageSize, statusFilter, companyFilter, cityFilter, stateFilter, debouncedSearch],
    queryFn: async () => {
      if (!effectiveOrgId) return { data: [], count: 0 };
      const offset = (pagination.currentPage - 1) * pagination.pageSize;

      let query = supabase
        .from("clients")
        .select(`
          *,
          contact:contacts(pipeline_stage_id, email),
          documents:client_documents(count),
          invoices:client_invoices(count)
        `, { count: 'exact' })
        .eq("org_id", effectiveOrgId);

      // Server-side filters
      if (statusFilter !== 'all') {
        query = query.eq("status", statusFilter);
      }
      if (companyFilter !== "all") {
        query = query.eq("company", companyFilter);
      }
      if (cityFilter !== "all") {
        query = query.eq("city", cityFilter);
      }
      if (stateFilter !== "all") {
        query = query.eq("state", stateFilter);
      }
      if (debouncedSearch) {
        query = query.or(`first_name.ilike.%${debouncedSearch}%,last_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%,company.ilike.%${debouncedSearch}%`);
      }

      const { data, error, count } = await query
        .order("converted_at", { ascending: false })
        .range(offset, offset + pagination.pageSize - 1);

      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
    enabled: !!effectiveOrgId,
  });

  // Lightweight stats query - only fetches status column, no joins
  const { data: clientStats } = useQuery({
    queryKey: ["client-stats", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return { total: 0, active: 0, inactive: 0, churned: 0, withInvoices: 0 };

      const { data, error } = await supabase
        .from("clients")
        .select("status")
        .eq("org_id", effectiveOrgId);

      if (error) throw error;

      const total = data?.length || 0;
      const active = data?.filter(c => (c.status || 'active') === 'active').length || 0;
      const inactive = data?.filter(c => c.status === 'inactive').length || 0;
      const churned = data?.filter(c => c.status === 'churned').length || 0;

      return { total, active, inactive, churned, withInvoices: 0 };
    },
    enabled: !!effectiveOrgId,
    staleTime: 30000,
  });

  // Lightweight filter options query - only fetches columns needed for dropdowns
  const { data: filterOptions } = useQuery({
    queryKey: ["client-filter-options", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return { companies: [] as string[], cities: [] as string[], states: [] as string[] };

      const { data, error } = await supabase
        .from("clients")
        .select("company, city, state")
        .eq("org_id", effectiveOrgId);

      if (error) throw error;

      return {
        companies: [...new Set(data?.map(c => c.company).filter(Boolean) || [])].sort() as string[],
        cities: [...new Set(data?.map(c => c.city).filter(Boolean) || [])].sort() as string[],
        states: [...new Set(data?.map(c => c.state).filter(Boolean) || [])].sort() as string[],
      };
    },
    enabled: !!effectiveOrgId,
    staleTime: 60000,
  });

  const clients = clientsData?.data || [];
  const stats = clientStats || { total: 0, active: 0, inactive: 0, churned: 0, withInvoices: 0 };
  const companies = filterOptions?.companies || [];
  const cities = filterOptions?.cities || [];
  const states = filterOptions?.states || [];

  // Update pagination total when data changes
  useEffect(() => {
    if (clientsData?.count !== undefined) {
      pagination.setTotalRecords(clientsData.count);
    }
  }, [clientsData?.count]);

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("clients")
        .delete()
        .in("id", ids);

      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Clients deleted", `${selectedIds.size} client(s) have been removed`);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client-stats"] });
      queryClient.invalidateQueries({ queryKey: ["client-filter-options"] });
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
    },
    onError: () => {
      notify.error("Error", "Failed to delete clients");
    },
  });

  const hasActiveFilters = companyFilter !== "all" || cityFilter !== "all" || stateFilter !== "all";

  const clearAllFilters = () => {
    setCompanyFilter("all");
    setCityFilter("all");
    setStateFilter("all");
    setSearchTerm("");
    setStatusFilter("all");
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && clients.length > 0) {
      setSelectedIds(new Set(clients.map(c => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const allSelected = clients.length > 0 && clients.every(c => selectedIds.has(c.id));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Client Hub</h1>
            <p className="text-muted-foreground">
              Your central place for managing clients, documents, and invoices
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowDuplicatesManager(true)}>
              <AlertTriangle className="h-4 w-4 mr-2" />
              Find Duplicates
            </Button>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
              <UserCheck className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inactive / Churned</CardTitle>
              <UserX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inactive + stats.churned}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With Invoices</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.withInvoices}</div>
            </CardContent>
          </Card>
        </div>

        {/* Status Filter Tabs */}
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
            <TabsTrigger value="active">Active ({stats.active})</TabsTrigger>
            <TabsTrigger value="inactive">Inactive ({stats.inactive})</TabsTrigger>
            <TabsTrigger value="churned">Churned ({stats.churned})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search and Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {companies.length > 0 && (
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-[180px] text-xs">
                  <SelectValue placeholder="Company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Companies</SelectItem>
                  {companies.map(c => <SelectItem key={c} value={c!}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {cities.length > 0 && (
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="w-[160px] text-xs">
                  <SelectValue placeholder="City" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  {cities.map(c => <SelectItem key={c} value={c!}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {states.length > 0 && (
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="w-[160px] text-xs">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {states.map(s => <SelectItem key={s} value={s!}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs text-muted-foreground gap-1">
                <X className="h-3.5 w-3.5" />Clear Filters
              </Button>
            )}
          </div>
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedIds.size})
            </Button>
          )}
        </div>

        {/* Clients Table */}
        {isLoading ? (
          <LoadingState message="Loading clients..." />
        ) : !clients.length ? (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title="No clients yet"
            message={statusFilter !== 'all'
              ? `No ${statusFilter} clients found.`
              : "Clients will appear here when deals are marked as Won in the pipeline."
            }
          />
        ) : (
          <>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="py-2 w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="py-2 text-xs">Client Name</TableHead>
                      <TableHead className="py-2 text-xs">Status</TableHead>
                      <TableHead className="py-2 text-xs">Company</TableHead>
                      <TableHead className="py-2 text-xs">Email</TableHead>
                      <TableHead className="py-2 text-xs">Phone</TableHead>
                      <TableHead className="py-2 text-xs">Converted On</TableHead>
                      <TableHead className="py-2 text-xs">Documents</TableHead>
                      <TableHead className="py-2 text-xs">Invoices</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow
                        key={client.id}
                        className="cursor-pointer hover:bg-muted/50"
                      >
                        <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(client.id)}
                            onCheckedChange={(checked) => handleSelectOne(client.id, !!checked)}
                          />
                        </TableCell>
                        <TableCell
                          className="py-1.5 font-medium"
                          onClick={() => navigate(`/clients/${client.id}`)}
                        >
                          {client.first_name} {client.last_name}
                        </TableCell>
                        <TableCell className="py-1.5" onClick={() => navigate(`/clients/${client.id}`)}>
                          <ClientStatusBadge status={client.status} showIcon={false} />
                        </TableCell>
                        <TableCell className="py-1.5 text-xs" onClick={() => navigate(`/clients/${client.id}`)}>
                          {client.company || "-"}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs" onClick={() => navigate(`/clients/${client.id}`)}>
                          {client.email || (client.contact as any)?.email || "-"}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs" onClick={() => navigate(`/clients/${client.id}`)}>
                          {client.phone || "-"}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs" onClick={() => navigate(`/clients/${client.id}`)}>
                          {format(new Date(client.converted_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="py-1.5" onClick={() => navigate(`/clients/${client.id}`)}>
                          <Badge variant="outline" className="text-xs">
                            {(client.documents as any)?.[0]?.count || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5" onClick={() => navigate(`/clients/${client.id}`)}>
                          <Badge variant="outline" className="text-xs">
                            {(client.invoices as any)?.[0]?.count || 0}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <PaginationControls pagination={pagination} />
          </>
        )}
      </div>

      <DuplicateClientsManager
        open={showDuplicatesManager}
        onOpenChange={setShowDuplicatesManager}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Clients"
        description={`Are you sure you want to delete ${selectedIds.size} client(s)? This action cannot be undone and will also remove all associated documents and invoices.`}
        confirmText="Delete"
        onConfirm={() => deleteMutation.mutate(Array.from(selectedIds))}
        variant="destructive"
      />
    </DashboardLayout>
  );
}
