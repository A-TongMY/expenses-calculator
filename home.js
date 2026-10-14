import { lineChart, meterBar, rangeDots, segmentBar, stackedBars } from "./charts.js";
import { currentMonth, money, monthLabel, range } from "./format.js";
import { expenseReport, housesReport } from "./reports.js";
import { el, icon } from "./ui.js";
import { spendingReport } from "./spending.js";
import { renderSpendingSummary } from "./spending-summary.js";
import { renovationReport } from "./renovation.js";
import { renovationMonth } from "./renovation-calendar.js";
import { renderRenovationSummary } from "./renovation-summary.js";

const percent = (share) => `${Math.round(share * 100)}%`;

function card(title, ...content) {
  const box = el("section", "card");
  box.append(el("h3", "", title), ...content);
  return box;
}

function stat(label, value, className = "") {
  const box = el("div", `stat ${className}`.trim());
  box.append(el("dt", "", label), el("dd", "", value));
  return box;
}

function stats(...tiles) {
  const list = el("dl", "stats");
  list.append(...tiles);
  return list;
}

function legend(entries) {
  const list = el("ul", "legend");
  for (const { name, className, text } of entries) {
    const item = el("li");
    item.append(el("span", `swatch ${className}`), text ? `${name} ${text}` : name);
    list.append(item);
  }
  return list;
}

function emptyCard(href) {
  const link = el("a", "empty-card");
  link.href = href;
  link.append(icon("plus"), "Add");
  return link;
}

// Rows of "label ... value" with a thin bar underneath.
function barRows(rows) {
  const list = el("div", "bar-rows");
  for (const row of rows) {
    const box = el("div", "bar-row");
    box.append(el("span", "label", row.label), el("span", "value", row.value), meterBar(row.share, row.className));
    if (row.sub) box.append(el("span", "sub", row.sub));
    list.append(box);
  }
  return list;
}

function expenseCards(report, month) {
  if (!report.hasData) return [emptyCard("#/expenses")];
  const cards = [];

  const spentTile = report.spentShare === null ? stat("Spent", money.format(report.spent)) : stat("Spent", percent(report.spentShare));
  const tightest = report.tightest
    ? stat("Tightest", `${monthLabel(report.tightest.month)} · ${money.format(report.tightest.worst)}`, "wide")
    : stat("Tightest", "–", "wide");
  cards.push(
    stats(
      stat("Left", range(report.left.worst, report.left.best), `hero${report.left.worst < 0 ? " negative" : ""}`),
      stat("Income", money.format(report.income)),
      spentTile,
      stat(`Lifestyle · ${report.lifestyle.source}`, range(report.lifestyle.low, report.lifestyle.high)),
      tightest,
    ),
  );

  const labels = report.months.map((entry) => monthLabel(entry.month));
  // Past the end of the real commitments only scenarios remain, so the baseline lines stop there.
  const baseline = report.months.filter((entry) => entry.inBaselineWindow);
  if (report.months.length > 1) {
    const series = [
      { name: "Best", values: baseline.map((entry) => entry.best), className: "s1 soft" },
      { name: "Worst", values: baseline.map((entry) => entry.worst), className: "s1" },
    ];
    const entries = [
      { name: "Best", className: "s1 soft" },
      { name: "Worst", className: "s1" },
    ];
    if (report.showScenarios) {
      series.push({ name: "With scenarios", values: report.months.map((entry) => entry.withScenarios.worst), className: "s3 dash" });
      entries.push({ name: "With scenarios", className: "s3 dash" });
    }
    cards.push(card("Left by month", lineChart({ labels, series, band: { upper: 0, lower: 1 }, points: true, label: "Left per month, best and worst case" }), legend(entries)));
  }

  const costParts = [];
  if (report.income > 0) {
    const leftover = Math.max(report.left.worst, 0);
    costParts.push(
      segmentBar(
        [
          { value: report.commitments, className: "s1" },
          { value: report.lifestyle.high, className: "s2" },
          { value: leftover, className: "s4" },
        ],
        "Where income goes this month",
      ),
      legend([
        { name: "Commitments", className: "s1", text: percent(report.commitments / report.income) },
        { name: "Lifestyle", className: "s2", text: percent(report.lifestyle.high / report.income) },
        report.left.worst >= 0
          ? { name: "Left", className: "s4", text: percent(report.left.worst / report.income) }
          : { name: "Over by", className: "s4", text: money.format(-report.left.worst) },
      ]),
    );
  }
  if (report.costs.length > 0) {
    const top = report.costs.slice(0, 5);
    const biggest = top[0].value;
    costParts.push(
      barRows(
        top.map((cost) => ({
          label: cost.name,
          value: money.format(cost.value),
          share: cost.value / biggest,
          className: cost.kind === "commitment" ? "s1" : "s2",
        })),
      ),
    );
  }
  if (costParts.length > 0) cards.push(card("Where income goes", ...costParts));

  if (report.actuals.length > 0) {
    const counts = { over: 0, within: 0, under: 0 };
    for (const entry of report.actuals) counts[entry.kind] += 1;
    cards.push(
      card(
        "Actual vs estimate",
        rangeDots({
          labels: report.actuals.map((entry) => monthLabel(entry.month)),
          items: report.actuals,
          label: "Spent against the estimate, by month",
        }),
        legend([
          { name: "Over", className: "s5", text: String(counts.over) },
          { name: "Within", className: "s4", text: String(counts.within) },
          { name: "Under", className: "s1", text: String(counts.under) },
        ]),
      ),
    );
  }
  return cards;
}

function houseCards(report) {
  if (!report.hasData) return [emptyCard("#/houses")];
  const cards = [];
  const { totals } = report;

  cards.push(
    stats(
      stat("Due this month", money.format(totals.monthly), "hero"),
      stat("Owed", money.format(totals.outstanding)),
      stat("Repaid", percent(report.repaidShare)),
      stat("Interest paid", money.format(totals.interestPaid)),
      stat("Total interest", money.format(totals.totalInterest)),
    ),
  );

  const { months, balance, nowIndex } = report.timeline;
  if (months.length > 1) {
    cards.push(
      card(
        "Owed over time",
        lineChart({
          labels: months.map(monthLabel),
          xLabel: (index) => months[index].slice(0, 4),
          series: [{ name: "Owed", values: balance, className: "s1" }],
          includeZero: true,
          markIndex: nowIndex,
          label: "Total owed on all houses over time",
        }),
      ),
    );
  }

  if (report.years.length > 0) {
    cards.push(
      card(
        "Principal and interest",
        stackedBars({
          labels: report.years.map((entry) => entry.year),
          stacks: [
            { name: "Principal", values: report.years.map((entry) => entry.principal), className: "s1" },
            { name: "Interest", values: report.years.map((entry) => entry.interest), className: "s3" },
          ],
          label: "Principal and interest paid each year",
        }),
        legend([
          { name: "Principal", className: "s1" },
          { name: "Interest", className: "s3" },
        ]),
      ),
    );
  }

  cards.push(
    card(
      "Houses",
      barRows(
        report.items.map(({ house, summary }) => ({
          label: house.name,
          value: money.format(summary.outstanding),
          share: summary.progress,
          className: summary.status === "paid off" ? "s4" : "s1",
          sub: `${percent(summary.progress)} repaid · ends ${monthLabel(summary.finalMonth)}`,
        })),
      ),
    ),
  );
  return cards;
}

export function setupHome({ getState }) {
  const expenses = document.getElementById("home-expenses");
  const houses = document.getElementById("home-houses");

  function render() {
    const state = getState();
    const month = currentMonth();
    expenses.replaceChildren(...expenseCards(expenseReport(state, month), month));
    houses.replaceChildren(...houseCards(housesReport(state.houses, month)));
    renderSpendingSummary(document.getElementById("home-spending"), spendingReport(state, month));
    const panels = state.houses.filter((house) =>
      state.renovationItems.some((item) => item.houseId === house.id)).map((house) => {
      const panel = el("details", "panel");
      panel.open = true;
      const heading = el("summary");
      const link = el("a", "open-link", "Open Renovation");
      link.href = `#/renovation?house=${encodeURIComponent(house.id)}`;
      heading.append(el("span", "title", `Renovation / ${house.name}`), link);
      const content = el("div", "panel-body cards");
      renderRenovationSummary(content, renovationReport(state, house.id, renovationMonth()));
      panel.append(heading, content);
      return panel;
    });
    document.getElementById("home-renovation").replaceChildren(...panels);
  }

  return { render };
}
