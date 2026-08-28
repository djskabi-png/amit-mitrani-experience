(() => {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  const scriptUrl = document.currentScript?.src
    || [...document.scripts].find((script) => /\/assets\/analytics\.js(?:$|\?)/.test(script.src))?.src;
  const assetBase = scriptUrl ? new URL(".", scriptUrl) : new URL("/assets/", location.origin);
  const trim = (value, limit = 200) => String(value || "").trim().slice(0, limit);
  const pagePath = trim(location.pathname || "/", 300);
  const language = trim(document.documentElement.lang?.split("-")[0] || "he", 8);
  const params = new URLSearchParams(location.search);
  const referrerHost = (() => {
    try { return new URL(document.referrer).hostname.replace(/^www\./, ""); } catch { return ""; }
  })();
  const source = trim(params.get("utm_source") || (params.has("gclid") ? "Google Ads" : params.has("fbclid") ? "Meta Ads" : params.has("ttclid") ? "TikTok Ads" : referrerHost || "Direct"), 100);
  const medium = trim(params.get("utm_medium") || (params.has("gclid") ? "cpc" : params.has("fbclid") || params.has("ttclid") ? "paid_social" : referrerHost ? "referral" : "none"), 100);
  let firestorePromise;

  const videoIdFromUrl = (value) => {
    try {
      const url = new URL(value, location.href);
      if (url.hostname === "youtu.be") return trim(url.pathname.split("/").filter(Boolean)[0], 32);
      if (/youtube(?:-nocookie)?\.com$/.test(url.hostname.replace(/^www\./, ""))) {
        return trim(url.searchParams.get("v") || url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1], 32);
      }
    } catch {}
    return "";
  };

  const writeAggregateEvent = async (eventType, details = {}) => {
    if (/\/admin(?:\.html)?$/.test(location.pathname)) return;
    try {
      firestorePromise ||= Promise.all([
        import(new URL("firebase-config.js", assetBase).href),
        import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")
      ]);
      const [{ db }, { addDoc, collection, serverTimestamp }] = await firestorePromise;
      await addDoc(collection(db, "analyticsEvents"), {
        eventType: trim(eventType, 40),
        pagePath,
        pageTitle: trim(document.title, 200),
        target: trim(details.target, 300),
        targetLabel: trim(details.targetLabel, 160),
        videoId: trim(details.videoId, 32),
        language,
        source,
        medium,
        campaign: trim(params.get("utm_campaign"), 160),
        content: trim(params.get("utm_content"), 160),
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.warn("Aggregate analytics event was not saved.", error);
    }
  };

  const send = (name, parameters = {}) => {
    window.gtag("event", name, {
      page_location: window.location.href,
      page_title: document.title,
      ...parameters
    });
  };

  writeAggregateEvent("page_view");

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href") || "";

    if (/^(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(href)) {
      send("whatsapp_click", { link_url: link.href, link_text: link.textContent.trim().slice(0, 100) });
      writeAggregateEvent("whatsapp_click", { target: "whatsapp", targetLabel: link.textContent });
    } else if (/^tel:/i.test(href)) {
      send("phone_click", { link_url: href, link_text: link.textContent.trim().slice(0, 100) });
      writeAggregateEvent("phone_click", { target: href, targetLabel: link.textContent });
    } else if (/^mailto:/i.test(href)) {
      send("email_click", { link_url: href, link_text: link.textContent.trim().slice(0, 100) });
      writeAggregateEvent("email_click", { target: href, targetLabel: link.textContent });
    } else {
      const videoId = videoIdFromUrl(link.href);
      if (videoId) writeAggregateEvent("youtube_click", { target: `youtube:${videoId}`, targetLabel: link.textContent, videoId });
      else if (link.target === "_blank" && /^https?:/i.test(link.href)) writeAggregateEvent("outbound_click", { target: new URL(link.href).hostname, targetLabel: link.textContent });
    }
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const label = trim(button.textContent || button.getAttribute("aria-label"), 160);
    if (button.matches("[data-commerce-open], .page-share__trigger, .page-share__action, #consent-toggle") || /הזמנה|שיתוף|booking|share/i.test(label)) {
      writeAggregateEvent("button_click", { target: button.id || button.className, targetLabel: label });
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.checkValidity()) return;
    send("generate_lead", {
      form_id: form.id || "unknown",
      form_name: form.getAttribute("name") || form.id || "unknown"
    });
    writeAggregateEvent("form_submit", { target: form.id || "unknown", targetLabel: form.getAttribute("name") || form.id || "טופס" });
  });

  const seenIframeVideos = new Set();
  window.addEventListener("blur", () => {
    window.setTimeout(() => {
      const frame = document.activeElement;
      if (!(frame instanceof HTMLIFrameElement)) return;
      const videoId = videoIdFromUrl(frame.src);
      if (!videoId || seenIframeVideos.has(videoId)) return;
      seenIframeVideos.add(videoId);
      writeAggregateEvent("youtube_click", { target: `youtube:${videoId}`, targetLabel: frame.title || "סרטון YouTube", videoId });
    }, 0);
  });

  const scrollMarks = new Set();
  window.addEventListener("scroll", () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (max <= 0) return;
    const percent = Math.round((scrollY / max) * 100);
    [50, 90].forEach((mark) => {
      if (percent >= mark && !scrollMarks.has(mark)) {
        scrollMarks.add(mark);
        writeAggregateEvent("scroll_depth", { target: String(mark), targetLabel: `${mark}%` });
      }
    });
  }, { passive: true });
})();
