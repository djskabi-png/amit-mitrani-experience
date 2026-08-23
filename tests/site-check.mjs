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
    if (value.includes("${")) continue;
    if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/)/i.test(value)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURI(value));
    assert.ok(fs.existsSync(resolved), `${relative}: missing local target ${value}`);
  }
}

const home = read(path.join(root, "index.html"));
assert.match(home, /<meta name="msvalidate\.01" content="373407FD78FC0D901E05BDBBFA68F00A">/, "Bing Webmaster verification tag is required");
assert.doesNotMatch(home, /מערכת הזמנות חכמה|רשימת שמות להצגה ראשונית|יחזקו את האתר בחיפושי Google/);
assert.match(home, /id="invitation" hidden aria-hidden="true"/);
assert.match(home, /const closeMobileMenu = \(\) =>/);
assert.match(home, /הודעת דואר אלקטרוני נשלחת לעמית עם העתק לאדיר לצורך בקרה/);
assert.match(read(path.join(root, "shows-for-kids.html")), /כמה עולה קוסם ליום הולדת\?/, "Kids page should answer the primary price-intent query");
assert.match(read(path.join(root, "shows-for-companies.html")), /כמה עולה אמן חושים לאירוע חברה\?/, "Corporate page should answer the primary price-intent query");
assert.match(read(path.join(root, "magician-bar-bat-mitzvah.html")), /כמה עולה קוסם לבר מצווה\?/, "Bar and Bat Mitzvah page should answer the primary price-intent query");
assert.match(read(path.join(root, "close-up-magic-receptions.html")), /כמה עולים קסמי קלוז אפ לקבלת פנים\?/, "Reception page should answer the primary price-intent query");
assert.match(read(path.join(root, "shows-for-families.html")), /כמה עולה מופע קסמים למשפחה\?/, "Families page should answer the primary price-intent query");
assert.match(read(path.join(root, "shows-for-institutions.html")), /כמה עולה מופע קסמים לבית ספר או לקייטנה\?/, "Institutions page should answer the primary price-intent query");
assert.match(read(path.join(root, "mentalist-adult-parties.html")), /כמה עולה אמן חושים ליום הולדת למבוגרים\?/, "Adult parties page should answer the primary price-intent query");
assert.match(read(path.join(root, "magician-brit-brita.html")), /כמה עולה קוסם לברית או לבריתה\?/, "Brit and Brita page should answer the primary price-intent query");
assert.match(read(path.join(root, "magician-purim-events.html")), /כמה עולה מופע קסמים לפורים\?/, "Purim page should answer the primary price-intent query");
assert.match(read(path.join(root, "business-magic.html")), /כמה עולה קסם מותאם למותג או לעסק\?/, "Business magic page should answer the primary price-intent query");
assert.match(read(path.join(root, "shows-abroad-hebrew.html")), /כמה עולה להזמין מופע קסמים בעברית בחו״ל\?/, "Shows abroad page should answer the primary price-intent query");

for (const locale of ["en", "fr", "ru"]) {
  const legal = read(path.join(root, locale, "legal.html"));
  assert.match(legal, /<meta name="description"/);
  assert.match(legal, /<link rel="canonical"/);
  assert.match(legal, /<meta name="robots" content="noindex,follow"/);
}

const sitemap = read(path.join(root, "sitemap.xml"));
assert.doesNotMatch(sitemap, /legal\.html|admin\.html|online-magic-courses\.html|cours-magie-en-ligne\.html|onlain-kursy-fokusov\.html/);
assert.match(read(path.join(root, "robots.txt")), /Sitemap: https:\/\/amitgic\.co\.il\/sitemap\.xml/);
assert.match(read(path.join(root, "robots.txt")), /Disallow: \/admin(?:\.html)?/, "Private admin routes must be excluded from crawling");
assert.equal(read(path.join(root, "10434512b7d347b1b575e3f42b4d53ce.txt")).trim(), "10434512b7d347b1b575e3f42b4d53ce", "IndexNow ownership key is required");

const indexedUrls = [...sitemap.matchAll(/<loc>(https:\/\/amitgic\.co\.il\/[^<]*)<\/loc>/g)].map((match) => match[1]);
assert.equal(indexedUrls.length, 51, "The sitemap must contain the complete 51-page public inventory");
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
  if (url.endsWith("/all-pages.html")) {
    assert.match(html, /<link rel="canonical" href="https:\/\/amitgic\.co\.il\/all-pages\.html">/, "Directory page requires a canonical URL");
    continue;
  }
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
  for (const match of relative === "magic-courses.html" ? [] : html.matchAll(/<img\b[^>]*>/gi)) {
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

for (const url of indexedUrls.filter((value) => !/^https:\/\/amitgic\.co\.il\/(?:en\/|fr\/|ru\/)?$/.test(value) && !/(?:guide-magician-pricing|all-pages|magic-courses)\.html$/.test(value))) {
  const html = read(urlToFile(url));
  assert.match(html, /data-seo="breadcrumbs"/, `${url}: breadcrumb schema is required`);
  assert.match(html, /"@type"\s*:\s*"FAQPage"/, `${url}: FAQ schema is required`);
  assert.match(html, /data-seo="service-webpage"/, `${url}: connected WebPage schema is required`);
  assert.match(html, /"provider"\s*:\s*\{\s*"@id"\s*:\s*"https:\/\/amitgic\.co\.il\/#amit-mitrani"/, `${url}: service provider must reference the canonical person entity`);
}

const pricingGuide = read(path.join(root, "guide-magician-pricing.html"));
assert.match(pricingGuide, /data-seo="article"/, "Pricing guide requires Article structured data");
assert.match(pricingGuide, /כמה עולה קוסם לאירוע\?/, "Pricing guide must answer the primary informational query");
assert.match(pricingGuide, /href="shows-for-kids\.html"/, "Pricing guide must connect to relevant service pages");

const llms = read(path.join(root, "llms.txt"));
assert.match(llms, /Canonical website: https:\/\/amitgic\.co\.il\//);
assert.match(llms, /Sitemap: https:\/\/amitgic\.co\.il\/sitemap\.xml/);
assert.match(llms, /magic\.org\.il/, "llms.txt should identify an independent professional authority source");

const analytics = read(path.join(root, "assets", "analytics.js"));
for (const eventName of ["whatsapp_click", "phone_click", "email_click", "generate_lead"]) {
  assert.match(analytics, new RegExp(eventName), `analytics.js: missing ${eventName} conversion event`);
}

console.log(`PASS: ${htmlFiles.length} HTML files checked`);
