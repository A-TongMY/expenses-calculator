import { currentDate, currentMonth, dateLabel, money } from "./format.js";
import { isActiveIn, roundToSen } from "./calc.js";
import { MAX_AMOUNT, MAX_DESCRIPTION_LENGTH, isDate, isMonth } from "./rules.js";
import { saveSpendingEntry, deleteSpendingEntry, spendingReport } from "./spending.js";
import { renderSpendingSummary } from "./spending-summary.js";
import {
  cloneEntryForm, discardForm, el, focusAction, focusRowAction, formSnapshot,
  iconButton, keepViewport, syncRows, syncSelectOptions,
} from "./ui.js";

export function setupSpending({ getState, commit, newId }) {
  const byId = (id) => document.getElementById(id);
  const form = byId("spending-form");
  const field = (name) => form.elements.namedItem(name);
  const month = byId("spending-month");
  const categoryFilter = byId("spending-category-filter");
  const list = byId("spending-list");
  const message = byId("spending-message");
  const submit = byId("spending-submit");
  let editingId = null;
  let editForm = null;
  let editBaseline = "";
  let feedback = null;
  let previousFilters = null;
  let lastMonth = currentMonth();
  let lastDate = currentDate();
  month.value = lastMonth;
  field("date").value = lastDate;
  field("amount").max = MAX_AMOUNT;
  field("description").maxLength = MAX_DESCRIPTION_LENGTH;

  function clearValidity(target = form) {
    for (const control of target.elements) control.setCustomValidity("");
  }

  function closeEdit() {
    editForm?.remove();
    editForm = null;
    editingId = null;
  }

  function reset() {
    const category = field("categoryId").value;
    closeEdit();
    form.reset();
    clearValidity();
    field("date").value = currentDate();
    field("categoryId").value = category;
    feedback = null;
  }

  function syncCategories(select, categories, all = false) {
    const options = categories.map(({ id, name }) => ({ value: id, label: name }));
    if (all) options.unshift({ value: "", label: "All categories" });
    syncSelectOptions(select, options);
  }

  function startEdit(entry) {
    if (editingId === entry.id) return;
    if (!discardForm(editForm, editBaseline)) return;
    closeEdit();
    editingId = entry.id;
    editForm = cloneEntryForm(form);
    editForm.setAttribute("aria-label", `Edit ${entry.description}`);
    for (const name of ["date", "categoryId", "amount", "description"]) {
      editForm.elements.namedItem(name).value = entry[name];
    }
    editForm.querySelector('button[type="submit"]').textContent = "Save";
    const id = entry.id;
    editForm.addEventListener("input", () => clearValidity(editForm));
    editForm.addEventListener("submit", (event) => {
      event.preventDefault();
      save(editForm, id);
    });
    editForm.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      if (!discardForm(editForm, editBaseline)) return;
      keepViewport(() => {
        closeEdit();
        focusRowAction(list, id, `Edit ${entry.description}`);
      });
    });
    editBaseline = formSnapshot(editForm);
    const row = [...list.children].find((node) => node.dataset.id === id);
    row.append(editForm);
  }

  function remove(entry) {
    if (!confirm(`Delete "${entry.description}"?`)) return;
    let next;
    try {
      next = deleteSpendingEntry(getState(), entry.id);
    } catch (error) {
      message.textContent = error.message;
      return;
    }
    if (editingId === entry.id && !discardForm(editForm, editBaseline)) return;
    keepViewport(() => {
      if (editingId === entry.id) closeEdit();
      feedback = { id: null, text: "Entry removed from your changes." };
      commit(next);
      focusAction(list.querySelector("button") ?? list);
    });
  }

  function buildRow(entry) {
    const category = getState().lifestyle.find(({ id }) => id === entry.categoryId);
    const row = el("li");
    row.dataset.id = entry.id;
    const actions = el("div", "actions");
    actions.append(
      iconButton({ name: "edit", label: `Edit ${entry.description}`, onClick: () => startEdit(entry) }),
      iconButton({ name: "trash", label: `Delete ${entry.description}`, className: "danger", onClick: () => remove(entry) }),
    );
    row.append(
      el("div", "name", entry.description),
      el("div", "cost", money.format(entry.amount)),
      el("div", "detail", `${dateLabel(entry.date)} · ${category.name}`),
      actions,
    );
    return row;
  }

  function render() {
    const state = getState();
    const today = currentDate();
    const nowMonth = currentMonth();
    if (!editingId && month.value === lastMonth && nowMonth !== lastMonth) month.value = nowMonth;
    if (!editingId && field("date").value === lastDate && today !== lastDate) field("date").value = today;
    lastMonth = nowMonth;
    lastDate = today;
    if (editingId && !state.spending.some(({ id }) => id === editingId)) closeEdit();
    syncCategories(field("categoryId"), state.lifestyle);
    if (editForm) syncCategories(editForm.elements.namedItem("categoryId"), state.lifestyle);
    syncCategories(categoryFilter, state.lifestyle, true);
    field("date").setCustomValidity("");
    field("categoryId").setCustomValidity("");
    byId("spending-no-categories").hidden = state.lifestyle.length > 0;
    form.hidden = state.lifestyle.length === 0;
    if (!isMonth(month.value)) {
      month.setCustomValidity("Choose a valid month.");
      byId("spending-summary").replaceChildren();
      list.replaceChildren();
      byId("spending-empty").hidden = true;
      byId("spending-total").textContent = "";
      message.textContent = "Choose a valid month.";
      return;
    }
    month.setCustomValidity("");
    const report = spendingReport(state, month.value, categoryFilter.value || null);
    renderSpendingSummary(byId("spending-summary"), report);
    syncRows(list, report.entries, buildRow, editingId);
    if (editingId) {
      const entry = state.spending.find(({ id }) => id === editingId);
      const category = state.lifestyle.find(({ id }) => id === entry.categoryId);
      const row = [...list.children].find((node) => node.dataset.id === editingId);
      if (row) row.querySelector(".detail").textContent = `${dateLabel(entry.date)} · ${category.name}`;
    }
    if (feedback) {
      const row = [...list.children].find((node) => node.dataset.id === feedback.id);
      const status = el(row ? "p" : "li", "hint", feedback.text);
      status.setAttribute("role", "status");
      if (row) {
        row.querySelector('[role="status"]')?.remove();
        row.append(status);
      } else list.append(status);
    }
    previousFilters = [month.value, categoryFilter.value];
    byId("spending-empty").hidden = report.count > 0;
    byId("spending-total").textContent = `Total ${money.format(report.total)}`;
  }

  for (const filter of [month, categoryFilter]) {
    filter.addEventListener("change", () => {
      if (!discardForm(editForm, editBaseline)) {
        [month.value, categoryFilter.value] = previousFilters;
        return;
      }
      closeEdit();
      feedback = null;
      message.textContent = "";
      render();
    });
  }
  form.addEventListener("input", () => clearValidity());
  function save(target, id = null) {
    const field = (name) => target.elements.namedItem(name);
    clearValidity(target);
    const localMessage = id ? editForm.querySelector('[role="status"]') : message;
    const state = getState();
    const category = state.lifestyle.find(({ id }) => id === field("categoryId").value);
    const date = field("date").value;
    if (!isDate(date)) field("date").setCustomValidity("Choose a valid date.");
    else if (category && !isActiveIn(category, date.slice(0, 7))) {
      field("date").setCustomValidity("This category is not active in that month.");
    }
    if (!category) field("categoryId").setCustomValidity("Choose a Lifestyle category.");
    const description = field("description").value.trim();
    if (!description) field("description").setCustomValidity("Enter a description.");
    if (!target.reportValidity()) return;
    const entry = {
      id: id ?? newId(),
      date,
      categoryId: category.id,
      amount: roundToSen(Number(field("amount").value)),
      description,
    };
    let next;
    try {
      next = saveSpendingEntry(state, entry);
    } catch (error) {
      if (localMessage) localMessage.textContent = error.message;
      else {
        const status = el("p", "notice", error.message);
        status.setAttribute("role", "status");
        target.append(status);
      }
      return;
    }
    const outside = entry.date.slice(0, 7) !== month.value ||
      (categoryFilter.value && categoryFilter.value !== entry.categoryId);
    const text = `${id ? "Entry updated in your changes" : "Entry added to your changes"}${outside ? " outside these filters." : "."}`;
    keepViewport(() => {
      if (id) {
        closeEdit();
        feedback = { id, text };
      } else {
        const category = field("categoryId").value;
        target.reset();
        field("date").value = currentDate();
        field("categoryId").value = category;
        message.textContent = text;
      }
      commit(next);
      if (id) {
        focusRowAction(list, id, `Edit ${entry.description}`);
        if (!list.contains(document.activeElement)) focusAction(list);
      } else focusAction(submit);
    });
  }
  list.tabIndex = -1;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    save(form);
  });
  return { render, reset };
}
