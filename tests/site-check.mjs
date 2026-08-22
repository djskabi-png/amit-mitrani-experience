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

console.log(`PASS: ${htmlFiles.length} HTML files checked`);
