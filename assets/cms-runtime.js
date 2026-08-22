const FIREBASE_PROJECT_ID = "amit-mitrani-crm";
const FIREBASE_API_KEY = "AIzaSyD_UIZZiiwrKrNMQQAtmO3m4HjVw38VhoY";
const COLLECTION_NAME = "siteContent";

const ignoredTextAncestors = "script, style, noscript, svg, template, input, textarea, select, option, [data-cms-ignore]";
const editableScopes = "header, main, footer";

const pagePath = () => {
  const path = window.location.pathname || "/";
  if (path.endsWith("/index.html")) return path.slice(0, -"index.html".length) || "/";
  return path;
};

const pageId = (path = pagePath()) => encodeURIComponent(path).replaceAll("%", "_");

const escapeSelector = (value) => {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/([^a-zA-Z0-9_-])/g, "\\$1");
};

const selectorFor = (element) => {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";
  if (element.id) return `#${escapeSelector(element.id)}`;

  const parts = [];
  let current = element;
  while (current && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? [...current.parentElement.children].filter((item) => item.tagName === current.tagName)
      : [];
    const suffix = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : "";
    parts.unshift(`${tag}${suffix}`);
    current = current.parentElement;
  }
  return parts.join(" > ");
};

const textNodeIndex = (node) => [...node.parentNode.childNodes]
  .filter((item) => item.nodeType === Node.TEXT_NODE)
  .indexOf(node);

const directTextNode = (element, index) => [...element.childNodes]
  .filter((item) => item.nodeType === Node.TEXT_NODE)[index];

const cleanExcerpt = (value, limit = 74) => {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "ללא תוכן";
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
};

const humanizeId = (value) => String(value || "")
  .replace(/[-_]+/g, " ")
  .replace(/\b(hero|section|content|wrapper|container)\b/gi, "")
  .replace(/\s+/g, " ")
  .trim();

const sectionInfo = (element) => {
  const section = element?.closest?.("section, article, form, nav, header, footer")
    || element?.closest?.("main")
    || document.querySelector("main")
    || document.body;
  const scope = section.matches?.("header") ? "כותרת האתר"
    : section.matches?.("footer") ? "תחתית האתר"
      : section.matches?.("nav") ? "ניווט"
        : section.matches?.("form") ? "טופס"
          : "תוכן העמוד";
  const heading = section.querySelector?.("h1, h2, h3, h4, [aria-label], [class*='title']");
  const headingText = heading?.getAttribute?.("aria-label") || heading?.textContent;
  const idText = humanizeId(section.id);
  const label = cleanExcerpt(headingText || idText || scope, 64);
  return {
    groupId: selectorFor(section) || scope,
    groupLabel: label,
    groupScope: scope
  };
};

const fieldRole = (element, kind, value = "") => {
  if (kind === "image") return "תמונה";
  if (kind === "video") return "סרטון";
  if (kind === "link") return element.matches(".btn, button, [role='button']") ? "כפתור וקישור" : "קישור";
  if (kind === "form") return "טקסט בטופס";
  if (element.matches("h1")) return "כותרת ראשית";
  if (element.matches("h2, h3, h4, h5, h6")) return "כותרת מקטע";
  if (element.matches("button, .btn, [role='button']")) return "טקסט כפתור";
  if (element.matches("a")) return "טקסט קישור";
  if (element.matches("label")) return "תווית שדה";
  if (element.matches("li")) return "פריט ברשימה";
  if (element.matches("small, figcaption, caption")) return "כיתוב משני";
  return String(value).length > 110 ? "פסקה" : "טקסט";
};

const descriptorId = (kind, selector, suffix = "") => `${kind}:${selector}${suffix}`;

const addFieldContext = (field, element) => ({
  ...field,
  ...sectionInfo(element),
  roleLabel: field.roleLabel || fieldRole(element, field.kind, field.value || field.alt || field.title || "")
});

const normalizePageUrl = (value) => {
  const input = String(value || "").trim();
  if (!input) return "";
  try {
    const url = new URL(input, window.location.href);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
};

const normalizeLinkUrl = (value) => {
  const input = String(value || "").trim();
  if (!input) return "";
  if (input.startsWith("#")) return input;
  try {
    const url = new URL(input, window.location.href);
    if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
};

const normalizeVideoUrl = (value) => {
  const input = String(value || "").trim();
  if (!input) return "";
  try {
    const url = new URL(input, window.location.href);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0` : "";
    }
    if (["youtube.com", "m.youtube.com"].includes(host)) {
      const id = url.pathname.startsWith("/embed/")
        ? url.pathname.split("/")[2]
        : url.searchParams.get("v") || (url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] : "");
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0` : "";
    }
    if (host === "youtube-nocookie.com" && url.pathname.startsWith("/embed/")) return url.href;
    if (host === "vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : "";
    }
    if (host === "player.vimeo.com" && url.pathname.startsWith("/video/")) return url.href;
    return "";
  } catch {
    return "";
  }
};

const metaFields = () => {
  const definitions = [
    ["meta:title", "כותרת הדפדפן והחיפוש", "title", "value"],
    ["meta:description", "תיאור העמוד במנועי חיפוש", 'meta[name="description"]', "content"],
    ["meta:og-title", "כותרת השיתוף ברשתות", 'meta[property="og:title"]', "content"],
    ["meta:og-description", "תיאור השיתוף ברשתות", 'meta[property="og:description"]', "content"],
    ["meta:og-image", "תמונת השיתוף ברשתות", 'meta[property="og:image"]', "content"],
    ["meta:twitter-title", "כותרת השיתוף בטוויטר", 'meta[name="twitter:title"]', "content"],
    ["meta:twitter-description", "תיאור השיתוף בטוויטר", 'meta[name="twitter:description"]', "content"],
    ["meta:twitter-image", "תמונת השיתוף בטוויטר", 'meta[name="twitter:image"]', "content"],
    ["meta:canonical", "כתובת קנונית", 'link[rel="canonical"]', "href"]
  ];

  return definitions.flatMap(([id, label, selector, attribute]) => {
    const element = selector === "title" ? document.querySelector("title") : document.querySelector(selector);
    if (!element) return [];
    const value = selector === "title" ? document.title : element.getAttribute(attribute) || "";
    return [{
      id,
      kind: "meta",
      label,
      roleLabel: label,
      selector,
      attribute,
      value,
      groupId: "cms-seo",
      groupLabel: "חיפוש ושיתוף",
      groupScope: "הגדרות העמוד"
    }];
  });
};

const scopedSelector = (tail) => editableScopes.split(", ").map((scope) => `${scope} ${tail}`).join(", ");

const scanEditableFields = () => {
  const fields = [...metaFields()];

  document.querySelectorAll(editableScopes).forEach((scope) => {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      const value = node.nodeValue?.trim() || "";
      if (value && parent && !parent.closest(ignoredTextAncestors)) {
        const selector = selectorFor(parent);
        const index = textNodeIndex(node);
        fields.push(addFieldContext({
          id: descriptorId("text", selector, `::${index}`),
          kind: "text",
          label: cleanExcerpt(value),
          selector,
          textIndex: index,
          value
        }, parent));
      }
      node = walker.nextNode();
    }
  });

  document.querySelectorAll(scopedSelector("img")).forEach((element) => {
    if (element.closest("[data-cms-ignore]")) return;
    const selector = selectorFor(element);
    const pictureSources = element.closest("picture")
      ? [...element.closest("picture").querySelectorAll("source[srcset]")].map((source) => source.getAttribute("srcset") || "")
      : [];
    fields.push(addFieldContext({
      id: descriptorId("image", selector),
      kind: "image",
      label: cleanExcerpt(element.alt || element.title || "תמונה"),
      selector,
      src: element.getAttribute("src") || "",
      alt: element.getAttribute("alt") || "",
      title: element.getAttribute("title") || "",
      decorative: element.getAttribute("alt") === "",
      pictureSources
    }, element));
  });

  document.querySelectorAll(`${scopedSelector("video")}, ${scopedSelector("iframe")}`).forEach((element) => {
    if (element.closest("[data-cms-ignore]")) return;
    const current = element.getAttribute("src") || element.querySelector("source")?.getAttribute("src") || "";
    if (element.tagName === "IFRAME" && !/youtube|youtu\.be|vimeo/i.test(current)) return;
    const selector = selectorFor(element);
    fields.push(addFieldContext({
      id: descriptorId("video", selector),
      kind: "video",
      label: cleanExcerpt(element.title || "סרטון"),
      selector,
      src: current,
      title: element.getAttribute("title") || ""
    }, element));
  });

  document.querySelectorAll(scopedSelector("a[href]")).forEach((element) => {
    if (element.closest("[data-cms-ignore]")) return;
    const selector = selectorFor(element);
    fields.push(addFieldContext({
      id: descriptorId("link", selector),
      kind: "link",
      label: cleanExcerpt(element.textContent || element.getAttribute("aria-label") || "קישור"),
      selector,
      href: element.getAttribute("href") || ""
    }, element));
  });

  document.querySelectorAll(`${scopedSelector("input")}, ${scopedSelector("textarea")}, ${scopedSelector("select")}`).forEach((element) => {
    if (element.closest("[data-cms-ignore]")) return;
    const selector = selectorFor(element);
    const placeholder = element.getAttribute("placeholder");
    if (placeholder) {
      fields.push(addFieldContext({
        id: descriptorId("form", selector, "::placeholder"),
        kind: "form",
        label: `טקסט עזר: ${cleanExcerpt(placeholder, 54)}`,
        selector,
        attribute: "placeholder",
        value: placeholder
      }, element));
    }
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel && ariaLabel !== placeholder) {
      fields.push(addFieldContext({
        id: descriptorId("form", selector, "::aria-label"),
        kind: "form",
        label: `שם נגיש: ${cleanExcerpt(ariaLabel, 54)}`,
        selector,
        attribute: "aria-label",
        value: ariaLabel
      }, element));
    }
    if (element.matches('input[type="submit"], input[type="button"]') && element.value) {
      fields.push(addFieldContext({
        id: descriptorId("form", selector, "::value"),
        kind: "form",
        label: `טקסט כפתור: ${cleanExcerpt(element.value, 54)}`,
        selector,
        attribute: "value",
        value: element.value
      }, element));
    }
    if (element.matches("select")) {
      [...element.options].forEach((option, optionIndex) => {
        if (!option.textContent.trim()) return;
        fields.push(addFieldContext({
          id: descriptorId("form", selector, `::option-${optionIndex}`),
          kind: "form",
          label: `אפשרות בחירה: ${cleanExcerpt(option.textContent, 50)}`,
          selector,
          attribute: "optionText",
          optionIndex,
          value: option.textContent.trim()
        }, element));
      });
    }
  });

  return fields.map((field, index) => ({ ...field, order: index }));
};

const applyOverride = (entry) => {
  if (!entry || typeof entry !== "object") return;
  if (entry.kind === "meta") {
    if (entry.selector === "title") document.title = String(entry.value || "").slice(0, 180);
    else {
      const element = document.querySelector(entry.selector);
      if (element) element.setAttribute(entry.attribute || "content", String(entry.value || "").slice(0, 800));
    }
    return;
  }

  const element = document.querySelector(entry.selector);
  if (!element) return;

  if (entry.kind === "text") {
    const node = directTextNode(element, Number(entry.textIndex || 0));
    if (!node) return;
    const original = node.nodeValue || "";
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    node.nodeValue = `${leading}${String(entry.value || "")}${trailing}`;
    return;
  }

  if (entry.kind === "form") {
    if (entry.attribute === "optionText") {
      const option = element.options?.[Number(entry.optionIndex)];
      if (option) option.textContent = String(entry.value || "").slice(0, 300);
    } else if (entry.attribute) {
      element.setAttribute(entry.attribute, String(entry.value || "").slice(0, 500));
      if (entry.attribute === "value") element.value = String(entry.value || "").slice(0, 500);
    }
    return;
  }

  if (entry.kind === "image") {
    const src = normalizePageUrl(entry.src);
    if (src) {
      element.setAttribute("src", src);
      element.closest("picture")?.querySelectorAll("source[srcset]").forEach((source) => source.setAttribute("srcset", src));
    }
    const decorative = Boolean(entry.decorative);
    element.setAttribute("alt", decorative ? "" : String(entry.alt || "").slice(0, 300));
    if (entry.title) element.setAttribute("title", String(entry.title).slice(0, 300));
    else element.removeAttribute("title");
    return;
  }

  if (entry.kind === "video") {
    const src = element.tagName === "IFRAME" ? normalizeVideoUrl(entry.src) : normalizePageUrl(entry.src);
    if (!src) return;
    if (element.tagName === "VIDEO" && element.querySelector("source")) {
      element.querySelector("source").setAttribute("src", src);
      element.load();
    } else {
      element.setAttribute("src", src);
    }
    if (entry.title) element.setAttribute("title", String(entry.title).slice(0, 300));
    return;
  }

  if (entry.kind === "link") {
    const href = normalizeLinkUrl(entry.href);
    if (href) element.setAttribute("href", href);
  }
};

const applyOverrides = (overrides = {}) => {
  Object.values(overrides).forEach(applyOverride);
  document.dispatchEvent(new CustomEvent("amit-cms-applied", { detail: { count: Object.keys(overrides).length } }));
};

const fetchPublishedOverrides = async () => {
  const id = pageId();
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${COLLECTION_NAME}/${id}?key=${FIREBASE_API_KEY}`;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (response.status === 404 || response.status === 403) return {};
    if (!response.ok) throw new Error(`CMS request failed with ${response.status}`);
    const documentData = await response.json();
    const payload = documentData?.fields?.payload?.stringValue;
    return payload ? JSON.parse(payload) : {};
  } catch (error) {
    console.warn("Site content could not be loaded.", error);
    return {};
  }
};

window.AmitCMS = {
  applyOverrides,
  fetchPublishedOverrides,
  normalizeLinkUrl,
  normalizePageUrl,
  normalizeVideoUrl,
  pageId,
  pagePath,
  scanEditableFields,
  selectorFor
};
document.documentElement.dataset.cmsReady = "true";

const publishedOverrides = await fetchPublishedOverrides();
applyOverrides(publishedOverrides);
window.AmitCMS.publishedOverrides = publishedOverrides;
document.dispatchEvent(new CustomEvent("amit-cms-ready"));
