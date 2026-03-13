import { useState, useCallback } from "react";
import type {
  BillingDocument,
  BillingPayment,
  BillingSettings,
  BillingDocumentType,
  BillingDocumentStatus,
} from "@/types/billing";
import { getCurrentFinancialYear } from "@/utils/billingUtils";

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
  quotation_prefix: "QTN",
  proforma_prefix: "PI",
  next_invoice_number: 1,
  next_quotation_number: 1,
  next_proforma_number: 1,
  credit_note_prefix: "CN",
  next_credit_note_number: 1,
};

const STORAGE_KEY = "billing_data";

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}_${key}`);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return fallback;
}

function saveToStorage(key: string, data: unknown) {
  try {
    localStorage.setItem(`${STORAGE_KEY}_${key}`, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function useBillingData() {
  const [documents, setDocuments] = useState<BillingDocument[]>(() =>
    loadFromStorage("documents", [])
  );
  const [payments, setPayments] = useState<BillingPayment[]>(() =>
    loadFromStorage("payments", [])
  );
  const [settings, setSettingsState] = useState<BillingSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...loadFromStorage("settings", DEFAULT_SETTINGS),
  }));

  const updateDocuments = useCallback((docs: BillingDocument[]) => {
    setDocuments(docs);
    saveToStorage("documents", docs);
  }, []);

  const updatePayments = useCallback((pays: BillingPayment[]) => {
    setPayments(pays);
    saveToStorage("payments", pays);
  }, []);

  const updateSettings = useCallback((s: BillingSettings) => {
    setSettingsState(s);
    saveToStorage("settings", s);
  }, []);

  // Document CRUD
  const addDocument = useCallback((doc: BillingDocument) => {
    const next = [doc, ...documents];
    updateDocuments(next);
    const prefix = doc.doc_type === "quotation" ? "quotation" : doc.doc_type === "proforma" ? "proforma" : doc.doc_type === "credit_note" ? "credit_note" : "invoice";
    const key = `next_${prefix}_number` as keyof BillingSettings;
    updateSettings({ ...settings, [key]: (settings[key] as number) + 1 });
  }, [documents, settings, updateDocuments, updateSettings]);

  const updateDocument = useCallback((id: string, updates: Partial<BillingDocument>) => {
    const next = documents.map(d => d.id === id ? { ...d, ...updates } : d);
    updateDocuments(next);
  }, [documents, updateDocuments]);

  const deleteDocument = useCallback((id: string) => {
    updateDocuments(documents.filter(d => d.id !== id));
    updatePayments(payments.filter(p => p.document_id !== id));
  }, [documents, payments, updateDocuments, updatePayments]);

  const convertDocument = useCallback((doc: BillingDocument, targetType: BillingDocumentType) => {
    const fy = getCurrentFinancialYear();
    const prefix = targetType === "proforma" ? settings.proforma_prefix : settings.invoice_prefix;
    const nextNum = targetType === "proforma" ? settings.next_proforma_number : settings.next_invoice_number;

    const newDoc: BillingDocument = {
      ...doc,
      id: `d${Date.now()}`,
      doc_type: targetType,
      doc_number: `${prefix}-${fy}-${String(nextNum).padStart(4, "0")}`,
      status: "draft",
      amount_paid: 0,
      balance_due: doc.total_amount,
      created_at: new Date().toISOString(),
    };
    addDocument(newDoc);
    return newDoc;
  }, [settings, addDocument]);

  // Payment CRUD
  const recordPayment = useCallback((payment: Omit<BillingPayment, "id" | "created_at">) => {
    const newPayment: BillingPayment = {
      ...payment,
      id: `p${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    updatePayments([newPayment, ...payments]);

    const doc = documents.find(d => d.id === payment.document_id);
    if (doc) {
      const newPaid = doc.amount_paid + payment.amount;
      const newBalance = doc.total_amount - newPaid;
      const newStatus: BillingDocumentStatus = newBalance <= 0 ? "paid" : "partially_paid";
      updateDocument(doc.id, { amount_paid: newPaid, balance_due: Math.max(0, newBalance), status: newStatus });
    }
    return newPayment;
  }, [payments, documents, updatePayments, updateDocument]);

  const getDocumentPayments = useCallback((docId: string) => {
    return payments.filter(p => p.document_id === docId);
  }, [payments]);

  const getNextDocNumber = useCallback((docType: BillingDocumentType) => {
    const fy = getCurrentFinancialYear();
    const prefix = docType === "quotation" ? settings.quotation_prefix : docType === "proforma" ? settings.proforma_prefix : docType === "credit_note" ? settings.credit_note_prefix : settings.invoice_prefix;
    const nextNum = docType === "quotation" ? settings.next_quotation_number : docType === "proforma" ? settings.next_proforma_number : docType === "credit_note" ? settings.next_credit_note_number : settings.next_invoice_number;
    return `${prefix}-${fy}-${String(nextNum).padStart(4, "0")}`;
  }, [settings]);

  const issueCreditNote = useCallback((cancelledInvoice: BillingDocument) => {
    const fy = getCurrentFinancialYear();
    const prefix = settings.credit_note_prefix;
    const nextNum = settings.next_credit_note_number;
    const newDoc: BillingDocument = {
      ...cancelledInvoice,
      id: `d${Date.now()}`,
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
    };
    addDocument(newDoc);
    return newDoc;
  }, [settings, addDocument]);

  return {
    documents,
    payments,
    settings,
    addDocument,
    updateDocument,
    deleteDocument,
    convertDocument,
    recordPayment,
    updateSettings,
    getDocumentPayments,
    getNextDocNumber,
    issueCreditNote,
  };
}
