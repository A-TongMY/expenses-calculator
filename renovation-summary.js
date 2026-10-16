import { money } from "./format.js";
import { el } from "./ui.js";

const TILES = [
  ["Budget", "budget"], ["Actual cost", "actualCost"], ["Paid", "paid"],
  ["Outstanding", "outstanding"], ["Due this month", "due"], ["Overdue", "overdue"],
];
const SHOWN_WHEN_ABOVE_ZERO = new Set(["due", "overdue"]);

export function renderRenovationSummary(container, report) {
  const { totals } = report;
  const stats = el("dl", "stats");
  for (const [label, key] of TILES) {
    if (SHOWN_WHEN_ABOVE_ZERO.has(key) && !(totals[key] > 0)) continue;
    const tile = el("div", `stat${key === "overdue" ? " warn" : ""}`);
    tile.dataset.key = key;
    tile.append(el("dt", "", label), el("dd", "", money.format(totals[key])));
    stats.append(tile);
  }
  container.replaceChildren(stats);
}
