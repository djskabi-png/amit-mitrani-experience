import { auth, db } from "./firebase-config.js";
import { startCms } from "./cms-admin.js?v=2";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const ADMIN_EMAILS = new Set([
  "djskabi@gmail.com",
  "amitmagician6@gmail.com",
]);
const localCmsQa = ["127.0.0.1", "localhost"].includes(window.location.hostname)
  && new URLSearchParams(window.location.search).has("cmsQa");
const statusLabels = {
  pending: "ממתין לאישור",
  new: "חדש",
  approved: "אושר",
  contacted: "נוצר קשר",
  quoted: "נשלחה הצעה",
  booked: "נסגר",
  declined: "לא אושר",
  closed: "לא רלוונטי"
};

const loginScreen = document.querySelector("#login-screen");
const dashboard = document.querySelector("#dashboard");
const loginButton = document.querySelector("#login-button");
const logoutButton = document.querySelector("#logout-button");
const loginError = document.querySelector("#login-error");
const userLabel = document.querySelector("#user-label");
const leadList = document.querySelector("#lead-list");
const leadDetail = document.querySelector("#lead-detail");
const searchInput = document.querySelector("#lead-search");
const statusFilter = document.querySelector("#status-filter");
const taskList = document.querySelector("#task-list");
const taskForm = document.querySelector("#task-form");

let leads = [];
let tasks = [];
let selectedLeadId = "";
let unsubscribeLeads = null;
let unsubscribeTasks = null;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[character]));

const showToast = (message) => {
  const toast = document.querySelector("#admin-toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
};

const formatDate = (value) => {
  if (!value) return "לא צוין";
  if (typeof value.toDate === "function") {
    return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(value.toDate());
  }
  return escapeHtml(value);
};

const phoneHref = (phone) => "tel:" + String(phone || "").replace(/[^\d+]/g, "");
const whatsappHref = (phone, name) => {
  const normalized = String(phone || "").replace(/\D/g, "").replace(/^0/, "972");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(`היי ${name || ""}, עמית מיטרני כאן, חוזר אליך לגבי הפנייה מהאתר.`)}`;
};

const updateStats = () => {
  document.querySelector("#stat-new").textContent = leads.filter((lead) => ["pending", "new"].includes(lead.status)).length;
  document.querySelector("#stat-open").textContent = leads.filter((lead) => ["approved", "contacted", "quoted"].includes(lead.status)).length;
  document.querySelector("#stat-booked").textContent = leads.filter((lead) => lead.status === "booked").length;
  document.querySelector("#stat-total").textContent = leads.length;
};

const filteredLeads = () => {
  const term = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  return leads.filter((lead) => {
    const matchesStatus = status === "all"
      || lead.status === status
      || (status === "pending" && lead.status === "new");
    const haystack = [lead.name, lead.phone, lead.email, lead.interest, lead.city, lead.message, lead.requestNumber].join(" ").toLowerCase();
    return matchesStatus && (!term || haystack.includes(term));
  });
};

const renderLeads = () => {
  updateStats();
  const visible = filteredLeads();
  if (!visible.length) {
    leadList.innerHTML = `<div class="empty">${leads.length ? "לא נמצאו פניות בסינון שנבחר." : "עדיין אין פניות. אפשר להוסיף נתוני הדגמה כדי להציג את המערכת."}</div>`;
    return;
  }

  leadList.innerHTML = visible.map((lead) => `
    <article class="lead-card ${lead.id === selectedLeadId ? "active" : ""}" tabindex="0" role="button" data-lead-id="${escapeHtml(lead.id)}">
      <div>
        <div class="lead-title">
          <strong>${escapeHtml(lead.name || "ללא שם")}</strong>
          <span class="badge badge-${escapeHtml(lead.status || "pending")}">${escapeHtml(statusLabels[lead.status] || "ממתין לאישור")}</span>
        </div>
        <p>${escapeHtml(lead.interest || "פנייה כללית")} · ${escapeHtml(lead.city || "מיקום לא צוין")}</p>
      </div>
      <time class="lead-time">${formatDate(lead.createdAt)}</time>
    </article>
  `).join("");

  leadList.querySelectorAll("[data-lead-id]").forEach((card) => {
    const open = () => selectLead(card.dataset.leadId);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
};

const selectLead = (id) => {
  selectedLeadId = id;
  const lead = leads.find((item) => item.id === id);
  renderLeads();
  if (!lead) return;

  leadDetail.innerHTML = `
    <h3>${escapeHtml(lead.name || "פנייה")}</h3>
    ${lead.demo ? '<p class="badge badge-quoted">נתוני הדגמה</p>' : ""}
    ${lead.requestType === "booking_request" ? '<p class="badge badge-pending">בקשת הזמנה</p>' : '<p class="badge">פנייה כללית</p>'}
    <div class="detail-grid">
      <div class="detail-row"><small>מספר פנייה</small><strong>${escapeHtml(lead.requestNumber || lead.id)}</strong></div>
      <div class="detail-row"><small>טלפון</small><a href="${phoneHref(lead.phone)}">${escapeHtml(lead.phone || "לא צוין")}</a></div>
      <div class="detail-row"><small>דוא״ל</small>${lead.email ? `<a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a>` : "<strong>לא צוין</strong>"}</div>
      <div class="detail-row"><small>סוג אירוע או פנייה</small><strong>${escapeHtml(lead.interest || "לא צוין")}</strong></div>
      <div class="detail-row"><small>תאריך</small><strong>${escapeHtml(lead.date || "לא צוין")}</strong></div>
      <div class="detail-row"><small>מקום</small><strong>${escapeHtml([lead.country, lead.city].filter(Boolean).join(", ") || "לא צוין")}</strong></div>
      <div class="detail-row"><small>מספר משתתפים</small><strong>${escapeHtml(lead.participants || "לא צוין")}</strong></div>
      <div class="detail-row"><small>פרטים נוספים</small><span>${escapeHtml(lead.message || "לא נכתבו פרטים נוספים")}</span></div>
      <div class="detail-row"><small>התראת מייל</small><strong>${lead.notificationStatus === "sent" ? "נשלחה" : "ממתינה לחיבור שירות מייל"}</strong></div>
    </div>
    <label><small>סטטוס טיפול</small>
      <select class="control" id="detail-status">
        ${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${lead.status === value ? "selected" : ""}>${label}</option>`).join("")}
      </select>
    </label>
    <label><small>הערת ניהול</small><textarea class="control" id="detail-note" placeholder="מה סוכם, מתי חוזרים, מה הצעד הבא">${escapeHtml(lead.note || "")}</textarea></label>
    <div class="detail-actions">
      ${["pending", "new"].includes(lead.status) ? '<button class="btn btn-primary" id="approve-lead" type="button">אישור הבקשה</button><button class="btn" id="decline-lead" type="button">אי אישור</button>' : ""}
      <button class="btn btn-primary" id="save-lead" type="button">שמירת עדכון</button>
      <a class="btn" href="${whatsappHref(lead.phone, lead.name)}" target="_blank" rel="noopener">וואטסאפ</a>
      <a class="btn" href="${phoneHref(lead.phone)}">חיוג</a>
      <button class="btn btn-danger" id="delete-lead" type="button">מחיקה</button>
    </div>
  `;

  document.querySelector("#approve-lead")?.addEventListener("click", async () => {
    await updateDoc(doc(db, "leads", id), {
      status: "approved",
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    showToast("הבקשה אושרה.");
  });

  document.querySelector("#decline-lead")?.addEventListener("click", async () => {
    await updateDoc(doc(db, "leads", id), {
      status: "declined",
      updatedAt: serverTimestamp()
    });
    showToast("הבקשה סומנה כלא מאושרת.");
  });

  document.querySelector("#save-lead").addEventListener("click", async () => {
    await updateDoc(doc(db, "leads", id), {
      status: document.querySelector("#detail-status").value,
      note: document.querySelector("#detail-note").value.trim().slice(0, 2000),
      updatedAt: serverTimestamp()
    });
    showToast("הפנייה עודכנה.");
  });

  document.querySelector("#delete-lead").addEventListener("click", async () => {
    if (!confirm("למחוק את הפנייה? הפעולה אינה ניתנת לביטול.")) return;
    await deleteDoc(doc(db, "leads", id));
    selectedLeadId = "";
    leadDetail.innerHTML = '<h3>פרטי הפנייה</h3><p class="empty">הפנייה נמחקה.</p>';
    showToast("הפנייה נמחקה.");
  });
};

const renderTasks = () => {
  if (!tasks.length) {
    taskList.innerHTML = '<p class="empty">אין משימות פתוחות.</p>';
    return;
  }
  taskList.innerHTML = tasks.map((task) => `
    <div class="quick-item ${task.done ? "done" : ""}">
      <input type="checkbox" ${task.done ? "checked" : ""} data-task-toggle="${escapeHtml(task.id)}" aria-label="סימון משימה">
      <span>${escapeHtml(task.title)}</span>
      <button type="button" data-task-delete="${escapeHtml(task.id)}" aria-label="מחיקת משימה">מחיקה</button>
    </div>
  `).join("");

  taskList.querySelectorAll("[data-task-toggle]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => updateDoc(doc(db, "tasks", checkbox.dataset.taskToggle), {
      done: checkbox.checked,
      updatedAt: serverTimestamp()
    }));
  });
  taskList.querySelectorAll("[data-task-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteDoc(doc(db, "tasks", button.dataset.taskDelete)));
  });
};

const startRealtime = () => {
  unsubscribeLeads?.();
  unsubscribeTasks?.();
  unsubscribeLeads = onSnapshot(query(collection(db, "leads"), orderBy("createdAt", "desc")), (snapshot) => {
    leads = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderLeads();
    if (selectedLeadId) selectLead(selectedLeadId);
  }, () => {
    leadList.innerHTML = '<div class="empty">לא הצלחנו לטעון את הפניות. רעננו את העמוד ונסו שוב.</div>';
  });
  unsubscribeTasks = onSnapshot(query(collection(db, "tasks"), orderBy("createdAt", "desc")), (snapshot) => {
    tasks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderTasks();
  });
};

loginButton.addEventListener("click", async () => {
  loginError.textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    loginError.textContent = "הכניסה לא הושלמה. נסו שוב ובחרו בחשבון הניהול.";
  }
});

logoutButton.addEventListener("click", () => signOut(auth));
searchInput.addEventListener("input", renderLeads);
statusFilter.addEventListener("change", renderLeads);

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = new FormData(taskForm).get("title").trim();
  if (!title) return;
  await addDoc(collection(db, "tasks"), { title: title.slice(0, 120), done: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  taskForm.reset();
  showToast("המשימה נוספה.");
});

document.querySelector("#demo-button").addEventListener("click", async () => {
  if (leads.some((lead) => lead.demo)) {
    showToast("נתוני ההדגמה כבר קיימים.");
    return;
  }
  const now = serverTimestamp();
  const examples = [
    { name: "משפחת ישראלי", phone: "050-0000000", interest: "יום הולדת לילדים", date: "", city: "ראשון לציון", participants: "35", message: "מבקשים להבין התאמה לגילאי 8 ולבדוק תאריך.", status: "pending" },
    { name: "מנהלת רווחה, חברת הדגמה", phone: "050-0000001", interest: "אירוע חברה או רווחה", date: "", city: "תל אביב", participants: "120", message: "קבלת פנים ומופע מרכזי לעובדי החברה.", status: "quoted" },
    { name: "משפחת כהן", phone: "050-0000002", interest: "בר או בת מצווה", date: "", city: "רחובות", participants: "80", message: "אירוע ערב למשפחה ולחברים.", status: "booked" }
  ];
  await Promise.all(examples.map((item) => addDoc(collection(db, "leads"), {
    ...item,
    source: "נתוני הדגמה",
    demo: true,
    createdAt: now,
    updatedAt: now
  })));
  showToast("נוספו נתוני הדגמה מסומנים.");
});

document.querySelector("#export-button").addEventListener("click", () => {
  if (!leads.length) {
    showToast("אין פניות לייצוא.");
    return;
  }
  const columns = ["שם", "טלפון", "סוג פנייה", "תאריך", "עיר", "משתתפים", "סטטוס", "הערה"];
  const rows = leads.map((lead) => [lead.name, lead.phone, lead.interest, lead.date, lead.city, lead.participants, statusLabels[lead.status], lead.note]);
  const quote = (value) => `"${String(value || "").replaceAll('"', '""')}"`;
  const csv = "\uFEFF" + [columns, ...rows].map((row) => row.map(quote).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `amit-mitrani-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

onAuthStateChanged(auth, (user) => {
  if (localCmsQa) {
    loginScreen.hidden = true;
    dashboard.hidden = false;
    logoutButton.hidden = true;
    userLabel.textContent = "בדיקה מקומית";
    startCms();
    return;
  }

  const allowed = user && ADMIN_EMAILS.has(user.email);
  loginScreen.hidden = Boolean(allowed);
  dashboard.hidden = !allowed;
  logoutButton.hidden = !user;
  userLabel.textContent = user?.email || "";

  if (allowed) {
    loginError.textContent = "";
    startRealtime();
    startCms();
    return;
  }

  unsubscribeLeads?.();
  unsubscribeTasks?.();
  if (user) {
    loginError.textContent = "לחשבון הזה אין הרשאת ניהול.";
    signOut(auth);
  }
});
