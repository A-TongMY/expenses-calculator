import { meterBar } from "./charts.js";
import { money } from "./format.js";
import { el } from "./ui.js";

export function renderSpendingSummary(root, report) {
  const stats = el("dl", "stats");
  for (const [label, value] of [
    ["Recorded", money.format(report.total)],
    ["Entries", String(report.count)],
    ["Per day", money.format(report.average)],
  ]) {
    const tile = el("div", "stat");
    tile.append(el("dt", "", label), el("dd", "", value));
    stats.append(tile);
  }
  const chart = el("section", "card");
  chart.setAttribute("aria-label", "Spending by category");
  chart.append(el("h3", "", "By category"));
  if (report.categories.length === 0) {
    chart.append(el("p", "empty", "No spending this month"));
  } else {
    const rows = el("div", "bar-rows");
    const largest = report.categories[0].amount;
    for (const category of report.categories) {
      const row = el("div", "bar-row");
      row.append(
        el("span", "label", category.name),
        el("span", "value", money.format(category.amount)),
        meterBar(largest > 0 ? category.amount / largest : 0, "s2"),
      );
      rows.append(row);
    }
    chart.append(rows);
  }
  root.replaceChildren(stats, chart);
}
