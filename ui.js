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
  action?.focus();
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
