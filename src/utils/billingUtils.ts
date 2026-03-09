import type { SupplyType, BillingDocumentItem } from "@/types/billing";

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

export function formatCurrencyINR(n: number): string {
  return `₹${formatINR(n)}`;
}

export function detectSupplyType(companyStateCode: string, clientStateCode: string): SupplyType {
  if (!companyStateCode || !clientStateCode) return "inter_state";
  return companyStateCode === clientStateCode ? "intra_state" : "inter_state";
}

export function calculateLineItem(
  qty: number,
  rate: number,
  discount: number,
  taxRate: number,
  supplyType: SupplyType
): { taxable: number; cgst: number; sgst: number; igst: number; total: number } {
  const taxable = qty * rate * (1 - (discount || 0) / 100);
  const taxAmt = taxable * taxRate / 100;
  const cgst = supplyType === "intra_state" ? taxAmt / 2 : 0;
  const sgst = supplyType === "intra_state" ? taxAmt / 2 : 0;
  const igst = supplyType === "inter_state" ? taxAmt : 0;
  return { taxable, cgst, sgst, igst, total: taxable + taxAmt };
}

export function calculateDocumentTotals(items: BillingDocumentItem[]) {
  const subtotal = items.reduce((s, i) => s + (i.taxable || 0), 0);
  const totalCgst = items.reduce((s, i) => s + (i.cgst || 0), 0);
  const totalSgst = items.reduce((s, i) => s + (i.sgst || 0), 0);
  const totalIgst = items.reduce((s, i) => s + (i.igst || 0), 0);
  const totalTax = totalCgst + totalSgst + totalIgst;
  const grandTotal = subtotal + totalTax;
  return { subtotal, totalCgst, totalSgst, totalIgst, totalTax, grandTotal };
}

export function numberToWords(num: number): string {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convert(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }

  const intPart = Math.floor(num);
  return "Rupees " + convert(intPart) + " Only";
}

export function generateDocNumber(prefix: string, fy: string, nextNum: number): string {
  return `${prefix}-${fy}-${String(nextNum).padStart(4, "0")}`;
}

export function getCurrentFinancialYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // Indian FY: April to March
  if (month >= 3) {
    // April onwards = current year to next
    return `${String(year).slice(2)}${String(year + 1).slice(2)}`;
  } else {
    return `${String(year - 1).slice(2)}${String(year).slice(2)}`;
  }
}

export function formatFinancialYear(fy: string): string {
  if (fy.length !== 4) return fy;
  return `20${fy.substring(0, 2)}-${fy.substring(2)}`;
}

export function statusLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
