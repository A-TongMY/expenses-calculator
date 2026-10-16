import { money, monthLabel, dateLabel } from "./format.js";
import { MAX_AMOUNT } from "./rules.js";
import { renovationDate, renovationMonth } from "./renovation-calendar.js";
import {
  deleteRenovationItem, deleteRenovationPayment, renovationReport,
  saveRenovationItem, saveRenovationPayment, setInstallmentPlan,
} from "./renovation.js";
import { renderRenovationSummary } from "./renovation-summary.js";
import {
  cloneEntryForm, discardForm, el, focusAction, formSnapshot, iconButton,
  keepViewport, setIconButton, syncRows, syncSelectOptions,
} from "./ui.js";

const byId = (id) => document.getElementById(id);

function field(label, control) {
  const node = el("label", "field");
  node.append(el("span", "", label), control);
  return node;
}

function pair(...nodes) {
  const node = el("div", "pair");
  node.append(...nodes);
  return node;
}

function control(tag, name, properties = {}) {
  const node = el(tag);
  node.name = name;
  Object.assign(node, properties);
  return node;
}

const amountInput = (name, value) => control("input", name, {
  type: "number", required: true, min: "0.01", max: String(MAX_AMOUNT), step: "0.01",
  inputMode: "decimal", placeholder: "0.00", autocomplete: "off", value: value === undefined ? "" : String(value),
});

function option(value, label) {
  const node = el("option", "", label);
  node.value = value;
  return node;
}

function editorForm(fields, extraActions = []) {
  const form = el("form", "inline-editor");
  form.autocomplete = "off";
  const message = el("p", "hint");
  message.dataset.role = "message";
  message.setAttribute("role", "status");
  const save = iconButton({ name: "save", label: "Save", className: "primary", onClick: () => {} });
  save.type = "submit";
  const cancel = iconButton({ name: "x", label: "Cancel", onClick: () => {} });
  cancel.dataset.action = "cancel";
  const actions = el("div", "actions");
  actions.append(save, cancel, ...extraActions);
  form.append(...fields, message, actions);
  return form;
}

function figuresText(entry) {
  const parts = [];
  if (entry.budget !== null) parts.push(`Budget ${money.format(entry.budget)}`);
  if (entry.actualCost !== null) parts.push(`Actual ${money.format(entry.actualCost)}`);
  parts.push(`Paid ${money.format(entry.paid)}`);
  if (entry.outstanding !== null) parts.push(`Outstanding ${money.format(entry.outstanding)}`);
  if (entry.budget !== null && entry.actualCost !== null && entry.budget !== entry.actualCost) {
    const gap = Math.abs(Math.round((entry.actualCost - entry.budget) * 100)) / 100;
    parts.push(`${money.format(gap)} ${entry.actualCost > entry.budget ? "over" : "under"} budget`);
  }
  return parts.join(" · ");
}

function planText({ item, covered, due, overdue }) {
  const plan = item.installmentPlan;
  if (!plan) return "";
  const parts = [
    `${money.format(plan.amount)} × ${plan.count} from ${monthLabel(plan.startMonth)}`,
    `${covered} of ${plan.count} covered`,
  ];
  if (due > 0) parts.push(`${money.format(due)} due`);
  if (overdue > 0) parts.push(`${money.format(overdue)} overdue`);
  return parts.join(" · ");
}

const paymentText = (payment) =>
  `${dateLabel(payment.date)} · ${money.format(payment.amount)} · ${payment.kind === "deposit" ? "Deposit" : "Payment"}`;

export function setupRenovation({ getState, commit, newId }) {
  const houseSelect = byId("renovation-house");
  const overview = byId("renovation-overview");
  const list = byId("renovation-list");
  const addPanel = byId("renovation-add");
  const addForm = byId("renovation-item-form");
  let selectedHouse = "";
  // The one open inline editor: { kind: item|payment|plan, itemId, paymentId, action, form, host, baseline }.
  let editor = null;

  const childById = (parent, id) => [...parent.children].find((node) => node.dataset.id === id);
  const cardOf = (itemId) => childById(list, itemId);
  const rowOf = (card, paymentId) => childById(card.querySelector(".payments"), paymentId);
  const itemOf = (itemId) => getState().renovationItems.find(({ id }) => id === itemId);
  const messageOf = (form) => form.querySelector('[data-role="message"]');

  function opener({ itemId, paymentId, action }) {
    const card = cardOf(itemId);
    if (!card) return null;
    if (paymentId) return rowOf(card, paymentId)?.querySelector('[data-action="edit"]');
    return card.querySelector(`.item-head [data-action="${action}"]`);
  }

  function itemFromForm(form, base) {
    const value = (name) => form.elements.namedItem(name).value;
    const { notes, budget, actualCost, ...item } = { ...base, name: value("name").trim() };
    if (value("notes").trim()) item.notes = value("notes").trim();
    for (const key of ["budget", "actualCost"]) if (value(key) !== "") item[key] = Number(value(key));
    return item;
  }

  function closeEditor() {
    if (!editor) return;
    editor.form.remove();
    editor.host.classList.remove("editing");
    editor = null;
  }

  function finish(next) {
    const target = { ...editor };
    keepViewport(() => {
      closeEditor();
      commit(next);
    });
    focusAction(opener(target));
  }

  function attempt(form, change) {
    let next;
    try {
      next = change(getState());
    } catch (error) {
      messageOf(form).textContent = error.message;
      return;
    }
    finish(next);
  }

  function itemForm(item) {
    const form = cloneEntryForm(addForm);
    for (const name of ["name", "notes", "budget", "actualCost"]) {
      form.elements.namedItem(name).value = item[name] ?? "";
    }
    messageOf(form).textContent = "";
    setIconButton(form.querySelector('[type="submit"]'), "save", "Save");
    return form;
  }

  function paymentForm(payment) {
    const today = renovationDate();
    const date = control("input", "date", {
      type: "date", required: true, max: today, value: payment?.date ?? today, autocomplete: "off",
    });
    const kind = control("select", "kind");
    kind.append(option("payment", "Payment"), option("deposit", "Deposit"));
    kind.value = payment?.kind ?? "payment";
    return editorForm([pair(field("Date", date), field("Amount (MYR)", amountInput("amount", payment?.amount))), field("Type", kind)]);
  }

  function planForm(item) {
    const plan = item.installmentPlan;
    const start = control("input", "startMonth", {
      type: "month", required: true, pattern: "\\d{4}-\\d{2}", placeholder: "YYYY-MM",
      value: plan?.startMonth ?? renovationMonth(), autocomplete: "off",
    });
    const count = control("input", "count", {
      type: "number", required: true, min: "1", max: "600", step: "1", inputMode: "numeric",
      placeholder: "12", autocomplete: "off", value: plan ? String(plan.count) : "",
    });
    const remove = plan ? [iconButton({
      name: "trash", label: "Remove plan", className: "danger", onClick: () => {
        if (!confirm("Remove the monthly plan?")) return;
        attempt(editor.form, (state) => setInstallmentPlan(state, item.id, null));
      },
    })] : [];
    return editorForm([
      pair(field("First month", start), field("Monthly (MYR)", amountInput("amount", plan?.amount))),
      field("Installments", count),
    ], remove);
  }

  function submitEditor() {
    const { kind, itemId, paymentId, form } = editor;
    const value = (name) => form.elements.namedItem(name).value;
    attempt(form, (state) => {
      if (kind === "item") return saveRenovationItem(state, itemFromForm(form, itemOf(itemId)));
      if (kind === "plan") {
        return setInstallmentPlan(state, itemId, {
          startMonth: value("startMonth"), amount: Number(value("amount")), count: Number(value("count")),
        });
      }
      const previous = state.renovationPayments.find(({ id }) => id === paymentId);
      return saveRenovationPayment(state, {
        ...previous, id: paymentId ?? newId(), itemId,
        date: value("date"), amount: Number(value("amount")), kind: value("kind"),
      });
    });
  }

  function openEditor(kind, itemId, paymentId = null) {
    if (editor && editor.kind === kind && editor.itemId === itemId && editor.paymentId === paymentId) return;
    if (editor && !discardForm(editor.form, editor.baseline)) return;
    closeEditor();
    const item = itemOf(itemId);
    const card = cardOf(itemId);
    if (!item || !card) return;
    let host = card.querySelector('[data-role="editor"]');
    let form;
    let action = { item: "edit", plan: "plan", payment: "add-payment" }[kind];
    if (kind === "item") form = itemForm(item);
    else if (kind === "plan") form = planForm(item);
    else {
      const payment = paymentId && getState().renovationPayments.find(({ id }) => id === paymentId);
      form = paymentForm(payment);
      if (payment) {
        host = rowOf(card, paymentId);
        host.classList.add("editing");
        action = "edit";
      }
    }
    host.append(form);
    editor = { kind, itemId, paymentId, action, form, host, baseline: formSnapshot(form) };
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitEditor();
    });
    form.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      if (!discardForm(editor.form, editor.baseline)) return;
      const target = { ...editor };
      closeEditor();
      focusAction(opener(target));
    });
  }

  function deletePayment(itemId, paymentId) {
    if (!confirm("Delete this payment?")) return;
    const next = deleteRenovationPayment(getState(), paymentId);
    keepViewport(() => {
      if (editor?.paymentId === paymentId) closeEditor();
      commit(next);
    });
    focusAction(cardOf(itemId)?.querySelector('.item-head [data-action="add-payment"]'));
  }

  function deleteItem(itemId) {
    const item = itemOf(itemId);
    if (!item || !confirm(`Delete ${item.name} and its payments?`)) return;
    const next = deleteRenovationItem(getState(), itemId);
    keepViewport(() => {
      if (editor?.itemId === itemId) closeEditor();
      commit(next);
    });
    focusAction(addPanel.querySelector("summary"));
  }

  function buildPaymentRow(itemId, payment) {
    const row = el("li");
    row.dataset.id = payment.id;
    const actions = el("div", "row-actions");
    const edit = iconButton({ name: "edit", label: "Edit payment", onClick: () => openEditor("payment", itemId, payment.id) });
    edit.dataset.action = "edit";
    const remove = iconButton({ name: "trash", label: "Delete payment", className: "danger", onClick: () => deletePayment(itemId, payment.id) });
    remove.dataset.action = "delete";
    actions.append(edit, remove);
    row.append(el("span", "row-text"), actions);
    return row;
  }

  function buildCard(itemId) {
    const card = el("li", "renovation-item");
    card.dataset.id = itemId;
    const head = el("div", "item-head");
    const actions = el("div", "row-actions");
    const action = (key, name, className, onClick) => {
      const button = iconButton({ name, label: key, className, onClick });
      button.dataset.action = key;
      return button;
    };
    actions.append(
      action("edit", "edit", "", () => openEditor("item", itemId)),
      action("add-payment", "card", "", () => openEditor("payment", itemId)),
      action("plan", "calendar", "", () => openEditor("plan", itemId)),
      action("delete", "trash", "danger", () => deleteItem(itemId)),
    );
    head.append(el("strong", "name"), actions);
    const line = (role, className) => {
      const node = el("p", className);
      node.dataset.role = role;
      return node;
    };
    const slot = el("div");
    slot.dataset.role = "editor";
    card.append(head, line("notes", "notes"), line("figures", "figures"), line("plan", "plan"), slot, el("ul", "payments"));
    return card;
  }

  function fillCard(card, entry) {
    const { item } = entry;
    card.querySelector(".name").textContent = item.name;
    const labels = {
      edit: `Edit ${item.name}`,
      "add-payment": `Add payment to ${item.name}`,
      plan: `Monthly plan for ${item.name}`,
      delete: `Delete ${item.name}`,
    };
    for (const button of card.querySelectorAll(".item-head [data-action]")) {
      const label = labels[button.dataset.action];
      const waiting = entry.actualCost === null && ["add-payment", "plan"].includes(button.dataset.action);
      button.setAttribute("aria-label", label);
      button.disabled = waiting;
      button.title = waiting ? "Set actual cost first" : label;
    }
    const notes = card.querySelector('[data-role="notes"]');
    notes.textContent = item.notes ?? "";
    notes.hidden = !item.notes;
    card.querySelector('[data-role="figures"]').textContent = figuresText(entry);
    const plan = card.querySelector('[data-role="plan"]');
    plan.textContent = planText(entry);
    plan.hidden = !item.installmentPlan;
    const payments = card.querySelector(".payments");
    syncRows(payments, entry.payments, (payment) => childById(payments, payment.id) ?? buildPaymentRow(item.id, payment));
    for (const payment of entry.payments) {
      childById(payments, payment.id).querySelector(".row-text").textContent = paymentText(payment);
    }
  }

  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    let next;
    try {
      next = saveRenovationItem(getState(), itemFromForm(addForm, { id: newId(), houseId: selectedHouse }));
    } catch (error) {
      messageOf(addForm).textContent = error.message;
      return;
    }
    keepViewport(() => {
      commit(next);
      addForm.reset();
      messageOf(addForm).textContent = "";
    });
    focusAction(addForm.querySelector('[type="submit"]'));
  });

  function selectHouse(id) {
    if (id === selectedHouse) return true;
    if (!getState().houses.some((house) => house.id === id)) return false;
    if (editor && !discardForm(editor.form, editor.baseline)) {
      houseSelect.value = selectedHouse;
      return false;
    }
    closeEditor();
    selectedHouse = id;
    render();
    return true;
  }
  houseSelect.addEventListener("change", () => selectHouse(houseSelect.value));

  function render() {
    const state = getState();
    if (!state.houses.some(({ id }) => id === selectedHouse)) {
      closeEditor();
      selectedHouse = state.houses[0]?.id ?? "";
    }
    syncSelectOptions(houseSelect, state.houses.map(({ id, name }) => ({ value: id, label: name })));
    if (houseSelect.value !== selectedHouse) houseSelect.value = selectedHouse;
    houseSelect.disabled = !selectedHouse;
    byId("renovation-no-houses").hidden = Boolean(selectedHouse);
    byId("renovation-workspace").hidden = !selectedHouse;
    if (!selectedHouse) return;
    const report = renovationReport(state, selectedHouse);
    renderRenovationSummary(overview, report);
    const entries = report.items.map((entry) => ({ ...entry, id: entry.item.id }));
    syncRows(list, entries, (entry) => cardOf(entry.id) ?? buildCard(entry.id));
    for (const entry of entries) fillCard(cardOf(entry.id), entry);
    // The editor's item or payment was deleted elsewhere.
    if (editor && !list.contains(editor.form)) editor = null;
    for (const date of list.querySelectorAll('input[name="date"]')) date.max = renovationDate();
    byId("renovation-empty").hidden = report.items.length > 0;
  }

  function reset() {
    closeEditor();
    list.replaceChildren();
    addForm.reset();
    messageOf(addForm).textContent = "";
    selectedHouse = "";
  }

  return { render, reset, selectHouse };
}
