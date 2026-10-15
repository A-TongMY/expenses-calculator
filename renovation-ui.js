import { money, monthLabel, dateLabel } from "./format.js";
import { MAX_AMOUNT, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from "./rules.js";
import { renovationDate, renovationMonth } from "./renovation-calendar.js";
import {
  saveRenovationItem, deleteRenovationItem, saveRenovationCategory,
  deleteRenovationCategory, renovationReport,
} from "./renovation.js";
import { renderRenovationSummary } from "./renovation-summary.js";
import { el, syncSelectOptions } from "./ui.js";

export function createRenovationEditor({ getState, commit, newId }) {
  let draft = null;
  let original = null;
  let paymentDirty = false;
  const begin = (value) => {
    draft = structuredClone(value);
    original = JSON.stringify(draft);
    paymentDirty = false;
  };
  const requireDraft = () => {
    if (!draft) throw new Error("Open a renovation item before editing.");
  };
  return {
    start(itemId) {
      const state = getState();
      const item = state.renovationItems.find(({ id }) => id === itemId);
      if (!item) throw new RangeError("The renovation item no longer exists.");
      begin({ item, payments: state.renovationPayments.filter((payment) => payment.itemId === itemId) });
    },
    startNew(houseId, categoryId) {
      begin({ item: { id: newId(), houseId, categoryId, name: "" }, payments: [] });
    },
    setItem(item) { requireDraft(); draft.item = structuredClone(item); },
    setPayments(payments) { requireDraft(); draft.payments = structuredClone(payments); },
    setPaymentDirty(value) { requireDraft(); paymentDirty = value; },
    categories() {
      requireDraft();
      return getState().renovationCategories
        .filter(({ houseId }) => houseId === draft.item.houseId)
        .map(({ id, name }) => ({ id, name }));
    },
    save(today = renovationDate()) {
      requireDraft();
      if (paymentDirty) throw new RangeError("Stage or cancel the payment edit before saving all changes.");
      const next = saveRenovationItem(getState(), draft.item, draft.payments, today);
      commit(next);
      draft = null;
      original = null;
      paymentDirty = false;
    },
    cancel() { draft = null; original = null; paymentDirty = false; },
    snapshot() { return draft ? structuredClone(draft) : null; },
    isDirty() { return draft !== null && (paymentDirty || JSON.stringify(draft) !== original); },
  };
}

const button = (label, action) => {
  const node = el("button", "secondary", label);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
};
const labeled = (label, control) => {
  const node = el("label", "field");
  node.append(el("span", "", label), control);
  return node;
};
const input = (name, type, value = "") => {
  const node = el("input");
  node.name = name;
  node.type = type;
  node.value = value;
  if (type === "number") {
    node.min = 0;
    node.max = MAX_AMOUNT;
    node.step = "0.01";
  }
  if (type === "text") node.maxLength = MAX_NAME_LENGTH;
  return node;
};
const option = (value, label) => {
  const node = el("option", "", label);
  node.value = value;
  return node;
};

function scheduleTable(rows) {
  const table = el("table", "data-table");
  const head = el("tr");
  for (const label of ["Month", "Amount", "Paid", "Outstanding", "Status"]) {
    const th = el("th", "", label);
    th.scope = "col";
    head.append(th);
  }
  const thead = el("thead");
  thead.append(head);
  const body = el("tbody");
  for (const row of rows) {
    const tr = el("tr");
    const timing = row.remaining === 0 ? "" :
      row.dueStatus === "past" ? " / Overdue" : row.dueStatus === "current" ? " / Due this month" : " / Upcoming";
    tr.append(
      el("td", "", monthLabel(row.month)), el("td", "", money.format(row.amount)),
      el("td", "", money.format(row.paid)), el("td", "", money.format(row.remaining)),
      el("td", "", `${row.paymentStatus}${timing}`),
    );
    body.append(tr);
  }
  table.append(thead, body);
  const wrap = el("div", "table-wrap");
  wrap.append(table);
  return wrap;
}

export function setupRenovation({ getState, commit, newId }) {
  const byId = (id) => document.getElementById(id);
  const houseSelect = byId("renovation-house");
  const overview = byId("renovation-overview");
  const categoriesHost = byId("renovation-categories");
  const categoryForm = byId("renovation-category-form");
  const categoryName = categoryForm.elements.namedItem("name");
  const editorHost = byId("renovation-editor");
  const list = byId("renovation-list");
  const message = byId("renovation-message");
  const editor = createRenovationEditor({ getState, commit, newId });
  let selectedHouse = "";
  let categoryEditingId = null;
  let paymentEditingId = null;
  let itemForm = null;
  let paymentForm = null;
  let paymentList = null;
  let paymentBaseline = null;
  const expanded = new Set();
  categoryName.maxLength = MAX_NAME_LENGTH;

  const inform = (error) => { message.textContent = error.message; };
  const attempt = (operation) => {
    try { operation(); message.textContent = ""; } catch (error) { inform(error); }
  };
  const discardAllowed = () => !editor.isDirty() || confirm("Discard unsaved renovation item and payment changes?");
  const clearEditor = () => {
    editor.cancel();
    itemForm = null;
    paymentForm = null;
    paymentList = null;
    paymentEditingId = null;
    paymentBaseline = null;
    message.textContent = "";
    editorHost.replaceChildren();
    editorHost.hidden = true;
  };

  function readDraftFields() {
    const snapshot = editor.snapshot();
    if (!snapshot || !itemForm) return;
    const field = (name) => itemForm.elements.namedItem(name);
    const item = {
      id: snapshot.item.id, houseId: snapshot.item.houseId,
      categoryId: field("categoryId").value, name: field("name").value.trim(),
    };
    for (const key of ["budget", "actualCost"]) {
      if (field(key).value !== "") item[key] = Number(field(key).value);
    }
    if (field("notes").value.trim()) item.notes = field("notes").value.trim();
    const startMonth = field("startMonth").value;
    const amount = field("installmentAmount").value;
    const count = field("count").value;
    if (startMonth !== "" || amount !== "" || count !== "") {
      item.installmentPlan = { startMonth, amount: Number(amount), count: Number(count) };
    }
    editor.setItem(item);
  }

  function renderDraftPayments() {
    const draft = editor.snapshot();
    if (!draft) return;
    paymentList.replaceChildren();
    for (const payment of draft.payments) {
      const row = el("li");
      row.append(
        el("span", "", `${dateLabel(payment.date)} / ${payment.kind} / ${money.format(payment.amount)}${payment.installmentMonth ? ` / ${monthLabel(payment.installmentMonth)}` : " / Unlinked"}`),
        button("Edit payment", () => {
          if (paymentFieldsChanged() && !confirm("Discard unstaged payment changes?")) return;
          paymentEditingId = payment.id;
          for (const key of ["date", "amount", "kind", "installmentMonth"]) {
            paymentForm.elements.namedItem(key).value = payment[key] ?? "";
          }
          rememberPaymentFields();
          paymentForm.elements.namedItem("amount").focus();
        }),
        button("Unlink", () => {
          const { installmentMonth, ...unlinked } = payment;
          editor.setPayments(draft.payments.map((entry) => entry.id === payment.id ? unlinked : entry));
          renderDraftPayments();
        }),
        button("Remove payment", () => {
          if (!confirm("Remove this payment from the draft? It is applied only when you save all changes.")) return;
          editor.setPayments(draft.payments.filter(({ id }) => id !== payment.id));
          if (paymentEditingId === payment.id) resetPayment();
          renderDraftPayments();
        }),
      );
      paymentList.append(row);
    }
  }

  function paymentFieldsChanged() {
    return JSON.stringify(paymentValues()) !== paymentBaseline;
  }

  function paymentValues() {
    return ["date", "amount", "kind", "installmentMonth"]
      .map((key) => paymentForm.elements.namedItem(key).value);
  }

  function rememberPaymentFields() {
    paymentBaseline = JSON.stringify(paymentValues());
    editor.setPaymentDirty(false);
  }

  function resetPayment() {
    paymentEditingId = null;
    paymentForm.reset();
    paymentForm.elements.namedItem("date").value = renovationDate();
    rememberPaymentFields();
  }

  function syncDraftCategories() {
    if (!itemForm) return;
    const control = itemForm.elements.namedItem("categoryId");
    const previous = control.value;
    const categories = editor.categories();
    const options = categories.map(({ id, name }) => ({ value: id, label: name }));
    if (!categories.some(({ id }) => id === previous)) {
      options.unshift({ value: "", label: "Choose a category" });
    }
    syncSelectOptions(control, options);
    if (!categories.some(({ id }) => id === previous)) control.value = "";
    readDraftFields();
  }

  function openEditor(itemId) {
    if (!discardAllowed()) return;
    if (itemId) editor.start(itemId);
    else {
      const category = getState().renovationCategories.find((entry) => entry.houseId === selectedHouse);
      if (!category) throw new RangeError("Add a renovation category for this house first.");
      editor.startNew(selectedHouse, category.id);
    }
    paymentEditingId = null;
    const { item } = editor.snapshot();
    editorHost.hidden = false;
    itemForm = el("form", "renovation-form");
    const category = el("select");
    category.name = "categoryId";
    category.required = true;
    for (const entry of editor.categories()) {
      category.append(option(entry.id, entry.name));
    }
    category.value = item.categoryId;
    const name = input("name", "text", item.name);
    name.required = true;
    const notes = el("textarea");
    notes.name = "notes";
    notes.value = item.notes ?? "";
    notes.maxLength = MAX_DESCRIPTION_LENGTH;
    const start = input("startMonth", "month", item.installmentPlan?.startMonth ?? "");
    start.min = "1900-01";
    start.max = "9999-12";
    const count = input("count", "number", item.installmentPlan?.count ?? "");
    count.min = 1;
    count.max = 600;
    count.step = 1;
    const amount = input("installmentAmount", "number", item.installmentPlan?.amount ?? "");
    amount.min = "0.01";
    const save = el("button", "", "Save all changes");
    save.type = "submit";
    itemForm.append(
      labeled("Item name", name), labeled("Category", category),
      labeled("Budget (optional)", input("budget", "number", item.budget ?? "")),
      labeled("Actual total cost (optional)", input("actualCost", "number", item.actualCost ?? "")),
      labeled("Notes (optional)", notes),
      el("h3", "", "Monthly installment plan (optional)"),
      labeled("Start month", start), labeled("Installment amount", amount), labeled("Payment count", count),
      button("Remove plan", () => {
        for (const key of ["startMonth", "installmentAmount", "count"]) itemForm.elements.namedItem(key).value = "";
        readDraftFields();
      }),
      save,
      button("Cancel item changes", () => {
        if (!discardAllowed()) return;
        clearEditor();
        render();
      }),
    );
    itemForm.addEventListener("input", readDraftFields);
    itemForm.addEventListener("change", readDraftFields);
    itemForm.addEventListener("submit", (event) => {
      event.preventDefault();
      attempt(() => {
        readDraftFields();
        editor.save();
        clearEditor();
        render();
      });
    });
    paymentForm = el("form", "renovation-form");
    const date = input("date", "date", renovationDate());
    date.min = "1900-01-01";
    date.max = renovationDate();
    date.required = true;
    const paymentAmount = input("amount", "number");
    paymentAmount.min = "0.01";
    paymentAmount.required = true;
    const kind = el("select");
    kind.name = "kind";
    kind.append(option("payment", "Payment"), option("deposit", "Deposit"));
    const installment = input("installmentMonth", "month");
    installment.min = "1900-01";
    installment.max = "9999-12";
    const stage = el("button", "", "Stage payment");
    stage.type = "submit";
    paymentForm.append(
      labeled("Payment date", date), labeled("Payment amount", paymentAmount),
      labeled("Payment label", kind), labeled("Linked installment month (optional)", installment),
      stage, button("Cancel payment edit", resetPayment),
    );
    rememberPaymentFields();
    for (const event of ["input", "change"]) {
      paymentForm.addEventListener(event, () => editor.setPaymentDirty(paymentFieldsChanged()));
    }
    paymentForm.addEventListener("submit", (event) => {
      event.preventDefault();
      attempt(() => {
        readDraftFields();
        const draft = editor.snapshot();
        if (draft.item.actualCost === undefined) throw new RangeError("Enter actual total cost before staging a payment.");
        const payment = {
          id: paymentEditingId ?? newId(), itemId: draft.item.id,
          date: date.value, amount: Number(paymentAmount.value), kind: kind.value,
          ...(installment.value ? { installmentMonth: installment.value } : {}),
        };
        editor.setPayments(paymentEditingId
          ? draft.payments.map((entry) => entry.id === paymentEditingId ? payment : entry)
          : [...draft.payments, payment]);
        resetPayment();
        renderDraftPayments();
      });
    });
    paymentList = el("ul", "renovation-payments");
    editorHost.replaceChildren(
      el("h2", "", itemId ? "Edit renovation item" : "New renovation item"),
      el("p", "note", "Item, plan, and payment changes are staged. Use Save all changes to apply them together. Deposits reduce the balance; passing an installment date never records payment."),
      itemForm, el("h3", "", "Actual payments"), paymentList, paymentForm,
    );
    renderDraftPayments();
    name.focus();
  }

  categoryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    attempt(() => {
      commit(saveRenovationCategory(getState(), {
        id: categoryEditingId ?? newId(), houseId: selectedHouse, name: categoryName.value.trim(),
      }));
      categoryEditingId = null;
      categoryForm.reset();
      render();
    });
  });
  byId("renovation-category-cancel").addEventListener("click", () => {
    categoryEditingId = null;
    categoryForm.reset();
  });
  byId("renovation-add-item").addEventListener("click", () => attempt(() => openEditor()));

  function selectHouse(id) {
    if (id === selectedHouse) return true;
    if (!getState().houses.some((house) => house.id === id)) return false;
    if (!discardAllowed()) { houseSelect.value = selectedHouse; return false; }
    clearEditor();
    selectedHouse = id;
    categoryEditingId = null;
    categoryForm.reset();
    render();
    return true;
  }
  houseSelect.addEventListener("change", () => selectHouse(houseSelect.value));

  function render() {
    const state = getState();
    if (!state.houses.some(({ id }) => id === selectedHouse)) {
      clearEditor();
      selectedHouse = state.houses[0]?.id ?? "";
    }
    syncSelectOptions(houseSelect, state.houses.map(({ id, name }) => ({ value: id, label: name })));
    if (houseSelect.value !== selectedHouse) houseSelect.value = selectedHouse;
    houseSelect.disabled = !selectedHouse;
    byId("renovation-no-houses").hidden = Boolean(selectedHouse);
    byId("renovation-workspace").hidden = !selectedHouse;
    if (!selectedHouse) return;
    if (paymentForm) paymentForm.elements.namedItem("date").max = renovationDate();
    syncDraftCategories();
    const report = renovationReport(state, selectedHouse);
    renderRenovationSummary(overview, report);
    const openCategories = new Set(
      [...categoriesHost.children].filter((card) => card.open).map((card) => card.dataset.id),
    );
    categoriesHost.replaceChildren();
    for (const category of report.categories) {
      const card = el("details", "panel");
      card.dataset.id = category.categoryId;
      card.open = openCategories.has(category.categoryId);
      const summary = el("summary", "", category.name);
      const content = el("div", "panel-body cards");
      renderRenovationSummary(content, category);
      content.append(
        button("Rename category", () => {
          categoryEditingId = category.categoryId;
          categoryName.value = category.name;
          categoryName.focus();
        }),
        button("Delete category", () => attempt(() => {
          if (!confirm(`Delete category "${category.name}"?`)) return;
          commit(deleteRenovationCategory(getState(), category.categoryId));
          render();
        })),
      );
      card.append(summary, content);
      categoriesHost.append(card);
    }
    byId("renovation-add-item").disabled = report.categories.length === 0;
    list.replaceChildren();
    for (const entry of report.items) {
      const { item } = entry;
      const card = el("details", "panel");
      card.open = expanded.has(item.id);
      card.addEventListener("toggle", () => {
        if (card.open) expanded.add(item.id); else expanded.delete(item.id);
      });
      const summary = el("summary", "", `${item.name} / Expected ${money.format(entry.expected)}`);
      const content = el("div", "panel-body");
      const category = state.renovationCategories.find(({ id }) => id === item.categoryId);
      content.append(
        el("p", "", `${category.name} / Budget: ${entry.budget === null ? "Not budgeted" : money.format(entry.budget)} / Actual: ${entry.actualCost === null ? "Not known" : money.format(entry.actualCost)}`),
        el("p", "", `Paid: ${money.format(entry.paid)} / Outstanding: ${entry.outstanding === null ? "Not applicable" : money.format(entry.outstanding)} / Unscheduled: ${entry.unscheduled === null ? "Not applicable" : money.format(entry.unscheduled)}`),
      );
      if (item.notes) content.append(el("p", "", item.notes));
      if (entry.installments.length) content.append(scheduleTable(entry.installments));
      for (const payment of state.renovationPayments.filter((payment) => payment.itemId === item.id)) {
        content.append(el("p", "note", `${dateLabel(payment.date)} / ${payment.kind} / ${money.format(payment.amount)}${payment.installmentMonth ? ` / ${monthLabel(payment.installmentMonth)}` : " / Unlinked"}`));
      }
      content.append(
        button("Edit item and payments", () => attempt(() => openEditor(item.id))),
        button("Delete item", () => attempt(() => {
          if (!confirm(`Delete "${item.name}" and all its payments and installment plan?`)) return;
          if (editor.snapshot()?.item.id === item.id && !discardAllowed()) return;
          commit(deleteRenovationItem(getState(), item.id));
          if (editor.snapshot()?.item.id === item.id) clearEditor();
          render();
        })),
      );
      card.append(summary, content);
      list.append(card);
    }
    byId("renovation-empty").hidden = report.items.length > 0;
  }

  function reset() {
    clearEditor();
    categoriesHost.replaceChildren();
    categoryEditingId = null;
    categoryForm.reset();
    message.textContent = "";
    selectedHouse = "";
    expanded.clear();
  }
  return { render, reset, selectHouse };
}
