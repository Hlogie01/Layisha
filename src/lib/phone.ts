/**
 * Normalises a South African mobile number to E.164 (+27...), the format
 * WhatsApp needs. Accepts "082 123 4567", "0821234567", "27821234567",
 * "+27 82 123 4567". Returns null if it doesn't look like a valid number.
 */
export function normaliseSaPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let national: string;

  if (digits.startsWith("+27")) national = digits.slice(3);
  else if (digits.startsWith("27") && digits.length === 11) national = digits.slice(2);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else return null;

  if (!/^[1-9]\d{8}$/.test(national)) return null;
  return `+27${national}`;
}

export function formatSaPhone(e164: string): string {
  if (!e164.startsWith("+27") || e164.length !== 12) return e164;
  const n = e164.slice(3);
  return `0${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}

export function formatRand(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(amount);
}
