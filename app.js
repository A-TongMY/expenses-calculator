import { lifestyleMonthlyCost, monthlyCost, projection, tightestMonth } from "./calc.js";
import { readBackup, exportBackup } from "./backup.js";
import { initializeState } from "./bootstrap.js";
import { setupSpending } from "./spending-ui.js";
import { assertLifestyleChangeAllowed } from "./spending.js";
import { setupHome } from "./home.js";
import { setupHouses } from "./houses.js";
import { setupRenovation } from "./renovation-ui.js";
import { renovationDate } from "./renovation-calendar.js";
import { createSaveQueue } from "./persistence.js";
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
import {
  AuthRequiredError,
  StorageError,
  createStorageClient,
} from "./storage.js";
import {
  cloneEntryForm, discardForm, el, focusAction, focusRowAction, formSnapshot,
  iconButton, keepViewport, rememberPanels, revealInvalid, setIconButton, syncMoreOptions, syncRows,
} from "./ui.js";

const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

const $ = (id) => document.getElementById(id);
const els = {
  startupPanel: $("startup-panel"),
  startupMessage: $("startup-message"),
  retryStartup: $("retry-startup"),
  authPanel: $("auth-panel"),
  authMessage: $("auth-message"),
  authExportButton: $("auth-export-button"),
  migrationPanel: $("migration-panel"),
  migrationAccept: $("migration-accept"),
  migrationDecline: $("migration-decline"),
  migrationMessage: $("migration-message"),
  signedInShell: $("signed-in-shell"),
  saveStatus: $("save-status"),
  logoutButton: $("logout-button"),
  saveRecovery: $("save-recovery"),
  saveRecoveryMessage: $("save-recovery-message"),
  retrySaveButton: $("retry-save-button"),
  notice: $("storage-notice"),
  income: $("income"),
  figures: $("overview-stats"),
  commitmentsLabel: $("commitments-label"),
  totalCommitments: $("total-commitments"),
  totalLifestyle: $("total-lifestyle"),
  lifestyleSource: $("lifestyle-source"),
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

const storage = createStorageClient();
let state = {
  income: 0, commitments: [], lifestyle: [], spending: [], houses: [],
  renovationItems: [], renovationPayments: [],
};
let saveQueue = null;
let startupNotice = null;
let hasUnsavedChanges = false;
let appReady = false;

function showSignIn(message) {
  appReady = false;
  els.signedInShell.hidden = true;
  els.startupPanel.hidden = true;
  els.migrationPanel.hidden = true;
  els.authPanel.hidden = false;
  els.authMessage.textContent = message;
  els.authExportButton.hidden = !hasUnsavedChanges;
}

function showStartupFailure() {
  appReady = false;
  els.signedInShell.hidden = true;
  els.authPanel.hidden = true;
  els.migrationPanel.hidden = true;
  els.startupPanel.hidden = false;
  els.startupMessage.textContent =
    "Could not connect to your remote account. Your data was not replaced. Check your connection and try again.";
  els.retryStartup.hidden = false;
}

function updateSaveStatus(status) {
  if (status === "saving") {
    els.saveStatus.textContent = "Saving…";
    els.saveRecovery.hidden = true;
    return;
  }
  if (status === "saved") {
    hasUnsavedChanges = false;
    els.saveStatus.textContent = "Saved";
    els.saveRecovery.hidden = true;
    if (startupNotice) showNotice(startupNotice);
    else els.notice.hidden = true;
    return;
  }
  hasUnsavedChanges = true;
  els.saveStatus.textContent = "Not saved";
  els.saveRecoveryMessage.textContent =
    "Your changes are still in this tab, but have not been saved to your account. Export a backup or retry.";
  els.saveRecovery.hidden = false;
}

async function saveRemoteState(nextState) {
  try {
    await storage.saveState(nextState);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      showSignIn("Your session expired. Sign in again to continue; unsaved changes remain available to export.");
    }
    throw error;
  }
}

function persist() {
  if (!saveQueue) return false;
  hasUnsavedChanges = true;
  saveQueue.enqueue(state);
  return true;
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
  const addForm = part("form");
  const count = part("count");
  let editingId = null;
  let editForm = null;
  let editBaseline = "";
  const find = (id) => state[key].find((item) => item.id === id);

  function closeEdit() {
    editForm?.remove();
    editForm = null;
    editingId = null;
  }

  function reset() {
    closeEdit();
    addForm.reset();
    for (const control of addForm.elements) control.setCustomValidity("");
    addForm.querySelector('[data-role="custom-field"]').hidden = true;
    addForm.elements.namedItem("customMonths").disabled = true;
  }

  function startEdit(id) {
    const item = find(id);
    if (!item || editingId === id || !discardForm(editForm, editBaseline)) return;
    closeEdit();
    editingId = id;
    editForm = cloneEntryForm(addForm);
    const field = (name) => editForm.elements.namedItem(name);
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
    setIconButton(editForm.querySelector('[data-role="submit"]'), "save", "Save");
    editForm.setAttribute("aria-label", `Edit ${item.name}`);
    syncMoreOptions(editForm);
    bindForm(editForm, id);
    editBaseline = formSnapshot(editForm);
    [...list.children].find((row) => row.dataset.id === id).append(editForm);
  }

  function remove(id) {
    const item = find(id);
    if (!item || !confirm(`Delete "${item.name}"?`)) return;
    const next = { ...state, [key]: state[key].filter((other) => other.id !== id) };
    if (key === "lifestyle") {
      try {
        assertLifestyleChangeAllowed(state, next.lifestyle);
      } catch (error) {
        showNotice(error.message);
        return;
      }
    }
    if (editingId === id && !discardForm(editForm, editBaseline)) return;
    keepViewport(() => {
      if (editingId === id) closeEdit();
      commit(next);
      focusAction(list.querySelector("button") ?? list);
    });
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
      keepViewport(() => {
        replaceItem(item.id, (other) => ({ ...other, scenario: { on: box.checked } }));
        const row = [...list.children].find((other) => other.dataset.id === item.id);
        focusAction(row?.querySelector("input[role=switch]"));
      });
    });
    toggle.append(box);

    const makeReal = iconButton({
      name: "real",
      label: `Make ${item.name} a real commitment`,
      className: "positive",
      onClick: () => {
        keepViewport(() => {
          if (editingId === item.id) editForm.elements.namedItem("scenario").checked = false;
          replaceItem(item.id, ({ scenario, ...real }) => real);
          focusRowAction(list, item.id, `Edit ${item.name}`);
        });
      },
    });
    return [toggle, makeReal];
  }

  function buildRow(item) {
    const row = el("li");
    row.dataset.id = item.id;
    row.dataset.snapshot = JSON.stringify(item);

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
    if (editingId && !find(editingId)) closeEdit();
    syncRows(list, state[key], buildRow, editingId);
    if (editingId) {
      const item = find(editingId);
      const row = [...list.children].find((node) => node.dataset.id === editingId);
      if (row.dataset.snapshot !== JSON.stringify(item)) {
        const updated = buildRow(item);
        row.className = updated.className;
        row.dataset.snapshot = updated.dataset.snapshot;
        for (const selector of [".name", ".cost", ".detail", ".actions"]) {
          row.querySelector(selector).replaceWith(updated.querySelector(selector));
        }
      }
    }
    emptyMessage.hidden = state[key].length > 0;
    count.textContent = state[key].length;
    count.hidden = state[key].length === 0;
  }

  function bindForm(form, id = null) {
    const field = (name) => form.elements.namedItem(name);
    revealInvalid(form);
    const syncCustomField = () => {
      const custom = field("cadence").value === "custom";
      form.querySelector('[data-role="custom-field"]').hidden = !custom;
      field("customMonths").disabled = !custom;
    };
    field("cadence").addEventListener("change", syncCustomField);
    form.addEventListener("input", () => {
      for (const control of form.elements) control.setCustomValidity("");
    });
    if (id) form.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      if (!discardForm(editForm, editBaseline)) return;
      keepViewport(() => {
        closeEdit();
        focusRowAction(list, id, `Edit ${find(id).name}`);
      });
    });
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
        id: id ?? newId(),
        name: field("name").value.trim(),
        ...Object.fromEntries(config.amountFields.map((name) => [name, Number(field(name).value)])),
        everyMonths: Number(field("cadence").value === "custom" ? field("customMonths").value : field("cadence").value),
        ...months,
      };
      if (config.scenarios && field("scenario").checked) {
        item.scenario = { on: find(id)?.scenario?.on ?? true };
      }
      if (!config.isValid(item)) {
        field("name").setCustomValidity("Some of these values are not valid. Check them and try again.");
        form.reportValidity();
        return;
      }

      const next = {
        ...state,
        [key]: id
          ? state[key].map((other) => (other.id === id ? item : other))
          : [...state[key], item],
      };
      if (next[key].length > MAX_ITEMS) {
        field("name").setCustomValidity(`That would go over the limit of ${MAX_ITEMS} items.`);
        form.reportValidity();
        return;
      }
      if (key === "lifestyle") {
        try {
          assertLifestyleChangeAllowed(state, next.lifestyle);
        } catch (error) {
          field("endMonth").setCustomValidity(error.message);
          form.reportValidity();
          return;
        }
      }
      keepViewport(() => {
        if (id) closeEdit();
        else { form.reset(); syncCustomField(); }
        commit(next);
        if (id) focusRowAction(list, item.id, `Edit ${item.name}`);
        else focusAction(form.querySelector('[type="submit"]'));
      });
    });

    syncCustomField();
  }
  list.tabIndex = -1;
  bindForm(addForm);
  return { render, reset };
}

const sections = Object.entries(SECTIONS).map(([key, config]) =>
  createSection(document.querySelector(`[data-kind="${key}"]`), key, config),
);

const spending = setupSpending({ getState: () => state, commit, newId });
const houses = setupHouses({ getState: () => state, commit, newId, notify: showNotice });
const renovation = setupRenovation({ getState: () => state, commit, newId });
const home = setupHome({ getState: () => state });

let shownMonth = null;
let shownRenovationDate = null;

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
  els.lifestyleSource.textContent = lifestyle.source[0].toUpperCase() + lifestyle.source.slice(1);
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
  shownRenovationDate = renovationDate();
  renderOverview();
  for (const section of sections) section.render();
  spending.render();
  houses.render();
  renovation.render();
  home.render();
}

function syncIncomeField() {
  els.income.value = state.income > 0 ? state.income : "";
}

function showBackupMessage(message) {
  els.backupMessage.textContent = message;
}

function requestMigrationConfirmation() {
  return new Promise((resolve) => {
    els.startupPanel.hidden = true;
    els.migrationMessage.textContent =
      "A valid expense backup was found in this browser. Migrate a copy to your private account? The original browser data will remain unchanged.";
    els.migrationPanel.hidden = false;
    const finish = (accepted) => {
      els.migrationPanel.hidden = true;
      els.migrationAccept.onclick = null;
      els.migrationDecline.onclick = null;
      resolve(accepted);
    };
    els.migrationAccept.onclick = () => finish(true);
    els.migrationDecline.onclick = () => finish(false);
    els.migrationAccept.focus();
  });
}

async function initializeApp() {
  els.retryStartup.disabled = true;
  els.retryStartup.hidden = true;
  els.startupPanel.hidden = false;
  els.authPanel.hidden = true;
  els.migrationPanel.hidden = true;
  els.signedInShell.hidden = true;
  els.startupMessage.textContent = "Checking your saved expense data…";
  try {
    const initialized = await initializeState({
      storage,
      confirmMigration: requestMigrationConfirmation,
    });
    state = initialized.state;
    renovation.reset();
    startupNotice = initialized.notice;
    els.saveStatus.textContent = initialized.empty ? "Ready" : "Saved";
    saveQueue = createSaveQueue({
      save: saveRemoteState,
      onStatus: updateSaveStatus,
      delay: 300,
    });
    if (startupNotice) showNotice(startupNotice);
    els.startupPanel.hidden = true;
    els.authPanel.hidden = true;
    els.migrationPanel.hidden = true;
    els.signedInShell.hidden = false;
    appReady = true;
    syncIncomeField();
    renderAll();
    showPage();
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      showSignIn("Sign in with the allowed GitHub account to access your private expense data.");
    } else if (error instanceof StorageError) {
      appReady = false;
      showStartupFailure();
    } else {
      appReady = false;
      console.error(error);
      showStartupFailure();
    }
  } finally {
    els.retryStartup.disabled = false;
  }
}

const PAGES = ["home", "expenses", "spending", "houses", "renovation"];

function showPage() {
  if (!appReady) return;
  const [requested, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const page = PAGES.includes(requested) ? requested : "home";
  for (const name of PAGES) {
    $(`page-${name}`).hidden = name !== page;
    const link = document.querySelector(`[data-nav="${name}"]`);
    if (name === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  // Income changes on the Expenses page, so the dashboard is redrawn whenever it is shown.
  if (page === "home") home.render();
  if (page === "spending") spending.render();
  if (page === "renovation") {
    renovation.render();
    const house = new URLSearchParams(query).get("house");
    if (house) renovation.selectHouse(house);
  }
}

window.addEventListener("hashchange", () => {
  if (!appReady) return;
  showPage();
  window.scrollTo(0, 0);
});

els.income.addEventListener("input", () => {
  const value = Number(els.income.value);
  // Silently capped at the largest amount a backup can hold.
  state = { ...state, income: Number.isFinite(value) && value > 0 ? Math.min(value, MAX_AMOUNT) : 0 };
  persist();
  renderAll();
});

els.income.addEventListener("change", syncIncomeField);

function refreshIfMonthChanged() {
  if (appReady && !document.hidden &&
    (currentMonth() !== shownMonth || renovationDate() !== shownRenovationDate)) renderAll();
}

document.addEventListener("visibilitychange", refreshIfMonthChanged);
window.addEventListener("focus", refreshIfMonthChanged);
// A tab left open and visible across midnight on the 1st never fires visibilitychange.
setInterval(refreshIfMonthChanged, 60_000);

function exportCurrentState() {
  const blob = new Blob([exportBackup(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `expenses-backup-${currentMonth()}-${String(new Date().getDate()).padStart(2, "0")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showBackupMessage("Downloaded. Keep the file private.");
  if (!els.authPanel.hidden) {
    els.authMessage.textContent = "Your backup was downloaded. Keep the file private.";
  }
}

async function retrySave() {
  els.retrySaveButton.disabled = true;
  try {
    saveQueue.enqueue(state);
    await saveQueue.flush();
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      showSignIn("Your session expired. Sign in again; unsaved changes remain available to export.");
    } else {
      els.saveRecoveryMessage.textContent =
        "The save still has not completed. Your edits remain in this tab and can be exported.";
      els.saveRecovery.hidden = false;
    }
  } finally {
    els.retrySaveButton.disabled = false;
  }
}

async function signOut() {
  try {
    await saveQueue.flush();
  } catch (error) {
    if (
      !(error instanceof AuthRequiredError) &&
      !confirm("Some edits are not saved. Sign out anyway? Export a backup first if you need those edits.")
    ) {
      return;
    }
  }
  els.logoutButton.disabled = true;
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    if (!response.ok) throw new StorageError("The sign-out request failed.", response.status);
    saveQueue.stop();
    showSignIn(
      hasUnsavedChanges
        ? "You have signed out. Unsaved edits remain in this tab and can be exported."
        : "You have signed out. Sign in with the allowed GitHub account to continue.",
    );
  } catch {
    showNotice("Could not sign out. Check your connection and try again.");
  } finally {
    els.logoutButton.disabled = false;
  }
}

els.retryStartup.addEventListener("click", () => void initializeApp());
els.retrySaveButton.addEventListener("click", () => void retrySave());
$("save-recovery-export").addEventListener("click", exportCurrentState);
els.authExportButton.addEventListener("click", exportCurrentState);
els.exportButton.addEventListener("click", exportCurrentState);
els.logoutButton.addEventListener("click", () => void signOut());

els.importButton.addEventListener("click", () => els.importFile.click());

els.importFile.addEventListener("change", async () => {
  const [file] = els.importFile.files;
  els.importFile.value = "";
  if (!file) return;
  if (file.size > MAX_BACKUP_BYTES) {
    showBackupMessage("File too large.");
    return;
  }
  let imported;
  try {
    imported = readBackup(await file.text());
  } catch (error) {
    showBackupMessage(error.message);
    return;
  }
  if (!confirm("Importing replaces the expense data in your account. Continue?")) {
    showBackupMessage("Cancelled.");
    return;
  }
  state = imported.state;
  startupNotice = imported.notice;
  persist();
  syncIncomeField();
  for (const section of sections) section.reset();
  houses.reset();
  spending.reset();
  renovation.reset();
  renderAll();
  try {
    await saveQueue.flush();
    showBackupMessage(["Imported and saved to your account.", imported.notice].filter(Boolean).join(" "));
  } catch {
    showBackupMessage("Imported in this tab, but not saved. Export a backup to keep your changes.");
  }
});

void initializeApp();
