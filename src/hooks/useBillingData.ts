import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { toast } from "sonner";
import type {
  BillingDocument,
  BillingDocumentItem,
  BillingPayment,
  BillingSettings,
  BillingDocumentType,
  BillingDocumentStatus,
} from "@/types/billing";
import { getCurrentFinancialYear } from "@/utils/billingUtils";
import { INDIAN_STATES } from "@/types/billing";

// Default billing settings
const DEFAULT_SETTINGS: BillingSettings = {
  org_id: "",
  company_name: "",
  company_gstin: "",
  company_pan: "",
  company_state: "",
  company_state_code: "",
  company_address: "",
  company_email: "",
  company_phone: "",
  bank_name: "",
  bank_account_number: "",
  bank_ifsc: "",
  bank_branch: "",
  bank_upi_id: "",
  default_terms: "1. Payment is due within 30 days.\n2. Subject to local jurisdiction.",
  default_tax_rate: 18,
  default_due_days: 30,
  default_hsn: "998314",
  invoice_prefix: "INV",
  proforma_prefix: "PI",
  next_invoice_number: 1,
  next_proforma_number: 1,
  credit_note_prefix: "CN",
  next_credit_note_number: 1,
};

export function useBillingData() {
  const { effectiveOrgId } = useOrgContext();
  const [documents, setDocuments] = useState<BillingDocument[]>([]);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [settings, setSettingsState] = useState<BillingSettings>({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // ─── Fetch all billing data from Supabase ───
  const fetchAll = useCallback(async () => {
    if (!effectiveOrgId) return;
    setLoading(true);
    try {
      // Parallel fetch: documents (with nested items), payments, and settings
      const [docsResult, paysResult, settingsResult] = await Promise.all([
        // Fetch documents with items via nested select (eliminates separate items query)
        supabase
          .from("billing_documents")
          .select("*, billing_document_items(*)")
          .eq("org_id", effectiveOrgId)
          .order("created_at", { ascending: false }),
        // Fetch payments
        supabase
          .from("billing_payments")
          .select("*")
          .eq("org_id", effectiveOrgId)
          .order("created_at", { ascending: false }),
        // Fetch settings
        supabase
          .from("billing_settings")
          .select("*")
          .eq("org_id", effectiveOrgId)
          .maybeSingle(),
      ]);

      if (docsResult.error) throw docsResult.error;
      if (paysResult.error) throw paysResult.error;
      if (settingsResult.error) throw settingsResult.error;

      const docs = docsResult.data || [];

      // For documents missing client_billing_snapshot, look up from clients table
      const missingClientIds = [...new Set(
        docs
          .filter(d => !(d as any).client_billing_snapshot && d.client_id)
          .map(d => d.client_id)
      )];
      let clientLookup: Record<string, any> = {};
      if (missingClientIds.length > 0) {
        const { data: clientRows } = await supabase
          .from("clients")
          .select("id, company, first_name, last_name, address, city, state, postal_code")
          .in("id", missingClientIds);
        for (const c of clientRows || []) {
          const stateCode = INDIAN_STATES.find(s => s.name === c.state)?.code || "";
          clientLookup[c.id] = {
            company: c.company || `${c.first_name} ${c.last_name || ""}`.trim(),
            first_name: c.first_name,
            last_name: c.last_name || "",
            billing_address: c.address || "",
            city: c.city || "",
            state: c.state || "",
            billing_state_code: stateCode,
            pin_code: c.postal_code || "",
          };
        }
        // Auto-save snapshots back to DB so this lookup only happens once
        for (const d of docs) {
          if (!(d as any).client_billing_snapshot && d.client_id && clientLookup[d.client_id]) {
            supabase.from("billing_documents")
              .update({ client_billing_snapshot: clientLookup[d.client_id] })
              .eq("id", d.id)
              .then(() => {});
          }
        }
      }

      const mappedDocs: BillingDocument[] = docs.map(d => {
        // Map nested items, sorted by sort_order
        const rawItems = ((d as any).billing_document_items || []) as any[];
        rawItems.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
        const items: BillingDocumentItem[] = rawItems.map((item: any) => ({
          id: item.id,
          document_id: item.document_id,
          description: item.description,
          hsn_sac: item.hsn_sac || "",
          qty: Number(item.qty),
          unit: item.unit || "Nos",
          rate: Number(item.rate),
          discount: Number(item.discount || 0),
          tax_rate: Number(item.tax_rate || 18),
          taxable: Number(item.taxable || 0),
          cgst: Number(item.cgst || 0),
          sgst: Number(item.sgst || 0),
          igst: Number(item.igst || 0),
          total: Number(item.total || 0),
          sort_order: item.sort_order || 0,
        }));

        return {
          id: d.id,
          org_id: d.org_id,
          doc_type: d.doc_type as BillingDocumentType,
          doc_number: d.doc_number,
          client_id: d.client_id || "",
          client_name: d.client_name,
          client: (d as any).client_billing_snapshot || clientLookup[d.client_id] || undefined,
          doc_date: d.doc_date,
          due_date: d.due_date || "",
          financial_year: d.financial_year || "",
          supply_type: (d.supply_type || "intra_state") as any,
          subtotal: Number(d.subtotal),
          total_tax: Number(d.total_tax),
          total_amount: Number(d.total_amount),
          amount_paid: Number(d.amount_paid || 0),
          balance_due: Number(d.balance_due),
          status: (d.status || "draft") as BillingDocumentStatus,
          notes: d.notes || undefined,
          terms_and_conditions: d.terms_and_conditions || undefined,
          original_invoice_id: d.original_invoice_id || undefined,
          original_invoice_number: d.original_invoice_number || undefined,
          converted_from_id: (d as any).converted_from_id || undefined,
          items,
          created_at: d.created_at || undefined,
          updated_at: d.updated_at || undefined,
        };
      });

      setDocuments(mappedDocs);

      // Process payments (already fetched in parallel)
      const pays = paysResult.data || [];
      setPayments(pays.map(p => ({
        id: p.id,
        document_id: p.document_id,
        payment_date: p.payment_date,
        amount: Number(p.amount),
        tds_amount: Number((p as any).tds_amount || 0),
        payment_mode: p.payment_mode as any,
        reference_number: p.reference_number || undefined,
        notes: p.notes || undefined,
        org_id: p.org_id,
        created_by: p.created_by || undefined,
        created_at: p.created_at || undefined,
      })));

      // Process settings (already fetched in parallel)
      const settingsData = settingsResult.data;
      if (settingsData) {
        setSettingsState({
          id: settingsData.id,
          org_id: settingsData.org_id,
          company_name: settingsData.company_name || "",
          company_gstin: settingsData.company_gstin || "",
          company_pan: settingsData.company_pan || "",
          company_state: settingsData.company_state || "",
          company_state_code: settingsData.company_state_code || "",
          company_address: settingsData.company_address || "",
          company_email: settingsData.company_email || "",
          company_phone: settingsData.company_phone || "",
          bank_name: settingsData.bank_name || "",
          bank_account_number: settingsData.bank_account_number || "",
          bank_ifsc: settingsData.bank_ifsc || "",
          bank_branch: settingsData.bank_branch || "",
          bank_upi_id: settingsData.bank_upi_id || "",
          default_terms: settingsData.default_terms || DEFAULT_SETTINGS.default_terms,
          default_proforma_terms: settingsData.default_proforma_terms || undefined,
          default_credit_note_terms: settingsData.default_credit_note_terms || undefined,
          default_tax_rate: Number(settingsData.default_tax_rate ?? 18),
          default_due_days: settingsData.default_due_days ?? 30,
          default_hsn: settingsData.default_hsn || "998314",
          invoice_prefix: settingsData.invoice_prefix || "INV",
          proforma_prefix: settingsData.proforma_prefix || "PI",
          credit_note_prefix: settingsData.credit_note_prefix || "CN",
          next_invoice_number: settingsData.next_invoice_number ?? 1,
          next_proforma_number: settingsData.next_proforma_number ?? 1,
          next_credit_note_number: settingsData.next_credit_note_number ?? 1,
          logo_url: settingsData.logo_url || undefined,
          signature_url: settingsData.signature_url || undefined,
        });
      } else {
        setSettingsState({ ...DEFAULT_SETTINGS, org_id: effectiveOrgId });
      }
    } catch (err) {
      console.error("Error fetching billing data:", err);
    } finally {
      setLoading(false);
    }
  }, [effectiveOrgId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ─── Helper: save items for a document ───
  const saveItems = async (documentId: string, items: BillingDocumentItem[]) => {
    // Delete existing items
    await supabase.from("billing_document_items").delete().eq("document_id", documentId);
    // Insert new items
    if (items.length > 0) {
      const rows = items.map((item, idx) => ({
        document_id: documentId,
        description: item.description,
        hsn_sac: item.hsn_sac,
        qty: item.qty,
        unit: item.unit,
        rate: item.rate,
        discount: item.discount,
        tax_rate: item.tax_rate,
        taxable: item.taxable,
        cgst: item.cgst,
        sgst: item.sgst,
        igst: item.igst,
        total: item.total,
        sort_order: idx,
      }));
      const { error } = await supabase.from("billing_document_items").insert(rows);
      if (error) console.error("Error saving items:", error);
    }
  };

  // ─── Helper: increment next doc number in settings ───
  const incrementDocNumber = async (docType: BillingDocumentType) => {
    const key = docType === "proforma" ? "next_proforma_number"
      : docType === "credit_note" ? "next_credit_note_number"
      : "next_invoice_number";
    const nextVal = (settings[key] as number) + 1;
    const newSettings = { ...settings, [key]: nextVal };

    if (settings.id) {
      await supabase.from("billing_settings").update({ [key]: nextVal, updated_at: new Date().toISOString() }).eq("id", settings.id);
    } else {
      const { data } = await supabase.from("billing_settings").insert({ ...newSettings, org_id: effectiveOrgId! }).select().single();
      if (data) newSettings.id = data.id;
    }
    setSettingsState(newSettings);
  };

  // ─── Check if a document number already exists ───
  const checkDuplicateDocNumber = async (docNumber: string, excludeId?: string): Promise<boolean> => {
    if (!effectiveOrgId) return false;
    let query = supabase
      .from("billing_documents")
      .select("id")
      .eq("org_id", effectiveOrgId)
      .eq("doc_number", docNumber);
    if (excludeId) {
      query = query.neq("id", excludeId);
    }
    const { data } = await query.maybeSingle();
    return !!data;
  };

  // ─── Document CRUD ───
  const addDocument = useCallback(async (doc: BillingDocument): Promise<{ success: boolean; error?: string }> => {
    if (!effectiveOrgId || busy) return { success: false, error: "Not ready" };
    const { items, client, ...docData } = doc as any;

    // Check for duplicate document number
    const isDuplicate = await checkDuplicateDocNumber(docData.doc_number);
    if (isDuplicate) {
      return { success: false, error: `Document number "${docData.doc_number}" already exists. Please use a different number or delete the existing document first.` };
    }

    const row = {
      org_id: effectiveOrgId,
      doc_type: docData.doc_type,
      doc_number: docData.doc_number,
      client_id: docData.client_id || null,
      client_name: docData.client_name,
      client_billing_snapshot: client || null,
      doc_date: docData.doc_date,
      due_date: docData.due_date || null,
      financial_year: docData.financial_year || null,
      supply_type: docData.supply_type || null,
      subtotal: docData.subtotal,
      total_tax: docData.total_tax,
      total_amount: docData.total_amount,
      amount_paid: docData.amount_paid || 0,
      balance_due: docData.balance_due,
      status: docData.status || "draft",
      notes: docData.notes || null,
      terms_and_conditions: docData.terms_and_conditions || null,
      original_invoice_id: docData.original_invoice_id || null,
      original_invoice_number: docData.original_invoice_number || null,
    };

    const { data, error } = await supabase.from("billing_documents").insert(row).select().single();
    if (error) {
      console.error("Error adding document:", error);
      if ((error as any).code === "23505") {
        const msg = `Document number "${docData.doc_number}" already exists. Please use a different number.`;
        toast.error(msg);
        return { success: false, error: msg };
      }
      return { success: false, error: "Failed to save document" };
    }

    // Save items
    await saveItems(data.id, items || []);
    // Increment doc number
    await incrementDocNumber(doc.doc_type);

    // Add to local state
    const newDoc: BillingDocument = { ...doc, id: data.id, org_id: effectiveOrgId, items: items || [] };
    setDocuments(prev => [newDoc, ...prev]);
    return { success: true };
  }, [effectiveOrgId, settings]);

  const updateDocument = useCallback(async (id: string, updates: Partial<BillingDocument>): Promise<{ success: boolean; error?: string }> => {
    const { items, client, ...updateData } = updates as any;
    const row: Record<string, any> = { updated_at: new Date().toISOString() };

    // Only include fields that are being updated
    const fields = ["doc_type", "doc_number", "client_id", "client_name", "doc_date", "due_date",
      "financial_year", "supply_type", "subtotal", "total_tax", "total_amount", "amount_paid",
      "balance_due", "status", "notes", "terms_and_conditions", "original_invoice_id", "original_invoice_number"];
    for (const f of fields) {
      if (f in updateData) row[f] = updateData[f];
    }
    // Save client billing snapshot if client details are provided
    if (client) row.client_billing_snapshot = client;

    // Strict duplicate guard: if doc_number is being changed, confirm no other
    // doc in the same org already holds that number before attempting the
    // update. The DB unique index is the final backstop.
    if ("doc_number" in row) {
      const isDup = await checkDuplicateDocNumber(row.doc_number, id);
      if (isDup) {
        const msg = `Document number "${row.doc_number}" already exists. Please use a different number.`;
        toast.error(msg);
        return { success: false, error: msg };
      }
    }

    const { error } = await supabase.from("billing_documents").update(row).eq("id", id);
    if (error) {
      console.error("Error updating document:", error);
      if ((error as any).code === "23505") {
        const msg = `Document number "${row.doc_number}" already exists. Please use a different number.`;
        toast.error(msg);
        return { success: false, error: msg };
      }
      return { success: false, error: "Failed to update document" };
    }

    // Update items if provided
    if (items) await saveItems(id, items);

    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    return { success: true };
  }, [effectiveOrgId]);

  const deleteDocument = useCallback(async (id: string) => {
    if (!effectiveOrgId) return;

    // Capture the doc before delete so we know its type + numeric suffix
    // for counter reconciliation. Items and payments cascade-delete via FK.
    const target = documents.find(d => d.id === id);
    const { error } = await supabase.from("billing_documents").delete().eq("id", id);
    if (error) { console.error("Error deleting document:", error); return; }
    setDocuments(prev => prev.filter(d => d.id !== id));
    setPayments(prev => prev.filter(p => p.document_id !== id));

    // Release the deleted number back into the series: the next new doc of
    // the same type should reuse the highest unused slot. We recompute the
    // counter from whatever invoices actually remain for this org+type.
    if (target) {
      const counterKey =
        target.doc_type === "proforma" ? "next_proforma_number" :
        target.doc_type === "credit_note" ? "next_credit_note_number" :
        "next_invoice_number";
      const { data: remaining } = await supabase
        .from("billing_documents")
        .select("doc_number")
        .eq("org_id", effectiveOrgId)
        .eq("doc_type", target.doc_type);
      const maxNum = (remaining || []).reduce((mx, r: any) => {
        const m = /-(\d+)$/.exec(r.doc_number || "");
        const n = m ? parseInt(m[1], 10) : 0;
        return n > mx ? n : mx;
      }, 0);
      const nextVal = maxNum + 1;
      if (settings.id && settings[counterKey] !== nextVal) {
        await supabase.from("billing_settings")
          .update({ [counterKey]: nextVal, updated_at: new Date().toISOString() })
          .eq("id", settings.id);
        setSettingsState(prev => ({ ...prev, [counterKey]: nextVal }));
      }
    }
  }, [effectiveOrgId, documents, settings]);

  const convertDocument = useCallback(async (doc: BillingDocument, targetType: BillingDocumentType) => {
    if (!effectiveOrgId || busy) return doc;
    setBusy(true);
    try {
      // Idempotency: if this source doc has already been converted to the
      // target type, return the existing sibling instead of creating a duplicate.
      if (doc.id) {
        const { data: existing } = await supabase
          .from("billing_documents")
          .select("id, doc_number, doc_type")
          .eq("org_id", effectiveOrgId)
          .eq("converted_from_id", doc.id)
          .eq("doc_type", targetType)
          .maybeSingle();
        if (existing) {
          toast.info(`${doc.doc_number} was already converted to ${existing.doc_number}. Opening it.`);
          return { ...doc, id: existing.id, doc_type: targetType, doc_number: existing.doc_number } as BillingDocument;
        }
      }

      // Fetch latest settings to get correct next number
      const { data: latestSettings } = await supabase
        .from("billing_settings")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .maybeSingle();

      const currentSettings = latestSettings || settings;
      const fy = getCurrentFinancialYear();
      const prefix = targetType === "proforma" ? (currentSettings.proforma_prefix || "PI") : (currentSettings.invoice_prefix || "INV");

      // Derive next number from actual docs in this FY so each financial year
      // starts at 0001 regardless of the legacy shared counter.
      const pfx = `${prefix}-${fy}-`;
      const { data: existingInFy } = await supabase
        .from("billing_documents")
        .select("doc_number")
        .eq("org_id", effectiveOrgId)
        .eq("doc_type", targetType)
        .like("doc_number", `${pfx}%`);
      const maxInFy = (existingInFy || []).reduce((mx, r: any) => {
        const m = /-(\d+)$/.exec(r.doc_number || "");
        const n = m ? parseInt(m[1], 10) : 0;
        return n > mx ? n : mx;
      }, 0);
      const nextNum = maxInFy + 1;
      const newDocNumber = `${prefix}-${fy}-${String(nextNum).padStart(4, "0")}`;

      // Check for duplicate document number
      const isDuplicate = await checkDuplicateDocNumber(newDocNumber);
      if (isDuplicate) {
        toast.error(`Document number "${newDocNumber}" already exists. Please check billing settings.`);
        return doc;
      }

      const { items, client, id, ...docData } = doc as any;
      // On PI→Invoice conversion, swap proforma boilerplate (e.g. "Tax invoice
      // will be issued upon receipt of payment") for the invoice-default terms.
      // Only override when the source used the proforma default; custom edits
      // the user made on the PI are preserved.
      const sourceTerms = docData.terms_and_conditions || "";
      const isProformaBoilerplate =
        doc.doc_type === "proforma" &&
        targetType === "invoice" &&
        (!sourceTerms || sourceTerms === (currentSettings.default_proforma_terms || ""));
      const resolvedTerms = isProformaBoilerplate
        ? (currentSettings.default_terms || null)
        : (sourceTerms || null);
      const resolvedNotes = isProformaBoilerplate
        ? (currentSettings.default_terms || null)
        : (docData.notes || null);

      const row: any = {
        org_id: effectiveOrgId,
        doc_type: targetType,
        doc_number: newDocNumber,
        client_id: docData.client_id || null,
        client_name: docData.client_name,
        client_billing_snapshot: client || null,
        doc_date: docData.doc_date,
        due_date: docData.due_date || null,
        financial_year: docData.financial_year || null,
        supply_type: docData.supply_type || null,
        subtotal: docData.subtotal,
        total_tax: docData.total_tax,
        total_amount: docData.total_amount,
        amount_paid: 0,
        balance_due: docData.total_amount,
        status: "draft",
        notes: resolvedNotes,
        terms_and_conditions: resolvedTerms,
        converted_from_id: id || null,
      };

      const { data, error } = await supabase.from("billing_documents").insert(row).select().single();
      if (error) {
        console.error("Error converting document:", error);
        // Unique-index race (another click won): reuse the existing sibling.
        if ((error as any).code === "23505" && id) {
          const { data: sibling } = await supabase
            .from("billing_documents")
            .select("id, doc_number")
            .eq("org_id", effectiveOrgId)
            .eq("converted_from_id", id)
            .eq("doc_type", targetType)
            .maybeSingle();
          if (sibling) {
            toast.info(`${doc.doc_number} was already converted to ${sibling.doc_number}. Opening it.`);
            return { ...doc, id: sibling.id, doc_type: targetType, doc_number: sibling.doc_number } as BillingDocument;
          }
        }
        toast.error("Could not convert document. Please try again.");
        return doc;
      }

      // Save items
      await saveItems(data.id, items || []);

      // Increment next number
      const numKey = targetType === "proforma" ? "next_proforma_number" : "next_invoice_number";
      if (currentSettings.id) {
        await supabase.from("billing_settings").update({ [numKey]: nextNum + 1, updated_at: new Date().toISOString() }).eq("id", currentSettings.id);
      }

      // Refetch all data to sync state
      await fetchAll();
      toast.success(`Converted ${doc.doc_number} → ${row.doc_number}`);
      return { ...doc, id: data.id, doc_type: targetType, doc_number: row.doc_number } as BillingDocument;
    } finally {
      setBusy(false);
    }
  }, [effectiveOrgId, busy, settings, fetchAll]);

  // ─── Payment CRUD ───
  const recordPayment = useCallback(async (payment: Omit<BillingPayment, "id" | "created_at">) => {
    if (!effectiveOrgId) return;

    const tdsAmount = (payment as any).tds_amount || 0;
    const row = {
      org_id: effectiveOrgId,
      document_id: payment.document_id,
      payment_date: payment.payment_date,
      amount: payment.amount,
      tds_amount: tdsAmount,
      payment_mode: payment.payment_mode || null,
      reference_number: payment.reference_number || null,
      notes: payment.notes || null,
    };

    const { data, error } = await supabase.from("billing_payments").insert(row).select().single();
    if (error) { console.error("Error recording payment:", error); return; }

    const newPayment: BillingPayment = {
      id: data.id,
      document_id: data.document_id,
      payment_date: data.payment_date,
      amount: Number(data.amount),
      tds_amount: Number(data.tds_amount || 0),
      payment_mode: data.payment_mode as any,
      reference_number: data.reference_number || undefined,
      notes: data.notes || undefined,
      org_id: data.org_id,
      created_at: data.created_at || undefined,
    };
    setPayments(prev => [newPayment, ...prev]);

    // Update document payment status (amount + TDS = total settled)
    const doc = documents.find(d => d.id === payment.document_id);
    if (doc) {
      const totalSettled = payment.amount + tdsAmount;
      const newPaid = doc.amount_paid + totalSettled;
      const newBalance = doc.total_amount - newPaid;
      const newStatus: BillingDocumentStatus = newBalance <= 0 ? "paid" : "partially_paid";
      await updateDocument(doc.id, { amount_paid: newPaid, balance_due: Math.max(0, newBalance), status: newStatus });
    }
    return newPayment;
  }, [effectiveOrgId, documents, updateDocument]);

  const getDocumentPayments = useCallback((docId: string) => {
    return payments.filter(p => p.document_id === docId);
  }, [payments]);

  const getNextDocNumber = useCallback((docType: BillingDocumentType) => {
    const fy = getCurrentFinancialYear();
    const prefix = docType === "proforma" ? settings.proforma_prefix : docType === "credit_note" ? settings.credit_note_prefix : settings.invoice_prefix;
    // Derive next number per-FY from existing docs so each financial year
    // restarts at 0001. Counter fields in billing_settings are kept in sync
    // elsewhere but are not authoritative.
    const pfx = `${prefix}-${fy}-`;
    const maxInFy = documents
      .filter(d => d.doc_type === docType && d.doc_number?.startsWith(pfx))
      .reduce((mx, d) => {
        const m = /-(\d+)$/.exec(d.doc_number || "");
        const n = m ? parseInt(m[1], 10) : 0;
        return n > mx ? n : mx;
      }, 0);
    return `${prefix}-${fy}-${String(maxInFy + 1).padStart(4, "0")}`;
  }, [settings, documents]);

  // ─── Settings ───
  const updateSettings = useCallback(async (s: BillingSettings) => {
    if (!effectiveOrgId) return;
    const { id, ...data } = s as any;
    const row = {
      org_id: effectiveOrgId,
      company_name: data.company_name || null,
      company_gstin: data.company_gstin || null,
      company_pan: data.company_pan || null,
      company_state: data.company_state || null,
      company_state_code: data.company_state_code || null,
      company_address: data.company_address || null,
      company_email: data.company_email || null,
      company_phone: data.company_phone || null,
      bank_name: data.bank_name || null,
      bank_account_number: data.bank_account_number || null,
      bank_ifsc: data.bank_ifsc || null,
      bank_branch: data.bank_branch || null,
      bank_upi_id: data.bank_upi_id || null,
      default_terms: data.default_terms || null,
      default_proforma_terms: data.default_proforma_terms || null,
      default_credit_note_terms: data.default_credit_note_terms || null,
      default_tax_rate: data.default_tax_rate,
      default_due_days: data.default_due_days,
      default_hsn: data.default_hsn || null,
      invoice_prefix: data.invoice_prefix || "INV",
      proforma_prefix: data.proforma_prefix || "PI",
      credit_note_prefix: data.credit_note_prefix || "CN",
      next_invoice_number: data.next_invoice_number,
      next_proforma_number: data.next_proforma_number,
      next_credit_note_number: data.next_credit_note_number,
      logo_url: data.logo_url || null,
      signature_url: data.signature_url || null,
      updated_at: new Date().toISOString(),
    };

    if (settings.id) {
      const { error } = await supabase.from("billing_settings").update(row).eq("id", settings.id);
      if (error) { console.error("Error updating settings:", error); return; }
      setSettingsState({ ...s, id: settings.id });
    } else {
      const { data: inserted, error } = await supabase.from("billing_settings").insert(row).select().single();
      if (error) { console.error("Error creating settings:", error); return; }
      setSettingsState({ ...s, id: inserted.id });
    }
  }, [effectiveOrgId, settings.id]);

  // ─── Issue Credit Note ───
  const issueCreditNote = useCallback(async (cancelledInvoice: BillingDocument) => {
    if (!effectiveOrgId) return cancelledInvoice;
    const fy = getCurrentFinancialYear();
    const prefix = settings.credit_note_prefix;
    const nextNum = settings.next_credit_note_number;
    const newDoc: BillingDocument = {
      ...cancelledInvoice,
      id: "",
      doc_type: "credit_note",
      doc_number: `${prefix}-${fy}-${String(nextNum).padStart(4, "0")}`,
      status: "draft",
      original_invoice_id: cancelledInvoice.id,
      original_invoice_number: cancelledInvoice.doc_number,
      amount_paid: 0,
      balance_due: cancelledInvoice.total_amount,
      doc_date: new Date().toISOString().split("T")[0],
      notes: settings.default_credit_note_terms || `Credit Note against ${cancelledInvoice.doc_number}`,
      terms_and_conditions: settings.default_credit_note_terms || `Credit Note against ${cancelledInvoice.doc_number}`,
      created_at: new Date().toISOString(),
      org_id: effectiveOrgId,
    };
    await addDocument(newDoc);
    return newDoc;
  }, [settings, addDocument, effectiveOrgId]);

  return {
    documents,
    payments,
    settings,
    loading,
    busy,
    addDocument,
    updateDocument,
    deleteDocument,
    convertDocument,
    recordPayment,
    updateSettings,
    getDocumentPayments,
    getNextDocNumber,
    issueCreditNote,
    refetch: fetchAll,
  };
}
