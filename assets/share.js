(() => {
  const scriptBase = document.currentScript?.src
    || [...document.scripts].find((script) => /\/assets\/share\.js(?:$|\?)/.test(script.src))?.src;
  if (scriptBase) {
    import(new URL("cms-runtime.js?v=3", scriptBase).href).catch((error) => {
      console.warn("Site content editor runtime could not be loaded.", error);
      document.documentElement.dataset.cmsError = error?.message || "load-failed";
    });
    import(new URL("lead-capture.js?v=2", scriptBase).href).catch((error) => {
      console.warn("Site CRM could not be loaded.", error);
      document.documentElement.dataset.crmError = error?.message || "load-failed";
    });
  }

  const copy = {
    he: {
      trigger: "שיתוף",
      title: "לשתף את העמוד",
      description: "שלחו את העמוד המדויק למי שייהנה ממנו.",
      device: "שיתוף במכשיר",
      whatsapp: "שיתוף בוואטסאפ",
      link: "העתקת קישור",
      copied: "הקישור הועתק.",
      failed: "לא הצלחנו להעתיק. אפשר לסמן את הכתובת בשורת הדפדפן.",
      close: "סגירה"
    },
    en: {
      trigger: "Share",
      title: "Share this page",
      description: "Send this exact page to someone planning an event.",
      device: "Share from this device",
      whatsapp: "Share on WhatsApp",
      link: "Copy link",
      copied: "Link copied.",
      failed: "The link could not be copied. You can copy it from the address bar.",
      close: "Close"
    },
    fr: {
      trigger: "Partager",
      title: "Partager cette page",
      description: "Envoyez cette page précise à une personne qui prépare un événement.",
      device: "Partager depuis cet appareil",
      whatsapp: "Partager sur WhatsApp",
      link: "Copier le lien",
      copied: "Lien copié.",
      failed: "Le lien n’a pas pu être copié. Vous pouvez le copier dans la barre d’adresse.",
      close: "Fermer"
    },
    ru: {
      trigger: "Поделиться",
      title: "Поделиться страницей",
      description: "Отправьте эту страницу тому, кто планирует мероприятие.",
      device: "Поделиться с устройства",
      whatsapp: "Отправить в WhatsApp",
      link: "Копировать ссылку",
      copied: "Ссылка скопирована.",
      failed: "Скопировать ссылку не удалось. Её можно скопировать из адресной строки.",
      close: "Закрыть"
    }
  };

  const language = document.documentElement.lang?.split("-")[0] || "he";
  const text = copy[language] || copy.en;
  const pageTitle = document.querySelector('meta[property="og:title"]')?.content || document.title;
  const pageDescription = document.querySelector('meta[property="og:description"]')?.content
    || document.querySelector('meta[name="description"]')?.content
    || "";
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  const isShortGitHubAddress = window.location.hostname === "djskabi-png.github.io"
    && window.location.pathname.startsWith("/amit/");
  const currentUrl = isShortGitHubAddress || window.location.hash
    ? window.location.href
    : (canonical || window.location.href);
  const shareText = pageDescription ? `${pageTitle}\n${pageDescription}` : pageTitle;
  const panelId = "page-share-panel";

  const root = document.createElement("aside");
  root.className = "page-share";
  root.setAttribute("aria-label", text.title);
  root.innerHTML = `
    <div class="page-share__panel" id="${panelId}" hidden>
      <div class="page-share__heading">
        <strong>${text.title}</strong>
        <button class="page-share__close" type="button" aria-label="${text.close}">×</button>
      </div>
      <p class="page-share__description">${text.description}</p>
      <div class="page-share__actions">
        <button class="page-share__action page-share__device" type="button">${text.device}</button>
        <a class="page-share__action page-share__action--whatsapp" target="_blank" rel="noopener">${text.whatsapp}</a>
        <button class="page-share__action page-share__copy" type="button">${text.link}</button>
      </div>
      <p class="page-share__status" role="status" aria-live="polite"></p>
    </div>
    <button class="page-share__trigger" type="button" aria-expanded="false" aria-controls="${panelId}">${text.trigger}</button>
  `;

  document.body.append(root);

  const panel = root.querySelector(".page-share__panel");
  const trigger = root.querySelector(".page-share__trigger");
  const closeButton = root.querySelector(".page-share__close");
  const deviceButton = root.querySelector(".page-share__device");
  const whatsappLink = root.querySelector(".page-share__action--whatsapp");
  const copyButton = root.querySelector(".page-share__copy");
  const status = root.querySelector(".page-share__status");

  whatsappLink.href = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${currentUrl}`)}`;
  if (!navigator.share) deviceButton.hidden = true;

  const closePanel = (returnFocus = false) => {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    status.textContent = "";
    if (returnFocus) trigger.focus();
  };

  trigger.addEventListener("click", () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
    status.textContent = "";
    if (opening) closeButton.focus();
  });

  closeButton.addEventListener("click", () => closePanel(true));

  deviceButton.addEventListener("click", async () => {
    try {
      await navigator.share({ title: pageTitle, text: pageDescription, url: currentUrl });
      closePanel();
    } catch (error) {
      if (error?.name !== "AbortError") status.textContent = text.failed;
    }
  });

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      status.textContent = text.copied;
    } catch {
      const field = document.createElement("textarea");
      field.value = currentUrl;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      status.textContent = copied ? text.copied : text.failed;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) closePanel(true);
  });

  document.addEventListener("click", (event) => {
    if (!panel.hidden && !root.contains(event.target)) closePanel();
  });
})();
