const FIREBASE_PROJECT_ID = "amit-mitrani-crm";
const FIREBASE_API_KEY = "AIzaSyD_UIZZiiwrKrNMQQAtmO3m4HjVw38VhoY";
const COLLECTION_NAME = "siteContent";

const ignoredAncestors = "script, style, noscript, svg, input, textarea, select, option, [data-cms-ignore]";
const textScopes = "header, main, footer";

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

const contextLabel = (element, fallback) => {
  const section = element.closest("section, article, header, footer, nav") || element.parentElement;
  const heading = section?.querySelector("h1, h2, h3, h4, [class*='title']");
  const text = heading?.textContent?.trim();
  return (text && text !== fallback ? text : fallback).slice(0, 90);
};

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

const descriptorId = (kind, selector, suffix = "") => `${kind}:${selector}${suffix}`;

const scanEditableFields = () => {
  const fields = [
    {
      id: "meta:title",
      kind: "meta",
      label: "כותרת הדפדפן והחיפוש",
      selector: "title",
      value: document.title
    }
  ];

  const description = document.querySelector('meta[name="description"]');
  if (description) {
    fields.push({
      id: "meta:description",
      kind: "meta",
      label: "תיאור העמוד במנועי חיפוש",
      selector: 'meta[name="description"]',
      value: description.content
    });
  }

  document.querySelectorAll(textScopes).forEach((scope) => {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      const value = node.nodeValue?.trim() || "";
      if (value && parent && !parent.closest(ignoredAncestors)) {
        const selector = selectorFor(parent);
        const index = textNodeIndex(node);
        fields.push({
          id: descriptorId("text", selector, `::${index}`),
          kind: "text",
          label: contextLabel(parent, value),
          selector,
          textIndex: index,
          value
        });
      }
      node = walker.nextNode();
    }
  });

  document.querySelectorAll("img").forEach((element) => {
    if (element.closest("[data-cms-ignore]")) return;
    const selector = selectorFor(element);
    fields.push({
      id: descriptorId("image", selector),
      kind: "image",
      label: contextLabel(element, element.alt || "תמונה"),
      selector,
      src: element.getAttribute("src") || "",
      alt: element.getAttribute("alt") || ""
    });
  });

  document.querySelectorAll("video, iframe").forEach((element) => {
    if (element.closest("[data-cms-ignore]")) return;
    const current = element.getAttribute("src") || element.querySelector("source")?.getAttribute("src") || "";
    if (element.tagName === "IFRAME" && !/youtube|youtu\.be|vimeo/i.test(current)) return;
    const selector = selectorFor(element);
    fields.push({
      id: descriptorId("video", selector),
      kind: "video",
      label: contextLabel(element, element.title || "סרטון"),
      selector,
      src: current,
      title: element.getAttribute("title") || ""
    });
  });

  document.querySelectorAll("main a[href]").forEach((element) => {
    if (element.closest("[data-cms-ignore]")) return;
    const selector = selectorFor(element);
    fields.push({
      id: descriptorId("link", selector),
      kind: "link",
      label: contextLabel(element, element.textContent?.trim() || "קישור"),
      selector,
      href: element.getAttribute("href") || ""
    });
  });

  return fields;
};

const applyOverride = (entry) => {
  if (!entry || typeof entry !== "object") return;
  if (entry.kind === "meta") {
    if (entry.selector === "title") document.title = String(entry.value || "").slice(0, 180);
    else {
      const element = document.querySelector(entry.selector);
      if (element) element.setAttribute("content", String(entry.value || "").slice(0, 500));
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

  if (entry.kind === "image") {
    const src = normalizePageUrl(entry.src);
    if (src) element.setAttribute("src", src);
    element.setAttribute("alt", String(entry.alt || "").slice(0, 300));
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
  scanEditableFields
};
document.documentElement.dataset.cmsReady = "true";

const publishedOverrides = await fetchPublishedOverrides();
applyOverrides(publishedOverrides);
window.AmitCMS.publishedOverrides = publishedOverrides;
document.dispatchEvent(new CustomEvent("amit-cms-ready"));
