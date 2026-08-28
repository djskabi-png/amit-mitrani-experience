import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const labels = {
  page_view: "צפיות בעמודים",
  youtube_click: "לחיצות על סרטונים",
  whatsapp_click: "לחיצות WhatsApp",
  phone_click: "לחיצות חיוג",
  email_click: "לחיצות אימייל",
  form_submit: "טפסים שנשלחו",
  button_click: "לחיצות על כפתורים",
  outbound_click: "יציאות לקישורים",
  scroll_depth: "עומק גלילה"
};
const el = (id) => document.querySelector(`#${id}`);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const dateKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const formatNumber = (value) => new Intl.NumberFormat("he-IL").format(value || 0);
const formatTime = (value) => value?.toDate ? new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(value.toDate()) : "—";
const groupCount = (items, keyFn) => items.reduce((map, item) => {
  const key = keyFn(item) || "לא ידוע";
  map.set(key, (map.get(key) || 0) + 1);
  return map;
}, new Map());
const sorted = (map) => [...map].sort((a, b) => b[1] - a[1]);

let initialized = false;
let events = [];
let previousEvents = [];
let detailFilter = null;
let currentRange = null;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
const rangeForDays = (days) => {
  const now = new Date();
  const end = endOfDay(now);
  const start = days === 0 ? startOfDay(now) : startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1));
  const duration = end - start;
  return { start, end, previousStart: new Date(start.getTime() - duration), previousEnd: start };
};
const percentChange = (current, previous) => {
  if (!previous) return current ? { text: "חדש", className: "up" } : { text: "ללא שינוי", className: "flat" };
  const value = Math.round(((current - previous) / previous) * 100);
  return { text: `${value >= 0 ? "+" : ""}${value}%`, className: value > 0 ? "up" : value < 0 ? "down" : "flat" };
};

const loadRange = async (range) => {
  currentRange = range;
  el("analytics-status").textContent = "טוען את הפעילות...";
  const q = query(
    collection(db, "analyticsEvents"),
    where("createdAt", ">=", Timestamp.fromDate(range.previousStart)),
    where("createdAt", "<", Timestamp.fromDate(range.end)),
    orderBy("createdAt", "desc"),
    limit(5000)
  );
  const snapshot = await getDocs(q);
  const all = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  events = all.filter((item) => item.createdAt?.toDate?.() >= range.start);
  previousEvents = all.filter((item) => {
    const date = item.createdAt?.toDate?.();
    return date && date >= range.previousStart && date < range.previousEnd;
  });
  detailFilter = null;
  render();
  el("analytics-status").textContent = snapshot.size >= 5000
    ? "מוצגות 5,000 הפעולות האחרונות בתקופה."
    : `${formatNumber(events.length)} פעולות בתקופה שנבחרה.`;
};

const metric = (type) => events.filter((item) => item.eventType === type).length;
const previousMetric = (type) => previousEvents.filter((item) => item.eventType === type).length;
const renderKpis = () => {
  const items = [
    ["page_view", "צפיות", "כמה פעמים עמודים נפתחו"],
    ["youtube_click", "סרטונים", "לחיצות או הפעלות YouTube"],
    ["whatsapp_click", "WhatsApp", "לחיצות לפתיחת שיחה"],
    ["form_submit", "טפסים", "טפסים תקינים שנשלחו"],
    ["phone_click", "חיוג", "לחיצות על מספר הטלפון"]
  ];
  el("analytics-kpis").innerHTML = items.map(([type, title, hint]) => {
    const current = metric(type);
    const change = percentChange(current, previousMetric(type));
    return `<button class="analytics-kpi" type="button" data-detail-type="${type}"><span>${title}</span><strong>${formatNumber(current)}</strong><small class="${change.className}">${change.text} מול התקופה הקודמת</small><em>${hint}</em></button>`;
  }).join("");
};

const ranking = (targetId, rows, kind, emptyText) => {
  const max = rows[0]?.[1] || 1;
  el(targetId).innerHTML = rows.length ? rows.slice(0, 8).map(([name, count]) => `
    <button class="ranking-row" type="button" data-detail-kind="${kind}" data-detail-value="${escapeHtml(name)}">
      <span><strong>${escapeHtml(name)}</strong><i style="--bar:${Math.max(5, Math.round((count / max) * 100))}%"></i></span><b>${formatNumber(count)}</b>
    </button>`).join("") : `<p class="analytics-empty">${emptyText}</p>`;
};

const renderChart = () => {
  const byDay = groupCount(events, (item) => dateKey(item.createdAt?.toDate?.() || new Date()));
  const days = [];
  for (let day = new Date(currentRange.start); day < currentRange.end; day.setDate(day.getDate() + 1)) days.push(new Date(day));
  const max = Math.max(1, ...days.map((day) => byDay.get(dateKey(day)) || 0));
  el("analytics-chart").innerHTML = days.map((day) => {
    const key = dateKey(day);
    const count = byDay.get(key) || 0;
    return `<button class="chart-day" type="button" data-detail-kind="day" data-detail-value="${key}" aria-label="${key}: ${count} פעולות"><span style="--height:${Math.max(count ? 8 : 2, Math.round((count / max) * 100))}%"></span><b>${formatNumber(count)}</b><small>${new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" }).format(day)}</small></button>`;
  }).join("");
};

const renderDetail = () => {
  let visible = events;
  let title = "כל הפעולות";
  if (detailFilter?.type === "eventType") {
    visible = events.filter((item) => item.eventType === detailFilter.value);
    title = labels[detailFilter.value] || detailFilter.value;
  } else if (detailFilter?.type === "page") {
    visible = events.filter((item) => item.pagePath === detailFilter.value);
    title = detailFilter.value;
  } else if (detailFilter?.type === "video") {
    visible = events.filter((item) => item.videoId === detailFilter.value);
    title = `סרטון ${detailFilter.value}`;
  } else if (detailFilter?.type === "source") {
    visible = events.filter((item) => item.source === detailFilter.value);
    title = `מקור: ${detailFilter.value}`;
  } else if (detailFilter?.type === "day") {
    visible = events.filter((item) => dateKey(item.createdAt?.toDate?.() || new Date(0)) === detailFilter.value);
    title = `פעילות בתאריך ${detailFilter.value}`;
  }
  el("analytics-detail-title").textContent = title;
  el("analytics-detail").innerHTML = visible.length ? visible.slice(0, 120).map((item) => `
    <article class="detail-event">
      <div><strong>${escapeHtml(labels[item.eventType] || item.eventType)}</strong><span>${escapeHtml(item.pagePath)}</span></div>
      <div><span>${escapeHtml(item.targetLabel || item.videoId || item.source || "")}</span><time>${formatTime(item.createdAt)}</time></div>
    </article>`).join("") : '<p class="analytics-empty">אין פעולות בסינון הזה.</p>';
};

const render = () => {
  renderKpis();
  renderChart();
  ranking("analytics-pages", sorted(groupCount(events.filter((item) => item.eventType === "page_view"), (item) => item.pagePath)), "page", "עדיין אין צפיות בתקופה הזאת.");
  ranking("analytics-videos", sorted(groupCount(events.filter((item) => item.eventType === "youtube_click"), (item) => item.videoId || item.targetLabel)), "video", "עדיין אין לחיצות על סרטונים.");
  ranking("analytics-actions", sorted(groupCount(events.filter((item) => item.eventType !== "page_view"), (item) => labels[item.eventType] || item.eventType)), "event-label", "עדיין אין פעולות בתקופה הזאת.");
  ranking("analytics-sources", sorted(groupCount(events.filter((item) => item.eventType === "page_view"), (item) => item.source)), "source", "עדיין אין מקורות תנועה.");
  el("analytics-range-label").textContent = `${new Intl.DateTimeFormat("he-IL", { dateStyle: "short" }).format(currentRange.start)}–${new Intl.DateTimeFormat("he-IL", { dateStyle: "short" }).format(new Date(currentRange.end.getTime() - 1))}`;
  renderDetail();
};

const bindClicks = () => {
  document.querySelectorAll("[data-days]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-days]").forEach((item) => item.classList.toggle("active", item === button));
    const custom = button.dataset.days === "custom";
    el("analytics-custom-range").hidden = !custom;
    if (!custom) loadRange(rangeForDays(Number(button.dataset.days))).catch(showError);
  }));
  el("analytics-custom-range").addEventListener("submit", (event) => {
    event.preventDefault();
    const start = startOfDay(new Date(`${el("analytics-from").value}T00:00:00`));
    const end = endOfDay(new Date(`${el("analytics-to").value}T00:00:00`));
    const duration = end - start;
    loadRange({ start, end, previousStart: new Date(start - duration), previousEnd: start }).catch(showError);
  });
  document.addEventListener("click", (event) => {
    const typeButton = event.target.closest("[data-detail-type]");
    const row = event.target.closest("[data-detail-kind]");
    if (typeButton) detailFilter = { type: "eventType", value: typeButton.dataset.detailType };
    else if (row) {
      const kind = row.dataset.detailKind;
      const value = row.dataset.detailValue;
      if (kind === "event-label") detailFilter = { type: "eventType", value: Object.keys(labels).find((key) => labels[key] === value) || value };
      else detailFilter = { type: kind, value };
    } else return;
    renderDetail();
    el("analytics-detail-title").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  el("analytics-clear-detail").addEventListener("click", () => { detailFilter = null; renderDetail(); });
};

const showError = (error) => {
  console.error(error);
  el("analytics-status").textContent = "לא הצלחנו לטעון את הנתונים. נסו לרענן את העמוד.";
};

export const startAnalytics = () => {
  if (initialized) return;
  initialized = true;
  const today = dateKey(new Date());
  el("analytics-from").value = today;
  el("analytics-to").value = today;
  bindClicks();
  loadRange(rangeForDays(0)).catch(showError);
};
