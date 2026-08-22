import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyD_UIZZiiwrKrNMQQAtmO3m4HjVw38VhoY",
  authDomain: "amit-mitrani-crm.firebaseapp.com",
  projectId: "amit-mitrani-crm",
  storageBucket: "amit-mitrani-crm.firebasestorage.app",
  messagingSenderId: "292775906846",
  appId: "1:292775906846:web:d200c406baef12be15a80f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
