// Small dependency-free SVG charts. Colours come from CSS classes (s1..s4), so dark mode just works.
import { money } from "./format.js";

const NS = "http://www.w3.org/2000/svg";

function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

const trim = (value) => String(Math.round(value * 10) / 10);

// 1200 -> 1.2k, 2500000 -> 2.5M
export function compact(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}k`;
  return `${sign}${Math.round(abs)}`;
}

// Round, evenly spaced axis values that cover [min, max].
export function niceTicks(min, max, target = 4) {
  let low = min;
  let high = max;
  if (!(high > low)) {
    low = Math.min(0, low);
    high = Math.max(low + 1, high);
  }
  const raw = (high - low) / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  const first = Math.floor(low / step) * step;
  const last = Math.ceil(high / step) * step;
  const ticks = [];
  for (let value = first; value <= last + step / 2; value += step) ticks.push(Math.round(value * 1e6) / 1e6);
  return { ticks, min: ticks[0], max: ticks.at(-1) };
}

// A handful of evenly spread positions, always including the first and last.
export function spreadIndexes(count, wanted) {
  if (count <= wanted) return Array.from({ length: count }, (_, index) => index);
  const picked = new Set();
  for (let slot = 0; slot < wanted; slot += 1) picked.add(Math.round((slot * (count - 1)) / (wanted - 1)));
  return [...picked];
}

const W = 360;
const H = 180;
const M = { left: 44, right: 10, top: 12, bottom: 22 };

function frame(label) {
  return svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": label });
}

function axes(root, ticks, yOf) {
  for (const tick of ticks) {
    const y = yOf(tick);
    root.append(
      svg("line", { x1: M.left, x2: W - M.right, y1: y, y2: y, class: tick === 0 ? "zero" : "grid" }),
      svg("text", { x: M.left - 6, y: y + 3, "text-anchor": "end" }, compact(tick)),
    );
  }
}

function xLabels(root, count, xOf, label, wanted) {
  const picks = spreadIndexes(count, wanted);
  picks.forEach((index, order) => {
    const anchor = order === 0 ? "start" : order === picks.length - 1 && picks.length > 1 ? "end" : "middle";
    root.append(svg("text", { x: xOf(index), y: H - 6, "text-anchor": anchor }, label(index)));
  });
}

// series: [{ name, values, className }]. band: { upper, lower } are indexes into series.
export function lineChart({ labels, series, band, markIndex, includeZero = false, points = false, xLabel = (i) => labels[i], label }) {
  const root = frame(label);
  const all = series.flatMap((item) => item.values);
  let low = Math.min(...all);
  let high = Math.max(...all);
  if (includeZero || low < 0) {
    low = Math.min(low, 0);
    high = Math.max(high, 0);
  }
  const { ticks, min, max } = niceTicks(low, high);
  const count = labels.length;
  const xOf = (index) => (count === 1 ? (M.left + W - M.right) / 2 : M.left + (index * (W - M.left - M.right)) / (count - 1));
  const yOf = (value) => M.top + ((max - value) / (max - min)) * (H - M.top - M.bottom);
  axes(root, ticks, yOf);

  const path = (values) => values.map((value, index) => `${index === 0 ? "M" : "L"}${xOf(index).toFixed(1)} ${yOf(value).toFixed(1)}`).join(" ");
  if (band) {
    const upper = series[band.upper].values;
    const lower = series[band.lower].values;
    const down = lower.map((value, index) => `L${xOf(index).toFixed(1)} ${yOf(value).toFixed(1)}`).reverse().join(" ");
    root.append(svg("path", { d: `${path(upper)} ${down} Z`, class: "band" }));
  }
  for (const item of series) root.append(svg("path", { d: path(item.values), class: `line ${item.className}` }));
  if (markIndex !== undefined && markIndex >= 0 && markIndex < count) {
    const x = xOf(markIndex);
    root.append(svg("line", { x1: x, x2: x, y1: M.top, y2: H - M.bottom, class: "mark" }));
  }
  if (points && count <= 36) {
    for (const item of series) {
      item.values.forEach((value, index) => {
        const dot = svg("circle", { cx: xOf(index), cy: yOf(value), r: 3, class: `pt ${item.className}` });
        dot.append(svg("title", {}, `${labels[index]} · ${item.name}: ${money.format(value)}`));
        root.append(dot);
      });
    }
  }
  xLabels(root, count, xOf, xLabel, 4);
  return root;
}

// stacks: [{ name, values, className }] stacked bottom to top, one bar per label.
export function stackedBars({ labels, stacks, label }) {
  const root = frame(label);
  const totals = labels.map((_, index) => stacks.reduce((total, stack) => total + stack.values[index], 0));
  const { ticks, max } = niceTicks(0, Math.max(...totals));
  const innerWidth = W - M.left - M.right;
  const slot = innerWidth / labels.length;
  const barWidth = Math.max(2, slot * 0.7);
  const yOf = (value) => M.top + ((max - value) / max) * (H - M.top - M.bottom);
  axes(root, ticks, yOf);
  const xOf = (index) => M.left + slot * index + slot / 2;
  labels.forEach((name, index) => {
    let base = 0;
    for (const stack of stacks) {
      const value = stack.values[index];
      if (value <= 0) continue;
      const top = yOf(base + value);
      const bar = svg("rect", { x: xOf(index) - barWidth / 2, y: top, width: barWidth, height: yOf(base) - top, class: `bar ${stack.className}` });
      bar.append(svg("title", {}, `${name} · ${stack.name}: ${money.format(value)}`));
      root.append(bar);
      base += value;
    }
  });
  xLabels(root, labels.length, xOf, (index) => labels[index], 5);
  return root;
}

// items: [{ low, high, actual, kind }]: the estimate as a bar, the real figure as a dot.
export function rangeDots({ labels, items, label }) {
  const root = frame(label);
  const { ticks, max } = niceTicks(0, Math.max(...items.flatMap((item) => [item.high, item.actual])));
  const slot = (W - M.left - M.right) / items.length;
  const yOf = (value) => M.top + ((max - value) / max) * (H - M.top - M.bottom);
  axes(root, ticks, yOf);
  const xOf = (index) => M.left + slot * index + slot / 2;
  items.forEach((item, index) => {
    const group = svg("g");
    group.append(
      svg("rect", { x: xOf(index) - 7, y: yOf(item.high), width: 14, height: Math.max(2, yOf(item.low) - yOf(item.high)), rx: 4, class: "range" }),
      svg("circle", { cx: xOf(index), cy: yOf(item.actual), r: 5, class: `dot ${item.kind}` }),
      svg("title", {}, `${labels[index]} · spent ${money.format(item.actual)} · estimate ${money.format(item.low)} – ${money.format(item.high)}`),
    );
    root.append(group);
  });
  xLabels(root, items.length, xOf, (index) => labels[index], 6);
  return root;
}

// A single bar split into shares. segments: [{ value, className }]
export function segmentBar(segments, label) {
  const root = svg("svg", { viewBox: "0 0 100 8", preserveAspectRatio: "none", class: "segbar", role: "img", "aria-label": label });
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let x = 0;
  for (const segment of segments) {
    const width = total > 0 ? (segment.value / total) * 100 : 0;
    if (width > 0) root.append(svg("rect", { x, y: 0, width, height: 8, class: `seg ${segment.className}` }));
    x += width;
  }
  return root;
}

// A thin horizontal bar, 0..1 full.
export function meterBar(share, className) {
  const root = svg("svg", { viewBox: "0 0 100 6", preserveAspectRatio: "none", class: "meter", "aria-hidden": "true" });
  root.append(
    svg("rect", { x: 0, y: 0, width: 100, height: 6, class: "track" }),
    svg("rect", { x: 0, y: 0, width: Math.max(0, Math.min(1, share)) * 100, height: 6, class: `seg ${className}` }),
  );
  return root;
}
