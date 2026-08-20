/*
 * newtab.js — renders the dashboard and drives its interactions.
 *
 * Load order: paint instantly from the last cached scrape (localStorage), then
 * fetch fresh from baps.org in the background and update. That is what makes a
 * new tab feel instant even though a live scrape takes a moment.
 */
(function () {
  "use strict";

  const CACHE_KEY = "baps-dashboard-v1";
  const BOOKMARKS_KEY = "baps-bookmarks-v1";
  const AUTOPLAY_MS = 6000;

  // Fixed shortcuts. The user's own bookmarks are appended after these and
  // persisted separately in localStorage.
  const QUICK_LINKS = [
    { label: "BAPS.org", href: "https://www.baps.org/" },
    { label: "Daily Satsang", href: "https://www.baps.org/Daily-Satsang.aspx" },
    { label: "Vicharan", href: "https://www.baps.org/vicharan.aspx" },
  ];

  const $ = function (id) {
    return document.getElementById(id);
  };

  // ---------- clock ----------
  function tickClock() {
    const now = new Date();
    $("clock-time").textContent = now
      .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      .toUpperCase();
    $("clock-date").textContent = now.toLocaleDateString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    $("greg-date").textContent = now.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  // ---------- search ----------
  function initSearch() {
    $("search-form").addEventListener("submit", function (e) {
      e.preventDefault();
      const q = $("search-input").value.trim();
      if (!q) return;
      const looksLikeUrl =
        /^https?:\/\//i.test(q) ||
        /^[^\s]+\.[a-z]{2,}(\/|$)/i.test(q);
      if (looksLikeUrl) {
        window.location.href = /^https?:\/\//i.test(q) ? q : "https://" + q;
      } else {
        window.location.href =
          "https://www.google.com/search?q=" + encodeURIComponent(q);
      }
    });
  }

  // ---------- quick links + user bookmarks ----------
  // A bookmark is { label, href, icon: bool, folder: bool }. `folder` ones are
  // tucked into a pop-up folder instead of the main bar. `icon` toggles a
  // site favicon beside the label.
  let bookmarks = [];
  let addingBookmark = false;
  let folderOpen = false;

  function loadBookmarks() {
    try {
      const raw = JSON.parse(localStorage.getItem(BOOKMARKS_KEY));
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }
  function saveBookmarks() {
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    } catch (e) {
      /* quota / private mode — non-fatal */
    }
  }

  function normalizeUrl(url) {
    const u = (url || "").trim();
    if (!u) return "";
    return /^https?:\/\//i.test(u) ? u : "https://" + u;
  }
  function labelFromUrl(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (e) {
      return url;
    }
  }
  function faviconUrl(href) {
    try {
      const host = new URL(href).hostname;
      return "https://www.google.com/s2/favicons?sz=64&domain=" + encodeURIComponent(host);
    } catch (e) {
      return "";
    }
  }

  // Small icon-button factory (used for move/remove actions on bookmarks).
  function actionButton(className, title, svg, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.innerHTML = svg;
    b.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  const SVG_FOLDER =
    '<svg class="mini-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16a1.5 1.5 0 0 0 1.5-1.5V8.5A1.5 1.5 0 0 0 20 7h-7l-2-2H4a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 4 20Z"/></svg>';
  const SVG_TO_FOLDER =
    '<svg class="mini-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v9"/><path d="M8.5 9.5 12 13l3.5-3.5"/><path d="M5 20h14"/></svg>';
  const SVG_TO_BAR =
    '<svg class="mini-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20v-9"/><path d="M8.5 14.5 12 11l3.5 3.5"/><path d="M5 4h14"/></svg>';

  function makeFavicon(bm) {
    if (!bm.icon) return null;
    const url = faviconUrl(bm.href);
    if (!url) return null;
    const img = document.createElement("img");
    img.className = "bm-favicon";
    img.src = url;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    // Fall back to a text-only chip if the favicon can't be fetched.
    img.addEventListener("error", function () {
      img.remove();
    });
    return img;
  }

  function makeDefaultLink(link) {
    const a = document.createElement("a");
    a.className = "quicklink";
    a.href = link.href;
    a.textContent = link.label;
    return a;
  }

  function removeBookmark(i) {
    bookmarks.splice(i, 1);
    saveBookmarks();
    renderQuickLinks();
  }
  function setBookmarkFolder(i, inFolder) {
    bookmarks[i].folder = inFolder;
    saveBookmarks();
    renderQuickLinks();
  }

  // A bookmark chip for the main bar.
  function makeBookmark(bm, i) {
    const a = document.createElement("a");
    a.className = "quicklink custom";
    a.href = bm.href;
    const icon = makeFavicon(bm);
    if (icon) a.appendChild(icon);
    const span = document.createElement("span");
    span.textContent = bm.label;
    a.appendChild(span);
    a.appendChild(
      actionButton("quicklink-action", "Move to folder", SVG_TO_FOLDER, function () {
        setBookmarkFolder(i, true);
      }),
    );
    a.appendChild(
      actionButton("quicklink-remove", "Remove bookmark", "×", function () {
        removeBookmark(i);
      }),
    );
    return a;
  }

  // A bookmark row inside the folder pop-up.
  function makeFolderItem(bm, i) {
    const row = document.createElement("div");
    row.className = "folder-item";
    const a = document.createElement("a");
    a.className = "folder-item-link";
    a.href = bm.href;
    const icon = makeFavicon(bm);
    if (icon) a.appendChild(icon);
    const span = document.createElement("span");
    span.textContent = bm.label;
    a.appendChild(span);
    row.appendChild(a);
    row.appendChild(
      actionButton("quicklink-action", "Move to bar", SVG_TO_BAR, function () {
        setBookmarkFolder(i, false);
      }),
    );
    row.appendChild(
      actionButton("quicklink-remove", "Remove bookmark", "×", function () {
        removeBookmark(i);
      }),
    );
    return row;
  }

  function makeFolderControl(folderEntries) {
    const wrap = document.createElement("div");
    wrap.className = "folder-wrap";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quicklink quicklink-folder" + (folderOpen ? " open" : "");
    btn.innerHTML = SVG_FOLDER + "<span>" + folderEntries.length + "</span>";
    btn.setAttribute("aria-label", "Saved bookmarks folder");
    btn.addEventListener("click", function () {
      folderOpen = !folderOpen;
      renderQuickLinks();
    });
    wrap.appendChild(btn);
    if (folderOpen) {
      const pop = document.createElement("div");
      pop.className = "folder-popover";
      folderEntries.forEach(function (entry) {
        pop.appendChild(makeFolderItem(entry.bm, entry.i));
      });
      wrap.appendChild(pop);
    }
    return wrap;
  }

  function makeAddControl() {
    if (!addingBookmark) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quicklink quicklink-add";
      btn.textContent = "+ Add";
      btn.addEventListener("click", function () {
        addingBookmark = true;
        renderQuickLinks();
        const url = $("bm-url");
        if (url) url.focus();
      });
      return btn;
    }

    const form = document.createElement("form");
    form.className = "bookmark-form";

    const label = document.createElement("input");
    label.className = "bookmark-input";
    label.type = "text";
    label.placeholder = "Name (optional)";
    label.autocomplete = "off";

    const url = document.createElement("input");
    url.id = "bm-url";
    url.className = "bookmark-input";
    url.type = "text";
    url.placeholder = "example.com";
    url.autocomplete = "off";
    url.spellcheck = false;

    const iconCb = document.createElement("input");
    iconCb.type = "checkbox";
    iconCb.checked = true;
    const iconLabel = document.createElement("label");
    iconLabel.className = "bookmark-check";
    iconLabel.appendChild(iconCb);
    iconLabel.appendChild(document.createTextNode("Icon"));

    const folderCb = document.createElement("input");
    folderCb.type = "checkbox";
    const folderLabel = document.createElement("label");
    folderLabel.className = "bookmark-check";
    folderLabel.appendChild(folderCb);
    folderLabel.appendChild(document.createTextNode("Folder"));

    const save = document.createElement("button");
    save.type = "submit";
    save.className = "bookmark-btn save";
    save.textContent = "Save";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "bookmark-btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", function () {
      addingBookmark = false;
      renderQuickLinks();
    });

    form.appendChild(label);
    form.appendChild(url);
    form.appendChild(iconLabel);
    form.appendChild(folderLabel);
    form.appendChild(save);
    form.appendChild(cancel);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const href = normalizeUrl(url.value);
      if (!href) {
        url.focus();
        return;
      }
      bookmarks.push({
        label: label.value.trim() || labelFromUrl(href),
        href: href,
        icon: iconCb.checked,
        folder: folderCb.checked,
      });
      saveBookmarks();
      addingBookmark = false;
      if (folderCb.checked) folderOpen = true;
      renderQuickLinks();
    });

    return form;
  }

  function renderQuickLinks() {
    const nav = $("quicklinks");
    nav.textContent = "";
    QUICK_LINKS.forEach(function (link) {
      nav.appendChild(makeDefaultLink(link));
    });

    const folderEntries = [];
    bookmarks.forEach(function (bm, i) {
      if (bm.folder) folderEntries.push({ bm: bm, i: i });
      else nav.appendChild(makeBookmark(bm, i));
    });

    if (folderEntries.length) nav.appendChild(makeFolderControl(folderEntries));
    else folderOpen = false;

    nav.appendChild(makeAddControl());
  }

  function initQuickLinks() {
    bookmarks = loadBookmarks();
    renderQuickLinks();
    // Close the folder pop-up when clicking anywhere outside it.
    document.addEventListener("click", function (e) {
      if (folderOpen && !e.target.closest(".folder-wrap")) {
        folderOpen = false;
        renderQuickLinks();
      }
    });
  }

  // ---------- image helper ----------
  function setImage(mainEl, blurEl, src, alt) {
    mainEl.src = src || "";
    mainEl.alt = alt || "";
    if (blurEl) blurEl.src = src || "";
  }

  // ---------- Vicharan carousel ----------
  const vic = { photos: [], index: 0, playing: true, timer: null, label: "" };

  function vicShow(i) {
    const n = vic.photos.length;
    if (n === 0) return;
    vic.index = ((i % n) + n) % n;
    const photo = vic.photos[vic.index];
    setImage($("vic-image"), $("vic-blur"), photo.image, photo.caption || vic.label);
    $("vic-counter").textContent = vic.index + 1 + " of " + n;
    $("vic-caption").textContent = photo.caption || vic.label || "";
  }

  function vicStopAutoplay() {
    if (vic.timer) {
      clearInterval(vic.timer);
      vic.timer = null;
    }
  }
  function vicStartAutoplay() {
    vicStopAutoplay();
    if (vic.playing && vic.photos.length > 1) {
      vic.timer = setInterval(function () {
        vicShow(vic.index + 1);
      }, AUTOPLAY_MS);
    }
  }
  function vicSetPlaying(p) {
    vic.playing = p;
    $("vic-playpause-icon").textContent = p ? "❚❚" : "►";
    $("vic-playpause").setAttribute(
      "aria-label",
      p ? "Pause slideshow" : "Play slideshow",
    );
    vicStartAutoplay();
  }

  function renderVicharan(v) {
    v = v || {};
    const photos = v.photos || [];
    vic.photos = photos;
    vic.label = [v.date, v.location].filter(Boolean).join(" — ");
    $("vic-daylabel").textContent = vic.label || "Recent photos";

    const pill = $("vic-schedule");
    if (v.scheduleNote) {
      pill.textContent = v.scheduleNote;
      pill.hidden = false;
      if (v.scheduleHref) pill.href = v.scheduleHref;
    } else {
      pill.hidden = true;
    }

    if (photos.length === 0) {
      $("vic-daylabel").textContent = "Vicharan updates aren’t available right now";
      $("vic-counter").textContent = "–";
      $("vic-caption").textContent = "";
      setImage($("vic-image"), $("vic-blur"), "", "");
      vicStopAutoplay();
      return;
    }
    vic.index = 0;
    vicShow(0);
    vicSetPlaying(vic.playing);
  }

  function initVicharanControls() {
    $("vic-prev").addEventListener("click", function () {
      vicSetPlaying(false);
      vicShow(vic.index - 1);
    });
    $("vic-next").addEventListener("click", function () {
      vicSetPlaying(false);
      vicShow(vic.index + 1);
    });
    $("vic-playpause").addEventListener("click", function () {
      vicSetPlaying(!vic.playing);
    });
  }

  // ---------- Darshan ----------
  const darshan = { murti: [], swamishri: [], tab: "swamishri", index: 0 };

  function darshanActive() {
    return darshan.tab === "swamishri" ? darshan.swamishri : darshan.murti;
  }

  function darshanShow() {
    const active = darshanActive();
    const current = active[darshan.index] || active[0];
    if (!current) return;
    setImage($("darshan-image"), $("darshan-blur"), current.src, current.caption || "Darshan");
    $("darshan-caption").textContent = current.caption || "";

    const dots = $("darshan-dots");
    dots.textContent = "";
    if (active.length > 1) {
      active.forEach(function (_, i) {
        const d = document.createElement("button");
        d.type = "button";
        d.className = "dot" + (i === darshan.index ? " active" : "");
        d.setAttribute("aria-label", "Photo " + (i + 1));
        d.addEventListener("click", function () {
          darshan.index = i;
          darshanShow();
        });
        dots.appendChild(d);
      });
    }
  }

  function darshanSelectTab(tab) {
    darshan.tab = tab;
    darshan.index = 0;
    $("tab-murti").classList.toggle("active", tab === "murti");
    $("tab-swamishri").classList.toggle("active", tab === "swamishri");
    darshanShow();
  }

  function renderDarshan(d) {
    d = d || { murti: [], swamishri: [] };
    darshan.murti = d.murti || [];
    darshan.swamishri = d.swamishri || [];
    const hasMurti = darshan.murti.length > 0;
    const hasSwamishri = darshan.swamishri.length > 0;

    $("tab-murti").disabled = !hasMurti;
    $("tab-swamishri").disabled = !hasSwamishri;

    if (!hasMurti && !hasSwamishri) {
      $("darshan-body").hidden = true;
      $("darshan-empty").hidden = false;
      return;
    }
    $("darshan-body").hidden = false;
    $("darshan-empty").hidden = true;
    darshanSelectTab(hasSwamishri ? "swamishri" : "murti");
  }

  function initDarshanControls() {
    $("tab-murti").addEventListener("click", function () {
      if (!$("tab-murti").disabled) darshanSelectTab("murti");
    });
    $("tab-swamishri").addEventListener("click", function () {
      if (!$("tab-swamishri").disabled) darshanSelectTab("swamishri");
    });
  }

  // ---------- lightbox (full-screen image preview) ----------
  const lb = { items: [], index: 0 };

  function lbRender() {
    const item = lb.items[lb.index];
    if (!item) return;
    $("lightbox-img").src = item.src;
    const cap = $("lightbox-caption");
    cap.textContent = item.caption || "";
    cap.hidden = !item.caption;
    const multi = lb.items.length > 1;
    $("lightbox-prev").hidden = !multi;
    $("lightbox-next").hidden = !multi;
  }
  function lbGo(delta) {
    const n = lb.items.length;
    if (n < 2) return;
    lb.index = (((lb.index + delta) % n) + n) % n;
    lbRender();
  }
  function openLightbox(items, index) {
    if (!items || !items.length) return;
    lb.items = items;
    lb.index = index || 0;
    lbRender();
    $("lightbox").hidden = false;
  }
  function closeLightbox() {
    $("lightbox").hidden = true;
    $("lightbox-img").src = "";
  }
  function lbIsOpen() {
    return !$("lightbox").hidden;
  }

  function initLightbox() {
    // Click the backdrop itself (not the image or a control) to dismiss.
    $("lightbox").addEventListener("click", function (e) {
      if (e.target === $("lightbox")) closeLightbox();
    });
    $("lightbox-close").addEventListener("click", closeLightbox);
    $("lightbox-prev").addEventListener("click", function () {
      lbGo(-1);
    });
    $("lightbox-next").addEventListener("click", function () {
      lbGo(1);
    });
    document.addEventListener("keydown", function (e) {
      if (!lbIsOpen()) return;
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") lbGo(-1);
      else if (e.key === "ArrowRight") lbGo(1);
    });

    $("vic-image").addEventListener("click", function () {
      if (!vic.photos.length) return;
      openLightbox(
        vic.photos.map(function (p) {
          return { src: p.image, caption: p.caption || vic.label };
        }),
        vic.index,
      );
    });
    $("darshan-image").addEventListener("click", function () {
      const active = darshanActive();
      if (!active.length) return;
      openLightbox(
        active.map(function (d) {
          return { src: d.src, caption: d.caption };
        }),
        darshan.index,
      );
    });
  }

  // ---------- text + audio cards ----------
  function renderPrerna(block) {
    const el = $("prerna-body");
    el.textContent = "";
    if (!block) {
      el.innerHTML = '<p class="muted">Not available right now.</p>';
      return;
    }
    if (block.title) {
      const t = document.createElement("p");
      t.className = "text-title gu";
      t.textContent = block.title;
      el.appendChild(t);
    }
    const p = document.createElement("p");
    p.className = "gu";
    p.textContent = block.body;
    el.appendChild(p);
  }

  function renderVachanamrut(block) {
    const el = $("vachanamrut-body");
    el.textContent = "";
    if (!block) {
      el.innerHTML = '<p class="muted">Not available right now.</p>';
      return;
    }
    if (block.title) {
      const t = document.createElement("p");
      t.className = "text-title";
      t.textContent = block.title;
      el.appendChild(t);
    }
    const p = document.createElement("p");
    p.textContent = block.body;
    el.appendChild(p);
    if (block.citation) {
      const c = document.createElement("p");
      c.className = "text-citation";
      c.textContent = block.citation;
      el.appendChild(c);
    }
  }

  function renderAudio(tracks) {
    const el = $("audio-body");
    el.textContent = "";
    if (!tracks || tracks.length === 0) {
      el.innerHTML = '<p class="muted">No audio available right now.</p>';
      return;
    }
    tracks.forEach(function (track) {
      const wrap = document.createElement("div");
      wrap.className = "audio-track";
      const title = document.createElement("div");
      title.className = "audio-track-title";
      title.textContent = track.title;
      wrap.appendChild(title);
      if (track.src) {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "none";
        audio.src = track.src;
        wrap.appendChild(audio);
      }
      el.appendChild(wrap);
    });
  }

  // ---------- render + status ----------
  function render(data) {
    if (!data) return;
    renderVicharan(data.vicharan);
    renderDarshan(data.satsang && data.satsang.darshan);
    renderPrerna(data.satsang && data.satsang.prernaParimal);
    renderVachanamrut(data.satsang && data.satsang.vachanamrutGems);
    renderAudio(data.satsang && data.satsang.audio);
    if (data.satsang && data.satsang.hinduDate) {
      $("hindu-date").textContent = data.satsang.hinduDate;
    }
  }

  function setStatus(msg) {
    const el = $("status");
    if (!msg) {
      el.hidden = true;
      return;
    }
    el.textContent = msg;
    el.hidden = false;
  }

  function loadCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY));
    } catch (e) {
      return null;
    }
  }
  function saveCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      /* quota / private mode — non-fatal */
    }
  }

  async function refresh(hadCache) {
    setStatus(hadCache ? null : "Loading today’s darshan…");
    try {
      const data = await BapsScrape.getDashboard();
      const gotSomething =
        (data.vicharan && data.vicharan.ok && data.vicharan.photos.length) ||
        (data.satsang && data.satsang.ok);
      if (gotSomething) {
        render(data);
        saveCache(data);
        setStatus(null);
      } else {
        const challenged =
          (data.vicharan && data.vicharan.challenged) ||
          (data.satsang && data.satsang.challenged);
        if (!hadCache) render(data);
        setStatus(
          challenged
            ? "Couldn’t reach baps.org (Cloudflare). Open baps.org once in this browser, then reload this tab."
            : "Couldn’t load fresh content from baps.org right now.",
        );
      }
    } catch (e) {
      if (!hadCache) {
        setStatus("Couldn’t load from baps.org: " + ((e && e.message) || e));
      }
    }
  }

  // ---------- boot ----------
  function boot() {
    tickClock();
    setInterval(tickClock, 1000);
    initSearch();
    initQuickLinks();
    initVicharanControls();
    initDarshanControls();
    initLightbox();

    const cached = loadCache();
    if (cached) render(cached);
    refresh(!!cached);

    // Refresh when the tab is refocused after the day may have rolled over.
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") refresh(true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
