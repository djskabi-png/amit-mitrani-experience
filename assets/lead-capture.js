import { db } from "./firebase-config.js";
import {
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

window.saveAmitLead = async (formData) => {
  const clean = (name, limit = 500) => String(formData.get(name) || "").trim().slice(0, limit);
  const payload = {
    name: clean("name", 100),
    phone: clean("phone", 30),
    interest: clean("interest", 120),
    date: clean("date", 20),
    city: clean("city", 120),
    participants: clean("participants", 12),
    message: clean("message", 1500),
    status: "new",
    source: location.href.slice(0, 500),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const result = await addDoc(collection(db, "leads"), payload);
  return result.id;
};
