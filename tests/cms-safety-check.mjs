import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [adminHtml, adminJs, cmsJs, firestoreRules, storageRules] = await Promise.all([
  read("admin.html"),
  read("assets/admin.js"),
  read("assets/cms-admin.js"),
  read("firestore.rules"),
  read("storage.rules")
]);

assert.match(adminHtml, /id="admin-confirm"/u, "CMS must provide an in-product confirmation dialog");
assert.match(adminHtml, /id="admin-confirm-cancel"/u, "Confirmation must expose a safe cancel action");
assert.match(adminHtml, /id="admin-confirm-approve"/u, "Confirmation must expose an explicit approval action");
assert.doesNotMatch(cmsJs, /\bconfirm\s*\(/u, "CMS must not use blocking browser-native confirms");
assert.doesNotMatch(adminJs, /\bconfirm\s*\(/u, "CRM must not use blocking browser-native confirms");
assert.doesNotMatch(adminHtml, /demo-button/u, "Production admin must not expose demo-data controls");
assert.doesNotMatch(adminJs, /deleteDoc|delete-lead|data-task-delete/u, "Daily admin must not expose irreversible lead or task deletion");

for (const email of ["djskabi@gmail.com", "amitmagician6@gmail.com"]) {
  assert.match(firestoreRules, new RegExp(email.replace(".", "\\."), "u"), `Firestore must authorize ${email}`);
  assert.match(storageRules, new RegExp(email.replace(".", "\\."), "u"), `Storage must authorize ${email}`);
}

assert.match(firestoreRules, /match \/siteContent\/\{pageId\}/u, "Firestore must protect siteContent documents");
assert.match(firestoreRules, /request\.resource\.data\.updatedBy == request\.auth\.token\.email/u, "CMS writes must be attributed to the authenticated account");
assert.match(firestoreRules, /request\.resource\.data\.history\.size\(\) <= 5/u, "CMS history must be bounded");
assert.match(storageRules, /request\.resource\.contentType\.matches\('\(image\|video\)\/\.\*'\)/u, "CMS uploads must be restricted to images and videos");
assert.match(storageRules, /request\.resource\.size < 80 \* 1024 \* 1024/u, "CMS uploads must have a size limit");

console.log("PASS: CMS safety and authorization source checks");
