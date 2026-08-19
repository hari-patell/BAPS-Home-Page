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
  const AUTOPLAY_MS = 6000;

  const QUICK_LINKS = [
    { label: "BAPS.org", href: "https://www.baps.org/" },
    { label: "Daily Satsang", href: "https://www.baps.org/Daily-Satsang.aspx" },
    { label: "Vicharan", href: "https://www.baps.org/vicharan.aspx" },
    { label: "Media Gallery", href: "https://www.baps.org/Media.aspx" },
    { label: "Mandirs", href: "https://www.baps.org/Global-Network/Mandirs.aspx" },
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

  // ---------- quick links ----------
  function initQuickLinks() {
    const nav = $("quicklinks");
    QUICK_LINKS.forEach(function (link) {
      const a = document.createElement("a");
      a.className = "quicklink";
      a.href = link.href;
      a.textContent = link.label;
      nav.appendChild(a);
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

    const thumbs = $("vic-thumbs").children;
    for (let k = 0; k < thumbs.length; k++) {
      thumbs[k].classList.toggle("active", k === vic.index);
    }
    const active = thumbs[vic.index];
    if (active) active.scrollIntoView({ inline: "center", block: "nearest" });
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

    const strip = $("vic-thumbs");
    strip.textContent = "";
    photos.forEach(function (photo, i) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "thumb";
      btn.title = photo.caption || "Photo " + (i + 1);
      const img = document.createElement("img");
      img.referrerPolicy = "no-referrer";
      img.alt = "";
      img.src = photo.image;
      btn.appendChild(img);
      btn.addEventListener("click", function () {
        vicSetPlaying(false);
        vicShow(i);
      });
      strip.appendChild(btn);
    });

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
