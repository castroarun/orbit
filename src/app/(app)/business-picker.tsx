"use client";

import { useRouter } from "next/navigation";

/** Switches the business a screen is showing (?b=<id>), keeping the user on the same screen. */
export function BusinessPicker({ businesses, current, basePath }: { businesses: { id: string; name: string }[]; current: string; basePath: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Business</span>
      <select
        className="input h-[34px] w-auto py-0 font-medium"
        value={current}
        onChange={(e) => router.push(`${basePath}?b=${e.target.value}`)}
      >
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
