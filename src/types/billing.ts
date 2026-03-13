// Billing System Types

export const INDIAN_STATES = [
  { code: "01", name: "Jammu & Kashmir" }, { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" }, { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" }, { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" }, { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" }, { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" }, { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" }, { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" }, { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" }, { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" }, { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" }, { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" }, { code: "24", name: "Gujarat" },
  { code: "27", name: "Maharashtra" }, { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" }, { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" }, { code: "34", name: "Puducherry" },
  { code: "36", name: "Telangana" }, { code: "37", name: "Andhra Pradesh" },
] as const;

export type SupplyType = "intra_state" | "inter_state";
export type BillingDocumentType = "quotation" | "proforma" | "invoice" | "credit_note";
export type BillingDocumentStatus = "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "cancelled" | "accepted" | "rejected" | "expired" | "issued";
export type PaymentMethod = "bank_transfer" | "upi" | "cheque" | "cash" | "online";

export interface BillingDocumentItem {
  id?: string;
  document_id?: string;
  description: string;
  hsn_sac: string;
  qty: number;
  unit: string;
  rate: number;
  discount: number;
  tax_rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  sort_order?: number;
}

export interface BillingDocument {
  id: string;
  org_id: string;
  doc_type: BillingDocumentType;
  doc_number: string;
  client_id: string;
  client_name: string;
  client?: {
    company: string;
    first_name: string;
    last_name: string;
    invoice_company_name?: string;
    gstin?: string;
    pan?: string;
    billing_state_code?: string;
    billing_address?: string;
    state?: string;
    city?: string;
    pin_code?: string;
  };
  doc_date: string;
  due_date: string;
  financial_year: string;
  supply_type: SupplyType;
  subtotal: number;
  total_tax: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: BillingDocumentStatus;
  notes?: string;
  terms_and_conditions?: string;
  original_invoice_id?: string;
  original_invoice_number?: string;
  items: BillingDocumentItem[];
  created_at?: string;
  updated_at?: string;
}

export interface BillingPayment {
  id: string;
  document_id: string;
  payment_date: string;
  amount: number;
  payment_mode: PaymentMethod;
  reference_number?: string;
  notes?: string;
  org_id: string;
  created_by?: string;
  created_at?: string;
  // Joined fields
  doc_number?: string;
  client_name?: string;
}

export interface BillingSettings {
  id?: string;
  org_id: string;
  company_name: string;
  company_gstin: string;
  company_pan: string;
  company_state: string;
  company_state_code: string;
  company_address: string;
  company_email: string;
  company_phone: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_branch: string;
  bank_upi_id: string;
  default_terms: string;
  default_quotation_terms?: string;
  default_proforma_terms?: string;
  default_tax_rate: number;
  default_due_days: number;
  default_hsn: string;
  invoice_prefix: string;
  quotation_prefix: string;
  proforma_prefix: string;
  next_invoice_number: number;
  next_quotation_number: number;
  next_proforma_number: number;
  credit_note_prefix: string;
  next_credit_note_number: number;
  default_credit_note_terms?: string;
  logo_url?: string;
  signature_url?: string;
}

export interface BillingClient {
  id: string;
  company: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  pan?: string;
  billing_state_code?: string;
  billing_address?: string;
  state?: string;
  city?: string;
  pin_code?: string;
  status?: string;
}

export const DOC_TYPE_LABELS: Record<BillingDocumentType, string> = {
  quotation: "Quotation",
  proforma: "Proforma Invoice",
  invoice: "Tax Invoice",
  credit_note: "Credit Note",
};

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-emerald-100 text-emerald-700",
  partially_paid: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-200 text-gray-500",
  issued: "bg-purple-100 text-purple-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-gray-200 text-gray-500",
};

export const DOC_TYPE_COLORS: Record<string, string> = {
  quotation: "bg-violet-100 text-violet-700",
  proforma: "bg-sky-100 text-sky-700",
  invoice: "bg-emerald-100 text-emerald-700",
  credit_note: "bg-red-100 text-red-700",
};
