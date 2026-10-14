import {
  MAX_AMOUNT, MAX_ITEMS, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_TERM_MONTHS,
  isDate, isMonth,
} from "./rules.js";
import { renovationDate, renovationMonth } from "./renovation-calendar.js";

export function toRenovationSen(amount) {
  if (!validMoney(amount)) {
    throw new RangeError("Enter a valid renovation amount with at most two decimal places.");
  }
  return Math.round(amount * 100);
}

const validMoney = (value) =>
  typeof value === "number" && Number.isFinite(value) &&
  value >= 0 && value <= MAX_AMOUNT && Math.round(value * 100) / 100 === value;
const validId = (value) => typeof value === "string" && value.trim().length > 0;
const validName = (value) => validId(value) && value === value.trim() && value.length <= MAX_NAME_LENGTH;
const validList = (list) => Array.isArray(list) && list.length <= MAX_ITEMS &&
  list.every((entry) => validId(entry?.id)) &&
  new Set(list.map(({ id }) => id)).size === list.length;
const monthIndex = (month) => {
  const [year, number] = month.split("-").map(Number);
  return year * 12 + number - 1;
};
const monthAt = (index) =>
  `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;

function stateError(state, today) {
  if (!isDate(today)) return "The renovation accounting date is invalid.";
  if (!Array.isArray(state?.houses)) return "The Houses list is unavailable.";
  const { renovationCategories: categories, renovationItems: items, renovationPayments: payments } = state;
  if (![categories, items, payments].every(validList)) {
    return "Renovation lists must contain at most 2,000 records with unique nonblank IDs.";
  }
  const houses = new Set(state.houses.map(({ id }) => id));
  const categoryMap = new Map();
  for (const category of categories) {
    if (!validName(category.name) || !houses.has(category.houseId)) {
      return "Each renovation category needs a valid name and an existing house.";
    }
    categoryMap.set(category.id, category);
  }
  const itemMap = new Map();
  for (const item of items) {
    if (!validName(item.name) || !houses.has(item.houseId) ||
      categoryMap.get(item.categoryId)?.houseId !== item.houseId) {
      return "Each renovation item needs a valid name and a category from its own house.";
    }
    if (item.budget === undefined && item.actualCost === undefined) {
      return "Enter a budget or actual total cost for the renovation item.";
    }
    if ((item.budget !== undefined && !validMoney(item.budget)) ||
      (item.actualCost !== undefined && !validMoney(item.actualCost))) {
      return "Budget and actual cost must be valid amounts with at most two decimal places.";
    }
    if (item.notes !== undefined &&
      (typeof item.notes !== "string" || item.notes.length > MAX_DESCRIPTION_LENGTH)) {
      return "Renovation notes must contain at most 500 characters.";
    }
    const plan = item.installmentPlan;
    if (plan !== undefined && (
      !plan || typeof plan !== "object" || item.actualCost === undefined ||
      !isMonth(plan.startMonth) || !validMoney(plan.amount) || plan.amount <= 0 ||
      !Number.isInteger(plan.count) || plan.count < 1 || plan.count > MAX_TERM_MONTHS ||
      monthIndex(plan.startMonth) + plan.count - 1 > monthIndex("9999-12")
    )) {
      return "A monthly plan needs an actual cost, a valid start month, a positive amount, and 1-600 installments.";
    }
    itemMap.set(item.id, { item, paid: 0, linked: 0, byMonth: new Map() });
  }
  for (const payment of payments) {
    const record = itemMap.get(payment.itemId);
    if (!record || record.item.actualCost === undefined) {
      return "Payments require an existing renovation item with an actual total cost.";
    }
    if (!isDate(payment.date) || payment.date > today ||
      !validMoney(payment.amount) || payment.amount <= 0 ||
      !["deposit", "payment"].includes(payment.kind)) {
      return "Enter a positive payment with at most two decimals, a deposit/payment label, and a date no later than today.";
    }
    const sen = toRenovationSen(payment.amount);
    record.paid += sen;
    if (payment.installmentMonth !== undefined) {
      const plan = record.item.installmentPlan;
      if (!plan || !isMonth(payment.installmentMonth) ||
        monthIndex(payment.installmentMonth) < monthIndex(plan.startMonth) ||
        monthIndex(payment.installmentMonth) >= monthIndex(plan.startMonth) + plan.count) {
        return "A linked payment must refer to an installment in this item's plan.";
      }
      const total = (record.byMonth.get(payment.installmentMonth) ?? 0) + sen;
      if (total > toRenovationSen(plan.amount)) {
        return "Linked payments cannot exceed the installment's amount; record the excess separately.";
      }
      record.byMonth.set(payment.installmentMonth, total);
      record.linked += sen;
    }
  }
  for (const { item, paid, linked } of itemMap.values()) {
    if (item.actualCost === undefined) continue;
    const outstanding = toRenovationSen(item.actualCost) - paid;
    if (outstanding < 0) return "Payments exceed actual cost. Update the actual total cost first.";
    const scheduled = item.installmentPlan
      ? toRenovationSen(item.installmentPlan.amount) * item.installmentPlan.count - linked : 0;
    if (scheduled > outstanding) {
      return "Unpaid scheduled amounts exceed outstanding. Allocate the payment or adjust the plan in the same edit.";
    }
  }
  return null;
}

export const isValidRenovationState = (state, today = renovationDate()) =>
  stateError(state, today) === null;

function assertState(state, today = renovationDate()) {
  const error = stateError(state, today);
  if (error) throw new RangeError(error);
}

const financialKeys = [
  "budgeted", "expected", "actualCost", "paid", "outstanding",
  "scheduledRemaining", "unscheduled", "due", "overdue", "comparedBudget", "comparedActual",
];
const emptyTotals = () => ({
  ...Object.fromEntries(financialKeys.map((key) => [key, 0])),
  unbudgetedCount: 0, gap: null,
});

function totalsFor(items) {
  const totals = emptyTotals();
  let compared = false;
  for (const entry of items) {
    const { item } = entry;
    const values = {
      budgeted: entry.budget, expected: entry.expected, actualCost: entry.actualCost,
      paid: entry.paid, outstanding: entry.outstanding, scheduledRemaining: entry.scheduledRemaining,
      unscheduled: entry.unscheduled, due: entry.due, overdue: entry.overdue,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value !== null) totals[key] += Math.round(value * 100);
    }
    if (item.budget === undefined) totals.unbudgetedCount += 1;
    if (item.budget !== undefined && item.actualCost !== undefined) {
      compared = true;
      totals.comparedBudget += toRenovationSen(item.budget);
      totals.comparedActual += toRenovationSen(item.actualCost);
    }
  }
  totals.gap = compared ? (totals.comparedActual - totals.comparedBudget) / 100 : null;
  for (const key of financialKeys) totals[key] /= 100;
  return totals;
}

export function renovationReport(state, houseId, month = renovationMonth()) {
  assertState(state);
  if (!isMonth(month)) throw new RangeError("Invalid renovation reporting month.");
  if (!state.houses.some(({ id }) => id === houseId)) throw new RangeError("The selected house no longer exists.");
  const paymentMap = new Map();
  for (const payment of state.renovationPayments) {
    if (!paymentMap.has(payment.itemId)) paymentMap.set(payment.itemId, []);
    paymentMap.get(payment.itemId).push(payment);
  }
  const items = state.renovationItems.filter((item) => item.houseId === houseId).map((item) => {
    const payments = paymentMap.get(item.id) ?? [];
    const paidSen = payments.reduce((sum, payment) => sum + toRenovationSen(payment.amount), 0);
    const linked = new Map();
    for (const payment of payments) {
      if (payment.installmentMonth !== undefined) {
        linked.set(payment.installmentMonth,
          (linked.get(payment.installmentMonth) ?? 0) + toRenovationSen(payment.amount));
      }
    }
    const plan = item.installmentPlan;
    const installments = plan ? Array.from({ length: plan.count }, (_, index) => {
      const dueMonth = monthAt(monthIndex(plan.startMonth) + index);
      const amount = toRenovationSen(plan.amount);
      const paid = linked.get(dueMonth) ?? 0;
      return {
        month: dueMonth, amount: amount / 100, paid: paid / 100, remaining: (amount - paid) / 100,
        paymentStatus: paid === amount ? "paid" : paid > 0 ? "partial" : "unpaid",
        dueStatus: dueMonth < month ? "past" : dueMonth === month ? "current" : "future",
      };
    }) : [];
    const sumRemaining = (rows) => rows.reduce((sum, row) => sum + Math.round(row.remaining * 100), 0);
    const scheduled = sumRemaining(installments);
    const outstanding = item.actualCost === undefined ? null : toRenovationSen(item.actualCost) - paidSen;
    return {
      item, budget: item.budget ?? null, actualCost: item.actualCost ?? null,
      expected: item.actualCost ?? item.budget, paid: paidSen / 100,
      outstanding: outstanding === null ? null : outstanding / 100,
      scheduledRemaining: scheduled / 100,
      unscheduled: outstanding === null ? null : (outstanding - scheduled) / 100,
      due: sumRemaining(installments.filter((row) => row.dueStatus === "current")) / 100,
      overdue: sumRemaining(installments.filter((row) => row.dueStatus === "past")) / 100,
      installments,
    };
  });
  return {
    houseId, totals: totalsFor(items), items,
    categories: state.renovationCategories.filter((category) => category.houseId === houseId).map((category) => ({
      categoryId: category.id, name: category.name,
      totals: totalsFor(items.filter(({ item }) => item.categoryId === category.id)),
    })),
  };
}

export function saveRenovationCategory(state, category, today = renovationDate()) {
  assertState(state, today);
  const previous = state.renovationCategories.find(({ id }) => id === category.id);
  if (previous && previous.houseId !== category.houseId) {
    throw new RangeError("A renovation category cannot be moved to another house.");
  }
  const saved = structuredClone(category);
  const next = {
    ...state,
    renovationCategories: previous
      ? state.renovationCategories.map((entry) => entry.id === saved.id ? saved : entry)
      : [...state.renovationCategories, saved],
  };
  assertState(next, today);
  return next;
}

export function deleteRenovationCategory(state, categoryId, today = renovationDate()) {
  assertState(state, today);
  if (!state.renovationCategories.some(({ id }) => id === categoryId)) {
    throw new RangeError("The renovation category no longer exists.");
  }
  if (state.renovationItems.some((item) => item.categoryId === categoryId)) {
    throw new RangeError("Move or delete this category's renovation items before deleting it.");
  }
  return {
    ...state,
    renovationCategories: state.renovationCategories.filter(({ id }) => id !== categoryId),
  };
}

export function saveRenovationItem(state, item, itemPayments, today = renovationDate()) {
  assertState(state, today);
  const previous = state.renovationItems.find(({ id }) => id === item.id);
  if (previous && previous.houseId !== item.houseId) {
    throw new RangeError("A renovation item cannot be moved to another house.");
  }
  if (!Array.isArray(itemPayments) || itemPayments.some((payment) => payment?.itemId !== item.id)) {
    throw new RangeError("Every staged payment must belong to this renovation item.");
  }
  if (previous?.installmentPlan) {
    const oldPlan = previous.installmentPlan;
    const newPlan = item.installmentPlan;
    const allocated = state.renovationPayments.filter((payment) =>
      payment.itemId === item.id && payment.installmentMonth !== undefined);
    for (const payment of allocated) {
      const month = payment.installmentMonth;
      const retained = newPlan && newPlan.amount === oldPlan.amount &&
        isMonth(newPlan.startMonth) &&
        monthIndex(month) >= monthIndex(newPlan.startMonth) &&
        monthIndex(month) < monthIndex(newPlan.startMonth) + newPlan.count;
      if (!retained && itemPayments.some((entry) => entry.installmentMonth === month)) {
        throw new RangeError("Unlink payments before changing or removing their installment; save the adjustments together.");
      }
    }
  }
  const saved = structuredClone(item);
  const next = {
    ...state,
    renovationItems: previous
      ? state.renovationItems.map((entry) => entry.id === saved.id ? saved : entry)
      : [...state.renovationItems, saved],
    renovationPayments: [
      ...state.renovationPayments.filter((payment) => payment.itemId !== saved.id),
      ...structuredClone(itemPayments),
    ],
  };
  assertState(next, today);
  return next;
}

export function deleteRenovationItem(state, itemId, today = renovationDate()) {
  assertState(state, today);
  if (!state.renovationItems.some(({ id }) => id === itemId)) {
    throw new RangeError("The renovation item no longer exists.");
  }
  return {
    ...state,
    renovationItems: state.renovationItems.filter(({ id }) => id !== itemId),
    renovationPayments: state.renovationPayments.filter((payment) => payment.itemId !== itemId),
  };
}

export function assertHouseDeletionAllowed(state, houseId) {
  if (state.renovationItems.some((item) => item.houseId === houseId)) {
    throw new RangeError("Delete this house's renovation items before deleting the house.");
  }
  if (state.renovationCategories.some((category) => category.houseId === houseId)) {
    throw new RangeError("Delete this house's renovation categories before deleting the house.");
  }
}
