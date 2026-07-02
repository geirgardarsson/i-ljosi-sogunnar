// Mirrors the shape produced by scripts/build-episodes.ts.

export type PlaceKind = "city" | "region" | "country" | "landmark" | "water";

export interface EpisodePlace {
  slug: string;
  name: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  role: "primary" | "secondary";
  note?: string;
  zoom?: number;
}

export interface Span {
  start: number; // signed year, negative = BC
  end: number;
  approx?: boolean;
}

export interface Episode {
  id: string;
  title: string;
  description: string;
  firstrun: string; // YYYY-MM-DD
  durationSec: number | null;
  audio: string | null;
  image: string | null;
  ruv: string;
  subject: string;
  series?: { key: string; part: number; of: number };
  repeatOf?: string;
  places: EpisodePlace[];
  spans: Span[];
  confidence: "high" | "medium" | "low";
}

export interface EpisodesFile {
  built: string;
  catalogFetched: string;
  episodes: Episode[];
}
