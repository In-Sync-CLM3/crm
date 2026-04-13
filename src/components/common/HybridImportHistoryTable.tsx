import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, RotateCcw, Loader2, X, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { useNotification } from "@/hooks/useNotification";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

interface HybridImportHistoryTableProps {
  orgId: string;
  tableName?: string;
  limit?: number;
}

interface ImportHistory {
  id: string;
  file_name: string;
  table_name: string;
  status: string;
  total_records: number;
  successful_records: number;
  failed_records: number;
  can_revert: boolean;
  error_log: any[];
  created_at: string;
  completed_at: string | null;
}

export function HybridImportHistoryTable({ orgId, tableName, limit = 5 }: HybridImportHistoryTableProps) {
  const [revertImportId, setRevertImportId] = useState<string | null>(null);
  const [cancelImportId, setCancelImportId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const notification = useNotification();

  const { data: imports = [], isLoading } = useQuery({
    queryKey: ['bulk-import-history', orgId, tableName],
    queryFn: async () => {
      let query = supabase
        .from('bulk_import_history')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (tableName) {
        query = query.eq('table_name', tableName);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ImportHistory[];
    },
    refetchInterval: 5000,
  });

  const revertMutation = useMutation({
    mutationFn: async (importId: string) => {
      const { data, error } = await supabase.functions.invoke('revert-import', {
        body: { importId }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Revert failed');
      return data;
    },
    onSuccess: (data) => {
      notification.success("Revert completed", `${data.deleted} records have been removed`);
      queryClient.invalidateQueries({ queryKey: ['bulk-import-history'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setRevertImportId(null);
    },
    onError: (error: any) => {
      notification.error("Revert failed", error.message);
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (importId: string) => {
      const { data, error } = await supabase.rpc('cancel_import', {
        _import_id: importId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      notification.success("Import cancelled", "The import process has been stopped");
      queryClient.invalidateQueries({ queryKey: ['bulk-import-history'] });
      setCancelImportId(null);
    },
    onError: (error: any) => {
      notification.error("Cancel failed", error.message);
    }
  });

  const downloadErrorFile = (importRecord: ImportHistory) => {
    if (!importRecord.error_log || importRecord.error_log.length === 0) {
      notification.error("No errors", "This import has no errors to download");
      return;
    }

    const errorLines = ['Row,Error'];
    importRecord.error_log.forEach((err: any) => {
      errorLines.push(`${err.row || 'N/A'},"${String(err.error || 'Unknown error').replace(/"/g, '""')}"`);
    });

    const blob = new Blob([errorLines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${importRecord.file_name}-errors.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode; label: string }> = {
      pending: { variant: "secondary", icon: <Clock className="h-3 w-3 mr-1" />, label: "Pending" },
      processing: { variant: "default", icon: <Loader2 className="h-3 w-3 mr-1 animate-spin" />, label: "Processing" },
      completed: { variant: "default", icon: <CheckCircle2 className="h-3 w-3 mr-1" />, label: "Completed" },
      partial: { variant: "outline", icon: <AlertCircle className="h-3 w-3 mr-1" />, label: "Partial" },
      failed: { variant: "destructive", icon: <AlertCircle className="h-3 w-3 mr-1" />, label: "Failed" },
      cancelled: { variant: "secondary", icon: <X className="h-3 w-3 mr-1" />, label: "Cancelled" },
      reverted: { variant: "secondary", icon: <RotateCcw className="h-3 w-3 mr-1" />, label: "Reverted" }
    };
    const statusConfig = config[status] || { variant: "secondary" as const, icon: null, label: status };
    return (
      <Badge variant={statusConfig.variant} className="flex items-center w-fit">
        {statusConfig.icon}
        {statusConfig.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (imports.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No import history available
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Records</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.map((importRecord) => (
              <TableRow key={importRecord.id}>
                <TableCell className="font-medium max-w-[200px] truncate">
                  {importRecord.file_name}
                </TableCell>
                <TableCell className="capitalize">
                  {importRecord.table_name.replace('_', ' ')}
                </TableCell>
                <TableCell>{getStatusBadge(importRecord.status)}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div className="text-green-600">{importRecord.successful_records || 0} imported</div>
                    {importRecord.failed_records > 0 && (
                      <div className="text-destructive">{importRecord.failed_records} failed</div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(importRecord.created_at), 'MMM d, yyyy HH:mm')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {(importRecord.status === 'processing' || importRecord.status === 'pending') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancelImportId(importRecord.id)}
                        disabled={cancelMutation.isPending}
                        title="Cancel import"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    
                    {importRecord.failed_records > 0 && importRecord.error_log?.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadErrorFile(importRecord)}
                        title="Download error log"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    
                    {['completed', 'partial'].includes(importRecord.status) && 
                     importRecord.can_revert && 
                     importRecord.successful_records > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevertImportId(importRecord.id)}
                        disabled={revertMutation.isPending}
                        title="Revert import"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={revertImportId !== null}
        onOpenChange={(open) => !open && setRevertImportId(null)}
        title="Revert Import"
        description="This will permanently delete all records imported in this upload. This action cannot be undone."
        onConfirm={() => revertImportId && revertMutation.mutate(revertImportId)}
        confirmText="Revert Import"
        variant="destructive"
      />

      <ConfirmDialog
        open={cancelImportId !== null}
        onOpenChange={(open) => !open && setCancelImportId(null)}
        title="Cancel Import"
        description="This will stop the import process. Already imported records will not be removed."
        onConfirm={() => cancelImportId && cancelMutation.mutate(cancelImportId)}
        confirmText="Cancel Import"
      />
    </>
  );
}
