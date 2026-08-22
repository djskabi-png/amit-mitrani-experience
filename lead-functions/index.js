import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import nodemailer from "nodemailer";

initializeApp();
const db = getFirestore();
const AMIT_EMAIL = "amitmagician6@gmail.com";
const ADIR_EMAIL = "djskabi@gmail.com";
const SMTP_PASSWORD = defineSecret("AMIT_SMTP_PASSWORD");

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
  region: "me-west1",
  secrets: [SMTP_PASSWORD]
}, async (event) => {
  const lead = event.data?.data();
  if (!lead) return;
  const leadId = event.params.leadId;
  const lines = leadLines(lead, leadId);
  const subject = `פנייה חדשה מהאתר: ${text(lead.interest, "פנייה כללית")}`;
  const leadRef = db.collection("leads").doc(leadId);
  const claimed = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(leadRef);
    if (current.data()?.notificationAttemptId) return false;
    transaction.set(leadRef, {
      notificationAttemptId: event.id,
      notificationStatus: "sending",
      notificationStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  });
  if (!claimed) return;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: ADIR_EMAIL,
      pass: SMTP_PASSWORD.value()
    }
  });

  try {
    const result = await transporter.sendMail({
      from: `"אתר עמית מיטרני" <${ADIR_EMAIL}>`,
      to: AMIT_EMAIL,
      cc: ADIR_EMAIL,
      replyTo: text(lead.email, AMIT_EMAIL),
      subject,
      text: `${lines.join("\n")}\n\nמערכת הניהול: https://amitgic.co.il/admin.html`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7"><h2>${escapeHtml(subject)}</h2>${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<p><a href="https://amitgic.co.il/admin.html">פתיחת מערכת הניהול</a></p></div>`
    });
    await leadRef.set({
      notificationStatus: "sent",
      notificationMessageId: result.messageId || "",
      notificationAccepted: result.accepted || [],
      notificationRejected: result.rejected || [],
      notificationSentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    await leadRef.set({
      notificationStatus: "failed",
      notificationError: String(error?.message || error).slice(0, 500),
      notificationFailedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    throw error;
  }
});
