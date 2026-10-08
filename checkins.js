import { checkInGap, isActiveIn, lifestyleMonthlyCost, recordCheckIn } from "./calc.js";
import { currentMonth, money, monthLabel, range } from "./format.js";
import { MAX_AMOUNT, MAX_ITEMS, isMonth, isValidCheckIn } from "./rules.js";

const byId = (id) => document.getElementById(id);

export function setupCheckIns({ getState, commit }) {
  const form = byId("checkin-form");
  const field = (name) => form.elements.namedItem(name);
  const table = byId("checkin-table");
  const body = byId("checkin-body");
  const emptyMessage = byId("checkin-empty");
  const noLifestyle = byId("checkin-no-lifestyle");
  const hint = byId("checkin-hint");
  const submit = byId("checkin-submit");

  field("month").value = currentMonth();
  field("actual").max = MAX_AMOUNT;

  const selectedItem = () => getState().lifestyle.find((item) => item.id === field("item").value);
  const existing = () =>
    getState().checkIns.find(
      (checkIn) => checkIn.month === field("month").value && checkIn.itemId === field("item").value,
    );

  function updateHint() {
    const item = selectedItem();
    if (!item) {
      hint.textContent = "";
      return;
    }
    const cost = lifestyleMonthlyCost(item);
    const parts = [`Estimate: ${range(cost.low, cost.high)} a month, spread evenly.`];
    if (item.everyMonths > 1) {
      parts.push(
        `This item is paid every ${item.everyMonths} months, so one month's spending will often differ from its monthly estimate.`,
      );
    }
    if (existing()) parts.push("Updating keeps the estimate this check-in was first compared against.");
    hint.textContent = parts.join(" ");
  }

  function syncForm() {
    field("month").setCustomValidity("");
    const found = existing();
    field("actual").value = found ? found.actual : "";
    submit.textContent = found ? "Update check-in" : "Save check-in";
    updateHint();
  }

  function gapText(checkIn) {
    const { kind, amount } = checkInGap(checkIn);
    if (kind === "within") return "Within estimate";
    return `${kind === "under" ? "Under" : "Over"} by ${money.format(amount)}`;
  }

  function remove(checkIn) {
    if (!confirm(`Delete the ${monthLabel(checkIn.month)} check-in for "${checkIn.name}"?`)) return;
    const remaining = getState().checkIns.filter(
      (other) => other.month !== checkIn.month || other.itemId !== checkIn.itemId,
    );
    commit({ ...getState(), checkIns: remaining });
    syncForm();
  }

  function buildRow(checkIn) {
    const row = document.createElement("tr");
    const month = document.createElement("th");
    month.scope = "row";
    month.textContent = monthLabel(checkIn.month);
    const cells = [
      checkIn.name,
      range(checkIn.low, checkIn.high),
      money.format(checkIn.actual),
      gapText(checkIn),
    ].map((text) => {
      const cell = document.createElement("td");
      cell.textContent = text;
      return cell;
    });
    const actions = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = "Delete";
    del.setAttribute("aria-label", `Delete the ${monthLabel(checkIn.month)} check-in for ${checkIn.name}`);
    del.addEventListener("click", () => remove(checkIn));
    actions.append(del);
    row.append(month, ...cells, actions);
    return row;
  }

  function render() {
    const { lifestyle, checkIns } = getState();
    // A tab left open across a month boundary must accept the new month.
    field("month").max = currentMonth();
    // The "not active" message depends on the items, and the browser blocks submit before we could clear it.
    field("month").setCustomValidity("");

    const previous = field("item").value;
    field("item").replaceChildren(
      ...lifestyle.map((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        return option;
      }),
    );
    if (lifestyle.some((item) => item.id === previous)) field("item").value = previous;
    // Only reset the typed amount when the selected item changed underneath it.
    if (field("item").value === previous) updateHint();
    else syncForm();

    noLifestyle.hidden = lifestyle.length > 0;
    form.hidden = lifestyle.length === 0;

    const sorted = [...checkIns].sort(
      (a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name),
    );
    body.replaceChildren(...sorted.map(buildRow));
    table.hidden = sorted.length === 0;
    emptyMessage.hidden = sorted.length > 0;
  }

  field("month").addEventListener("change", syncForm);
  field("item").addEventListener("change", syncForm);
  form.addEventListener("input", () => field("month").setCustomValidity(""));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const month = field("month");
    const item = selectedItem();
    month.setCustomValidity("");
    if (month.value && !isMonth(month.value)) {
      month.setCustomValidity("Use the format YYYY-MM, for example 2026-10.");
    } else if (month.value > currentMonth()) {
      month.setCustomValidity("Check-ins are for this month or an earlier one.");
    } else if (month.value && item && !isActiveIn(item, month.value)) {
      month.setCustomValidity("This item was not active in that month. Check its start and end months.");
    }
    if (!form.reportValidity()) return;

    const next = recordCheckIn(getState().checkIns, item, month.value, Number(field("actual").value));
    if (next.length > MAX_ITEMS) {
      month.setCustomValidity(`That would go over the limit of ${MAX_ITEMS} check-ins.`);
      form.reportValidity();
      return;
    }
    if (!next.every(isValidCheckIn)) {
      month.setCustomValidity("Some of these values are not valid. Check them and try again.");
      form.reportValidity();
      return;
    }

    commit({ ...getState(), checkIns: next });
    field("actual").value = "";
    syncForm();
    field("item").focus();
  });

  return { render, syncForm };
}
