/**
 * One shared tooltip element. Content is set line-by-line with textContent —
 * episode titles/descriptions come from RÚV and are treated as untrusted.
 * Curator notes pass as `{ note: text }` and render italic (style.css).
 */
export type TooltipLine = string | { note: string };

const el = document.createElement("div");
el.className = "tooltip";
el.setAttribute("role", "tooltip");
el.hidden = true;
document.body.append(el);

export function showTooltip(lines: TooltipLine[], x: number, y: number): void {
  el.replaceChildren(
    ...lines.map((line) => {
      const div = document.createElement("div");
      if (typeof line === "string") div.textContent = line;
      else {
        div.textContent = line.note;
        div.className = "tooltip-note";
      }
      return div;
    }),
  );
  el.hidden = false;
  const pad = 12;
  const { width, height } = el.getBoundingClientRect();
  el.style.left = `${Math.min(x + pad, window.innerWidth - width - pad)}px`;
  el.style.top = `${Math.min(y + pad, window.innerHeight - height - pad)}px`;
}

export function hideTooltip(): void {
  el.hidden = true;
}
