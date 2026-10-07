import {
  lifestyleMonthlyCost,
  monthlyCost,
  remaining,
  totalLifestyleCost,
  totalMonthlyCost,
} from "./calc.js";
import { exportBackup, importBackup } from "./backup.js";
import {
  MAX_AMOUNT,
  MAX_EVERY_MONTHS,
  MAX_NAME_LENGTH,
  isValidCommitment,
  isValidLifestyle,
} from "./rules.js";

const STORAGE_KEY = "expenses-calculator";

const money = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });
const range = (low, high) =>
  low === high ? money.format(low) : `${money.format(low)} – ${money.format(high)}`;

const $ = (id) => document.getElementById(id);
const els = {
  notice: $("storage-notice"),
  income: $("income"),
  totalCommitments: $("total-commitments"),
  totalLifestyle: $("total-lifestyle"),
  remaining: $("remaining"),
  remainingHint: $("remaining-hint"),
  exportButton: $("export-button"),
  importButton: $("import-button"),
  importFile: $("import-file"),
  backupMessage: $("backup-message"),
};

for (const el of document.querySelectorAll('[data-limit="amount"]')) el.max = MAX_AMOUNT;
for (const el of document.querySelectorAll('[data-limit="months"]')) el.max = MAX_EVERY_MONTHS;
for (const el of document.querySelectorAll('[data-limit="name"]')) el.maxLength = MAX_NAME_LENGTH;

let state = loadState();
let saveFailed = false;

function blankState() {
  return { income: 0, commitments: [], lifestyle: [] };
}

function showNotice(message) {
  els.notice.textContent = message;
  els.notice.hidden = false;
}

function hideNotice() {
  els.notice.hidden = true;
}

function keepUnreadableCopy(saved) {
  const key = `${STORAGE_KEY}:unreadable:${new Date().toISOString()}`;
  try {
    localStorage.setItem(key, saved);
    return key;
  } catch {
    return null;
  }
}

function loadState() {
  let saved;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    showNotice("This browser is blocking storage, so changes will not be saved. Use Export backup to keep your data.");
    return blankState();
  }
  if (!saved) return blankState();
  try {
    return importBackup(saved);
  } catch {
    const key = keepUnreadableCopy(saved);
    showNotice(
      key
        ? `Your saved data could not be read, so the app started empty. The original was kept untouched in this browser (storage key "${key}").`
        : "Your saved data could not be read, so the app started empty, and a copy could not be kept. Do not make changes if you want to recover it.",
    );
    return blankState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, exportBackup(state));
    if (saveFailed) {
      saveFailed = false;
      hideNotice();
    }
    return true;
  } catch {
    saveFailed = true;
    showNotice("Could not save to this browser. Use Export backup to keep your data.");
    return false;
  }
}

function cadenceLabel(everyMonths) {
  if (everyMonths === 1) return "every month";
  if (everyMonths === 12) return "every year";
  return `every ${everyMonths} months`;
}

const SECTIONS = {
  commitments: {
    noun: "commitment",
    amountFields: ["amount"],
    isValid: isValidCommitment,
    detail: (item) => `${money.format(item.amount)} ${cadenceLabel(item.everyMonths)}`,
    cost: (item) => `${money.format(monthlyCost(item))} / month`,
  },
  lifestyle: {
    noun: "lifestyle spending",
    amountFields: ["low", "high"],
    isValid: isValidLifestyle,
    detail: (item) => `${range(item.low, item.high)} ${cadenceLabel(item.everyMonths)}`,
    cost: (item) => {
      const cost = lifestyleMonthlyCost(item);
      return `${range(cost.low, cost.high)} / month`;
    },
    checkForm: (field) => {
      const lowAboveHigh =
        field("high").value !== "" && Number(field("low").value) > Number(field("high").value);
      field("high").setCustomValidity(lowAboveHigh ? "High must be at least the low estimate." : "");
    },
  },
};

function createSection(root, key, config) {
  const part = (role) => root.querySelector(`[data-role="${role}"]`);
  const list = part("list");
  const emptyMessage = part("empty");
  const form = part("form");
  const heading = part("form-heading");
  const submit = part("submit");
  const cancel = part("cancel");
  const customField = part("custom-field");
  const field = (name) => form.elements.namedItem(name);
  const addHeading = heading.textContent;
  const addLabel = submit.textContent;
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
    editingId = null;
    form.reset();
    clearValidity();
    heading.textContent = addHeading;
    submit.textContent = addLabel;
    cancel.hidden = true;
    syncCustomField();
  }

  function startEdit(id) {
    const item = find(id);
    if (!item) return;
    editingId = id;
    field("name").value = item.name;
    for (const amountField of config.amountFields) field(amountField).value = item[amountField];
    if (item.everyMonths === 1 || item.everyMonths === 12) {
      field("cadence").value = String(item.everyMonths);
    } else {
      field("cadence").value = "custom";
      field("customMonths").value = item.everyMonths;
    }
    syncCustomField();
    heading.textContent = `Edit ${config.noun}`;
    submit.textContent = "Save changes";
    cancel.hidden = false;
    field("name").focus();
  }

  function remove(id) {
    const item = find(id);
    if (!item || !confirm(`Delete "${item.name}"?`)) return;
    state = { ...state, [key]: state[key].filter((other) => other.id !== id) };
    if (editingId === id) reset();
    saveState();
    renderAll();
  }

  function buildRow(item) {
    const row = document.createElement("li");

    const text = document.createElement("div");
    const name = document.createElement("div");
    name.className = "item-name";
    name.textContent = item.name;
    const detail = document.createElement("div");
    detail.className = "item-detail";
    detail.textContent = config.detail(item);
    text.append(name, detail);

    const cost = document.createElement("div");
    cost.className = "item-cost";
    cost.textContent = config.cost(item);

    const actions = document.createElement("div");
    actions.className = "actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${item.name}`);
    edit.addEventListener("click", () => startEdit(item.id));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = "Delete";
    del.setAttribute("aria-label", `Delete ${item.name}`);
    del.addEventListener("click", () => remove(item.id));
    actions.append(edit, del);

    row.append(text, cost, actions);
    return row;
  }

  function render() {
    list.replaceChildren(...state[key].map(buildRow));
    emptyMessage.hidden = state[key].length > 0;
  }

  field("cadence").addEventListener("change", syncCustomField);
  cancel.addEventListener("click", reset);

  form.addEventListener("input", clearValidity);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    field("name").setCustomValidity(field("name").value.trim() ? "" : "Enter a name.");
    config.checkForm?.(field);
    if (!form.reportValidity()) return;

    const item = {
      id: editingId ?? crypto.randomUUID(),
      name: field("name").value.trim(),
      ...Object.fromEntries(config.amountFields.map((name) => [name, Number(field(name).value)])),
      everyMonths: readEveryMonths(),
    };
    if (!config.isValid(item)) return;

    state = {
      ...state,
      [key]: editingId
        ? state[key].map((other) => (other.id === editingId ? item : other))
        : [...state[key], item],
    };
    saveState();
    reset();
    renderAll();
    field("name").focus();
  });

  syncCustomField();
  return { render, reset };
}

const sections = Object.entries(SECTIONS).map(([key, config]) =>
  createSection(document.querySelector(`[data-kind="${key}"]`), key, config),
);

function renderSummary() {
  const { best, worst } = remaining(state);
  const lifestyleCost = totalLifestyleCost(state.lifestyle);
  els.totalCommitments.textContent = money.format(totalMonthlyCost(state.commitments));
  els.totalLifestyle.textContent = range(lifestyleCost.low, lifestyleCost.high);
  els.remaining.textContent = range(worst, best);
  els.remainingHint.hidden = worst === best;
  els.remaining.classList.toggle("negative", worst < 0);
}

function renderAll() {
  renderSummary();
  for (const section of sections) section.render();
}

function syncIncomeField() {
  els.income.value = state.income > 0 ? state.income : "";
}

function showBackupMessage(message) {
  els.backupMessage.textContent = message;
}

syncIncomeField();

els.income.addEventListener("input", () => {
  const value = Number(els.income.value);
  state = { ...state, income: Number.isFinite(value) && value > 0 ? Math.min(value, MAX_AMOUNT) : 0 };
  saveState();
  renderSummary();
});

els.income.addEventListener("change", syncIncomeField);

els.exportButton.addEventListener("click", () => {
  const blob = new Blob([exportBackup(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `expenses-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showBackupMessage("Backup downloaded. Keep it private: it contains your finances.");
});

els.importButton.addEventListener("click", () => els.importFile.click());

els.importFile.addEventListener("change", async () => {
  const [file] = els.importFile.files;
  els.importFile.value = "";
  if (!file) return;
  try {
    const imported = importBackup(await file.text());
    if (!confirm("Importing replaces everything currently saved in this browser. Continue?")) {
      showBackupMessage("Import cancelled. Nothing was changed.");
      return;
    }
    state = imported;
    const saved = saveState();
    syncIncomeField();
    for (const section of sections) section.reset();
    renderAll();
    showBackupMessage(
      saved
        ? "Backup imported."
        : "Backup imported for this session only. It could not be saved in this browser.",
    );
  } catch (error) {
    showBackupMessage(error.message);
  }
});

renderAll();
