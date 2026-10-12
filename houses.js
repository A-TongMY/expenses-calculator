import { currentMonth, money, monthLabel, termLabel } from "./format.js";
import { housesOverview, loanSummary, monthlyInstallment, repaysInFull } from "./loan.js";
import {
  MAX_AMOUNT,
  MAX_HOUSES,
  MAX_NAME_LENGTH,
  MAX_TERM_MONTHS,
  isMonth,
  isValidHouse,
} from "./rules.js";
import { el, icon, iconButton } from "./ui.js";

const byId = (id) => document.getElementById(id);

function figure(label, value) {
  const box = el("div");
  box.append(el("dt", "", label), el("dd", "", value));
  return box;
}

const STATUS = {
  upcoming: { label: (house) => `Starts ${monthLabel(house.startMonth)}`, className: "" },
  active: { label: () => "Active", className: "active" },
  "paid off": { label: () => "Paid off", className: "done" },
};

export function setupHouses({ getState, commit, newId }) {
  const form = byId("house-form");
  const field = (name) => form.elements.namedItem(name);
  const addPanel = byId("house-add");
  const heading = byId("house-form-heading");
  const submit = byId("house-submit");
  const cancel = byId("house-cancel");
  const hint = byId("house-hint");
  const list = byId("house-list");
  const emptyMessage = byId("house-empty");
  const overview = byId("houses-overview");
  const addHeading = heading.textContent;
  let editingId = null;
  const openHouses = new Set();
  const openSchedules = new Set();

  for (const input of form.querySelectorAll('[data-limit="amount"]')) input.max = MAX_AMOUNT;
  for (const input of form.querySelectorAll('[data-limit="name"]')) input.maxLength = MAX_NAME_LENGTH;

  const find = (id) => getState().houses.find((house) => house.id === id);

  function readItem() {
    const value = (name) => field(name).value;
    const item = {
      id: editingId ?? newId(),
      name: value("name").trim(),
      loan: Number(value("loan")),
      ratePercent: Number(value("ratePercent")),
      termMonths: Math.round(Number(value("years")) * 12),
      startMonth: value("startMonth"),
    };
    if (value("price") !== "") item.price = Number(value("price"));
    if (value("installment") !== "") item.installment = Number(value("installment"));
    return item;
  }

  function clearValidity() {
    for (const control of form.elements) control.setCustomValidity?.("");
  }

  function updateHint() {
    const item = readItem();
    const parts = [];
    const usable =
      item.loan > 0 && Number.isFinite(item.ratePercent) && item.ratePercent >= 0 &&
      item.termMonths >= 1 && item.termMonths <= MAX_TERM_MONTHS;
    if (usable) {
      parts.push(`${money.format(monthlyInstallment(item))} /mo`);
    }
    if (item.price !== undefined && item.loan > 0 && item.price >= item.loan) {
      parts.push(`down ${money.format(item.price - item.loan)}`);
    }
    hint.textContent = parts.join(" ");
  }

  function reset() {
    // Finishing an edit folds the form away; adding keeps it open for the next house.
    if (editingId !== null) addPanel.open = false;
    editingId = null;
    form.reset();
    clearValidity();
    heading.textContent = addHeading;
    cancel.hidden = true;
    updateHint();
  }

  function startEdit(id) {
    const house = find(id);
    if (!house) return;
    editingId = id;
    field("name").value = house.name;
    field("price").value = house.price ?? "";
    field("loan").value = house.loan;
    field("ratePercent").value = house.ratePercent;
    field("years").value = house.termMonths / 12;
    field("startMonth").value = house.startMonth;
    field("installment").value = house.installment ?? "";
    heading.textContent = "Edit house";
    cancel.hidden = false;
    addPanel.open = true;
    clearValidity();
    updateHint();
    field("name").focus();
  }

  function remove(id) {
    const house = find(id);
    if (!house || !confirm(`Delete "${house.name}"?`)) return;
    if (editingId === id) reset();
    openHouses.delete(id);
    openSchedules.delete(id);
    commit({ ...getState(), houses: getState().houses.filter((other) => other.id !== id) });
  }

  function scheduleTable(summary) {
    const table = el("table", "data-table");
    const head = el("tr");
    for (const label of ["#", "Month", "Paid", "Interest", "Principal", "Balance"]) {
      const cell = el("th", "", label);
      cell.scope = "col";
      head.append(cell);
    }
    const thead = el("thead");
    thead.append(head);
    table.append(thead);
    const body = el("tbody");
    const now = currentMonth();
    for (const row of summary.rows) {
      const tr = el("tr");
      if (row.month < now) tr.className = "paid";
      if (row.month === now) tr.className = "current";
      const month = el("th", "", monthLabel(row.month));
      month.scope = "row";
      if (row.month === now) month.append(" ", el("span", "chip active", "Now"));
      tr.append(
        el("td", "", String(row.number)),
        month,
        el("td", "", money.format(row.payment)),
        el("td", "", money.format(row.interest)),
        el("td", "", money.format(row.principal)),
        el("td", "", money.format(row.balance)),
      );
      body.append(tr);
    }
    table.append(body);
    const wrap = el("div", "table-wrap");
    wrap.append(table);
    return wrap;
  }

  function buildCard(house) {
    const summary = loanSummary(house, currentMonth());
    const status = STATUS[summary.status];
    const card = el("details", "panel");
    card.dataset.id = house.id;
    card.open = openHouses.has(house.id);
    card.addEventListener("toggle", () => {
      if (card.open) openHouses.add(house.id);
      else openHouses.delete(house.id);
    });

    const head = el("summary");
    head.append(
      icon("home"),
      el("span", "title", house.name),
      ...(summary.status === "active" ? [] : [el("span", `chip ${status.className}`.trim(), status.label(house))]),
      el("span", "amount", money.format(summary.installment)),
      icon("chevron", "chev"),
    );

    const stats = el("dl", "stats");
    const stat = (label, value) => {
      const box = el("div", "stat");
      box.append(el("dt", "", label), el("dd", "", value));
      stats.append(box);
    };
    if (house.price !== undefined) {
      stat("Price", money.format(house.price));
      stat("Down payment", money.format(house.price - house.loan));
    }
    stat("Loan", money.format(house.loan));
    stat("Owed", money.format(summary.outstanding));
    stat("Principal paid", money.format(summary.principalPaid));
    stat("Interest paid", money.format(summary.interestPaid));
    stat("Total interest", money.format(summary.totalInterest));
    stat("Total payable", money.format(summary.totalPayable));
    stat("Payments", `${summary.paymentsMade} / ${summary.paymentsTotal}`);
    stat("Ends", monthLabel(summary.finalMonth));

    const percent = Math.round(summary.progress * 1000) / 10;
    const progress = el("progress");
    progress.max = 100;
    progress.value = percent;
    progress.setAttribute("aria-label", `${house.name}: ${percent}% repaid`);

    const meta = el("div", "house-meta");
    const terms = [`${house.ratePercent}%`, termLabel(house.termMonths), `from ${monthLabel(house.startMonth)}`];
    if (house.installment !== undefined) terms.push("bank installment");
    meta.append(
      el("span", "muted", `${percent}% repaid · ${terms.join(" · ")}`),
    );
    const actions = el("div", "actions");
    actions.append(
      iconButton({ name: "edit", label: `Edit ${house.name}`, onClick: () => startEdit(house.id) }),
      iconButton({ name: "trash", label: `Delete ${house.name}`, className: "danger", onClick: () => remove(house.id) }),
    );
    meta.append(actions);

    const schedule = el("details", "sub");
    const scheduleHead = el("summary");
    scheduleHead.append(icon("table"), "Schedule");
    schedule.append(scheduleHead, scheduleTable(summary));
    schedule.open = openSchedules.has(house.id);
    schedule.addEventListener("toggle", () => {
      if (schedule.open) openSchedules.add(house.id);
      else openSchedules.delete(house.id);
    });

    const body = el("div", "panel-body");
    body.append(stats, progress, meta, schedule);
    card.append(head, body);
    return card;
  }

  function render() {
    const { houses } = getState();
    if (editingId && !find(editingId)) reset();
    list.replaceChildren(...houses.map(buildCard));
    emptyMessage.hidden = houses.length > 0;
    overview.hidden = houses.length === 0;
    if (houses.length > 0) {
      const totals = housesOverview(houses, currentMonth());
      byId("houses-total-monthly").textContent = money.format(totals.monthly);
      byId("houses-total-outstanding").textContent = money.format(totals.outstanding);
      byId("houses-total-principal").textContent = money.format(totals.principalPaid);
      byId("houses-total-interest-paid").textContent = money.format(totals.interestPaid);
      byId("houses-total-interest").textContent = money.format(totals.totalInterest);
    }
  }

  form.addEventListener("input", () => {
    clearValidity();
    updateHint();
  });
  cancel.addEventListener("click", () => {
    reset();
    addPanel.open = false;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearValidity();
    const item = readItem();
    const problem = (name, message) => field(name).setCustomValidity(message);

    if (!item.name) problem("name", "Enter a name.");
    if (!isMonth(item.startMonth)) problem("startMonth", "Use the format YYYY-MM, for example 2024-03.");
    if (item.price !== undefined && item.loan > item.price) {
      problem("loan", "The loan cannot be more than the property price.");
    }
    if (!(item.termMonths >= 1 && item.termMonths <= MAX_TERM_MONTHS)) {
      problem("years", `Enter a term between 1 month and ${MAX_TERM_MONTHS / 12} years.`);
    }
    if (item.installment !== undefined && item.installment <= 0) {
      problem("installment", "Enter an amount above zero, or leave it empty.");
    } else if (item.installment !== undefined && item.loan > 0 && !repaysInFull(item)) {
      problem("installment", "This installment is too small to repay the loan within 100 years.");
    }
    if (!form.reportValidity()) return;

    if (!isValidHouse(item)) {
      problem("name", "Some of these values are not valid. Check them and try again.");
      form.reportValidity();
      return;
    }
    const { houses } = getState();
    const next = editingId
      ? houses.map((other) => (other.id === editingId ? item : other))
      : [...houses, item];
    if (next.length > MAX_HOUSES) {
      problem("name", `That would go over the limit of ${MAX_HOUSES} houses.`);
      form.reportValidity();
      return;
    }
    reset();
    openHouses.add(item.id);
    commit({ ...getState(), houses: next });
    field("name").focus();
  });

  updateHint();
  return { render, reset };
}
