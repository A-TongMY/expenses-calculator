import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers/renovation-fixture.js";

const ui = await import("../renovation-ui.js").catch(() => null);

function harness() {
  let state = fixture();
  let commits = 0;
  const editor = ui.createRenovationEditor({
    getState: () => state,
    commit: (next) => { state = next; commits += 1; },
    newId: () => "new-item",
  });
  return { editor, get state() { return state; }, get commits() { return commits; } };
}

test("invalid staged edits preserve the draft without committing", () => {
  const context = harness();
  context.editor.start("cabinets");
  context.editor.setItem({ ...context.editor.snapshot().item, actualCost: 1000 });
  assert.throws(() => context.editor.save("2026-10-14"), /paid|cost|outstanding/i);
  assert.equal(context.commits, 0);
  assert.equal(context.editor.snapshot().item.actualCost, 1000);
  assert.equal(context.state.renovationItems[0].actualCost, 12000);
});

test("cancel discards drafts without changing canonical data", () => {
  const context = harness();
  context.editor.start("cabinets");
  context.editor.setItem({ ...context.editor.snapshot().item, name: "Draft name" });
  assert.equal(context.editor.isDirty(), true);
  context.editor.cancel();
  assert.equal(context.editor.snapshot(), null);
  assert.equal(context.commits, 0);
  assert.equal(context.state.renovationItems[0].name, "Cabinets");
});

test("new budget-only items use the same atomic editor", () => {
  const context = harness();
  context.editor.startNew("h1", "kitchen");
  assert.equal(context.commits, 0);
  context.editor.setItem({ ...context.editor.snapshot().item, name: "Painting", budget: 3000 });
  context.editor.save("2026-10-14");
  assert.equal(context.commits, 1);
  assert.equal(context.state.renovationItems[1].budget, 3000);
  assert.equal(context.state.renovationItems[1].actualCost, undefined);
  assert.equal(context.state.renovationPayments.length, 1);
});

test("snapshots cannot mutate the editor or committed state", () => {
  const context = harness();
  context.editor.start("cabinets");
  context.editor.snapshot().item.name = "External mutation";
  assert.equal(context.editor.snapshot().item.name, "Cabinets");
  assert.equal(context.editor.isDirty(), false);
});

test("an extra payment and plan reduction commit once", () => {
  const context = harness();
  context.editor.start("cabinets");
  const draft = context.editor.snapshot();
  context.editor.setPayments([...draft.payments, {
    id: "extra", itemId: "cabinets", date: "2026-10-14", amount: 1000, kind: "payment",
  }]);
  context.editor.setItem({
    ...draft.item, installmentPlan: { ...draft.item.installmentPlan, count: 9 },
  });
  context.editor.save("2026-10-14");
  assert.equal(context.commits, 1);
  assert.equal(context.state.renovationPayments.length, 2);
  assert.equal(context.state.renovationItems[0].installmentPlan.count, 9);
});

test("a thrown commit preserves the item draft", () => {
  const state = fixture();
  const editor = ui.createRenovationEditor({
    getState: () => state,
    commit: () => { throw new Error("commit unavailable"); },
    newId: () => "new",
  });
  editor.start("cabinets");
  editor.setItem({ ...editor.snapshot().item, name: "Changed" });
  assert.throws(() => editor.save("2026-10-14"), /commit unavailable/);
  assert.equal(editor.snapshot().item.name, "Changed");
});

test("unstaged payment edits are dirty and block saving without discarding the draft", () => {
  const context = harness();
  context.editor.start("cabinets");
  context.editor.setPaymentDirty(true);
  assert.equal(context.editor.isDirty(), true);
  assert.throws(() => context.editor.save("2026-10-14"), /stage|cancel.*payment/i);
  assert.equal(context.commits, 0);
  assert.equal(context.editor.snapshot().item.id, "cabinets");
});

test("staging or cancelling payment input clears only its pending status", () => {
  const context = harness();
  context.editor.start("cabinets");
  context.editor.setItem({ ...context.editor.snapshot().item, name: "Updated cabinets" });
  context.editor.setPaymentDirty(true);
  context.editor.setPaymentDirty(false);
  assert.equal(context.editor.isDirty(), true);
  context.editor.save("2026-10-14");
  assert.equal(context.commits, 1);
  assert.equal(context.state.renovationItems[0].name, "Updated cabinets");
});

test("cancelling an editor clears pending payment status for the next item", () => {
  const context = harness();
  context.editor.start("cabinets");
  context.editor.setPaymentDirty(true);
  context.editor.cancel();
  context.editor.start("cabinets");
  assert.equal(context.editor.isDirty(), false);
  context.editor.save("2026-10-14");
  assert.equal(context.commits, 1);
});

test("open draft category choices follow current names and stay house-specific", () => {
  const context = harness();
  context.editor.start("cabinets");
  context.editor.setItem({ ...context.editor.snapshot().item, name: "Unsaved cabinet draft" });
  context.state.renovationCategories[0].name = "Kitchen updated";
  context.state.houses.push({ ...context.state.houses[0], id: "h2", name: "House Two" });
  context.state.renovationCategories.push({ id: "other", houseId: "h2", name: "Kitchen" });
  assert.deepEqual(context.editor.categories(), [{ id: "kitchen", name: "Kitchen updated" }]);
  assert.equal(context.editor.snapshot().item.name, "Unsaved cabinet draft");
  assert.equal(context.editor.snapshot().item.categoryId, "kitchen");
});

test("cancelling an unfinished new item creates no canonical records", () => {
  const context = harness();
  context.editor.startNew("h1", "kitchen");
  context.editor.setItem({ ...context.editor.snapshot().item, name: "Unfinished", actualCost: 100 });
  context.editor.cancel();
  assert.equal(context.commits, 0);
  assert.equal(context.state.renovationItems.length, 1);
  assert.equal(context.state.renovationPayments.length, 1);
  assert.equal(context.editor.snapshot(), null);
});
