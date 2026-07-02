import type { Episode } from "./types";
import { fold } from "./util";

export type HoverSource = "map" | "timeline" | "list";
export interface Hover {
  ids: string[];
  source: HoverSource;
}

type EventName = "filter" | "select" | "hover" | "view" | "theme";

export interface SelectOptions {
  /** Pan/zoom the map to the episode's primary place (false for map clicks). */
  fly?: boolean;
}

class Store {
  episodes: Episode[] = [];
  byId = new Map<string, Episode>();
  /** Highest span end in the data — the timeline's right edge. */
  yearMax = 2026;

  brush: [number, number] | null = null;
  query = "";
  selectedId: string | null = null;
  selectFly = true;
  hover: Hover | null = null;
  view: "map" | "list" = "map";
  dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

  private listeners: Partial<Record<EventName, Set<() => void>>> = {};

  on(evt: EventName, fn: () => void): void {
    (this.listeners[evt] ??= new Set()).add(fn);
  }

  private emit(evt: EventName): void {
    this.listeners[evt]?.forEach((fn) => fn());
  }

  init(episodes: Episode[]): void {
    this.episodes = episodes;
    this.byId = new Map(episodes.map((e) => [e.id, e]));
    this.yearMax = Math.max(...episodes.flatMap((e) => e.spans.map((s) => s.end)), 2026);
  }

  setBrush(range: [number, number] | null): void {
    this.brush = range;
    this.emit("filter");
  }

  setQuery(q: string): void {
    this.query = q.trim();
    this.emit("filter");
  }

  select(id: string | null, opts: SelectOptions = {}): void {
    this.selectedId = id;
    this.selectFly = opts.fly ?? true;
    this.emit("select");
  }

  setHover(hover: Hover | null): void {
    this.hover = hover;
    this.emit("hover");
  }

  setView(view: "map" | "list"): void {
    this.view = view;
    this.emit("view");
  }

  setDark(dark: boolean): void {
    this.dark = dark;
    this.emit("theme");
  }

  get theme(): "light" | "dark" {
    return this.dark ? "dark" : "light";
  }

  /** Does an episode pass the current search + brush filters? */
  matches(ep: Episode): boolean {
    if (this.query) {
      const hay = fold(`${ep.title} ${ep.subject} ${ep.places.map((p) => p.name).join(" ")}`);
      if (!hay.includes(fold(this.query))) return false;
    }
    if (this.brush) {
      const [a, b] = this.brush;
      // Episodes without spans (RÚV placeholders) carry no time info: any
      // active time filter excludes them.
      if (!ep.spans.some((s) => s.end >= a && s.start <= b)) return false;
    }
    return true;
  }
}

export const store = new Store();
