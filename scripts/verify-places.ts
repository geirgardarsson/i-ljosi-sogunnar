/**
 * Cross-check gazetteer coordinates against Nominatim (OpenStreetMap).
 * Flags entries whose stored point is suspiciously far from the geocoder's
 * answer. Report-only: a flag means "look at this", not "this is wrong" —
 * region centroids in particular can legitimately differ.
 *
 * Respects Nominatim usage policy: 1 request/second, identifying User-Agent.
 */
import { readFileSync } from "node:fs";

interface Place {
  name: string;
  kind: "city" | "region" | "country" | "landmark" | "water";
  lat: number;
  lon: number;
  q?: string;
}

// km beyond which a mismatch is worth a human look, by place kind
const THRESHOLD_KM: Record<Place["kind"], number> = {
  city: 50,
  landmark: 50,
  region: 300,
  country: 500,
  water: 500,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const places = JSON.parse(readFileSync("data/places.json", "utf-8")) as Record<string, Place>;
// Optional slug args limit the check to just-added places (full run: no args)
const only = new Set(process.argv.slice(2));
const entries = Object.entries(places).filter(([slug]) => !only.size || only.has(slug));
console.log(`Verifying ${entries.length} places against Nominatim…`);

let flags = 0;
for (const [slug, p] of entries) {
  const query = p.q ?? p.name;
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(query);
  const res = await fetch(url, {
    headers: { "User-Agent": "i-ljosi-sogunnar-map/0.1 (geir93@gmail.com)" },
  });
  const hits = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  if (!hits.length) {
    console.log(`FLAG ${slug}: no Nominatim result for "${query}"`);
    flags++;
  } else {
    const km = haversineKm(p.lat, p.lon, Number(hits[0].lat), Number(hits[0].lon));
    if (km > THRESHOLD_KM[p.kind]) {
      console.log(
        `FLAG ${slug}: ${km.toFixed(0)} km from Nominatim's "${hits[0].display_name}" ` +
          `(${Number(hits[0].lat).toFixed(2)}, ${Number(hits[0].lon).toFixed(2)})`
      );
      flags++;
    }
  }
  await sleep(1100);
}
console.log(flags ? `${flags} place(s) flagged for review` : "All places check out");
