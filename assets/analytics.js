(() => {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  const send = (name, parameters = {}) => {
    window.gtag("event", name, {
      page_location: window.location.href,
      page_title: document.title,
      ...parameters
    });
  };

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href") || "";

    if (/^(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(href)) {
      send("whatsapp_click", { link_url: link.href, link_text: link.textContent.trim().slice(0, 100) });
    } else if (/^tel:/i.test(href)) {
      send("phone_click", { link_url: href, link_text: link.textContent.trim().slice(0, 100) });
    } else if (/^mailto:/i.test(href)) {
      send("email_click", { link_url: href, link_text: link.textContent.trim().slice(0, 100) });
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.checkValidity()) return;
    send("generate_lead", {
      form_id: form.id || "unknown",
      form_name: form.getAttribute("name") || form.id || "unknown"
    });
  });
})();
