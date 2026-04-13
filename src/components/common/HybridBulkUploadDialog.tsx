import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileText, AlertCircle, Download, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/hooks/useNotification";
import Papa from "papaparse";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_RECORDS = 50000; // Increased limit for hybrid approach

interface HybridBulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  onUploadComplete: () => void;
  tableName: 'contacts' | 'inventory' | 'redefine_repository';
  title?: string;
  description?: string;
  templateColumns: string[];
  requiredColumn: string;
}

export function HybridBulkUploadDialog({ 
  open, 
  onOpenChange, 
  orgId, 
  onUploadComplete,
  tableName,
  title = "Bulk Upload",
  description = "Upload a CSV file. Maximum 50,000 records and 10MB file size.",
  templateColumns,
  requiredColumn
}: HybridBulkUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [validationError, setValidationError] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<string>("");
  const notification = useNotification();

  const validateFile = (file: File): string | null => {
    if (!file.type.includes('csv') && !file.name.endsWith('.csv')) {
      return 'Please select a CSV file';
    }

    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be less than 10MB';
    }

    return null;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const error = validateFile(droppedFile);
      if (error) {
        setValidationError(error);
        setFile(null);
      } else {
        setValidationError("");
        setFile(droppedFile);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const error = validateFile(selectedFile);
      if (error) {
        setValidationError(error);
        setFile(null);
      } else {
        setValidationError("");
        setFile(selectedFile);
      }
    }
  };

  const downloadTemplate = () => {
    const csvContent = templateColumns.join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableName}_template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    notification.info("Template Downloaded", "Use this template to format your CSV file.");
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStage("Parsing CSV...");

    try {
      // Parse CSV using PapaParse
      const text = await file.text();
      
      const parseResult = await new Promise<Papa.ParseResult<Record<string, string>>>((resolve, reject) => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: resolve,
          error: reject
        });
      });

      const records = parseResult.data;
      const recordCount = records.length;

      // Validate record count
      if (recordCount === 0) {
        setValidationError("CSV file is empty or has no valid data rows");
        setIsUploading(false);
        return;
      }

      if (recordCount > MAX_RECORDS) {
        setValidationError(`File contains ${recordCount} records. Maximum allowed is ${MAX_RECORDS}`);
        setIsUploading(false);
        return;
      }

      // Check for required column
      const headers = Object.keys(records[0] || {}).map(h => h.toLowerCase().trim());
      if (!headers.includes(requiredColumn.toLowerCase())) {
        setValidationError(`CSV must contain a '${requiredColumn}' column`);
        setIsUploading(false);
        return;
      }

      setUploadProgress(10);
      setUploadStage("Creating import session...");

      // Step 1: Create import session (RPC — no edge function cold-start)
      const { data: sessionData, error: sessionError } = await supabase.rpc('create_import_session', {
        _table_name: tableName,
        _file_name: file.name,
        _total_records: recordCount,
      });

      if (sessionError || !sessionData?.importId) {
        throw new Error(sessionError?.message || 'Failed to create import session');
      }

      const { importId } = sessionData;
      
      setUploadProgress(30);
      setUploadStage("Processing records...");

      // Step 2: Send all records to hybrid processor
      const { data: processResult, error: processError } = await supabase.functions.invoke('process-import-hybrid', {
        body: { 
          importId, 
          records, 
          tableName 
        }
      });

      if (processError) {
        throw new Error(processError.message || 'Failed to process import');
      }

      setUploadProgress(100);
      setUploadStage("Complete!");

      // Show results
      const { inserted = 0, skipped = 0, failed = 0, status } = processResult;
      
      if (status === 'completed') {
        notification.success(
          "Upload completed", 
          `${inserted} records imported${skipped > 0 ? `, ${skipped} duplicates skipped` : ''}`
        );
      } else if (status === 'partial') {
        notification.info(
          "Upload partially completed",
          `${inserted} imported, ${failed} failed`
        );
      } else {
        notification.error("Upload failed", `All ${failed} records failed to import`);
      }

      onUploadComplete();
      handleClose();
    } catch (error: any) {
      console.error('Upload error:', error);
      notification.error("Upload failed", error.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStage("");
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setFile(null);
      setValidationError("");
      setUploadProgress(0);
      setUploadStage("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="mb-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadTemplate}
            className="w-full"
          >
            <Download className="w-4 h-4 mr-2" />
            Download CSV Template
          </Button>
        </div>

        <div className="space-y-4">
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          {isUploading ? (
            <div className="space-y-4 py-8">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <div className="text-center">
                  <p className="font-medium">{uploadStage}</p>
                  <p className="text-sm text-muted-foreground">Please don't close this dialog</p>
                </div>
              </div>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          ) : (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging ? 'border-primary bg-primary/5' : 'border-border'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="space-y-2">
                  <FileText className="h-12 w-12 mx-auto text-primary" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFile(null);
                      setValidationError("");
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag and drop your CSV file here, or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                    id={`${tableName}-file-upload`}
                  />
                  <label htmlFor={`${tableName}-file-upload`}>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <span>Browse Files</span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="bg-muted p-3 rounded-lg text-xs space-y-1">
            <p className="font-medium">Requirements:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>UTF-8 encoded CSV file</li>
              <li>Required column: <code className="bg-background px-1 rounded">{requiredColumn}</code></li>
              <li>Maximum 50,000 records per upload</li>
              <li>Maximum file size: 10MB</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleUpload}
              disabled={!file || isUploading}
            >
              {isUploading ? "Processing..." : "Upload"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
