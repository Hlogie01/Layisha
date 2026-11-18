export type MemberRole = "owner" | "dispatcher";
export type OrderStatus =
  | "new"
  | "confirmed"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "cancelled";
export type PaymentType = "prepaid" | "cash" | "eft" | "card";

export interface Company {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
}

export interface Driver {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  vehicle: string | null;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  whatsapp: string;
  address_text: string | null;
  lat: number | null;
  lng: number | null;
  landmark_note: string | null;
  location_confirmed_at: string | null;
}

export interface OrderRow {
  id: string;
  reference: string;
  items: string;
  amount_due: number;
  payment_type: PaymentType;
  status: OrderStatus;
  delivery_date: string;
  notes: string | null;
  driver_id: string | null;
  customer: Customer | null;
}

export const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "confirmed", label: "Confirmed" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

export const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: "cash", label: "Cash on delivery" },
  { value: "eft", label: "EFT on delivery" },
  { value: "card", label: "Card on delivery" },
  { value: "prepaid", label: "Already paid" },
];

export function statusLabel(status: OrderStatus) {
  return ORDER_STATUSES.find((s) => s.value === status)?.label ?? status;
}
