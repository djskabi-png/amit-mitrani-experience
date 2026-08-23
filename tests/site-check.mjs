import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  if ([".git", "node_modules", "tests"].includes(entry.name)) return [];
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

const files = walk(root);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
const read = (file) => fs.readFileSync(file, "utf8");
assert.ok(htmlFiles.length >= 50, "Expected the full multilingual site inventory");
assert.ok(fs.existsSync(path.join(root, "404.html")), "A branded 404 page is required");

for (const file of htmlFiles) {
  const html = read(file);
  const relative = path.relative(root, file).replaceAll("\\", "/");
  assert.match(html, /<html\s+lang="[^"]+"\s+dir="(?:rtl|ltr)"/i, `${relative}: language and direction are required`);
  assert.match(html, /<meta\s+name="viewport"/i, `${relative}: viewport is required`);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${relative}: duplicate ids found`);
  for (const match of html.matchAll(/\s(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
    const value = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/)/i.test(value)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURI(value));
    assert.ok(fs.existsSync(resolved), `${relative}: missing local target ${value}`);
  }
}

const home = read(path.join(root, "index.html"));
assert.doesNotMatch(home, /מערכת הזמנות חכמה|רשימת שמות להצגה ראשונית|יחזקו את האתר בחיפושי Google/);
assert.match(home, /id="invitation" hidden aria-hidden="true"/);
assert.match(home, /const closeMobileMenu = \(\) =>/);
assert.match(home, /הודעת דואר אלקטרוני נשלחת לעמית עם העתק לאדיר לצורך בקרה/);

for (const locale of ["en", "fr", "ru"]) {
  const legal = read(path.join(root, locale, "legal.html"));
  assert.match(legal, /<meta name="description"/);
  assert.match(legal, /<link rel="canonical"/);
  assert.match(legal, /<meta name="robots" content="noindex,follow"/);
}

const sitemap = read(path.join(root, "sitemap.xml"));
assert.doesNotMatch(sitemap, /legal\.html|admin\.html|magic-courses\.html|online-magic-courses\.html|cours-magie-en-ligne\.html|onlain-kursy-fokusov\.html/);
assert.match(read(path.join(root, "robots.txt")), /Sitemap: https:\/\/amitgic\.co\.il\/sitemap\.xml/);

const indexedUrls = [...sitemap.matchAll(/<loc>(https:\/\/amitgic\.co\.il\/[^<]*)<\/loc>/g)].map((match) => match[1]);
assert.equal(indexedUrls.length, 48, "The sitemap must contain the complete 48-page public inventory");
assert.equal(new Set(indexedUrls).size, indexedUrls.length, "The sitemap must not contain duplicate URLs");

const urlToFile = (url) => {
  const relative = url.slice("https://amitgic.co.il/".length);
  if (!relative) return path.join(root, "index.html");
  if (["en/", "fr/", "ru/"].includes(relative)) return path.join(root, relative, "index.html");
  return path.join(root, ...relative.split("/"));
};

for (const url of indexedUrls) {
  const file = urlToFile(url);
  const html = read(file);
  const relative = path.relative(root, file).replaceAll("\\", "/");
  assert.match(html, /GTM-M7H725PC/, `${relative}: Google Tag Manager container is required`);
  assert.match(html, /analytics\.js/, `${relative}: conversion tracking script is required`);
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  assert.equal(canonical, url, `${relative}: canonical must match the sitemap URL`);
  assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">/, `${relative}: explicit preview-friendly index directive is required`);
  for (const language of ["he", "en", "fr", "ru", "x-default"]) {
    assert.match(html, new RegExp(`hreflang="${language}"`, "i"), `${relative}: missing ${language} hreflang`);
  }
  for (const field of ["og:url", "og:image:alt", "og:site_name", "twitter:card", "twitter:title", "twitter:description", "twitter:image", "twitter:image:alt"]) {
    assert.match(html, new RegExp(field.replace(":", "\\:"), "i"), `${relative}: missing ${field}`);
  }
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    assert.match(match[0], /\salt="[^"]*"/i, `${relative}: every image requires an alt attribute`);
    assert.match(match[0], /\swidth="\d+"/i, `${relative}: every image requires an explicit width`);
    assert.match(match[0], /\sheight="\d+"/i, `${relative}: every image requires an explicit height`);
  }
  for (const match of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    assert.doesNotThrow(() => JSON.parse(match[1]), `${relative}: invalid JSON-LD`);
  }
}

for (const localeHome of ["index.html", "en/index.html", "fr/index.html", "ru/index.html"]) {
  assert.match(read(path.join(root, localeHome)), /data-seo="entity-graph"/, `${localeHome}: entity graph is required`);
}

for (const url of indexedUrls.filter((value) => !/^https:\/\/amitgic\.co\.il\/(?:en\/|fr\/|ru\/)?$/.test(value))) {
  const html = read(urlToFile(url));
  assert.match(html, /data-seo="breadcrumbs"/, `${url}: breadcrumb schema is required`);
  assert.match(html, /"@type"\s*:\s*"FAQPage"/, `${url}: FAQ schema is required`);
  assert.match(html, /data-seo="service-webpage"/, `${url}: connected WebPage schema is required`);
  assert.match(html, /"provider"\s*:\s*\{\s*"@id"\s*:\s*"https:\/\/amitgic\.co\.il\/#amit-mitrani"/, `${url}: service provider must reference the canonical person entity`);
}

const llms = read(path.join(root, "llms.txt"));
assert.match(llms, /Canonical website: https:\/\/amitgic\.co\.il\//);
assert.match(llms, /Sitemap: https:\/\/amitgic\.co\.il\/sitemap\.xml/);
assert.match(llms, /magic\.org\.il/, "llms.txt should identify an independent professional authority source");

const analytics = read(path.join(root, "assets", "analytics.js"));
for (const eventName of ["whatsapp_click", "phone_click", "email_click", "generate_lead"]) {
  assert.match(analytics, new RegExp(eventName), `analytics.js: missing ${eventName} conversion event`);
}

console.log(`PASS: ${htmlFiles.length} HTML files checked`);
