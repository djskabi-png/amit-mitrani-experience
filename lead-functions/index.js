import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import nodemailer from "nodemailer";

initializeApp();
const db = getFirestore();
const AMIT_EMAIL = "amitmagician6@gmail.com";
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
  `הודעה: ${text(lead.message, "לא נכתבה הודעה")}`
];

const attributionLines = (lead) => [
  `Source: ${text(lead.source)}`,
  `Medium: ${text(lead.medium)}`,
  `Campaign: ${text(lead.campaign)}`,
  `Ad / Content: ${text(lead.content)}`,
  `Term: ${text(lead.term)}`,
  `Referrer: ${text(lead.referrer)}`,
  `Landing Page: ${text(lead.landingPage)}`,
  `Form Page: ${text(lead.formPage)}`,
  `UTM parameters: ${text(lead.utmParameters, "לא נמצאו פרמטרים")}`
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
  const attribution = attributionLines(lead);
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
      user: AMIT_EMAIL,
      pass: SMTP_PASSWORD.value()
    }
  });

  try {
    const result = await transporter.sendMail({
      from: `"אתר עמית מיטרני" <${AMIT_EMAIL}>`,
      to: AMIT_EMAIL,
      replyTo: text(lead.email, AMIT_EMAIL),
      subject,
      text: `${lines.join("\n")}\n\nמקור הליד:\n${attribution.join("\n")}\n\nמערכת הניהול: https://amitgic.co.il/admin.html`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7"><h2>${escapeHtml(subject)}</h2>${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<div style="margin-top:24px;padding:16px;border:1px solid #ddd;border-radius:12px;background:#f7f7f7"><h3 style="margin-top:0">מקור הליד</h3>${attribution.map((line) => `<p dir="ltr" style="text-align:left">${escapeHtml(line)}</p>`).join("")}</div><p><a href="https://amitgic.co.il/admin.html">פתיחת מערכת הניהול</a></p></div>`
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
