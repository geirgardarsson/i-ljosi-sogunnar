import type { Episode } from "./types";

/**
 * Era buckets per DESIGN.md §4: an episode is bucketed by the midpoint of its
 * first span. Colors are an ordinal blue ramp (light→dark = old→recent),
 * validated 2026-07-02 against the OpenFreeMap land colors
 * (positron #f2f3f0, dark #0c0c0c) — see DESIGN.md.
 */
export const ERA_UPPER_BOUNDS = [500, 1500, 1800, 1900]; // 5th bucket = 1900 →
export const ERA_LABELS = ["Fornöld", "Miðaldir", "1500–1800", "19. öld", "1900 →"];

export const ERA_RAMP: Record<"light" | "dark", string[]> = {
  light: ["#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  dark: ["#cde2fb", "#86b6ef", "#3987e5", "#256abf", "#184f95"],
};

/** Actual land color of each basemap style — marker rings must match it. */
export const LAND_COLOR: Record<"light" | "dark", string> = {
  light: "#f2f3f0",
  dark: "#0c0c0c",
};

export function eraIndex(ep: Episode): number {
  const s = ep.spans[0];
  if (!s) return 4;
  const mid = (s.start + s.end) / 2;
  for (let i = 0; i < ERA_UPPER_BOUNDS.length; i++) {
    if (mid <= ERA_UPPER_BOUNDS[i]) return i;
  }
  return 4;
}

/** Brush presets for the „Öll tímabil" dropdown (DESIGN.md §3). */
export interface EraPreset {
  value: string;
  label: string;
  range: [number, number];
}

export const ERA_PRESETS: EraPreset[] = [
  { value: "fornold", label: "Fornöld", range: [-60000, 500] },
  { value: "midaldir", label: "Miðaldir", range: [500, 1500] },
  { value: "arnyold", label: "1500–1800", range: [1500, 1800] },
  { value: "19-old", label: "19. öld", range: [1800, 1900] },
  { value: "20-old", label: "20. öld", range: [1900, 2000] },
  { value: "21-old", label: "21. öld", range: [2000, 2030] },
];
