import { monthlyCost, remaining, totalMonthlyCost } from "./calc.js";
import { exportBackup, importBackup } from "./backup.js";
import {
  MAX_AMOUNT,
  MAX_EVERY_MONTHS,
  MAX_NAME_LENGTH,
  isValidCommitment,
} from "./rules.js";

const STORAGE_KEY = "expenses-calculator";

const money = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });

const $ = (id) => document.getElementById(id);
const els = {
  notice: $("storage-notice"),
  income: $("income"),
  totalCommitments: $("total-commitments"),
  remaining: $("remaining"),
  list: $("commitment-list"),
  emptyState: $("empty-state"),
  form: $("commitment-form"),
  formHeading: $("form-heading"),
  name: $("name"),
  amount: $("amount"),
  cadence: $("cadence"),
  customField: $("custom-field"),
  customMonths: $("custom-months"),
  submitButton: $("submit-button"),
  cancelEdit: $("cancel-edit"),
  exportButton: $("export-button"),
  importButton: $("import-button"),
  importFile: $("import-file"),
  backupMessage: $("backup-message"),
};

els.income.max = MAX_AMOUNT;
els.amount.max = MAX_AMOUNT;
els.customMonths.max = MAX_EVERY_MONTHS;
els.name.maxLength = MAX_NAME_LENGTH;

let state = loadState();
let editingId = null;
let saveFailed = false;

function blankState() {
  return { income: 0, commitments: [] };
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

function findCommitment(id) {
  return state.commitments.find((c) => c.id === id);
}

function cadenceLabel(everyMonths) {
  if (everyMonths === 1) return "every month";
  if (everyMonths === 12) return "every year";
  return `every ${everyMonths} months`;
}

function readEveryMonths() {
  if (els.cadence.value === "custom") return Number(els.customMonths.value);
  return Number(els.cadence.value);
}

function renderSummary() {
  const remainingAmount = remaining(state);
  els.totalCommitments.textContent = money.format(totalMonthlyCost(state.commitments));
  els.remaining.textContent = money.format(remainingAmount);
  els.remaining.classList.toggle("negative", remainingAmount < 0);
}

function renderList() {
  els.list.replaceChildren();
  els.emptyState.hidden = state.commitments.length > 0;

  for (const commitment of state.commitments) {
    const item = document.createElement("li");

    const text = document.createElement("div");
    const name = document.createElement("div");
    name.className = "item-name";
    name.textContent = commitment.name;
    const detail = document.createElement("div");
    detail.className = "item-detail";
    detail.textContent = `${money.format(commitment.amount)} ${cadenceLabel(commitment.everyMonths)}`;
    text.append(name, detail);

    const cost = document.createElement("div");
    cost.className = "item-cost";
    cost.textContent = `${money.format(monthlyCost(commitment))} / month`;

    const actions = document.createElement("div");
    actions.className = "actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${commitment.name}`);
    edit.addEventListener("click", () => startEdit(commitment.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${commitment.name}`);
    remove.addEventListener("click", () => deleteCommitment(commitment.id));
    actions.append(edit, remove);

    item.append(text, cost, actions);
    els.list.append(item);
  }
}

function render() {
  renderSummary();
  renderList();
}

function syncIncomeField() {
  els.income.value = state.income > 0 ? state.income : "";
}

function syncCustomField() {
  const custom = els.cadence.value === "custom";
  els.customField.hidden = !custom;
  els.customMonths.disabled = !custom;
}

function resetForm() {
  editingId = null;
  els.form.reset();
  els.formHeading.textContent = "Add a commitment";
  els.submitButton.textContent = "Add commitment";
  els.cancelEdit.hidden = true;
  syncCustomField();
}

function startEdit(id) {
  const commitment = findCommitment(id);
  if (!commitment) return;
  editingId = id;
  els.name.value = commitment.name;
  els.amount.value = commitment.amount;
  if (commitment.everyMonths === 1 || commitment.everyMonths === 12) {
    els.cadence.value = String(commitment.everyMonths);
  } else {
    els.cadence.value = "custom";
    els.customMonths.value = commitment.everyMonths;
  }
  syncCustomField();
  els.formHeading.textContent = "Edit commitment";
  els.submitButton.textContent = "Save changes";
  els.cancelEdit.hidden = false;
  els.name.focus();
}

function deleteCommitment(id) {
  const commitment = findCommitment(id);
  if (!commitment || !confirm(`Delete "${commitment.name}"?`)) return;
  state = { ...state, commitments: state.commitments.filter((c) => c.id !== id) };
  if (editingId === id) resetForm();
  saveState();
  render();
}

function showBackupMessage(message) {
  els.backupMessage.textContent = message;
}

syncIncomeField();
syncCustomField();

els.income.addEventListener("input", () => {
  const value = Number(els.income.value);
  state = { ...state, income: Number.isFinite(value) && value > 0 ? Math.min(value, MAX_AMOUNT) : 0 };
  saveState();
  renderSummary();
});

els.income.addEventListener("change", syncIncomeField);

els.cadence.addEventListener("change", syncCustomField);

els.name.addEventListener("input", () => els.name.setCustomValidity(""));

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  els.name.setCustomValidity(els.name.value.trim() ? "" : "Enter a name.");
  if (!els.form.reportValidity()) return;

  const commitment = {
    id: editingId ?? crypto.randomUUID(),
    name: els.name.value.trim(),
    amount: Number(els.amount.value),
    everyMonths: readEveryMonths(),
  };
  if (!isValidCommitment(commitment)) return;

  state = {
    ...state,
    commitments: editingId
      ? state.commitments.map((c) => (c.id === editingId ? commitment : c))
      : [...state.commitments, commitment],
  };
  saveState();
  resetForm();
  render();
  els.name.focus();
});

els.cancelEdit.addEventListener("click", resetForm);

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
    resetForm();
    render();
    showBackupMessage(
      saved
        ? "Backup imported."
        : "Backup imported for this session only. It could not be saved in this browser.",
    );
  } catch (error) {
    showBackupMessage(error.message);
  }
});

render();
