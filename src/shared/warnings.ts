import type { Warning } from "./types";

export interface WarningGroup {
  message: string;
  items: string[];
}

/**
 * Groups warnings by message, keeping first-seen order. Duplicate items are
 * dropped, since a variable converted once per mode warns once per mode.
 */
export function groupWarnings(warnings: Warning[]): WarningGroup[] {
  const groups = new Map<string, Set<string>>();
  for (const { message, item } of warnings) {
    const items = groups.get(message) ?? new Set<string>();
    items.add(item);
    groups.set(message, items);
  }
  return [...groups].map(([message, items]) => ({ message, items: [...items] }));
}
