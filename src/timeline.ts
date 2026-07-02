import { store } from "./state";
import { fmtYear } from "./util";
import { hideTooltip, showTooltip } from "./tooltip";
import type { Episode } from "./types";

/**
 * Hand-rolled SVG timeline (DESIGN.md §3): piecewise-linear scale with a
 * clamped "forsaga" band, pixel-space density histogram, brushable range
 * filter, and a bold overlay for the selected episode's spans.
 */

const FORSAGA_MIN = -60000;

/** Pixel share per year segment — tuned 2026-07-02 against the annotated
 * distribution (258 of 329 mapped episodes touch 1900+). */
const SEGMENTS: { from: number; to: number; share: number }[] = [
  { from: FORSAGA_MIN, to: -3000, share: 3 },
  { from: -3000, to: 0, share: 6 },
  { from: 0, to: 1000, share: 7 },
  { from: 1000, to: 1500, share: 9 },
  { from: 1500, to: 1800, share: 14 },
  { from: 1800, to: 1900, share: 21 },
  { from: 1900, to: 2026, share: 40 }, // `to` is stretched to store.yearMax
];

const TICK_YEARS = [-3000, 0, 1000, 1500, 1800, 1900, 1950, 2000];
const BIN_PX = 8;
const MARGIN = { left: 10, right: 10, top: 6, bottom: 20 };
/** Px each side of a brush edge that grabs the handle — finger-sized on touch. */
const HANDLE_HIT = window.matchMedia?.("(pointer: coarse)").matches ? 16 : 7;

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

interface Bin {
  x0: number;
  x1: number;
  year0: number;
  year1: number;
  ids: string[];
}

class Timeline {
  private svg: SVGSVGElement;
  private width = 0;
  private height = 0;
  private plotLeft = 0;
  private plotRight = 0;
  private baseline = 0;
  private segments: { from: number; to: number; x0: number; x1: number }[] = [];
  private bins: Bin[] = [];
  private maxBinCount = 1;

  private gBars: SVGGElement;
  private gAxis: SVGGElement;
  private gBrush: SVGGElement;
  private gSpans: SVGGElement;
  private overlay: SVGRectElement;
  private handleL: SVGGElement;
  private handleR: SVGGElement;

  private drag: { mode: "new" | "move" | "left" | "right"; startPx: number; startBrush: [number, number] | null } | null = null;
  private hoverBin = -1;

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    this.gAxis = svgEl("g", { class: "tl-axis" });
    this.gBars = svgEl("g");
    this.gBrush = svgEl("g");
    this.gSpans = svgEl("g");
    this.overlay = svgEl("rect", { fill: "transparent" });
    this.handleL = this.makeHandle("Upphaf valins tímabils");
    this.handleR = this.makeHandle("Lok valins tímabils");
    svg.append(this.gAxis, this.gBars, this.gBrush, this.gSpans, this.overlay, this.handleL, this.handleR);

    this.wirePointer();
    this.wireKeyboard();

    new ResizeObserver(() => this.layout()).observe(svg);
    store.on("filter", () => {
      this.renderBars();
      this.renderBrush();
    });
    store.on("select", () => this.renderSpans());
    store.on("hover", () => this.renderExternalHover());
    this.layout();
  }

  // ── scale ────────────────────────────────────────────────────

  private layout(): void {
    const rect = this.svg.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 30) return;
    this.width = rect.width;
    this.height = rect.height;
    this.plotLeft = MARGIN.left;
    this.plotRight = this.width - MARGIN.right;
    this.baseline = this.height - MARGIN.bottom;

    const plotW = this.plotRight - this.plotLeft;
    const totalShare = SEGMENTS.reduce((sum, s) => sum + s.share, 0);
    let x = this.plotLeft;
    this.segments = SEGMENTS.map((s, i) => {
      const to = i === SEGMENTS.length - 1 ? Math.max(s.to, store.yearMax) : s.to;
      const w = (s.share / totalShare) * plotW;
      const seg = { from: s.from, to, x0: x, x1: x + w };
      x += w;
      return seg;
    });

    this.buildBins();
    this.overlay.setAttribute("x", String(this.plotLeft));
    this.overlay.setAttribute("y", "0");
    this.overlay.setAttribute("width", String(plotW));
    this.overlay.setAttribute("height", String(this.height));

    this.renderAxis();
    this.renderBars();
    this.renderBrush();
    this.renderSpans();
  }

  private x(year: number): number {
    const y = Math.max(FORSAGA_MIN, Math.min(year, this.segments.at(-1)!.to));
    for (const s of this.segments) {
      if (y <= s.to) return s.x0 + ((y - s.from) / (s.to - s.from)) * (s.x1 - s.x0);
    }
    return this.plotRight;
  }

  private yearAt(px: number): number {
    const p = Math.max(this.plotLeft, Math.min(px, this.plotRight));
    for (const s of this.segments) {
      if (p <= s.x1) return Math.round(s.from + ((p - s.x0) / (s.x1 - s.x0)) * (s.to - s.from));
    }
    return this.segments.at(-1)!.to;
  }

  /** Years spanned by ~4 px at this year — the arrow-key step size. */
  private yearStep(year: number): number {
    const px = this.x(year);
    return Math.max(1, Math.abs(this.yearAt(px + 4) - year));
  }

  // ── histogram ────────────────────────────────────────────────

  private buildBins(): void {
    // Repeats are the same content as their original: counting both would
    // double the bar. Placeholders have no spans and never land in a bin.
    const episodes = store.episodes.filter((e) => !e.repeatOf);
    this.bins = [];
    for (let x0 = this.plotLeft; x0 < this.plotRight; x0 += BIN_PX) {
      const x1 = Math.min(x0 + BIN_PX, this.plotRight);
      this.bins.push({ x0, x1, year0: this.yearAt(x0), year1: this.yearAt(x1), ids: [] });
    }
    for (const ep of episodes) {
      for (const bin of this.bins) {
        if (ep.spans.some((s) => s.end >= bin.year0 && s.start <= bin.year1)) {
          bin.ids.push(ep.id);
        }
      }
    }
  }

  private renderBars(): void {
    const counts = this.bins.map((bin) =>
      store.query
        ? bin.ids.filter((id) => store.matches(store.byId.get(id)!)).length
        : bin.ids.length,
    );
    this.maxBinCount = Math.max(...counts, 1);
    const plotH = this.baseline - MARGIN.top;
    const brush = store.brush;

    this.gBars.replaceChildren(
      ...this.bins.flatMap((bin, i) => {
        if (counts[i] === 0) return [];
        const h = Math.max(2, (counts[i] / this.maxBinCount) * plotH);
        const inBrush = brush && bin.year1 >= brush[0] && bin.year0 <= brush[1];
        return [
          svgEl("rect", {
            class: `tl-bar${inBrush ? " in-brush" : ""}`,
            "data-bin": i,
            x: bin.x0,
            y: this.baseline - h,
            width: Math.max(1, bin.x1 - bin.x0 - 1),
            height: h,
          }),
        ];
      }),
    );
  }

  private renderAxis(): void {
    const children: SVGElement[] = [
      svgEl("line", { class: "tl-axisline", x1: this.plotLeft, x2: this.plotRight, y1: this.baseline, y2: this.baseline }),
    ];
    // "forsaga" label centered in the clamped prehistory band
    const forsaga = this.segments[0];
    children.push(this.tickLabel((forsaga.x0 + forsaga.x1) / 2, "forsaga", "tl-forsaga"));
    let lastX = forsaga.x1;
    for (const year of TICK_YEARS) {
      const x = this.x(year);
      if (x - lastX < 42) continue; // skip labels that would collide
      lastX = x;
      children.push(
        svgEl("line", { class: "tl-tick", x1: x, x2: x, y1: this.baseline, y2: this.baseline + 4 }),
        this.tickLabel(x, year === -3000 ? "3000 f.Kr." : String(year)),
      );
    }
    this.gAxis.replaceChildren(...children);
  }

  private tickLabel(x: number, text: string, cls = ""): SVGTextElement {
    const t = svgEl("text", { class: `tl-label ${cls}`.trim(), x, y: this.baseline + 15, "text-anchor": "middle" });
    t.textContent = text;
    return t;
  }

  // ── brush ────────────────────────────────────────────────────

  private renderBrush(): void {
    const brush = store.brush;
    if (!brush) {
      this.gBrush.replaceChildren();
      this.handleL.style.display = "none";
      this.handleR.style.display = "none";
      return;
    }
    const x0 = this.x(brush[0]);
    const x1 = this.x(brush[1]);
    this.gBrush.replaceChildren(
      svgEl("rect", { class: "tl-brush", x: x0, y: MARGIN.top, width: Math.max(1, x1 - x0), height: this.baseline - MARGIN.top }),
    );
    this.placeHandle(this.handleL, x0, brush[0]);
    this.placeHandle(this.handleR, x1, brush[1]);
  }

  private makeHandle(label: string): SVGGElement {
    const g = svgEl("g", { class: "tl-handle", tabindex: 0, role: "slider" });
    g.setAttribute("aria-label", label);
    g.setAttribute("aria-valuemin", String(FORSAGA_MIN));
    g.append(
      svgEl("rect", { class: "tl-handle-hit", x: -HANDLE_HIT, width: HANDLE_HIT * 2, fill: "transparent" }),
      svgEl("line", { class: "tl-handle-line", x1: 0, x2: 0 }),
    );
    g.style.display = "none";
    return g;
  }

  private placeHandle(g: SVGGElement, x: number, year: number): void {
    g.style.display = "";
    g.setAttribute("transform", `translate(${x},0)`);
    g.setAttribute("aria-valuemax", String(this.segments.at(-1)!.to));
    g.setAttribute("aria-valuenow", String(year));
    g.setAttribute("aria-valuetext", fmtYear(year));
    const hit = g.querySelector(".tl-handle-hit")!;
    hit.setAttribute("y", String(MARGIN.top));
    hit.setAttribute("height", String(this.baseline - MARGIN.top));
    const line = g.querySelector(".tl-handle-line")!;
    line.setAttribute("y1", String(MARGIN.top));
    line.setAttribute("y2", String(this.baseline));
  }

  private wirePointer(): void {
    this.svg.addEventListener("pointerdown", (e) => {
      const px = this.toLocalX(e);
      const brush = store.brush;
      let mode: "new" | "move" | "left" | "right" = "new";
      if (brush) {
        const x0 = this.x(brush[0]);
        const x1 = this.x(brush[1]);
        if (Math.abs(px - x0) <= HANDLE_HIT) mode = "left";
        else if (Math.abs(px - x1) <= HANDLE_HIT) mode = "right";
        else if (px > x0 && px < x1) mode = "move";
      }
      this.drag = { mode, startPx: px, startBrush: brush ? [...brush] : null };
      this.svg.setPointerCapture(e.pointerId);
      hideTooltip();
    });

    this.svg.addEventListener("pointermove", (e) => {
      const px = this.toLocalX(e);
      if (!this.drag) {
        this.updateCursor(px);
        this.updateBinHover(px, e.clientX, e.clientY);
        return;
      }
      const { mode, startPx, startBrush } = this.drag;
      if (mode === "new") {
        if (Math.abs(px - startPx) < 3) return;
        const [a, b] = [this.yearAt(startPx), this.yearAt(px)].sort((m, n) => m - n);
        store.setBrush([a, b]);
      } else if (mode === "move" && startBrush) {
        // Pan in pixel space so the selection keeps its width on screen.
        const dx = px - startPx;
        const w = this.x(startBrush[1]) - this.x(startBrush[0]);
        let nx0 = this.x(startBrush[0]) + dx;
        nx0 = Math.max(this.plotLeft, Math.min(nx0, this.plotRight - w));
        store.setBrush([this.yearAt(nx0), this.yearAt(nx0 + w)]);
      } else if (startBrush) {
        const year = this.yearAt(px);
        const fixed = mode === "left" ? startBrush[1] : startBrush[0];
        store.setBrush(year <= fixed ? [year, fixed] : [fixed, year]);
      }
    });

    this.svg.addEventListener("pointerup", (e) => {
      if (this.drag?.mode === "new" && Math.abs(this.toLocalX(e) - this.drag.startPx) < 3) {
        store.setBrush(null); // plain click clears the range filter
      }
      this.drag = null;
    });

    this.svg.addEventListener("pointerleave", () => {
      if (!this.drag) this.clearBinHover();
    });

    this.svg.addEventListener("dblclick", () => store.setBrush(null));
  }

  private wireKeyboard(): void {
    const onKey = (edge: "left" | "right") => (e: KeyboardEvent) => {
      const brush = store.brush;
      if (!brush) return;
      const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (!dir) return;
      e.preventDefault();
      const i = edge === "left" ? 0 : 1;
      const year = brush[i] + dir * this.yearStep(brush[i]);
      const next: [number, number] = [...brush];
      next[i] = year;
      if (next[0] <= next[1]) store.setBrush(next);
    };
    this.handleL.addEventListener("keydown", onKey("left"));
    this.handleR.addEventListener("keydown", onKey("right"));
  }

  private toLocalX(e: PointerEvent | MouseEvent): number {
    return e.clientX - this.svg.getBoundingClientRect().left;
  }

  private updateCursor(px: number): void {
    const brush = store.brush;
    let cursor = "crosshair";
    if (brush) {
      const x0 = this.x(brush[0]);
      const x1 = this.x(brush[1]);
      if (Math.abs(px - x0) <= HANDLE_HIT || Math.abs(px - x1) <= HANDLE_HIT) cursor = "ew-resize";
      else if (px > x0 && px < x1) cursor = "grab";
    }
    this.svg.style.cursor = cursor;
  }

  // ── hover linking ────────────────────────────────────────────

  private updateBinHover(px: number, clientX: number, clientY: number): void {
    const i = this.bins.findIndex((b) => px >= b.x0 && px < b.x1);
    if (i === this.hoverBin) return;
    this.hoverBin = i;
    const bin = this.bins[i];
    if (!bin || bin.ids.length === 0) {
      this.clearBinHover();
      return;
    }
    this.markBins((j) => j === i, "hover");
    const n = bin.ids.length;
    showTooltip(
      [`${n} ${n === 1 ? "þáttur" : "þættir"}`, `${fmtYear(bin.year0)}–${fmtYear(bin.year1)}`],
      clientX,
      clientY,
    );
    store.setHover({ ids: bin.ids, source: "timeline" });
  }

  private clearBinHover(): void {
    this.hoverBin = -1;
    this.markBins(() => false, "hover");
    hideTooltip();
    if (store.hover?.source === "timeline") store.setHover(null);
  }

  /** Hover coming from the map or list: lift the bins those episodes touch. */
  private renderExternalHover(): void {
    if (store.hover && store.hover.source === "timeline") return;
    const eps = (store.hover?.ids ?? [])
      .map((id) => store.byId.get(id))
      .filter((e): e is Episode => !!e);
    this.markBins(
      (i) =>
        eps.some((ep) =>
          ep.spans.some((s) => s.end >= this.bins[i].year0 && s.start <= this.bins[i].year1),
        ),
      "lift",
    );
  }

  private markBins(pred: (binIndex: number) => boolean, cls: "hover" | "lift"): void {
    for (const rect of this.gBars.querySelectorAll<SVGRectElement>(".tl-bar")) {
      const i = Number(rect.dataset.bin);
      rect.classList.toggle(cls, pred(i));
    }
  }

  // ── selected episode overlay ─────────────────────────────────

  private renderSpans(): void {
    const ep = store.selectedId ? store.byId.get(store.selectedId) : undefined;
    if (!ep || ep.spans.length === 0) {
      this.gSpans.replaceChildren();
      return;
    }
    this.gSpans.replaceChildren(
      ...ep.spans.map((s) => {
        const x0 = this.x(s.start);
        const x1 = this.x(s.end);
        return svgEl("rect", {
          class: "tl-span",
          x: x0,
          y: this.baseline - 5,
          width: Math.max(4, x1 - x0),
          height: 5,
          rx: 2,
        });
      }),
    );
  }
}

export function initTimeline(svg: SVGSVGElement): void {
  new Timeline(svg);
}
