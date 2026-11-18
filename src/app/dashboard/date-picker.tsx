"use client";

import { useRouter } from "next/navigation";

export function DatePicker({ value }: { value: string }) {
  const router = useRouter();
  return (
    <label className="text-sm font-medium text-stone-600">
      <span className="sr-only">Delivery date</span>
      <input
        type="date"
        value={value}
        onChange={(e) => {
          if (e.target.value) router.push(`/dashboard?date=${e.target.value}`);
        }}
        className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-base"
      />
    </label>
  );
}
