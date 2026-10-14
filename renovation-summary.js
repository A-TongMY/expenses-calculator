import { money } from "./format.js";
import { el } from "./ui.js";

export function renderRenovationSummary(container, report) {
  const { totals } = report;
  const stats = el("dl", "stats");
  for (const [label, key] of [
    ["Budgeted total", "budgeted"], ["Expected total", "expected"],
    ["Actual total cost", "actualCost"], ["Paid", "paid"],
    ["Actual outstanding", "outstanding"], ["Due this month", "due"],
    ["Overdue", "overdue"], ["Unscheduled actual balance", "unscheduled"],
  ]) {
    const tile = el("div", `stat${key === "expected" ? " hero" : ""}`);
    tile.append(el("dt", "", label), el("dd", "", money.format(totals[key])));
    stats.append(tile);
  }
  const comparison = totals.gap === null
    ? "No items with both budget and actual cost to compare."
    : `Budget versus actual: ${money.format(totals.comparedBudget)} budget / ${money.format(totals.comparedActual)} actual (${money.format(totals.gap)} gap).`;
  container.replaceChildren(
    stats,
    el("p", "note", `${totals.unbudgetedCount} item(s) not budgeted. ${comparison}`),
    el("p", "note", "Outstanding includes only known actual costs. Due and overdue are parts of outstanding, not extra costs."),
  );
}
