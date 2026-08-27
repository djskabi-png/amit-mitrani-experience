import { db } from "./firebase-config.js";
import {
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const ATTRIBUTION_KEY = "amitLeadAttributionV1";
const ATTRIBUTION_MAX_AGE = 90 * 24 * 60 * 60 * 1000;

const limited = (value, limit = 500) => String(value || "").trim().slice(0, limit);

const detectAttribution = () => {
  const url = new URL(location.href);
  const params = url.searchParams;
  const utm = {};
  for (const [key, value] of params.entries()) {
    if (key.toLowerCase().startsWith("utm_") || ["gclid", "fbclid", "ttclid", "msclkid", "igshid"].includes(key.toLowerCase())) {
      utm[key.toLowerCase()] = limited(value, 300);
    }
  }

  const rawSource = limited(params.get("utm_source"), 120).toLowerCase();
  const rawMedium = limited(params.get("utm_medium"), 120).toLowerCase();
  const referrer = limited(document.referrer, 1000);
  let referrerHost = "";
  try { referrerHost = new URL(referrer).hostname.toLowerCase(); } catch {}

  let source = rawSource;
  let medium = rawMedium;
  const isPaid = /cpc|ppc|paid|display|ads?/.test(rawMedium);
  if (params.has("gclid")) { source = "Google Ads"; medium ||= "cpc"; }
  else if (params.has("fbclid") || ((/facebook|instagram|meta/.test(rawSource)) && isPaid)) { source = "Meta Ads"; medium ||= "paid_social"; }
  else if (params.has("ttclid")) { source = "TikTok Ads"; medium ||= "paid_social"; }
  else if (!source && /(^|\.)google\./.test(referrerHost)) { source = "Google Organic"; medium = "organic"; }
  else if (!source && /(^|\.)instagram\.com$/.test(referrerHost)) { source = "Instagram"; medium = "social"; }
  else if (!source && /(^|\.)facebook\.com$|(^|\.)facebook\.net$/.test(referrerHost)) { source = "Facebook"; medium = "social"; }
  else if (!source && /(^|\.)tiktok\.com$/.test(referrerHost)) { source = "TikTok"; medium = "social"; }
  else if (!source && /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(referrerHost)) { source = "YouTube"; medium = "video"; }
  else if (!source && referrerHost) { source = referrerHost; medium = "referral"; }
  else if (!source) { source = "Direct"; medium = "none"; }

  return {
    source: limited(source, 120),
    medium: limited(medium || "not set", 120),
    campaign: limited(params.get("utm_campaign"), 200),
    content: limited(params.get("utm_content"), 300),
    term: limited(params.get("utm_term"), 300),
    referrer,
    landingPage: limited(location.href, 1000),
    utmParameters: limited(JSON.stringify(utm), 2000),
    capturedAt: Date.now()
  };
};

const readStoredAttribution = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || "null");
    return stored && Date.now() - Number(stored.capturedAt || 0) < ATTRIBUTION_MAX_AGE ? stored : null;
  } catch { return null; }
};

const currentAttribution = detectAttribution();
const hasCampaignSignal = Object.keys(JSON.parse(currentAttribution.utmParameters || "{}")).length > 0;
let leadAttribution = readStoredAttribution();
if (!leadAttribution || hasCampaignSignal) {
  leadAttribution = currentAttribution;
  try { localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(leadAttribution)); } catch {}
}

window.saveAmitLead = async (formData) => {
  const clean = (name, limit = 500) => String(formData.get(name) || "").trim().slice(0, limit);
  const isBookingRequest = Boolean(formData.get("product"));
  const payload = {
    name: clean("name", 100),
    phone: clean("phone", 30),
    email: clean("email", 180),
    interest: clean("interest", 120) || clean("product", 120),
    product: clean("product", 120),
    date: clean("date", 20),
    country: clean("country", 120),
    city: clean("city", 120),
    participants: clean("participants", 12),
    message: clean("message", 1500) || clean("notes", 1500),
    requestType: isBookingRequest ? "booking_request" : "contact_request",
    requestNumber: clean("requestNumber", 40),
    status: "pending",
    notificationStatus: "not_configured",
    source: limited(leadAttribution.source, 120),
    medium: limited(leadAttribution.medium, 120),
    campaign: limited(leadAttribution.campaign, 200),
    content: limited(leadAttribution.content, 300),
    term: limited(leadAttribution.term, 300),
    referrer: limited(leadAttribution.referrer, 1000),
    landingPage: limited(leadAttribution.landingPage, 1000),
    formPage: limited(location.href, 1000),
    utmParameters: limited(leadAttribution.utmParameters, 2000),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const result = await addDoc(collection(db, "leads"), payload);
  return result.id;
};

const attachBookingForms = () => {
  document.querySelectorAll("#commerce-form").forEach((form) => {
    if (form.dataset.crmConnected === "true") return;
    form.dataset.crmConnected = "true";

    form.addEventListener("submit", async () => {
      if (!form.checkValidity() || form.dataset.crmSaving === "true") return;
      form.dataset.crmSaving = "true";

      const status = document.querySelector("#commerce-error");
      const data = new FormData(form);
      const generatedNumber = document.querySelector("#order-number")?.textContent?.trim()
        || `EVENT-${Date.now().toString().slice(-7)}`;
      data.set("requestNumber", generatedNumber);

      try {
        await window.saveAmitLead(data);
        const success = document.querySelector("#success-message");
        if (success) {
          success.textContent = "בקשת ההזמנה נשמרה במערכת וממתינה לאישור עמית. אפשר לשלוח גם הודעת וואטסאפ.";
        }
      } catch (error) {
        if (status) {
          status.textContent = "הפנייה לא נשמרה במערכת. אפשר לשלוח אותה בוואטסאפ ולנסות שוב מאוחר יותר.";
        }
      } finally {
        form.dataset.crmSaving = "false";
      }
    });
  });
};

attachBookingForms();
