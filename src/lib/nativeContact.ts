export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function toWhatsAppNumber(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function nativeCall(phone: string): void {
  if (!phone) return;
  window.location.href = `tel:${phone}`;
}

export function openWhatsApp(phone: string, message?: string): void {
  if (!phone) return;
  const num = toWhatsAppNumber(phone);
  const url = message
    ? `https://wa.me/${num}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${num}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
