import { money, monthLabel, dateLabel } from "./format.js";
import { MAX_AMOUNT, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from "./rules.js";
import { renovationDate, renovationMonth } from "./renovation-calendar.js";
import {
  saveRenovationItem, deleteRenovationItem, saveRenovationCategory,
  deleteRenovationCategory, renovationReport,
} from "./renovation.js";
import { renderRenovationSummary } from "./renovation-summary.js";
import {
  cloneEntryForm, discardForm, el, focusAction, formSnapshot, keepViewport,
  syncRows, syncSelectOptions,
} from "./ui.js";

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
  let editor = createRenovationEditor({ getState, commit, newId });
  let addSession = null;
  let editingItemId = null;
  let selectedHouse = "";
  let categoryEditingId = null;
  let paymentEditingId = null;
  let itemForm = null;
  let paymentForm = null;
  let paymentList = null;
  let paymentBaseline = null;
  let paymentHome = null;
  let paymentAddDraft = null;
  let categoryEditForm = null;
  let categoryBaseline = "";
  const expanded = new Set();
  categoryName.maxLength = MAX_NAME_LENGTH;

  const inform = (error, host = null) => {
    if (!host) { message.textContent = error.message; return; }
    let status = host.querySelector('[role="status"]');
    if (!status) {
      status = el("p", "notice");
      status.setAttribute("role", "status");
      host.append(status);
    }
    status.textContent = error.message;
  };
  const attempt = (operation, host = null) => {
    try {
      operation();
      message.textContent = "";
      host?.querySelector('[role="status"]')?.remove();
    } catch (error) { inform(error, host); }
  };
  const discardAllowed = () => !editor.isDirty() || confirm("Discard unsaved renovation item and payment changes?");
  const clearEditor = () => {
    editor.cancel();
    itemForm = null;
    paymentForm = null;
    paymentList = null;
    paymentEditingId = null;
    paymentBaseline = null;
    paymentAddDraft = null;
    editingItemId = null;
    message.textContent = "";
    editorHost.replaceChildren();
    editorHost.hidden = true;
    byId("renovation-add-item").parentElement.after(editorHost);
    if (addSession) {
      ({
        editor, itemForm, paymentForm, paymentList, paymentHome, paymentBaseline,
        paymentAddDraft, paymentEditingId,
      } = addSession);
      editorHost.replaceChildren(...addSession.nodes);
      editorHost.hidden = false;
      addSession = null;
    }
  };

  function finishItem() {
    const id = editingItemId;
    keepViewport(() => {
      clearEditor();
      render();
      const card = [...list.children].find((node) => node.dataset.id === id);
      focusAction(card?.querySelector('[data-action="edit-item"]') ?? byId("renovation-add-item"));
    });
  }

  function closeCategory() {
    categoryEditForm?.remove();
    categoryEditForm = null;
    categoryEditingId = null;
  }

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
          if (paymentEditingId === payment.id) return;
          if (paymentEditingId && paymentFieldsChanged() && !confirm("Discard unstaged payment changes?")) return;
          if (!paymentEditingId) paymentAddDraft = { values: paymentValues(), baseline: paymentBaseline };
          paymentEditingId = payment.id;
          for (const key of ["date", "amount", "kind", "installmentMonth"]) {
            paymentForm.elements.namedItem(key).value = payment[key] ?? "";
          }
          rememberPaymentFields();
          paymentForm.classList.add("inline-editor");
          row.append(paymentForm);
        }),
        button("Unlink", () => {
          const { installmentMonth, ...unlinked } = payment;
          keepViewport(() => {
            editor.setPayments(editor.snapshot().payments.map((entry) => entry.id === payment.id ? unlinked : entry));
            renderDraftPayments();
          });
        }),
        button("Remove payment", () => {
          if (!confirm("Remove this payment from the draft? It is applied only when you save all changes.")) return;
          if (paymentEditingId === payment.id && paymentFieldsChanged() && !confirm("Discard unstaged payment changes?")) return;
          keepViewport(() => {
            editor.setPayments(editor.snapshot().payments.filter(({ id }) => id !== payment.id));
            if (paymentEditingId === payment.id) resetPayment();
            renderDraftPayments();
            focusAction(paymentList.querySelector("button") ?? paymentHome.querySelector("button"));
          });
        }),
      );
      row.dataset.id = payment.id;
      paymentList.append(row);
      if (paymentEditingId === payment.id) row.append(paymentForm);
    }
  }

  function paymentFieldsChanged() {
    return JSON.stringify(paymentValues()) !== paymentBaseline;
  }

  function unfinishedPayment() {
    return paymentFieldsChanged() || Boolean(paymentAddDraft &&
      JSON.stringify(paymentAddDraft.values) !== paymentAddDraft.baseline);
  }

  function paymentValues() {
    return ["date", "amount", "kind", "installmentMonth"]
      .map((key) => paymentForm.elements.namedItem(key).value);
  }

  function rememberPaymentFields() {
    paymentBaseline = JSON.stringify(paymentValues());
    editor.setPaymentDirty(unfinishedPayment());
  }

  function resetPayment() {
    paymentEditingId = null;
    paymentHome.append(paymentForm);
    paymentForm.classList.remove("inline-editor");
    if (paymentAddDraft) {
      ["date", "amount", "kind", "installmentMonth"].forEach((key, index) => {
        paymentForm.elements.namedItem(key).value = paymentAddDraft.values[index];
      });
      paymentBaseline = paymentAddDraft.baseline;
      paymentAddDraft = null;
      editor.setPaymentDirty(paymentFieldsChanged());
    } else {
      paymentForm.reset();
      paymentForm.elements.namedItem("date").value = renovationDate();
      rememberPaymentFields();
    }
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
    if (itemId && editingItemId === itemId) return;
    if (!itemId && itemForm && !editingItemId) return;
    if (editingItemId) {
      if (!discardAllowed()) return;
      clearEditor();
      if (!itemId && itemForm) return;
    }
    if (itemId && itemForm && !editingItemId) {
      addSession = {
        editor, itemForm, paymentForm, paymentList, paymentHome, paymentBaseline,
        paymentAddDraft, paymentEditingId, nodes: [...editorHost.childNodes],
      };
      editorHost.replaceChildren();
      editor = createRenovationEditor({ getState, commit, newId });
    }
    editingItemId = itemId ?? null;
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
        finishItem();
      }),
    );
    itemForm.addEventListener("input", readDraftFields);
    itemForm.addEventListener("change", readDraftFields);
    itemForm.addEventListener("submit", (event) => {
      event.preventDefault();
      attempt(() => {
        readDraftFields();
        editor.save();
        finishItem();
      }, editorHost);
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
      stage, button("Cancel payment edit", () => {
        if (paymentFieldsChanged() && !confirm("Discard unstaged payment changes?")) return;
        const id = paymentEditingId;
        keepViewport(() => {
          resetPayment();
          const row = [...paymentList.children].find((node) => node.dataset.id === id);
          focusAction(row?.querySelector("button") ?? stage);
        });
      }),
    );
    rememberPaymentFields();
    for (const event of ["input", "change"]) {
      paymentForm.addEventListener(event, () => editor.setPaymentDirty(unfinishedPayment()));
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
        const id = paymentEditingId;
        keepViewport(() => {
          resetPayment();
          renderDraftPayments();
          const row = [...paymentList.children].find((node) => node.dataset.id === id);
          focusAction(row?.querySelector("button") ?? stage);
        });
      }, editorHost);
    });
    paymentList = el("ul", "renovation-payments");
    paymentHome = el("div");
    paymentHome.append(paymentForm);
    editorHost.replaceChildren(
      el("h2", "", itemId ? "Edit renovation item" : "New renovation item"),
      el("p", "note", "Item, plan, and payment changes are staged. Use Save all changes to apply them together. Deposits reduce the balance; passing an installment date never records payment."),
      itemForm, el("h3", "", "Actual payments"), paymentList, paymentHome,
    );
    renderDraftPayments();
    if (itemId) {
      const card = [...list.children].find((node) => node.dataset.id === itemId);
      card.open = true;
      expanded.add(itemId);
      card.querySelector(".panel-body").append(editorHost);
    }
  }

  categoryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    attempt(() => {
      commit(saveRenovationCategory(getState(), {
        id: newId(), houseId: selectedHouse, name: categoryName.value.trim(),
      }));
      categoryForm.reset();
      render();
      focusAction(categoryForm.querySelector('[type="submit"]'));
    });
  });
  byId("renovation-category-cancel").addEventListener("click", () => {
    categoryForm.reset();
  });
  byId("renovation-add-item").addEventListener("click", () => attempt(() => openEditor()));

  function selectHouse(id) {
    if (id === selectedHouse) return true;
    if (!getState().houses.some((house) => house.id === id)) return false;
    if (!discardForm(categoryEditForm, categoryBaseline)) { houseSelect.value = selectedHouse; return false; }
    if (!discardAllowed()) { houseSelect.value = selectedHouse; return false; }
    if (addSession?.editor.isDirty() && !confirm("Discard unsaved new renovation item changes?")) {
      houseSelect.value = selectedHouse;
      return false;
    }
    addSession = null;
    clearEditor();
    closeCategory();
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
    const buildCategory = (category) => {
      const card = el("details", "panel");
      card.dataset.id = category.categoryId;
      card.open = openCategories.has(category.categoryId);
      const summary = el("summary", "", category.name);
      const content = el("div", "panel-body cards");
      const figures = el("div", "cards");
      figures.dataset.role = "category-summary";
      renderRenovationSummary(figures, category);
      content.append(figures);
      content.append(
        button("Rename category", () => {
          if (categoryEditingId === category.categoryId) return;
          if (!discardForm(categoryEditForm, categoryBaseline)) return;
          closeCategory();
          categoryEditingId = category.categoryId;
          categoryEditForm = cloneEntryForm(categoryForm);
          const form = categoryEditForm;
          form.setAttribute("aria-label", `Rename ${category.name}`);
          form.elements.namedItem("name").value = category.name;
          form.querySelector('[type="submit"]').textContent = "Save";
          form.querySelector('[data-action="cancel"]').addEventListener("click", () => {
            if (!discardForm(form, categoryBaseline)) return;
            keepViewport(() => {
              closeCategory();
              focusAction(content.querySelector("button"));
            });
          });
          form.addEventListener("submit", (event) => {
            event.preventDefault();
            attempt(() => {
              const next = saveRenovationCategory(getState(), {
                id: category.categoryId, houseId: selectedHouse,
                name: form.elements.namedItem("name").value.trim(),
              });
              keepViewport(() => {
                closeCategory();
                commit(next);
                render();
                const saved = [...categoriesHost.children].find((node) => node.dataset.id === category.categoryId);
                focusAction(saved?.querySelector("button"));
              });
            }, form);
          });
          categoryBaseline = formSnapshot(form);
          content.append(form);
        }),
        button("Delete category", () => attempt(() => {
          if (!confirm(`Delete category "${category.name}"?`)) return;
          if (categoryEditingId === category.categoryId && !discardForm(categoryEditForm, categoryBaseline)) return;
          const next = deleteRenovationCategory(getState(), category.categoryId);
          keepViewport(() => {
            if (categoryEditingId === category.categoryId) closeCategory();
            commit(next);
            render();
            focusAction(categoriesHost.querySelector("button") ?? categoryForm.querySelector('[type="submit"]'));
          });
        })),
      );
      card.append(summary, content);
      return card;
    };
    syncRows(categoriesHost, report.categories.map((category) => ({ ...category, id: category.categoryId })),
      buildCategory, categoryEditingId);
    if (categoryEditingId) {
      const category = report.categories.find(({ categoryId }) => categoryId === categoryEditingId);
      const card = [...categoriesHost.children].find((node) => node.dataset.id === categoryEditingId);
      if (category && card) renderRenovationSummary(card.querySelector('[data-role="category-summary"]'), category);
    }
    byId("renovation-add-item").disabled = report.categories.length === 0;
    const buildItem = (entry) => {
      const { item } = entry;
      const card = el("details", "panel");
      card.dataset.id = item.id;
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
      const edit = button("Edit item and payments", () => attempt(() => openEditor(item.id)));
      edit.dataset.action = "edit-item";
      content.append(
        edit,
        button("Delete item", () => attempt(() => {
          if (!confirm(`Delete "${item.name}" and all its payments and installment plan?`)) return;
          if (editor.snapshot()?.item.id === item.id && !discardAllowed()) return;
          keepViewport(() => {
            if (editor.snapshot()?.item.id === item.id) clearEditor();
            commit(deleteRenovationItem(getState(), item.id));
            render();
            focusAction(list.querySelector("button") ?? byId("renovation-add-item"));
          });
        })),
      );
      card.append(summary, content);
      return card;
    };
    syncRows(list, report.items.map((entry) => ({ ...entry, id: entry.item.id })), buildItem, editingItemId);
    byId("renovation-empty").hidden = report.items.length > 0;
  }

  function reset() {
    addSession = null;
    clearEditor();
    categoriesHost.replaceChildren();
    closeCategory();
    categoryForm.reset();
    message.textContent = "";
    selectedHouse = "";
    expanded.clear();
  }
  return { render, reset, selectHouse };
}
