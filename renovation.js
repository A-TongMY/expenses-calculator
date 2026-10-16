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
const validPlan = (plan) =>
  plan && typeof plan === "object" &&
  isMonth(plan.startMonth) && validMoney(plan.amount) && plan.amount > 0 &&
  Number.isInteger(plan.count) && plan.count >= 1 && plan.count <= MAX_TERM_MONTHS &&
  monthIndex(plan.startMonth) + plan.count - 1 <= monthIndex("9999-12");
const byDateThenId = (a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function itemError(item, houses) {
  if (!validName(item.name) || !houses.has(item.houseId)) {
    return "Each renovation item needs a valid name and an existing house.";
  }
  const named = (message) => `${item.name}: ${message}`;
  if (item.budget === undefined && item.actualCost === undefined) {
    return named("Enter a budget or an actual cost.");
  }
  if ((item.budget !== undefined && !validMoney(item.budget)) ||
    (item.actualCost !== undefined && !validMoney(item.actualCost))) {
    return named("Budget and actual cost must be valid amounts with at most two decimal places.");
  }
  if (item.notes !== undefined &&
    (typeof item.notes !== "string" || item.notes.length > MAX_DESCRIPTION_LENGTH)) {
    return named("Notes must contain at most 500 characters.");
  }
  if (item.installmentPlan !== undefined &&
    (item.actualCost === undefined || !validPlan(item.installmentPlan))) {
    return named("A monthly plan needs an actual cost, a valid start month, a positive amount, and 1-600 installments.");
  }
  return null;
}

function stateError(state, today) {
  if (!isDate(today)) return "The renovation accounting date is invalid.";
  if (!Array.isArray(state?.houses)) return "The Houses list is unavailable.";
  const { renovationItems: items, renovationPayments: payments } = state;
  if (![items, payments].every(validList)) {
    return "Renovation lists must contain at most 2,000 records with unique nonblank IDs.";
  }
  const houses = new Set(state.houses.map(({ id }) => id));
  const records = new Map();
  for (const item of items) {
    const error = itemError(item, houses);
    if (error) return error;
    records.set(item.id, { item, paid: 0, deposits: 0 });
  }
  for (const payment of payments) {
    const record = records.get(payment.itemId);
    if (!record) return "Each payment needs an existing renovation item.";
    const { item } = record;
    if (item.actualCost === undefined) return `${item.name}: Set the actual cost before adding payments.`;
    if (!isDate(payment.date) || payment.date > today ||
      !validMoney(payment.amount) || payment.amount <= 0 ||
      !["deposit", "payment"].includes(payment.kind)) {
      return `${item.name}: Enter a positive amount with at most two decimals, Deposit or Payment, and a date no later than today.`;
    }
    const sen = toRenovationSen(payment.amount);
    record.paid += sen;
    if (payment.kind === "deposit") record.deposits += sen;
  }
  for (const { item, paid, deposits } of records.values()) {
    if (item.actualCost === undefined) continue;
    const actual = toRenovationSen(item.actualCost);
    if (paid > actual) return `${item.name}: Deposits and payments exceed the actual cost.`;
    const plan = item.installmentPlan;
    if (plan && deposits + toRenovationSen(plan.amount) * plan.count > actual) {
      return `${item.name}: Deposits plus the monthly plan total cannot exceed the actual cost.`;
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

export function allocateInstallments(plan, payments, month) {
  let pool = payments
    .filter((payment) => payment.kind === "payment")
    .reduce((sum, payment) => sum + toRenovationSen(payment.amount), 0);
  const amount = toRenovationSen(plan.amount);
  return Array.from({ length: plan.count }, (_, index) => {
    const due = monthAt(monthIndex(plan.startMonth) + index);
    const covered = Math.min(pool, amount);
    pool -= covered;
    const remaining = amount - covered;
    return {
      month: due, amount: amount / 100, covered: covered / 100, remaining: remaining / 100,
      dueStatus: remaining === 0 ? "paid" : due < month ? "overdue" : due === month ? "due" : "upcoming",
    };
  });
}

const sumSen = (rows, pick) => rows.reduce((sum, row) => sum + Math.round((pick(row) ?? 0) * 100), 0);

export function renovationReport(state, houseId, month = renovationMonth()) {
  assertState(state);
  if (!isMonth(month)) throw new RangeError("Invalid renovation reporting month.");
  if (!state.houses.some(({ id }) => id === houseId)) throw new RangeError("The selected house no longer exists.");
  const items = state.renovationItems.filter((item) => item.houseId === houseId).map((item) => {
    const payments = state.renovationPayments
      .filter((payment) => payment.itemId === item.id).sort(byDateThenId);
    const paid = sumSen(payments, (payment) => payment.amount);
    const installments = item.installmentPlan
      ? allocateInstallments(item.installmentPlan, payments, month) : [];
    const remainingWhere = (status) =>
      sumSen(installments.filter((row) => row.dueStatus === status), (row) => row.remaining) / 100;
    return {
      item, payments,
      budget: item.budget ?? null,
      actualCost: item.actualCost ?? null,
      paid: paid / 100,
      outstanding: item.actualCost === undefined ? null : (toRenovationSen(item.actualCost) - paid) / 100,
      covered: installments.filter((row) => row.remaining === 0).length,
      due: remainingWhere("due"),
      overdue: remainingWhere("overdue"),
      installments,
    };
  });
  const totals = Object.fromEntries(["budget", "actualCost", "paid", "outstanding", "due", "overdue"]
    .map((key) => [key, sumSen(items, (entry) => entry[key]) / 100]));
  return { houseId, totals, items };
}

function commitChange(state, next, today) {
  assertState(next, today);
  return next;
}

const replaceOrAdd = (list, entry) => list.some(({ id }) => id === entry.id)
  ? list.map((current) => current.id === entry.id ? entry : current)
  : [...list, entry];

function findItem(state, itemId) {
  const item = state.renovationItems.find(({ id }) => id === itemId);
  if (!item) throw new RangeError("The renovation item no longer exists.");
  return item;
}

export function saveRenovationItem(state, item, today = renovationDate()) {
  assertState(state, today);
  const previous = state.renovationItems.find(({ id }) => id === item.id);
  if (previous && previous.houseId !== item.houseId) {
    throw new RangeError("A renovation item cannot be moved to another house.");
  }
  const { installmentPlan, ...fields } = structuredClone(item);
  const saved = previous?.installmentPlan
    ? { ...fields, installmentPlan: structuredClone(previous.installmentPlan) }
    : fields;
  return commitChange(state, {
    ...state, renovationItems: replaceOrAdd(state.renovationItems, saved),
  }, today);
}

export function setInstallmentPlan(state, itemId, plan, today = renovationDate()) {
  assertState(state, today);
  const { installmentPlan, ...item } = findItem(state, itemId);
  const saved = plan ? { ...item, installmentPlan: structuredClone(plan) } : item;
  return commitChange(state, {
    ...state, renovationItems: replaceOrAdd(state.renovationItems, saved),
  }, today);
}

export function saveRenovationPayment(state, payment, today = renovationDate()) {
  assertState(state, today);
  const previous = state.renovationPayments.find(({ id }) => id === payment.id);
  if (previous && previous.itemId !== payment.itemId) {
    throw new RangeError("A payment cannot be moved to another item.");
  }
  return commitChange(state, {
    ...state,
    renovationPayments: replaceOrAdd(state.renovationPayments, structuredClone(payment)),
  }, today);
}

export function deleteRenovationPayment(state, paymentId, today = renovationDate()) {
  assertState(state, today);
  if (!state.renovationPayments.some(({ id }) => id === paymentId)) {
    throw new RangeError("The payment no longer exists.");
  }
  return commitChange(state, {
    ...state, renovationPayments: state.renovationPayments.filter(({ id }) => id !== paymentId),
  }, today);
}

export function deleteRenovationItem(state, itemId, today = renovationDate()) {
  assertState(state, today);
  findItem(state, itemId);
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
}
