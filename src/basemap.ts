import type { StyleSpecification, LayerSpecification } from "maplibre-gl";

/**
 * Antique-atlas basemap: the OpenFreeMap style is fetched at runtime and every
 * paint color is remapped onto sepia/teal/sage anchor ramps, preserving each
 * color's lightness so positron's visual hierarchy survives the re-hue.
 * LAND (in eras.ts) must equal what this transform does to the styles' land
 * colors — marker rings and halos are painted with it.
 */

const STYLE_URL: Record<"light" | "dark", string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

type RGB = [number, number, number];
type Bucket = "land" | "water" | "green";

/** [t=0 anchor, t=1 anchor] — a color of HSL-lightness t lerps between them. */
const ANCHORS: Record<"light" | "dark", Record<Bucket, { lo: RGB; hi: RGB }>> = {
  light: {
    land: { lo: [58, 45, 26], hi: [250, 243, 227] }, // sepia ink → parchment
    water: { lo: [40, 72, 82], hi: [190, 212, 209] }, // ink teal → aged teal
    green: { lo: [78, 80, 46], hi: [228, 226, 198] }, // olive ink → dry sage
  },
  dark: {
    land: { lo: [19, 15, 10], hi: [222, 209, 179] }, // night ground → cream ink
    water: { lo: [11, 22, 27], hi: [136, 167, 175] },
    green: { lo: [16, 20, 12], hi: [152, 154, 113] },
  },
};

function lerp(lo: RGB, hi: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(lo[i] + (hi[i] - lo[i]) * t)) as RGB;
}

/** HSL lightness of an sRGB color — the `t` we preserve. */
function lightness([r, g, b]: RGB): number {
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
}

/** Parse hex/rgb(a)/hsl(a) plus literal white/black; null for anything else. */
function parseColor(s: string): { rgb: RGB; a: number } | null {
  const str = s.trim().toLowerCase();
  if (str === "white") return { rgb: [255, 255, 255], a: 1 };
  if (str === "black") return { rgb: [0, 0, 0], a: 1 };
  let m = /^#([0-9a-f]{3,8})$/.exec(str);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) {
      const [r, g, b] = [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16));
      const a = h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1;
      return { rgb: [r, g, b], a };
    }
    if (h.length === 6 || h.length === 8) {
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return { rgb: [r, g, b], a };
    }
    return null;
  }
  m = /^rgba?\(([^)]+)\)$/.exec(str);
  if (m) {
    const parts = m[1].split(",").map((p) => parseFloat(p));
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return { rgb: [parts[0], parts[1], parts[2]] as RGB, a: parts[3] ?? 1 };
  }
  m = /^hsla?\(([^)]+)\)$/.exec(str);
  if (m) {
    const parts = m[1].split(",").map((p) => parseFloat(p));
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    const [h, s2, l] = [parts[0] / 360, parts[1] / 100, parts[2] / 100];
    const q = l < 0.5 ? l * (1 + s2) : l + s2 - l * s2;
    const p = 2 * l - q;
    const chan = (t0: number): number => {
      let t = ((t0 % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return {
      rgb: [chan(h + 1 / 3), chan(h), chan(h - 1 / 3)].map((v) =>
        Math.round(v * 255),
      ) as RGB,
      a: parts[3] ?? 1,
    };
  }
  return null;
}

function remap(color: string, anchors: { lo: RGB; hi: RGB }): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  const [r, g, b] = lerp(anchors.lo, anchors.hi, lightness(parsed.rgb));
  return parsed.a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${parsed.a})`;
}

function bucketOf(layer: LayerSpecification): Bucket {
  const id = layer.id;
  const sourceLayer = "source-layer" in layer ? (layer["source-layer"] ?? "") : "";
  if (/water|ocean|river|lake|aeroway/i.test(id) || /water/i.test(sourceLayer)) {
    return "water";
  }
  if (/park|green|wood|forest|grass|vegetation|landcover/i.test(id)) return "green";
  return "land";
}

/** Recolor every string that parses as a color inside a *-color property. */
function remapDeep(value: unknown, anchors: { lo: RGB; hi: RGB }): unknown {
  if (typeof value === "string") return remap(value, anchors);
  if (Array.isArray(value)) return value.map((v) => remapDeep(v, anchors));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, remapDeep(v, anchors)]),
    );
  }
  return value;
}

function transform(style: StyleSpecification, theme: "light" | "dark"): StyleSpecification {
  for (const layer of style.layers) {
    const anchors = ANCHORS[theme][bucketOf(layer)];
    for (const group of ["paint", "layout"] as const) {
      const props = (layer as unknown as Record<string, Record<string, unknown>>)[group];
      if (!props) continue;
      for (const [key, val] of Object.entries(props)) {
        if (key.endsWith("-color")) props[key] = remapDeep(val, anchors);
      }
    }
  }
  return style;
}

const cache = new Map<string, StyleSpecification>();

/** The antique style for a theme; falls back to the stock URL on fetch error. */
export async function antiqueStyle(
  theme: "light" | "dark",
): Promise<StyleSpecification | string> {
  const hit = cache.get(theme);
  if (hit) return hit;
  try {
    const res = await fetch(STYLE_URL[theme]);
    if (!res.ok) throw new Error(`style ${res.status}`);
    const style = transform((await res.json()) as StyleSpecification, theme);
    cache.set(theme, style);
    return style;
  } catch (err) {
    console.error("antique basemap failed, using stock style", err);
    return STYLE_URL[theme];
  }
}
