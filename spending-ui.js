import { currentDate, currentMonth, dateLabel, money } from "./format.js";
import { isActiveIn, roundToSen } from "./calc.js";
import { MAX_AMOUNT, MAX_DESCRIPTION_LENGTH, isDate, isMonth } from "./rules.js";
import { saveSpendingEntry, deleteSpendingEntry, spendingReport } from "./spending.js";
import { renderSpendingSummary } from "./spending-summary.js";
import { el, icon, iconButton } from "./ui.js";

export function setupSpending({ getState, commit, newId }) {
  const byId = (id) => document.getElementById(id);
  const form = byId("spending-form");
  const field = (name) => form.elements.namedItem(name);
  const month = byId("spending-month");
  const categoryFilter = byId("spending-category-filter");
  const list = byId("spending-list");
  const message = byId("spending-message");
  const cancel = byId("spending-cancel");
  const submit = byId("spending-submit");
  let editingId = null;
  let lastMonth = currentMonth();
  let lastDate = currentDate();
  month.value = lastMonth;
  field("date").value = lastDate;
  field("amount").max = MAX_AMOUNT;
  field("description").maxLength = MAX_DESCRIPTION_LENGTH;

  function clearValidity() {
    for (const control of form.elements) control.setCustomValidity("");
  }

  function reset() {
    const category = field("categoryId").value;
    editingId = null;
    form.reset();
    clearValidity();
    field("date").value = currentDate();
    field("categoryId").value = category;
    cancel.hidden = true;
    submit.replaceChildren(icon("plus"), "Add");
  }

  function syncCategories(select, categories, all = false) {
    const previous = select.value;
    const options = categories.map(({ id, name }) => {
      const option = el("option", "", name);
      option.value = id;
      return option;
    });
    if (all) {
      const option = el("option", "", "All categories");
      option.value = "";
      options.unshift(option);
    }
    select.replaceChildren(...options);
    if (categories.some(({ id }) => id === previous) || (all && previous === "")) {
      select.value = previous;
    }
  }

  function startEdit(entry) {
    editingId = entry.id;
    clearValidity();
    for (const name of ["date", "categoryId", "amount", "description"]) field(name).value = entry[name];
    cancel.hidden = false;
    submit.replaceChildren(icon("check"), "Update");
    message.textContent = "";
    field("date").focus();
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
    if (editingId === entry.id) reset();
    commit(next);
    message.textContent = "Entry removed from your changes.";
    field("date").focus();
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
    if (month.value === lastMonth && nowMonth !== lastMonth) month.value = nowMonth;
    if (!editingId && field("date").value === lastDate && today !== lastDate) field("date").value = today;
    lastMonth = nowMonth;
    lastDate = today;
    if (editingId && !state.spending.some(({ id }) => id === editingId)) reset();
    syncCategories(field("categoryId"), state.lifestyle);
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
    list.replaceChildren(...report.entries.map(buildRow));
    byId("spending-empty").hidden = report.count > 0;
    byId("spending-total").textContent = `Total ${money.format(report.total)}`;
  }

  for (const filter of [month, categoryFilter]) {
    filter.addEventListener("change", () => {
      message.textContent = "";
      render();
    });
  }
  form.addEventListener("input", clearValidity);
  cancel.addEventListener("click", () => {
    reset();
    message.textContent = "";
    field("date").focus();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearValidity();
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
    if (!form.reportValidity()) return;
    const entry = {
      id: editingId ?? newId(),
      date,
      categoryId: category.id,
      amount: roundToSen(Number(field("amount").value)),
      description,
    };
    let next;
    try {
      next = saveSpendingEntry(state, entry);
    } catch (error) {
      message.textContent = error.message;
      return;
    }
    const outside = entry.date.slice(0, 7) !== month.value ||
      (categoryFilter.value && categoryFilter.value !== entry.categoryId);
    reset();
    commit(next);
    message.textContent = outside
      ? "Entry added to your changes outside these filters."
      : "Entry added to your changes.";
    field("date").focus();
  });
  return { render, reset };
}
