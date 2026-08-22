import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";

initializeApp();
const db = getFirestore();
const AMIT_EMAIL = "amitmagician6@gmail.com";
const ADIR_EMAIL = "djskabi@gmail.com";

const text = (value, fallback = "לא צוין") => String(value ?? "").trim() || fallback;
const escapeHtml = (value) => text(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[character]));

const leadLines = (lead, leadId) => [
  `מספר פנייה: ${text(lead.requestNumber, leadId)}`,
  `שם: ${text(lead.name)}`,
  `טלפון: ${text(lead.phone)}`,
  `דוא״ל: ${text(lead.email)}`,
  `סוג פנייה: ${text(lead.interest)}`,
  `תאריך: ${text(lead.date)}`,
  `מקום: ${text([lead.country, lead.city].filter(Boolean).join(", "))}`,
  `משתתפים: ${text(lead.participants)}`,
  `הודעה: ${text(lead.message, "לא נכתבה הודעה")}`,
  `מקור: ${text(lead.source)}`
];

export const notifyAmitOfLead = onDocumentCreated({
  document: "leads/{leadId}",
  region: "me-west1"
}, async (event) => {
  const lead = event.data?.data();
  if (!lead) return;
  const leadId = event.params.leadId;
  const lines = leadLines(lead, leadId);
  const subject = `פנייה חדשה מהאתר: ${text(lead.interest, "פנייה כללית")}`;
  const mailRef = db.collection("mail").doc(`lead-${leadId}`);
  const leadRef = db.collection("leads").doc(leadId);
  const batch = db.batch();
  batch.create(mailRef, {
    to: [AMIT_EMAIL],
    cc: [ADIR_EMAIL],
    replyTo: text(lead.email, ADIR_EMAIL),
    message: {
      subject,
      text: lines.join("\n"),
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7"><h2>${escapeHtml(subject)}</h2>${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<p><a href="https://amitgic.co.il/admin.html">פתיחת מערכת הניהול</a></p></div>`
    },
    leadId,
    createdAt: FieldValue.serverTimestamp()
  });
  batch.set(leadRef, {
    notificationStatus: "queued",
    notificationQueuedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
});

export const syncLeadEmailDelivery = onDocumentUpdated({
  document: "mail/{messageId}",
  region: "me-west1"
}, async (event) => {
  const mail = event.data?.after.data();
  if (!mail?.leadId) return;
  const state = String(mail.delivery?.state || "").toUpperCase();
  if (!state || ["PENDING", "PROCESSING"].includes(state)) return;
  const notificationStatus = state === "SUCCESS" ? "sent" : "failed";
  await db.collection("leads").doc(mail.leadId).set({
    notificationStatus,
    notificationMessageId: event.params.messageId,
    notificationUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
});
