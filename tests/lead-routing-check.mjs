import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const allSource = [
  "assets/admin.js", "assets/lead-capture.js", "assets/share.js",
  "lead-functions/index.js", "firestore.rules", "storage.rules", "index.html"
].map(read).join("\n");

assert.doesNotMatch(allSource, /djskabi@gmail\.com/i, "Former address must not remain in lead or admin code");

const notifier = read("lead-functions/index.js");
assert.match(notifier, /from: `"אתר עמית מיטרני" <\$\{AMIT_EMAIL\}>`/);
assert.match(notifier, /to: AMIT_EMAIL/);
assert.doesNotMatch(notifier, /\bcc\s*:|\bbcc\s*:/i);
assert.match(notifier, /replyTo: text\(lead\.email, AMIT_EMAIL\)/);
for (const field of ["Source", "Medium", "Campaign", "Ad / Content", "Referrer", "Landing Page", "Form Page", "UTM parameters"]) {
  assert.match(notifier, new RegExp(field.replace("/", "\\/")), `Lead email is missing ${field}`);
}

const capture = read("assets/lead-capture.js");
for (const field of ["source", "medium", "campaign", "content", "term", "referrer", "landingPage", "formPage", "utmParameters"]) {
  assert.match(capture, new RegExp(`${field}:`), `Lead capture is missing ${field}`);
}

const formPages = [
  "index.html", "business-magic.html", "close-up-magic-receptions.html",
  "magician-bar-bat-mitzvah.html", "magician-brit-brita.html", "magician-purim-events.html",
  "mentalist-adult-parties.html", "shows-abroad-hebrew.html", "shows-for-companies.html",
  "shows-for-families.html", "shows-for-institutions.html", "shows-for-kids.html"
];
for (const file of formPages) {
  const html = read(file);
  assert.match(html, /<form/i, `${file} should contain a customer form`);
  assert.match(html, /share\.js\?v=4/, `${file} should load the current lead capture bundle`);
}

console.log(`PASS: lead routing and attribution checks (${formPages.length} forms)`);
