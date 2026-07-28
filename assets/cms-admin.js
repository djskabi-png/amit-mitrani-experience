import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const mediaLibrary = [
  "amit-cards-1200.webp",
  "amit-golden-1600.webp",
  "amit-golden-800.webp",
  "amit-headshot-720.webp",
  "amit-mentalism-1200.webp",
  "amit-thinking-1200.webp",
  "amit-time-machine-700.webp",
  "cubes-amit-1200.webp",
  "cubes-amit-720.webp",
  "hero-amit-1200.webp",
  "hero-amit-720.webp",
  "invitation-abroad-1200.webp",
  "invitation-corporate-1200.webp",
  "invitation-elegant-1200.webp",
  "invitation-family-1200.webp",
  "invitation-honoree-1200.webp",
  "invitation-kids-1200.webp",
  "invitation-mitzvah-1200.webp",
  "invitation-reception-1200.webp",
  "invitation-wedding-1200.webp",
  "pizza-party-900.webp"
].map((name) => `/assets/optimized/${name}`);

const extraEditablePages = [
  "/magic-courses.html",
  "/en/legal.html",
  "/en/online-magic-courses.html",
  "/fr/cours-magie-en-ligne.html",
  "/fr/legal.html",
  "/ru/legal.html",
  "/ru/onlain-kursy-fokusov.html"
];

const kindLabels = {
  meta: "קידום וחיפוש",
  text: "טקסט",
  image: "תמונה",
  video: "סרטון",
  link: "קישור"
};

const pageSelect = document.querySelector("#cms-page-select");
const fieldSearch = document.querySelector("#cms-field-search");
const fieldList = document.querySelector("#cms-field-list");
const editorEmpty = document.querySelector("#cms-editor-empty");
const editorFields = document.querySelector("#cms-editor-fields");
const fieldKind = document.querySelector("#cms-field-kind");
const fieldTitle = document.querySelector("#cms-field-title");
const changeCount = document.querySelector("#cms-change-count");
const resetFieldButton = document.querySelector("#cms-reset-field");
const rollbackButton = document.querySelector("#cms-rollback");
const saveButton = document.querySelector("#cms-save");
const cmsStatus = document.querySelector("#cms-status");
const preview = document.querySelector("#cms-preview");
const previewTitle = document.querySelector("#cms-preview-title");
const openPage = document.querySelector("#cms-open-page");
const contentView = document.querySelector("#content-view");
const crmView = document.querySelector("#crm-view");

let initialized = false;
let fields = [];
let selectedFieldId = "";
let currentPagePath = "/";
let publishedOverrides = {};
let draftOverrides = {};
let previousPayload = "";

const clone = (value) => JSON.parse(JSON.stringify(value || {}));
const pageId = (path) => encodeURIComponent(path).replaceAll("%", "_");
const contentRef = (path = currentPagePath) => doc(db, "siteContent", pageId(path));
const isDirty = () => JSON.stringify(draftOverrides) !== JSON.stringify(publishedOverrides);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[character]));

const setStatus = (message = "", type = "") => {
  cmsStatus.textContent = message;
  cmsStatus.className = `cms-status${type ? ` ${type}` : ""}`;
};

const pageLabel = (path) => {
  if (path === "/") return "עמוד הבית בעברית";
  const clean = decodeURIComponent(path).replace(/^\/|\/$/g, "").replace(/\.html$/i, "");
  const labels = {
    en: "עמוד הבית באנגלית",
    fr: "עמוד הבית בצרפתית",
    ru: "עמוד הבית ברוסית"
  };
  if (labels[clean]) return labels[clean];
  return clean.replaceAll("-", " ").replaceAll("/", " · ");
};

const loadPages = async () => {
  const response = await fetch("sitemap.xml", { cache: "no-store" });
  if (!response.ok) throw new Error("רשימת העמודים לא נטענה.");
  const xml = new DOMParser().parseFromString(await response.text(), "application/xml");
  const paths = [...xml.querySelectorAll("loc")]
    .map((item) => new URL(item.textContent.trim()).pathname)
    .map((path) => path.endsWith("/index.html") ? path.slice(0, -"index.html".length) || "/" : path)
    .filter((path) => path !== "/admin.html");
  const unique = [...new Set(["/", ...paths, ...extraEditablePages])].sort((a, b) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    return a.localeCompare(b);
  });
  pageSelect.innerHTML = unique
    .map((path) => `<option value="${escapeHtml(path)}">${escapeHtml(pageLabel(path))}</option>`)
    .join("");
};

const waitForPreviewApi = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (preview.contentWindow?.AmitCMS) return preview.contentWindow.AmitCMS;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("עורך התוכן לא נטען בתצוגה המקדימה.");
};

const loadPublishedOverrides = async () => {
  const snapshot = await getDoc(contentRef());
  const data = snapshot.exists() ? snapshot.data() : {};
  previousPayload = typeof data.previousPayload === "string" ? data.previousPayload : "";
  try {
    publishedOverrides = data.payload ? JSON.parse(data.payload) : {};
  } catch {
    publishedOverrides = {};
  }
  draftOverrides = clone(publishedOverrides);
  rollbackButton.disabled = !previousPayload;
};

const fieldCurrentValue = (field) => {
  const override = draftOverrides[field.id];
  if (!override) return field.value ?? field.src ?? field.href ?? "";
  return override.value ?? override.src ?? override.href ?? "";
};

const renderFieldList = () => {
  const term = fieldSearch.value.trim().toLowerCase();
  const visible = fields.filter((field) => {
    const haystack = [
      kindLabels[field.kind],
      field.label,
      field.value,
      field.src,
      field.href,
      field.alt,
      field.title
    ].join(" ").toLowerCase();
    return !term || haystack.includes(term);
  });

  if (!visible.length) {
    fieldList.innerHTML = '<p class="empty">לא נמצאו שדות בחיפוש הזה.</p>';
    return;
  }

  fieldList.innerHTML = visible.map((field) => {
    const current = fieldCurrentValue(field);
    return `
      <button class="cms-field-button ${field.id === selectedFieldId ? "active" : ""}" type="button" data-cms-field-id="${escapeHtml(field.id)}">
        <small>${kindLabels[field.kind] || "תוכן"}</small>
        <strong>${escapeHtml(field.label || "שדה תוכן")}</strong>
        <span>${escapeHtml(current || "ללא תוכן")}</span>
      </button>
    `;
  }).join("");

  fieldList.querySelectorAll("[data-cms-field-id]").forEach((button) => {
    button.addEventListener("click", () => selectField(button.dataset.cmsFieldId));
  });
};

const updateButtons = () => {
  const changedIds = new Set([...Object.keys(publishedOverrides), ...Object.keys(draftOverrides)]);
  const changed = [...changedIds].filter((id) => JSON.stringify(publishedOverrides[id]) !== JSON.stringify(draftOverrides[id]));
  changeCount.textContent = changed.length ? `${changed.length} שינויים שטרם פורסמו` : "אין שינויים";
  changeCount.classList.toggle("changed", Boolean(changed.length));
  saveButton.disabled = !isDirty();
  resetFieldButton.disabled = !selectedFieldId || !draftOverrides[selectedFieldId];
};

const highlightField = (field) => {
  const frameDocument = preview.contentDocument;
  if (!frameDocument || field.kind === "meta") return;
  let style = frameDocument.querySelector("#amit-cms-highlight-style");
  if (!style) {
    style = frameDocument.createElement("style");
    style.id = "amit-cms-highlight-style";
    style.textContent = ".amit-cms-highlight{outline:4px solid #f1c361!important;outline-offset:5px!important;box-shadow:0 0 0 8px rgba(241,195,97,.18)!important}";
    frameDocument.head.append(style);
  }
  frameDocument.querySelectorAll(".amit-cms-highlight").forEach((item) => item.classList.remove("amit-cms-highlight"));
  const target = frameDocument.querySelector(field.selector);
  if (target) {
    target.classList.add("amit-cms-highlight");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};

const entryFromField = (field, values) => {
  const base = { kind: field.kind, selector: field.selector };
  if (field.kind === "text") return { ...base, textIndex: field.textIndex, value: values.value.slice(0, 12000) };
  if (field.kind === "meta") return { ...base, value: values.value.slice(0, field.selector === "title" ? 180 : 500) };
  if (field.kind === "image") return { ...base, src: values.src.trim(), alt: values.alt.trim().slice(0, 300) };
  if (field.kind === "video") return { ...base, src: values.src.trim(), title: values.title.trim().slice(0, 300) };
  if (field.kind === "link") return { ...base, href: values.href.trim() };
  return base;
};

const applyDraftToPreview = () => {
  preview.contentWindow?.AmitCMS?.applyOverrides(draftOverrides);
  renderFieldList();
  updateButtons();
};

const bindEditorInput = (field) => {
  const update = () => {
    if (field.kind === "text" || field.kind === "meta") {
      draftOverrides[field.id] = entryFromField(field, {
        value: editorFields.querySelector("[name='value']").value
      });
    } else if (field.kind === "image") {
      draftOverrides[field.id] = entryFromField(field, {
        src: editorFields.querySelector("[name='src']").value,
        alt: editorFields.querySelector("[name='alt']").value
      });
    } else if (field.kind === "video") {
      draftOverrides[field.id] = entryFromField(field, {
        src: editorFields.querySelector("[name='src']").value,
        title: editorFields.querySelector("[name='title']").value
      });
    } else if (field.kind === "link") {
      draftOverrides[field.id] = entryFromField(field, {
        href: editorFields.querySelector("[name='href']").value
      });
    }
    setStatus("התצוגה המקדימה עודכנה. כדי לפרסם באתר יש ללחוץ על שמירה ופרסום.");
    applyDraftToPreview();
  };

  editorFields.querySelectorAll("input, textarea").forEach((control) => {
    control.addEventListener("input", update);
  });

  editorFields.querySelectorAll("[data-media-src]").forEach((button) => {
    button.addEventListener("click", () => {
      editorFields.querySelector("[name='src']").value = button.dataset.mediaSrc;
      update();
      renderEditor(field);
    });
  });
};

const renderEditor = (field) => {
  const override = draftOverrides[field.id] || {};
  editorEmpty.hidden = true;
  editorFields.hidden = false;
  fieldKind.textContent = kindLabels[field.kind] || "שדה תוכן";
  fieldTitle.textContent = field.label || "עריכת שדה";

  if (field.kind === "text" || field.kind === "meta") {
    const value = override.value ?? field.value ?? "";
    editorFields.innerHTML = `
      <div class="cms-field-control">
        <label for="cms-value">${field.kind === "meta" ? "תוכן השדה" : "הטקסט שיופיע באתר"}</label>
        <textarea class="control" id="cms-value" name="value" maxlength="${field.kind === "meta" ? 500 : 12000}">${escapeHtml(value)}</textarea>
        <p class="cms-field-help">מומלץ לשמור על ניסוח קצר וברור. השינוי מוצג מיד בתצוגה המקדימה.</p>
      </div>
    `;
  } else if (field.kind === "image") {
    const src = override.src ?? field.src ?? "";
    const alt = override.alt ?? field.alt ?? "";
    editorFields.innerHTML = `
      <div class="cms-field-control">
        <label for="cms-src">כתובת התמונה</label>
        <input class="control" id="cms-src" name="src" value="${escapeHtml(src)}" placeholder="https://... או /assets/...">
        <p class="cms-field-help">אפשר להדביק כתובת מאובטחת או לבחור תמונה קיימת מהספרייה.</p>
      </div>
      <div class="cms-field-control">
        <label for="cms-alt">תיאור התמונה לנגישות</label>
        <input class="control" id="cms-alt" name="alt" value="${escapeHtml(alt)}" maxlength="300">
      </div>
      <div class="cms-field-control">
        <label>ספריית התמונות הקיימת</label>
        <div class="cms-media-library">
          ${mediaLibrary.map((url) => `
            <button class="cms-media-option ${url === src ? "selected" : ""}" type="button" data-media-src="${url}">
              <img src="${url}" alt="">
              <span>${url.split("/").pop()}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  } else if (field.kind === "video") {
    const src = override.src ?? field.src ?? "";
    const title = override.title ?? field.title ?? "";
    editorFields.innerHTML = `
      <div class="cms-field-control">
        <label for="cms-src">כתובת הסרטון</label>
        <input class="control" id="cms-src" name="src" value="${escapeHtml(src)}" placeholder="קישור לסרטון ביוטיוב או Vimeo">
        <p class="cms-field-help">אפשר להדביק קישור רגיל מיוטיוב, סרטון קצר או Vimeo. המערכת תמיר אותו לנגן מאובטח.</p>
      </div>
      <div class="cms-field-control">
        <label for="cms-title">תיאור הסרטון לנגישות</label>
        <input class="control" id="cms-title" name="title" value="${escapeHtml(title)}" maxlength="300">
      </div>
    `;
  } else if (field.kind === "link") {
    const href = override.href ?? field.href ?? "";
    editorFields.innerHTML = `
      <div class="cms-field-control">
        <label for="cms-href">יעד הקישור</label>
        <input class="control" id="cms-href" name="href" value="${escapeHtml(href)}" placeholder="https://... או קישור פנימי">
        <p class="cms-field-help">בדקו שהכתובת נכונה לפני הפרסום. טקסט הקישור נערך כשדה טקסט נפרד.</p>
      </div>
    `;
  }

  bindEditorInput(field);
  updateButtons();
};

const selectField = (id) => {
  const field = fields.find((item) => item.id === id);
  if (!field) return;
  selectedFieldId = id;
  renderFieldList();
  renderEditor(field);
  highlightField(field);
};

const loadPage = async (path) => {
  currentPagePath = path;
  selectedFieldId = "";
  fieldList.innerHTML = '<p class="empty">טוען את שדות העמוד...</p>';
  editorEmpty.hidden = false;
  editorFields.hidden = true;
  editorFields.innerHTML = "";
  fieldKind.textContent = "שדה תוכן";
  fieldTitle.textContent = "בחרו שדה לעריכה";
  setStatus("טוען את העמוד ואת התוכן שפורסם...");
  saveButton.disabled = true;
  resetFieldButton.disabled = true;

  await loadPublishedOverrides();
  const separator = path.includes("?") ? "&" : "?";
  preview.src = `${path}${separator}cmsPreview=1&cache=${Date.now()}`;
  openPage.href = path;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("העמוד לא נטען בזמן.")), 12000);
    preview.addEventListener("load", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

  const api = await waitForPreviewApi();
  fields = api.scanEditableFields();
  previewTitle.textContent = preview.contentDocument.title || pageLabel(path);
  renderFieldList();
  updateButtons();
  setStatus(`${fields.length} שדות זמינים לעריכה בעמוד הזה.`, "success");
};

const saveChanges = async () => {
  if (!isDirty()) return;
  saveButton.disabled = true;
  setStatus("שומר ומפרסם את השינויים...");
  try {
    const currentPayload = JSON.stringify(publishedOverrides);
    const nextPayload = JSON.stringify(draftOverrides);
    if (nextPayload.length > 850000) throw new Error("העמוד מכיל יותר מדי תוכן לשמירה אחת.");
    await setDoc(contentRef(), {
      pagePath: currentPagePath,
      payload: nextPayload,
      previousPayload: currentPayload,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.email || ""
    });
    previousPayload = currentPayload;
    publishedOverrides = clone(draftOverrides);
    rollbackButton.disabled = false;
    updateButtons();
    setStatus("השינויים נשמרו ופורסמו באתר.", "success");
  } catch (error) {
    console.error(error);
    setStatus("השמירה נכשלה. לא פורסם שינוי. בדקו את החיבור ונסו שוב.", "error");
    updateButtons();
  }
};

const resetSelectedField = async () => {
  if (!selectedFieldId || !draftOverrides[selectedFieldId]) return;
  delete draftOverrides[selectedFieldId];
  setStatus("השדה אופס לגרסת הקוד. השינוי עדיין לא פורסם.");
  await reloadPreview();
};

const rollback = async () => {
  if (!previousPayload) return;
  rollbackButton.disabled = true;
  setStatus("מחזיר לפרסום הקודם...");
  try {
    const currentPayload = JSON.stringify(publishedOverrides);
    await setDoc(contentRef(), {
      pagePath: currentPagePath,
      payload: previousPayload,
      previousPayload: currentPayload,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.email || ""
    });
    const restored = previousPayload;
    previousPayload = currentPayload;
    publishedOverrides = restored ? JSON.parse(restored) : {};
    draftOverrides = clone(publishedOverrides);
    await reloadPreview();
    setStatus("הפרסום הקודם הוחזר.", "success");
  } catch (error) {
    console.error(error);
    setStatus("החזרה נכשלה ולא בוצע שינוי.", "error");
  } finally {
    rollbackButton.disabled = !previousPayload;
  }
};

const reloadPreview = async () => {
  const selected = selectedFieldId;
  await loadPage(currentPagePath);
  if (selected && fields.some((field) => field.id === selected)) selectField(selected);
};

const bindViewTabs = () => {
  document.querySelectorAll("[data-admin-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const contentSelected = button.dataset.adminView === "content";
      document.querySelectorAll("[data-admin-view]").forEach((item) => item.classList.toggle("active", item === button));
      contentView.hidden = !contentSelected;
      crmView.hidden = contentSelected;
    });
  });
};

export const startCms = async () => {
  if (initialized) return;
  initialized = true;
  bindViewTabs();
  fieldSearch.addEventListener("input", renderFieldList);
  pageSelect.addEventListener("change", () => loadPage(pageSelect.value).catch(handleLoadError));
  saveButton.addEventListener("click", saveChanges);
  resetFieldButton.addEventListener("click", resetSelectedField);
  rollbackButton.addEventListener("click", rollback);

  try {
    await loadPages();
    await loadPage("/");
  } catch (error) {
    handleLoadError(error);
  }
};

window.startAmitCms = startCms;

const handleLoadError = (error) => {
  console.error(error);
  setStatus("עורך התוכן לא נטען. רעננו את העמוד ונסו שוב.", "error");
  fieldList.innerHTML = '<p class="empty">לא הצלחנו לטעון את שדות העמוד.</p>';
};
