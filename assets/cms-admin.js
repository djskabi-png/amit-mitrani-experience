import { auth, db, storage } from "./firebase-config.js";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {
  getDownloadURL,
  listAll,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

const baseMediaLibrary = [
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
].map((name) => ({ url: `/assets/optimized/${name}`, name, uploaded: false }));

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
  meta: "חיפוש ושיתוף",
  text: "טקסט",
  form: "טופס",
  image: "תמונה",
  video: "סרטון",
  link: "קישור"
};

const languageLabels = {
  he: "עברית",
  en: "אנגלית",
  fr: "צרפתית",
  ru: "רוסית"
};

const pageNames = {
  "/": "עמוד הבית",
  "/shows-for-kids.html": "מופעים לימי הולדת לילדים",
  "/shows-for-companies.html": "מופעים לחברות",
  "/shows-for-families.html": "מופעים למשפחות",
  "/shows-for-institutions.html": "מופעים למוסדות",
  "/mentalist-adult-parties.html": "מופעי מנטליזם למבוגרים",
  "/business-magic.html": "קסמים לעסקים ולמותגים",
  "/close-up-magic-receptions.html": "קסמי קבלת פנים",
  "/magic-courses.html": "קורסי קסמים",
  "/magician-purim-events.html": "אירועי פורים",
  "/magician-bar-bat-mitzvah.html": "בר ובת מצווה",
  "/magician-brit-brita.html": "ברית ובריתה",
  "/shows-abroad-hebrew.html": "מופעים בעברית בחו״ל"
};

const pageSelect = document.querySelector("#cms-page-select");
const fieldSearch = document.querySelector("#cms-field-search");
const fieldList = document.querySelector("#cms-field-list");
const editorEmpty = document.querySelector("#cms-editor-empty");
const editorFields = document.querySelector("#cms-editor-fields");
const fieldKind = document.querySelector("#cms-field-kind");
const fieldTitle = document.querySelector("#cms-field-title");
const fieldLocation = document.querySelector("#cms-field-location");
const changeCount = document.querySelector("#cms-change-count");
const resetFieldButton = document.querySelector("#cms-reset-field");
const rollbackButton = document.querySelector("#cms-rollback");
const discardButton = document.querySelector("#cms-discard");
const saveDraftButton = document.querySelector("#cms-save-draft");
const publishButton = document.querySelector("#cms-publish");
const statePill = document.querySelector("#cms-state-pill");
const currentPageName = document.querySelector("#cms-current-page-name");
const lastSave = document.querySelector("#cms-last-save");
const cmsStatus = document.querySelector("#cms-status");
const preview = document.querySelector("#cms-preview");
const previewStage = document.querySelector("#cms-preview-stage");
const previewTitle = document.querySelector("#cms-preview-title");
const openPage = document.querySelector("#cms-open-page");
const contentView = document.querySelector("#content-view");
const crmView = document.querySelector("#crm-view");
const analyticsView = document.querySelector("#analytics-view");
const confirmDialog = document.querySelector("#admin-confirm");
const confirmForm = document.querySelector("#admin-confirm-form");
const confirmEyebrow = document.querySelector("#admin-confirm-eyebrow");
const confirmTitle = document.querySelector("#admin-confirm-title");
const confirmMessage = document.querySelector("#admin-confirm-message");
const confirmNote = document.querySelector("#admin-confirm-note");
const confirmCancel = document.querySelector("#admin-confirm-cancel");
const confirmApprove = document.querySelector("#admin-confirm-approve");

const localCmsQa = ["127.0.0.1", "localhost"].includes(window.location.hostname)
  && new URLSearchParams(window.location.search).has("cmsQa");
const qaStorageKey = "amit-cms-qa-content-v2";

let initialized = false;
let busy = false;
let fields = [];
let selectedFieldId = "";
let selectedKind = "all";
let currentPagePath = "/";
let currentRecord = {};
let publishedOverrides = {};
let savedDraftOverrides = {};
let workingOverrides = {};
let previousPayload = "";
let history = [];
let mediaLibrary = [...baseMediaLibrary];

const clone = (value) => JSON.parse(JSON.stringify(value || {}));
const pageId = (path) => encodeURIComponent(path).replaceAll("%", "_");
const contentRef = (path = currentPagePath) => doc(db, "siteContent", pageId(path));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[character]));

const safeJsonParse = (value, fallback = {}) => {
  try {
    return typeof value === "string" && value ? JSON.parse(value) : clone(fallback);
  } catch {
    return clone(fallback);
  }
};

const confirmAction = ({ eyebrow = "אישור פעולה", title, message, note = "", approveLabel = "אישור" }) => new Promise((resolve) => {
  if (!confirmDialog || !confirmDialog.showModal) {
    setStatus("לא ניתן לפתוח את חלון האישור. לא בוצע שינוי.", "error");
    resolve(false);
    return;
  }

  let settled = false;
  const finish = (approved) => {
    if (settled) return;
    settled = true;
    confirmForm.removeEventListener("submit", onSubmit);
    confirmCancel.removeEventListener("click", onCancel);
    confirmDialog.removeEventListener("cancel", onCancel);
    if (confirmDialog.open) confirmDialog.close();
    resolve(approved);
  };
  const onSubmit = (event) => {
    event.preventDefault();
    finish(true);
  };
  const onCancel = (event) => {
    event.preventDefault();
    finish(false);
  };

  confirmEyebrow.textContent = eyebrow;
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmNote.textContent = note;
  confirmNote.hidden = !note;
  confirmApprove.textContent = approveLabel;
  confirmForm.addEventListener("submit", onSubmit);
  confirmCancel.addEventListener("click", onCancel);
  confirmDialog.addEventListener("cancel", onCancel);
  confirmDialog.showModal();
  confirmCancel.focus();
});

const setStatus = (message = "", type = "") => {
  cmsStatus.textContent = message;
  cmsStatus.className = `cms-status${type ? ` ${type}` : ""}`;
};

const setBusy = (value, message = "") => {
  busy = value;
  document.querySelector("#content-view")?.setAttribute("aria-busy", String(value));
  [saveDraftButton, publishButton, discardButton, rollbackButton].forEach((button) => {
    button.dataset.busy = value ? "true" : "false";
  });
  if (message) setStatus(message);
  updateWorkflowState();
};

const pageLanguage = (path) => {
  const segment = path.split("/").filter(Boolean)[0];
  return ["en", "fr", "ru"].includes(segment) ? segment : "he";
};

const titleFromSlug = (path) => {
  const clean = decodeURIComponent(path).replace(/^\/(en|fr|ru)\//, "").replace(/^\//, "").replace(/\.html$/i, "");
  if (!clean) return "עמוד הבית";
  if (clean === "legal") return "מידע משפטי ונגישות";
  return clean.replaceAll("-", " ");
};

const pageLabel = (path) => pageNames[path] || titleFromSlug(path);

const formatTimestamp = (value) => {
  if (!value) return "עדיין לא נשמרה טיוטה";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "נשמר בעבר";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(date);
};

const objectDiffCount = (left, right) => {
  const ids = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  return [...ids].filter((id) => JSON.stringify(left?.[id]) !== JSON.stringify(right?.[id])).length;
};

const hasWorkingChanges = () => objectDiffCount(workingOverrides, savedDraftOverrides) > 0;
const hasDraftChanges = () => objectDiffCount(savedDraftOverrides, publishedOverrides) > 0;

const readQaStore = () => safeJsonParse(localStorage.getItem(qaStorageKey), {});

const readContentRecord = async () => {
  if (localCmsQa) return readQaStore()[pageId(currentPagePath)] || {};
  const snapshot = await getDoc(contentRef());
  return snapshot.exists() ? snapshot.data() : {};
};

const writeContentRecord = async (record) => {
  if (localCmsQa) {
    const store = readQaStore();
    store[pageId(currentPagePath)] = {
      ...record,
      updatedAt: new Date().toISOString(),
      updatedBy: "בדיקה מקומית"
    };
    localStorage.setItem(qaStorageKey, JSON.stringify(store));
    return store[pageId(currentPagePath)];
  }
  await setDoc(contentRef(), record, { merge: true });
  return record;
};

const serverAuditFields = () => localCmsQa ? {
  updatedAt: new Date().toISOString(),
  updatedBy: "בדיקה מקומית"
} : {
  updatedAt: serverTimestamp(),
  updatedBy: auth.currentUser?.email || ""
};

const loadPages = async () => {
  const response = await fetch("sitemap.xml", { cache: "no-store" });
  if (!response.ok) throw new Error("רשימת העמודים לא נטענה.");
  const xml = new DOMParser().parseFromString(await response.text(), "application/xml");
  const paths = [...xml.querySelectorAll("loc")]
    .map((item) => new URL(item.textContent.trim()).pathname)
    .map((path) => path.endsWith("/index.html") ? path.slice(0, -"index.html".length) || "/" : path)
    .filter((path) => path !== "/admin.html");
  const unique = [...new Set(["/", ...paths, ...extraEditablePages])];
  pageSelect.innerHTML = Object.keys(languageLabels).map((language) => {
    const languagePages = unique
      .filter((path) => pageLanguage(path) === language)
      .sort((a, b) => pageLabel(a).localeCompare(pageLabel(b), "he"));
    if (!languagePages.length) return "";
    return `<optgroup label="${languageLabels[language]}">${languagePages.map((path) => (
      `<option value="${escapeHtml(path)}">${escapeHtml(pageLabel(path))}</option>`
    )).join("")}</optgroup>`;
  }).join("");
};

const loadMediaLibrary = async () => {
  if (localCmsQa) return;
  try {
    const listing = await listAll(ref(storage, "cms-media"));
    const uploaded = await Promise.all(listing.items.slice(0, 120).map(async (item) => ({
      url: await getDownloadURL(item),
      name: item.name,
      uploaded: true
    })));
    mediaLibrary = [...uploaded.reverse(), ...baseMediaLibrary];
  } catch (error) {
    console.info("ספריית המדיה בענן עדיין אינה זמינה.", error);
  }
};

const injectPreviewRuntime = () => {
  const frameDocument = preview.contentDocument;
  if (!frameDocument || preview.contentWindow?.AmitCMS) return;
  const script = frameDocument.createElement("script");
  script.type = "module";
  script.src = `/assets/cms-runtime.js?cmsAdmin=${Date.now()}`;
  frameDocument.head.append(script);
};

const waitForPreviewApi = async () => {
  injectPreviewRuntime();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (preview.contentWindow?.AmitCMS) return preview.contentWindow.AmitCMS;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("עורך התוכן לא נטען בתצוגה המקדימה.");
};

const loadRecord = async () => {
  currentRecord = await readContentRecord();
  publishedOverrides = safeJsonParse(currentRecord.payload, {});
  savedDraftOverrides = safeJsonParse(currentRecord.draftPayload, publishedOverrides);
  workingOverrides = clone(savedDraftOverrides);
  previousPayload = typeof currentRecord.previousPayload === "string" ? currentRecord.previousPayload : "";
  history = Array.isArray(currentRecord.history) ? currentRecord.history.slice(0, 5) : [];
};

const fieldCurrentValue = (field) => {
  const override = workingOverrides[field.id];
  if (!override) return field.value ?? field.src ?? field.href ?? "";
  return override.value ?? override.src ?? override.href ?? "";
};

const prepareFieldLabels = () => {
  const roleCounts = new Map();
  fields.forEach((field) => {
    const key = `${field.groupId}|${field.roleLabel}`;
    roleCounts.set(key, (roleCounts.get(key) || 0) + 1);
  });
  const roleIndexes = new Map();
  fields = fields.map((field) => {
    const key = `${field.groupId}|${field.roleLabel}`;
    const next = (roleIndexes.get(key) || 0) + 1;
    roleIndexes.set(key, next);
    const suffix = roleCounts.get(key) > 1 ? ` ${next}` : "";
    return { ...field, displayRole: `${field.roleLabel}${suffix}` };
  });
};

const matchesKind = (field) => {
  if (selectedKind === "all") return true;
  if (selectedKind === "text") return ["text", "form"].includes(field.kind);
  if (selectedKind === "image") return ["image", "video"].includes(field.kind);
  return field.kind === selectedKind;
};

const renderFieldList = () => {
  const term = fieldSearch.value.trim().toLowerCase();
  const visible = fields.filter((field) => {
    const haystack = [
      kindLabels[field.kind],
      field.displayRole,
      field.groupLabel,
      field.label,
      field.value,
      field.src,
      field.href,
      field.alt,
      field.title
    ].join(" ").toLowerCase();
    return matchesKind(field) && (!term || haystack.includes(term));
  });

  if (!visible.length) {
    fieldList.innerHTML = '<p class="empty">לא נמצאו שדות בחיפוש הזה.</p>';
    return;
  }

  const groups = new Map();
  visible.forEach((field) => {
    const group = groups.get(field.groupId) || {
      id: field.groupId,
      label: field.groupLabel,
      scope: field.groupScope,
      fields: []
    };
    group.fields.push(field);
    groups.set(field.groupId, group);
  });

  fieldList.innerHTML = [...groups.values()].map((group, groupIndex) => {
    const selectedInside = group.fields.some((field) => field.id === selectedFieldId);
    return `
      <details class="cms-field-group" ${selectedInside || groupIndex === 0 || term ? "open" : ""}>
        <summary>
          <span><small>${escapeHtml(group.scope)}</small><strong>${escapeHtml(group.label)}</strong></span>
          <b>${group.fields.length}</b>
        </summary>
        <div class="cms-field-group-items">
          ${group.fields.map((field) => {
            const current = fieldCurrentValue(field);
            return `
              <button class="cms-field-button ${field.id === selectedFieldId ? "active" : ""}" type="button" data-cms-field-id="${escapeHtml(field.id)}">
                <small>${escapeHtml(field.displayRole)}</small>
                <span>${escapeHtml(current || field.label || "ללא תוכן")}</span>
              </button>
            `;
          }).join("")}
        </div>
      </details>
    `;
  }).join("");

  fieldList.querySelectorAll("[data-cms-field-id]").forEach((button) => {
    button.addEventListener("click", () => selectField(button.dataset.cmsFieldId));
  });
};

const updateWorkflowState = () => {
  const unsavedCount = objectDiffCount(workingOverrides, savedDraftOverrides);
  const draftCount = objectDiffCount(savedDraftOverrides, publishedOverrides);
  const publishedCount = objectDiffCount(workingOverrides, publishedOverrides);
  changeCount.textContent = unsavedCount ? `${unsavedCount} שינויים שלא נשמרו`
    : draftCount ? `${draftCount} שינויים בטיוטה`
      : "אין שינויים";
  changeCount.classList.toggle("changed", Boolean(unsavedCount || draftCount));

  statePill.className = "cms-state-pill";
  if (unsavedCount) {
    statePill.textContent = "שינויים שלא נשמרו";
    statePill.classList.add("unsaved");
  } else if (draftCount) {
    statePill.textContent = "טיוטה שמורה";
    statePill.classList.add("draft");
  } else {
    statePill.textContent = "האתר מעודכן";
    statePill.classList.add("published");
  }

  saveDraftButton.disabled = busy || !unsavedCount;
  discardButton.disabled = busy || !unsavedCount;
  publishButton.disabled = busy || Boolean(unsavedCount) || !draftCount;
  rollbackButton.disabled = busy || (!history.length && !previousPayload);
  resetFieldButton.disabled = busy || !selectedFieldId || !workingOverrides[selectedFieldId];
  publishButton.textContent = publishedCount ? `פרסום באתר (${publishedCount})` : "פרסום באתר";
};

const highlightField = (field) => {
  const frameDocument = preview.contentDocument;
  if (!frameDocument || field.kind === "meta") return;
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
  if (field.kind === "form") return {
    ...base,
    attribute: field.attribute,
    optionIndex: field.optionIndex,
    value: values.value.slice(0, 500)
  };
  if (field.kind === "meta") return {
    ...base,
    attribute: field.attribute,
    value: values.value.slice(0, field.selector === "title" ? 180 : 800)
  };
  if (field.kind === "image") return {
    ...base,
    src: values.src.trim(),
    alt: values.alt.trim().slice(0, 300),
    title: values.title.trim().slice(0, 300),
    decorative: Boolean(values.decorative),
    sourceRights: values.sourceRights.trim().slice(0, 500)
  };
  if (field.kind === "video") return {
    ...base,
    src: values.src.trim(),
    title: values.title.trim().slice(0, 300),
    sourceRights: values.sourceRights.trim().slice(0, 500)
  };
  if (field.kind === "link") return { ...base, href: values.href.trim() };
  return base;
};

const validateField = (field, entry) => {
  const api = preview.contentWindow?.AmitCMS;
  if (!api) return "התצוגה המקדימה עדיין לא מוכנה.";
  if (field.kind === "image") {
    if (!api.normalizePageUrl(entry.src)) return "כתובת התמונה אינה תקינה.";
    if (!entry.decorative && !entry.alt) return "לתמונת תוכן נדרש תיאור נגיש.";
  }
  if (field.kind === "video" && entry.src) {
    const target = preview.contentDocument?.querySelector(field.selector);
    const valid = target?.tagName === "IFRAME" ? api.normalizeVideoUrl(entry.src) : api.normalizePageUrl(entry.src);
    if (!valid) return "כתובת הסרטון אינה תקינה.";
  }
  if (field.kind === "link" && entry.href && !api.normalizeLinkUrl(entry.href)) return "יעד הקישור אינו תקין.";
  if (field.kind === "meta" && ["href"].includes(field.attribute) && entry.value && !api.normalizePageUrl(entry.value)) {
    return "הכתובת הקנונית אינה תקינה.";
  }
  return "";
};

const applyWorkingToPreview = () => {
  preview.contentWindow?.AmitCMS?.applyOverrides(workingOverrides);
  renderFieldList();
  updateWorkflowState();
};

const readEditorValues = (field) => {
  if (["text", "meta", "form"].includes(field.kind)) {
    return { value: editorFields.querySelector("[name='value']")?.value || "" };
  }
  if (field.kind === "image") {
    return {
      src: editorFields.querySelector("[name='src']")?.value || "",
      alt: editorFields.querySelector("[name='alt']")?.value || "",
      title: editorFields.querySelector("[name='title']")?.value || "",
      decorative: editorFields.querySelector("[name='decorative']")?.checked || false,
      sourceRights: editorFields.querySelector("[name='sourceRights']")?.value || ""
    };
  }
  if (field.kind === "video") {
    return {
      src: editorFields.querySelector("[name='src']")?.value || "",
      title: editorFields.querySelector("[name='title']")?.value || "",
      sourceRights: editorFields.querySelector("[name='sourceRights']")?.value || ""
    };
  }
  if (field.kind === "link") return { href: editorFields.querySelector("[name='href']")?.value || "" };
  return {};
};

const updateSelectedEntry = (field) => {
  const entry = entryFromField(field, readEditorValues(field));
  const error = validateField(field, entry);
  if (error) {
    setStatus(error, "error");
    return false;
  }
  workingOverrides[field.id] = entry;
  setStatus("השינוי מוצג בתצוגה המקדימה. שמרו טיוטה כשתסיימו לערוך.");
  applyWorkingToPreview();
  return true;
};

const uploadMedia = async (field) => {
  const input = editorFields.querySelector("[name='mediaFile']");
  const file = input?.files?.[0];
  if (!file) {
    setStatus("בחרו קובץ מהמחשב לפני ההעלאה.", "error");
    return;
  }
  const allowed = field.kind === "image" ? file.type.startsWith("image/") : file.type.startsWith("video/");
  const limit = field.kind === "image" ? 10 * 1024 * 1024 : 80 * 1024 * 1024;
  if (!allowed || file.size > limit) {
    setStatus(field.kind === "image" ? "אפשר להעלות תמונה עד 10 מגהבייט." : "אפשר להעלות סרטון עד 80 מגהבייט.", "error");
    return;
  }

  setBusy(true, "מעלה את הקובץ ומכין אותו לשימוש...");
  try {
    let url;
    if (localCmsQa) {
      url = URL.createObjectURL(file);
    } else {
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "media";
      const mediaRef = ref(storage, `cms-media/${Date.now()}-${safeName}`);
      await uploadBytes(mediaRef, file, {
        contentType: file.type,
        customMetadata: { uploadedBy: auth.currentUser?.email || "" }
      });
      url = await getDownloadURL(mediaRef);
      mediaLibrary.unshift({ url, name: file.name, uploaded: true });
    }
    const srcInput = editorFields.querySelector("[name='src']");
    srcInput.value = url;
    updateSelectedEntry(field);
    setStatus("הקובץ הועלה ונבחר. שמרו טיוטה כדי לשמור את השינוי.", "success");
  } catch (error) {
    console.error(error);
    setStatus("העלאת הקובץ נכשלה. לא נשמר שינוי. בדקו את החיבור ונסו שוב.", "error");
  } finally {
    setBusy(false);
  }
};

const mediaOptionsHtml = (selectedUrl) => mediaLibrary.map((item) => `
  <button class="cms-media-option ${item.url === selectedUrl ? "selected" : ""}" type="button" data-media-src="${escapeHtml(item.url)}" data-media-name="${escapeHtml(item.name.toLowerCase())}">
    <img src="${escapeHtml(item.url)}" alt="" loading="lazy">
    <span>${escapeHtml(item.name)}</span>
  </button>
`).join("");

const bindEditorInput = (field) => {
  editorFields.querySelectorAll("input:not([type='file']), textarea").forEach((control) => {
    control.addEventListener("input", () => updateSelectedEntry(field));
    control.addEventListener("change", () => updateSelectedEntry(field));
  });

  editorFields.querySelectorAll("[data-media-src]").forEach((button) => {
    button.addEventListener("click", () => {
      editorFields.querySelector("[name='src']").value = button.dataset.mediaSrc;
      updateSelectedEntry(field);
      renderEditor(field);
    });
  });

  editorFields.querySelector("[data-upload-media]")?.addEventListener("click", () => uploadMedia(field));
  editorFields.querySelector("[name='decorative']")?.addEventListener("change", (event) => {
    const altInput = editorFields.querySelector("[name='alt']");
    altInput.disabled = event.currentTarget.checked;
    if (event.currentTarget.checked) altInput.value = "";
    updateSelectedEntry(field);
  });
  editorFields.querySelector("#cms-media-search")?.addEventListener("input", (event) => {
    const term = event.currentTarget.value.trim().toLowerCase();
    editorFields.querySelectorAll("[data-media-name]").forEach((button) => {
      button.hidden = Boolean(term) && !button.dataset.mediaName.includes(term);
    });
  });
};

const renderEditor = (field) => {
  const override = workingOverrides[field.id] || {};
  editorEmpty.hidden = true;
  editorFields.hidden = false;
  fieldKind.textContent = kindLabels[field.kind] || "תוכן";
  fieldTitle.textContent = field.displayRole || field.roleLabel || "עריכת שדה";
  fieldLocation.textContent = `${field.groupScope} · ${field.groupLabel}`;

  if (["text", "meta", "form"].includes(field.kind)) {
    const value = override.value ?? field.value ?? "";
    const maxLength = field.kind === "text" ? 12000 : field.kind === "meta" ? 800 : 500;
    const multiline = field.kind === "text" && (value.length > 90 || field.roleLabel === "פסקה");
    editorFields.innerHTML = `
      <div class="cms-field-control">
        <label for="cms-value">${escapeHtml(field.displayRole || "התוכן שיופיע באתר")}</label>
        ${multiline
          ? `<textarea class="control" id="cms-value" name="value" maxlength="${maxLength}">${escapeHtml(value)}</textarea>`
          : `<input class="control" id="cms-value" name="value" value="${escapeHtml(value)}" maxlength="${maxLength}">`}
        <p class="cms-field-help">השינוי מוצג מיד בתצוגה. הוא לא יופיע באתר לפני פרסום.</p>
      </div>
    `;
  } else if (field.kind === "image") {
    const src = override.src ?? field.src ?? "";
    const alt = override.alt ?? field.alt ?? "";
    const title = override.title ?? field.title ?? "";
    const decorative = override.decorative ?? field.decorative ?? false;
    const sourceRights = override.sourceRights ?? "";
    editorFields.innerHTML = `
      <div class="cms-media-upload">
        <div><strong>החלפת תמונה</strong><span>בחרו קובץ או תמונה קיימת</span></div>
        <input class="control" name="mediaFile" type="file" accept="image/*">
        <button class="btn" type="button" data-upload-media>העלאת התמונה</button>
      </div>
      <div class="cms-field-control">
        <label for="cms-src">כתובת התמונה</label>
        <input class="control" id="cms-src" name="src" value="${escapeHtml(src)}" placeholder="https://... או /assets/...">
      </div>
      <div class="cms-check-row">
        <input id="cms-decorative" name="decorative" type="checkbox" ${decorative ? "checked" : ""}>
        <label for="cms-decorative">זו תמונת עיצוב בלבד, ללא מידע חשוב</label>
      </div>
      <div class="cms-field-control">
        <label for="cms-alt">תיאור התמונה לנגישות</label>
        <input class="control" id="cms-alt" name="alt" value="${escapeHtml(alt)}" maxlength="300" ${decorative ? "disabled" : ""}>
      </div>
      <div class="cms-field-control">
        <label for="cms-title">כותרת התמונה</label>
        <input class="control" id="cms-title" name="title" value="${escapeHtml(title)}" maxlength="300">
      </div>
      <div class="cms-field-control">
        <label for="cms-source-rights">מקור ואישור שימוש</label>
        <input class="control" id="cms-source-rights" name="sourceRights" value="${escapeHtml(sourceRights)}" maxlength="500" placeholder="לדוגמה: צילום של עמית, אושר לשימוש באתר">
      </div>
      <div class="cms-field-control">
        <label for="cms-media-search">תמונות שכבר קיימות</label>
        <input class="control" id="cms-media-search" type="search" placeholder="חיפוש תמונה">
        <div class="cms-media-library">${mediaOptionsHtml(src)}</div>
      </div>
    `;
  } else if (field.kind === "video") {
    const src = override.src ?? field.src ?? "";
    const title = override.title ?? field.title ?? "";
    const sourceRights = override.sourceRights ?? "";
    editorFields.innerHTML = `
      <div class="cms-media-upload">
        <div><strong>החלפת סרטון</strong><span>אפשר להעלות קובץ או להדביק קישור</span></div>
        <input class="control" name="mediaFile" type="file" accept="video/*">
        <button class="btn" type="button" data-upload-media>העלאת הסרטון</button>
      </div>
      <div class="cms-field-control">
        <label for="cms-src">כתובת הסרטון</label>
        <input class="control" id="cms-src" name="src" value="${escapeHtml(src)}" placeholder="קישור מאובטח, YouTube או Vimeo">
      </div>
      <div class="cms-field-control">
        <label for="cms-title">תיאור הסרטון לנגישות</label>
        <input class="control" id="cms-title" name="title" value="${escapeHtml(title)}" maxlength="300">
      </div>
      <div class="cms-field-control">
        <label for="cms-source-rights">מקור ואישור שימוש</label>
        <input class="control" id="cms-source-rights" name="sourceRights" value="${escapeHtml(sourceRights)}" maxlength="500">
      </div>
    `;
  } else if (field.kind === "link") {
    const href = override.href ?? field.href ?? "";
    editorFields.innerHTML = `
      <div class="cms-field-control">
        <label for="cms-href">לאן הקישור מוביל?</label>
        <input class="control" id="cms-href" name="href" value="${escapeHtml(href)}" placeholder="כתובת באתר, טלפון, דוא״ל או קישור חיצוני">
        <p class="cms-field-help">טקסט הכפתור או הקישור נערך בנפרד בלחיצה על הטקסט עצמו.</p>
      </div>
    `;
  }

  bindEditorInput(field);
  updateWorkflowState();
};

const selectField = (id) => {
  const field = fields.find((item) => item.id === id);
  if (!field) return;
  selectedFieldId = id;
  renderFieldList();
  renderEditor(field);
  highlightField(field);
};

const bindPreviewSelection = () => {
  const frameDocument = preview.contentDocument;
  if (!frameDocument) return;
  let style = frameDocument.querySelector("#amit-cms-highlight-style");
  if (!style) {
    style = frameDocument.createElement("style");
    style.id = "amit-cms-highlight-style";
    style.textContent = `
      .amit-cms-highlight{outline:4px solid #f1c361!important;outline-offset:5px!important;box-shadow:0 0 0 8px rgba(241,195,97,.22)!important}
      .amit-cms-hover{outline:2px dashed #8eb9ff!important;outline-offset:3px!important;cursor:pointer!important}
    `;
    frameDocument.head.append(style);
  }

  const candidateFor = (target) => fields
    .filter((field) => field.kind !== "meta")
    .map((field) => ({ field, element: frameDocument.querySelector(field.selector) }))
    .filter(({ element }) => element && (element === target || element.contains(target) || target.contains(element)))
    .sort((a, b) => {
      const priority = { image: 1, video: 1, link: 2, form: 2, text: 3 };
      return (priority[a.field.kind] || 9) - (priority[b.field.kind] || 9);
    })[0];

  frameDocument.addEventListener("click", (event) => {
    const candidate = candidateFor(event.target);
    if (!candidate) return;
    event.preventDefault();
    event.stopPropagation();
    selectField(candidate.field.id);
  }, true);

  frameDocument.addEventListener("mouseover", (event) => {
    frameDocument.querySelectorAll(".amit-cms-hover").forEach((item) => item.classList.remove("amit-cms-hover"));
    const candidate = candidateFor(event.target);
    candidate?.element?.classList.add("amit-cms-hover");
  }, true);
};

const reloadPreview = async () => {
  const api = await waitForPreviewApi();
  api.applyOverrides(workingOverrides);
  bindPreviewSelection();
  if (selectedFieldId) {
    const selected = fields.find((field) => field.id === selectedFieldId);
    if (selected) highlightField(selected);
  }
};

const loadPage = async (path) => {
  currentPagePath = path;
  selectedFieldId = "";
  fieldList.innerHTML = '<p class="empty">טוען את מקטעי העמוד...</p>';
  editorEmpty.hidden = false;
  editorFields.hidden = true;
  editorFields.innerHTML = "";
  fieldKind.textContent = "עריכת תוכן";
  fieldTitle.textContent = "בחרו תוכן לעריכה";
  fieldLocation.textContent = "";
  setStatus("טוען את העמוד ואת הטיוטה השמורה...");
  setBusy(true);

  await loadRecord();
  const separator = path.includes("?") ? "&" : "?";
  preview.src = `${path}${separator}cmsPreview=1&cache=${Date.now()}`;
  openPage.href = path;
  pageSelect.value = path;
  currentPageName.textContent = `${pageLabel(path)} · ${languageLabels[pageLanguage(path)]}`;
  lastSave.textContent = `שמירה אחרונה: ${formatTimestamp(currentRecord.draftUpdatedAt || currentRecord.updatedAt)}`;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("העמוד לא נטען בזמן.")), 15000);
    preview.addEventListener("load", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

  const api = await waitForPreviewApi();
  fields = api.scanEditableFields();
  prepareFieldLabels();
  api.applyOverrides(workingOverrides);
  previewTitle.textContent = preview.contentDocument.title || pageLabel(path);
  bindPreviewSelection();
  renderFieldList();
  setBusy(false);
  updateWorkflowState();
  setStatus(`${fields.length} פריטי תוכן מחולקים למקטעים ברורים.`, "success");
};

const validateAllWorkingFields = () => {
  for (const [id, entry] of Object.entries(workingOverrides)) {
    const field = fields.find((item) => item.id === id);
    if (!field) continue;
    const error = validateField(field, entry);
    if (error) {
      selectField(id);
      return error;
    }
  }
  return "";
};

const saveDraft = async () => {
  if (!hasWorkingChanges()) return;
  const error = validateAllWorkingFields();
  if (error) {
    setStatus(error, "error");
    return;
  }
  setBusy(true, "שומר את הטיוטה בלי לשנות את האתר הציבורי...");
  try {
    const draftPayload = JSON.stringify(workingOverrides);
    if (draftPayload.length > 850000) throw new Error("הטיוטה גדולה מדי לשמירה אחת.");
    await writeContentRecord({
      pagePath: currentPagePath,
      payload: JSON.stringify(publishedOverrides),
      draftPayload,
      previousPayload,
      history,
      draftUpdatedAt: localCmsQa ? new Date().toISOString() : serverTimestamp(),
      draftUpdatedBy: localCmsQa ? "בדיקה מקומית" : auth.currentUser?.email || "",
      ...serverAuditFields()
    });
    savedDraftOverrides = clone(workingOverrides);
    lastSave.textContent = `טיוטה נשמרה: ${formatTimestamp(new Date())}`;
    setStatus("הטיוטה נשמרה. האתר הציבורי לא השתנה.", "success");
  } catch (error) {
    console.error(error);
    setStatus("שמירת הטיוטה נכשלה. האתר הציבורי לא השתנה. בדקו את החיבור ונסו שוב.", "error");
  } finally {
    setBusy(false);
  }
};

const compactHistory = (items, nextPayload) => {
  const kept = items.slice(0, 5);
  while (kept.length && JSON.stringify(kept).length + nextPayload.length > 780000) kept.pop();
  return kept;
};

const publishDraft = async () => {
  if (hasWorkingChanges()) {
    setStatus("יש שינויים שלא נשמרו. שמרו טיוטה לפני הפרסום.", "error");
    return;
  }
  if (!hasDraftChanges()) return;
  const error = validateAllWorkingFields();
  if (error) {
    setStatus(error, "error");
    return;
  }
  const approved = await confirmAction({
    eyebrow: "פרסום באתר",
    title: `לפרסם את ״${pageLabel(currentPagePath)}״?`,
    message: "הטיוטה השמורה תחליף את התוכן שמופיע כרגע באתר הציבורי.",
    note: "הגרסה הנוכחית תישמר בהיסטוריה ותהיה זמינה לשחזור.",
    approveLabel: "פרסום עכשיו"
  });
  if (!approved) return;

  setBusy(true, "מפרסם את הטיוטה באתר...");
  try {
    const currentPayload = JSON.stringify(publishedOverrides);
    const nextPayload = JSON.stringify(savedDraftOverrides);
    const version = {
      payload: currentPayload,
      publishedAt: new Date().toISOString(),
      publishedBy: localCmsQa ? "בדיקה מקומית" : auth.currentUser?.email || "",
      label: "הגרסה שלפני הפרסום"
    };
    history = compactHistory([version, ...history], nextPayload);
    await writeContentRecord({
      pagePath: currentPagePath,
      payload: nextPayload,
      draftPayload: nextPayload,
      previousPayload: currentPayload,
      history,
      publishedAt: localCmsQa ? new Date().toISOString() : serverTimestamp(),
      publishedBy: localCmsQa ? "בדיקה מקומית" : auth.currentUser?.email || "",
      ...serverAuditFields()
    });
    previousPayload = currentPayload;
    publishedOverrides = clone(savedDraftOverrides);
    setStatus("הטיוטה פורסמה באתר. מומלץ לפתוח את העמוד ולבדוק אותו.", "success");
    lastSave.textContent = `פורסם: ${formatTimestamp(new Date())}`;
  } catch (error) {
    console.error(error);
    setStatus("הפרסום נכשל. האתר נשאר בגרסה הקודמת. בדקו את החיבור ונסו שוב.", "error");
  } finally {
    setBusy(false);
  }
};

const discardWorkingChanges = async () => {
  if (!hasWorkingChanges()) return;
  const approved = await confirmAction({
    title: "לבטל את השינויים שלא נשמרו?",
    message: "השינויים שבוצעו מאז שמירת הטיוטה האחרונה יימחקו.",
    approveLabel: "ביטול השינויים"
  });
  if (!approved) return;
  workingOverrides = clone(savedDraftOverrides);
  selectedFieldId = "";
  editorEmpty.hidden = false;
  editorFields.hidden = true;
  editorFields.innerHTML = "";
  await reloadPreview();
  renderFieldList();
  updateWorkflowState();
  setStatus("השינויים שלא נשמרו בוטלו.", "success");
};

const resetSelectedField = async () => {
  if (!selectedFieldId || !workingOverrides[selectedFieldId]) return;
  delete workingOverrides[selectedFieldId];
  const field = fields.find((item) => item.id === selectedFieldId);
  await reloadPreview();
  if (field) renderEditor(field);
  renderFieldList();
  updateWorkflowState();
  setStatus(
    isDirty()
      ? "השדה הוחזר למקור. נשארו שינויים אחרים שאפשר לשמור כטיוטה."
      : "השדה הוחזר למקור. אין שינויים לשמירה.",
    "success"
  );
};

const rollback = async () => {
  const targetPayload = history[0]?.payload || previousPayload;
  if (!targetPayload) return;
  const approved = await confirmAction({
    eyebrow: "שחזור גרסה",
    title: `להחזיר את ״${pageLabel(currentPagePath)}״ לגרסה הקודמת?`,
    message: "הגרסה הקודמת תפורסם מחדש והגרסה הנוכחית תישמר בהיסטוריה.",
    note: "הפעולה אינה מוחקת את היסטוריית הגרסאות.",
    approveLabel: "שחזור ופרסום"
  });
  if (!approved) return;
  setBusy(true, "מחזיר את הפרסום הקודם...");
  try {
    const currentPayload = JSON.stringify(publishedOverrides);
    const restored = safeJsonParse(targetPayload, {});
    const nextHistory = history.length
      ? compactHistory([{ payload: currentPayload, publishedAt: new Date().toISOString(), publishedBy: auth.currentUser?.email || "", label: "הגרסה שהוחלפה בשחזור" }, ...history.slice(1)], targetPayload)
      : [{ payload: currentPayload, publishedAt: new Date().toISOString(), publishedBy: auth.currentUser?.email || "", label: "הגרסה שהוחלפה בשחזור" }];
    await writeContentRecord({
      pagePath: currentPagePath,
      payload: targetPayload,
      draftPayload: targetPayload,
      previousPayload: currentPayload,
      history: nextHistory,
      publishedAt: localCmsQa ? new Date().toISOString() : serverTimestamp(),
      publishedBy: localCmsQa ? "בדיקה מקומית" : auth.currentUser?.email || "",
      ...serverAuditFields()
    });
    previousPayload = currentPayload;
    history = nextHistory;
    publishedOverrides = clone(restored);
    savedDraftOverrides = clone(restored);
    workingOverrides = clone(restored);
    await reloadPreview();
    renderFieldList();
    setStatus("הפרסום הקודם הוחזר בהצלחה.", "success");
  } catch (error) {
    console.error(error);
    setStatus("השחזור נכשל ולא בוצע שינוי באתר.", "error");
  } finally {
    setBusy(false);
  }
};

const changePage = async (path) => {
  if (hasWorkingChanges()) {
    const approved = await confirmAction({
      title: "לעבור לעמוד אחר בלי לשמור?",
      message: "השינויים שלא נשמרו בעמוד הנוכחי יימחקו.",
      approveLabel: "מעבר בלי שמירה"
    });
    if (!approved) {
      pageSelect.value = currentPagePath;
      return;
    }
  }
  await loadPage(path);
};

const bindViewTabs = () => {
  document.querySelectorAll("[data-admin-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedView = button.dataset.adminView;
      document.querySelectorAll("[data-admin-view]").forEach((item) => {
        item.classList.toggle("active", item === button);
        item.setAttribute("aria-selected", String(item === button));
      });
      contentView.hidden = selectedView !== "content";
      crmView.hidden = selectedView !== "crm";
      if (analyticsView) analyticsView.hidden = selectedView !== "analytics";
    });
  });
};

const handleLoadError = (error) => {
  console.error(error);
  setBusy(false);
  setStatus("עורך התוכן לא נטען. רעננו את העמוד ונסו שוב.", "error");
  fieldList.innerHTML = '<p class="empty">לא הצלחנו לטעון את מקטעי העמוד.</p>';
};

export const startCms = async () => {
  if (initialized) return;
  initialized = true;
  bindViewTabs();
  fieldSearch.addEventListener("input", renderFieldList);
  pageSelect.addEventListener("change", () => changePage(pageSelect.value).catch(handleLoadError));
  saveDraftButton.addEventListener("click", saveDraft);
  publishButton.addEventListener("click", publishDraft);
  discardButton.addEventListener("click", discardWorkingChanges);
  resetFieldButton.addEventListener("click", resetSelectedField);
  rollbackButton.addEventListener("click", rollback);
  document.querySelectorAll("[data-cms-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedKind = button.dataset.cmsKind;
      document.querySelectorAll("[data-cms-kind]").forEach((item) => item.classList.toggle("active", item === button));
      renderFieldList();
    });
  });
  document.querySelectorAll("[data-cms-device]").forEach((button) => {
    button.addEventListener("click", () => {
      previewStage.dataset.device = button.dataset.cmsDevice;
      document.querySelectorAll("[data-cms-device]").forEach((item) => item.classList.toggle("active", item === button));
    });
  });
  window.addEventListener("beforeunload", (event) => {
    if (!hasWorkingChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  try {
    await Promise.all([loadPages(), loadMediaLibrary()]);
    await loadPage("/");
  } catch (error) {
    handleLoadError(error);
  }
};

window.startAmitCms = startCms;
