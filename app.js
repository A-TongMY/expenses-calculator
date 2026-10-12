import { lifestyleMonthlyCost, monthlyCost, projection, tightestMonth } from "./calc.js";
import { importBackup, exportBackup } from "./backup.js";
import { setupCheckIns } from "./checkins.js";
import { setupHouses } from "./houses.js";
import { cadenceLabel, currentMonth, money, monthLabel, periodLabel, range } from "./format.js";
import {
  MAX_AMOUNT,
  MAX_EVERY_MONTHS,
  MAX_ITEMS,
  MAX_NAME_LENGTH,
  isMonth,
  isValidCommitment,
  isValidLifestyle,
} from "./rules.js";
import { STORAGE_KEY, loadState, saveState } from "./storage.js";
import { el, iconButton, rememberPanels } from "./ui.js";

const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

const $ = (id) => document.getElementById(id);
const els = {
  notice: $("storage-notice"),
  income: $("income"),
  figures: $("overview-stats"),
  commitmentsLabel: $("commitments-label"),
  totalCommitments: $("total-commitments"),
  totalLifestyle: $("total-lifestyle"),
  remainingLabel: $("remaining-label"),
  remaining: $("remaining"),
  remainingHint: $("remaining-hint"),
  remainingWithBlock: $("remaining-with-block"),
  remainingWith: $("remaining-with"),
  tightest: $("tightest"),
  tightestWith: $("tightest-with"),
  projectionEmpty: $("projection-empty"),
  projectionWrap: $("projection-wrap"),
  projectionBaselineHeader: $("projection-baseline-header"),
  projectionWithHeader: $("projection-with-header"),
  projectionBody: $("projection-body"),
  exportButton: $("export-button"),
  importButton: $("import-button"),
  importFile: $("import-file"),
  backupMessage: $("backup-message"),
};

for (const input of document.querySelectorAll('[data-limit="amount"]')) input.max = MAX_AMOUNT;
for (const input of document.querySelectorAll('[data-limit="months"]')) input.max = MAX_EVERY_MONTHS;
for (const input of document.querySelectorAll('[data-limit="name"]')) input.maxLength = MAX_NAME_LENGTH;

rememberPanels();

// crypto.randomUUID only exists on secure origins, not on a LAN address like http://192.168.1.5.
const newId = () =>
  crypto.randomUUID?.() ??
  [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");

function showNotice(message) {
  els.notice.textContent = message;
  els.notice.hidden = false;
}

const loaded = loadState();
let state = loaded.state;
if (loaded.notice) showNotice(loaded.notice);
const startupNotice = loaded.notice ?? null;

let saveFailed = false;

function persist() {
  const saved = saveState(state);
  if (saved && saveFailed) {
    if (startupNotice) showNotice(startupNotice);
    else els.notice.hidden = true;
  }
  if (!saved) showNotice("Could not save to this browser. Use Export backup to keep your data.");
  saveFailed = !saved;
  return saved;
}

function commit(next) {
  state = next;
  persist();
  renderAll();
}

const SECTIONS = {
  commitments: {
    scenarios: true,
    amountFields: ["amount"],
    isValid: isValidCommitment,
    detail: (item) =>
      [`${money.format(item.amount)} ${cadenceLabel(item.everyMonths)}`, periodLabel(item)]
        .filter(Boolean)
        .join(" · "),
    cost: (item) => `${money.format(monthlyCost(item))} /mo`,
  },
  lifestyle: {
    amountFields: ["low", "high"],
    isValid: isValidLifestyle,
    detail: (item) =>
      [`${range(item.low, item.high)} ${cadenceLabel(item.everyMonths)}`, periodLabel(item)]
        .filter(Boolean)
        .join(" · "),
    cost: (item) => {
      const cost = lifestyleMonthlyCost(item);
      return `${range(cost.low, cost.high)} /mo`;
    },
    checkForm: (field) => {
      const lowAboveHigh =
        field("high").value !== "" && Number(field("low").value) > Number(field("high").value);
      field("high").setCustomValidity(lowAboveHigh ? "High must be at least the low estimate." : "");
    },
  },
};

function checkMonths(field) {
  const start = field("startMonth");
  const end = field("endMonth");
  for (const input of [start, end]) {
    input.setCustomValidity(
      input.value && !isMonth(input.value) ? "Use the format YYYY-MM, for example 2027-03." : "",
    );
  }
  if (isMonth(start.value) && isMonth(end.value) && end.value < start.value) {
    end.setCustomValidity("The end month must be the same as or after the start month.");
  }
}

function createSection(root, key, config) {
  const part = (role) => root.querySelector(`[data-role="${role}"]`);
  const list = part("list");
  const emptyMessage = part("empty");
  const form = part("form");
  const addPanel = part("add");
  const count = part("count");
  const heading = part("form-heading");
  const submit = part("submit");
  const cancel = part("cancel");
  const customField = part("custom-field");
  const field = (name) => form.elements.namedItem(name);
  const addHeading = heading.textContent;
  let editingId = null;

  const find = (id) => state[key].find((item) => item.id === id);

  function readEveryMonths() {
    return Number(field("cadence").value === "custom" ? field("customMonths").value : field("cadence").value);
  }

  function syncCustomField() {
    const custom = field("cadence").value === "custom";
    customField.hidden = !custom;
    field("customMonths").disabled = !custom;
  }

  function clearValidity() {
    for (const control of form.elements) control.setCustomValidity("");
  }

  function reset() {
    // Finishing an edit folds the form away; adding keeps it open for the next item.
    if (editingId !== null) addPanel.open = false;
    editingId = null;
    form.reset();
    clearValidity();
    heading.textContent = addHeading;
    cancel.hidden = true;
    syncCustomField();
  }

  function startEdit(id) {
    const item = find(id);
    if (!item) return;
    editingId = id;
    field("name").value = item.name;
    for (const amountField of config.amountFields) field(amountField).value = item[amountField];
    field("startMonth").value = item.startMonth ?? "";
    field("endMonth").value = item.endMonth ?? "";
    if (config.scenarios) field("scenario").checked = Boolean(item.scenario);
    if (item.everyMonths === 1 || item.everyMonths === 12) {
      field("cadence").value = String(item.everyMonths);
    } else {
      field("cadence").value = "custom";
      field("customMonths").value = item.everyMonths;
    }
    syncCustomField();
    heading.textContent = "Edit";
    cancel.hidden = false;
    addPanel.open = true;
    field("name").focus();
  }

  function remove(id) {
    const item = find(id);
    if (!item || !confirm(`Delete "${item.name}"?`)) return;
    if (editingId === id) reset();
    commit({ ...state, [key]: state[key].filter((other) => other.id !== id) });
  }

  function replaceItem(id, change) {
    commit({ ...state, [key]: state[key].map((item) => (item.id === id ? change(item) : item)) });
  }

  function scenarioControls(item) {
    const toggle = el("label", "switch");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = item.scenario.on;
    box.setAttribute("role", "switch");
    box.setAttribute("aria-label", `Include ${item.name} in the figures`);
    box.title = "Include";
    box.addEventListener("change", () => {
      replaceItem(item.id, (other) => ({ ...other, scenario: { on: box.checked } }));
      // The list was just rebuilt, so the focused switch is gone: give focus back to its replacement.
      const row = [...list.children].find((other) => other.dataset.id === item.id);
      row?.querySelector("input[role=switch]")?.focus();
    });
    toggle.append(box);

    const makeReal = iconButton({
      name: "real",
      label: `Make ${item.name} a real commitment`,
      className: "positive",
      onClick: () => {
        if (editingId === item.id) field("scenario").checked = false;
        replaceItem(item.id, ({ scenario, ...real }) => real);
      },
    });
    return [toggle, makeReal];
  }

  function buildRow(item) {
    const row = el("li");
    row.dataset.id = item.id;

    const name = el("div", "name", item.name);
    if (item.scenario) {
      row.classList.add("scenario");
      row.classList.toggle("off", !item.scenario.on);
      name.append(" ", el("span", "chip", "Scenario"));
    }
    const detail = el("div", "detail", config.detail(item));
    const cost = el("div", "cost", config.cost(item));

    const actions = el("div", "actions");
    actions.append(
      ...(item.scenario ? scenarioControls(item) : []),
      iconButton({ name: "edit", label: `Edit ${item.name}`, onClick: () => startEdit(item.id) }),
      iconButton({ name: "trash", label: `Delete ${item.name}`, className: "danger", onClick: () => remove(item.id) }),
    );

    row.append(name, cost, detail, actions);
    return row;
  }

  function render() {
    if (editingId && !find(editingId)) reset();
    list.replaceChildren(...state[key].map(buildRow));
    emptyMessage.hidden = state[key].length > 0;
    count.textContent = state[key].length;
    count.hidden = state[key].length === 0;
  }

  field("cadence").addEventListener("change", syncCustomField);
  cancel.addEventListener("click", () => {
    reset();
    addPanel.open = false;
  });

  form.addEventListener("input", clearValidity);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    field("name").setCustomValidity(field("name").value.trim() ? "" : "Enter a name.");
    checkMonths(field);
    config.checkForm?.(field);
    if (!form.reportValidity()) return;

    const months = Object.fromEntries(
      ["startMonth", "endMonth"].map((name) => [name, field(name).value]).filter(([, value]) => value),
    );
    const item = {
      id: editingId ?? newId(),
      name: field("name").value.trim(),
      ...Object.fromEntries(config.amountFields.map((name) => [name, Number(field(name).value)])),
      everyMonths: readEveryMonths(),
      ...months,
    };
    if (config.scenarios && field("scenario").checked) {
      item.scenario = { on: find(editingId)?.scenario?.on ?? true };
    }
    if (!config.isValid(item)) {
      field("name").setCustomValidity("Some of these values are not valid. Check them and try again.");
      form.reportValidity();
      return;
    }

    const next = {
      ...state,
      [key]: editingId
        ? state[key].map((other) => (other.id === editingId ? item : other))
        : [...state[key], item],
    };
    if (next[key].length > MAX_ITEMS) {
      field("name").setCustomValidity(`That would go over the limit of ${MAX_ITEMS} items.`);
      form.reportValidity();
      return;
    }
    reset();
    commit(next);
    field("name").focus();
  });

  syncCustomField();
  return { render, reset };
}

const sections = Object.entries(SECTIONS).map(([key, config]) =>
  createSection(document.querySelector(`[data-kind="${key}"]`), key, config),
);

const checkIns = setupCheckIns({ getState: () => state, commit });
const houses = setupHouses({ getState: () => state, commit, newId });

let shownMonth = null;

function tightestLine(prefix, month, figures) {
  return `${prefix}${monthLabel(month)} · ${money.format(figures.worst)}`;
}

function tableCell(figures, isTightest) {
  const cell = document.createElement("td");
  cell.textContent = range(figures.worst, figures.best);
  cell.classList.toggle("negative", figures.worst < 0);
  if (isTightest) {
    cell.classList.add("tightest");
    const badge = document.createElement("span");
    badge.className = "chip";
    badge.textContent = "Tightest";
    cell.append(" ", badge);
  }
  return cell;
}

function renderOverview() {
  const months = projection(state, currentMonth());
  const hasData = state.income > 0 || state.commitments.length > 0 || state.lifestyle.length > 0;
  const showScenarios = state.commitments.some((commitment) => commitment.scenario?.on);
  const tightest = tightestMonth(months);
  const tightestWith = tightestMonth(months, { withScenarios: true });
  const { best, worst, commitments, lifestyle, withScenarios } = months[0];

  els.commitmentsLabel.textContent = "Commitments";
  els.totalCommitments.textContent = money.format(commitments);
  els.totalLifestyle.textContent = range(lifestyle.low, lifestyle.high);
  els.remainingLabel.textContent = showScenarios ? "Left · baseline" : "Left";
  els.remaining.textContent = range(worst, best);
  els.remainingHint.hidden = worst === best;
  els.remaining.classList.toggle("negative", worst < 0);

  els.figures.classList.toggle("has-scenarios", showScenarios);
  els.remainingWithBlock.hidden = !showScenarios;
  els.remainingWith.textContent = range(withScenarios.worst, withScenarios.best);
  els.remainingWith.classList.toggle("negative", withScenarios.worst < 0);

  els.tightest.hidden = !hasData;
  els.tightest.textContent = tightestLine(
    showScenarios ? "Tightest, baseline: " : "Tightest: ",
    tightest.month,
    tightest,
  );
  els.tightestWith.hidden = !hasData || !showScenarios;
  els.tightestWith.textContent = tightestLine(
    "Tightest, with scenarios: ",
    tightestWith.month,
    tightestWith.withScenarios,
  );

  els.projectionEmpty.hidden = hasData;
  els.projectionWrap.hidden = !hasData;
  els.projectionBaselineHeader.textContent = showScenarios ? "Baseline" : "Left";
  els.projectionWithHeader.hidden = !showScenarios;
  els.projectionBody.replaceChildren(
    ...months.map((entry) => {
      const row = document.createElement("tr");
      const label = document.createElement("th");
      label.scope = "row";
      label.textContent = monthLabel(entry.month);
      row.append(label, tableCell(entry, entry === tightest));
      if (showScenarios) row.append(tableCell(entry.withScenarios, entry === tightestWith));
      return row;
    }),
  );
}

function renderAll() {
  shownMonth = currentMonth();
  renderOverview();
  for (const section of sections) section.render();
  checkIns.render();
  houses.render();
}

function syncIncomeField() {
  els.income.value = state.income > 0 ? state.income : "";
}

function showBackupMessage(message) {
  els.backupMessage.textContent = message;
}

syncIncomeField();

const PAGES = ["expenses", "houses"];

function showPage() {
  const requested = location.hash.replace(/^#\/?/, "");
  const page = PAGES.includes(requested) ? requested : "expenses";
  for (const name of PAGES) {
    $(`page-${name}`).hidden = name !== page;
    const link = document.querySelector(`[data-nav="${name}"]`);
    if (name === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

showPage();
window.addEventListener("hashchange", () => {
  showPage();
  window.scrollTo(0, 0);
});

els.income.addEventListener("input", () => {
  const value = Number(els.income.value);
  // Silently capped at the largest amount a backup can hold.
  state = { ...state, income: Number.isFinite(value) && value > 0 ? Math.min(value, MAX_AMOUNT) : 0 };
  persist();
  renderOverview();
});

els.income.addEventListener("change", syncIncomeField);

function refreshIfMonthChanged() {
  if (!document.hidden && currentMonth() !== shownMonth) renderAll();
}

document.addEventListener("visibilitychange", refreshIfMonthChanged);
// A tab left open and visible across midnight on the 1st never fires visibilitychange.
setInterval(refreshIfMonthChanged, 60_000);

// Another tab saved: take its data instead of overwriting it with this tab's older copy.
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || event.newValue === null) return;
  let incoming;
  try {
    incoming = importBackup(event.newValue);
  } catch {
    return; // An unreadable value is left for the tab that wrote it to report.
  }
  state = incoming;
  syncIncomeField();
  renderAll();
});

els.exportButton.addEventListener("click", () => {
  const blob = new Blob([exportBackup(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `expenses-backup-${currentMonth()}-${String(new Date().getDate()).padStart(2, "0")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showBackupMessage("Downloaded. Keep the file private.");
});

els.importButton.addEventListener("click", () => els.importFile.click());

els.importFile.addEventListener("change", async () => {
  const [file] = els.importFile.files;
  els.importFile.value = "";
  if (!file) return;
  if (file.size > MAX_BACKUP_BYTES) {
    showBackupMessage("File too large.");
    return;
  }
  try {
    const imported = importBackup(await file.text());
    if (!confirm("Importing replaces everything currently saved in this browser. Continue?")) {
      showBackupMessage("Cancelled.");
      return;
    }
    state = imported;
    const saved = persist();
    syncIncomeField();
    for (const section of sections) section.reset();
    houses.reset();
    renderAll();
    checkIns.syncForm();
    showBackupMessage(
      saved ? "Imported." : "Imported, but not saved in this browser.",
    );
  } catch (error) {
    showBackupMessage(error.message);
  }
});

renderAll();
