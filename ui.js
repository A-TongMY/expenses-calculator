// Small helpers shared by every page, so buttons, icons and panels look and behave the same everywhere.
const SVG_NS = "http://www.w3.org/2000/svg";

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Icons live once in the sprite at the top of index.html.
export function icon(name, className = "icon") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

export function iconButton({ name, label, className = "", onClick }) {
  const button = el("button", `icon-btn ${className}`.trim());
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(icon(name));
  button.addEventListener("click", onClick);
  return button;
}

// Turns an existing button into an icon-only button that keeps its accessible name.
export function setIconButton(button, name, label) {
  button.classList.add("icon-btn");
  button.setAttribute("aria-label", label);
  button.title = label;
  button.replaceChildren(icon(name));
  return button;
}

export function syncSelectOptions(select, options) {
  if (
    select.options.length === options.length &&
    options.every(({ value, label }, index) =>
      select.options[index].value === value && select.options[index].textContent === label)
  ) return;
  const previous = select.value;
  select.replaceChildren(...options.map(({ value, label }) => {
    const option = el("option", "", label);
    option.value = value;
    return option;
  }));
  if (options.some(({ value }) => value === previous)) select.value = previous;
}

export function focusRowAction(list, id, label) {
  const row = [...list.children].find((node) => node.dataset.id === id);
  const action = row && [...row.querySelectorAll("button")]
    .find((button) => button.getAttribute("aria-label") === label);
  action?.focus({ preventScroll: true });
}

export function cloneEntryForm(template) {
  const form = template.cloneNode(true);
  const cancel = form.querySelector('[data-role="cancel"], [id$="-cancel"]');
  form.removeAttribute("id");
  form.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  form.reset();
  form.hidden = false;
  form.classList.add("inline-editor");
  if (cancel) {
    cancel.hidden = false;
    cancel.dataset.action = "cancel";
  }
  return form;
}

export function formSnapshot(form) {
  return JSON.stringify([...form.elements].filter((node) => node.name)
    .map((node) => [node.name, node.value, node.checked]));
}

// A field that fails validation inside a closed "More options" opens it, so the browser can show and focus it.
export function revealInvalid(form) {
  form.addEventListener("invalid", (event) => {
    const panel = event.target.closest("details");
    if (panel && form.contains(panel)) panel.open = true;
  }, true);
}

// Opens "More options" only when one of its fields holds a value.
export function syncMoreOptions(form) {
  for (const panel of form.querySelectorAll("details.more")) {
    panel.open = [...panel.querySelectorAll("input, select, textarea")]
      .some((control) => control.type === "checkbox" ? control.checked : control.value !== "");
  }
}

export function discardForm(form, baseline) {
  return !form || formSnapshot(form) === baseline || confirm("Discard unsaved entry changes?");
}

export function keepViewport(operation) {
  const { scrollX, scrollY } = window;
  operation();
  window.scrollTo(scrollX, scrollY);
}

export function focusAction(node) {
  node?.focus({ preventScroll: true });
}

export function syncRows(list, items, build, retainedId = null) {
  const retained = [...list.children].find((node) => node.dataset.id === retainedId);
  const rows = items.map((item) => item.id === retainedId && retained ? retained : build(item));
  const wanted = new Set(rows);
  for (const child of [...list.children]) if (!wanted.has(child)) child.remove();
  rows.forEach((row, index) => {
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
  });
}

// Remembers which panels are open. Kept apart from the saved data, so backups never carry it.
const PANELS_KEY = "expenses-calculator:panels";

export function rememberPanels() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(PANELS_KEY)) ?? {};
  } catch {
    saved = {};
  }
  for (const panel of document.querySelectorAll("details[data-panel]")) {
    const key = panel.dataset.panel;
    if (typeof saved[key] === "boolean") panel.open = saved[key];
    panel.addEventListener("toggle", () => {
      saved[key] = panel.open;
      try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(saved));
      } catch {
        // Storage blocked: the panel simply forgets its state on reload.
      }
    });
  }
}
