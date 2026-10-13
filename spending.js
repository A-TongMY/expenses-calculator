import { lifestyleMonthlyCost, roundToSen, spendingTotals } from "./calc.js";
import { MAX_ITEMS, isDate, isMonth, isValidSpending } from "./rules.js";

const entriesFrom = (state) => {
  if (!state || !Array.isArray(state.spending ?? [])) {
    throw new Error("Invalid Spending state.");
  }
  return state.spending ?? [];
};

const categoriesFrom = (state) => {
  if (!Array.isArray(state?.lifestyle)) throw new Error("Invalid Lifestyle state.");
  return state.lifestyle;
};

export function saveSpendingEntry(state, entry) {
  const spending = entriesFrom(state);
  const lifestyle = categoriesFrom(state);
  if (!isValidSpending(entry, lifestyle)) throw new Error("Invalid Spending entry.");

  const existingIndex = spending.findIndex(({ id }) => id === entry.id);
  if (existingIndex === -1 && spending.length >= MAX_ITEMS) {
    throw new Error(`Spending is limited to ${MAX_ITEMS} entries.`);
  }

  const nextSpending = [...spending];
  if (existingIndex === -1) nextSpending.push(entry);
  else nextSpending[existingIndex] = entry;
  return { ...state, spending: nextSpending };
}

export function deleteSpendingEntry(state, id) {
  const spending = entriesFrom(state);
  const existingIndex = spending.findIndex((entry) => entry.id === id);
  if (existingIndex === -1) throw new Error("Spending entry not found.");
  return {
    ...state,
    spending: spending.filter((entry) => entry.id !== id),
  };
}

export function assertLifestyleChangeAllowed(state, nextLifestyle) {
  const spending = entriesFrom(state);
  if (!Array.isArray(nextLifestyle)) throw new Error("Invalid Lifestyle state.");

  for (const entry of spending) {
    const item = nextLifestyle.find((category) => category?.id === entry.categoryId);
    if (!item) throw new Error("Spending entries still reference this Lifestyle category.");
    if (!isDate(entry.date) || !isValidSpending(entry, [item])) {
      throw new Error("A Lifestyle period change would make a Spending entry inactive.");
    }
  }
}

const daysInMonth = (month) => {
  const [year, number] = month.split("-").map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][number - 1];
};

export function spendingReport(state, month, categoryId = null) {
  if (!isMonth(month)) throw new Error("Invalid Spending report month.");
  const spending = entriesFrom(state);
  const lifestyle = categoriesFrom(state);
  const entries = spending
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) =>
        entry.date.slice(0, 7) === month &&
        (categoryId === null || entry.categoryId === categoryId),
    )
    .sort(
      (left, right) =>
        right.entry.date.localeCompare(left.entry.date) || left.index - right.index,
    )
    .map(({ entry }) => entry);
  const categoryTotals = spendingTotals(entries, month);
  const categories = [...categoryTotals].map(([id, amount]) => {
    const item = lifestyle.find((category) => category.id === id);
    if (!item) throw new Error("Spending entry references an unknown Lifestyle category.");
    return { id, name: item.name, amount };
  });
  categories.sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name));

  const total = roundToSen(entries.reduce((sum, entry) => sum + entry.amount, 0));
  return {
    month,
    entries,
    total,
    count: entries.length,
    average: roundToSen(total / daysInMonth(month)),
    categories,
  };
}

export function spendingComparisons(state) {
  const spending = entriesFrom(state);
  const lifestyle = categoriesFrom(state);
  const totals = new Map();

  for (const entry of spending) {
    const month = entry.date.slice(0, 7);
    let categoryTotals = totals.get(month);
    if (!categoryTotals) {
      categoryTotals = new Map();
      totals.set(month, categoryTotals);
    }
    categoryTotals.set(
      entry.categoryId,
      (categoryTotals.get(entry.categoryId) ?? 0) + entry.amount,
    );
  }

  const categoryOrder = new Map(lifestyle.map(({ id }, index) => [id, index]));
  const comparisons = [];
  for (const [month, categoryTotals] of totals) {
    for (const [itemId, amount] of categoryTotals) {
      const item = lifestyle.find((category) => category.id === itemId);
      if (!item) throw new Error("Spending entry references an unknown Lifestyle category.");
      const estimate = lifestyleMonthlyCost(item);
      comparisons.push({
        month,
        itemId,
        name: item.name,
        low: estimate.low,
        high: estimate.high,
        actual: roundToSen(amount),
      });
    }
  }
  comparisons.sort(
    (left, right) =>
      left.month.localeCompare(right.month) ||
      categoryOrder.get(left.itemId) - categoryOrder.get(right.itemId),
  );
  return comparisons;
}
