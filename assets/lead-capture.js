import { db } from "./firebase-config.js";
import {
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

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
    source: location.href.slice(0, 500),
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
