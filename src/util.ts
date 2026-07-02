import type { Span } from "./types";

/** "500 f.Kr." for negative years, plain digits otherwise. */
export function fmtYear(y: number): string {
  return y < 0 ? `${-y} f.Kr.` : String(y);
}

export function fmtSpan(s: Span): string {
  const approx = s.approx ? "≈" : "";
  if (s.start === s.end) return approx + fmtYear(s.start);
  if (s.start < 0 && s.end < 0) return `${approx}${-s.start}–${-s.end} f.Kr.`;
  return `${approx}${fmtYear(s.start)}–${fmtYear(s.end)}`;
}

export function fmtSpans(spans: Span[]): string {
  return spans.map(fmtSpan).join(" · ");
}

export function fmtDuration(sec: number | null): string {
  if (!sec) return "";
  return `${Math.round(sec / 60)} mín`;
}

/** "26.6.2026" — Icelandic short date from YYYY-MM-DD. */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${m}.${y}`;
}

/** Case- and accent-insensitive fold for search matching. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae");
}
