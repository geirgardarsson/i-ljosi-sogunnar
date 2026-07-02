/**
 * One shared tooltip element. Content is set line-by-line with textContent —
 * episode titles/descriptions come from RÚV and are treated as untrusted.
 */
const el = document.createElement("div");
el.className = "tooltip";
el.setAttribute("role", "tooltip");
el.hidden = true;
document.body.append(el);

export function showTooltip(lines: string[], x: number, y: number): void {
  el.replaceChildren(
    ...lines.map((line) => {
      const div = document.createElement("div");
      div.textContent = line;
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
