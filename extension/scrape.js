/*
 * scrape.js — client-side port of the server scraper in src/lib/scrape/*.
 *
 * The extension runs inside the user's real browser, so it can fetch baps.org
 * directly: the request carries the browser's own Cloudflare clearance and
 * TLS fingerprint (the exact thing the server version needed a headless Chrome
 * for), and host_permissions in the manifest lets it read the response
 * cross-origin. Parsing uses DOMParser instead of cheerio.
 *
 * Exposes a single global: BapsScrape.getDashboard().
 */
(function (global) {
  "use strict";

  const SOURCES = {
    vicharan: "https://www.baps.org/vicharan.aspx",
    dailySatsang: "https://www.baps.org/Daily-Satsang.aspx",
  };

  // ---- regexes (mirror src/lib/scrape/heuristics.ts) ----
  const GUJARATI_RE = /[઀-૿]/;
  const SAMVAT_RE =
    /([A-Za-z]+\s+(?:Sud|Vad)\s+[A-Za-z઀-૿]+\s*,?\s*Samvat\s*\d{4})/i;
  const DATE_TOKEN_RE =
    /\b\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]\d{4}\b/i;
  const FILENAME_DATE_RE = /(?:^|\D)(20\d{2})[_-]?(\d{2})[_-]?(\d{2})(?!\d)/;
  const CHROME_HINT_RE =
    /(icon|logo|sprite|spacer|pixel|bullet|arrow|favicon|separator)/i;
  const CONTENT_MEDIA_RE = /\/Media\//i;
  const SITE_CHROME_PATH_RE = /\/images\//i;
  const THUMBNAIL_PATH_RE = /\/Thumbnails\//i;
  const LOCATION_SPLIT_RE = /[—–-]\s*/;

  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  // ---- text helpers (mirror src/lib/scrape/fetchHtml.ts) ----
  function cleanText(text) {
    if (!text) return "";
    return String(text).replace(/[\s ​]+/g, " ").trim();
  }

  function absoluteUrl(base, maybeRelative) {
    if (!maybeRelative) return undefined;
    let trimmed = String(maybeRelative).trim();
    if (!trimmed || trimmed.startsWith("data:")) return trimmed || undefined;
    // "//Data/Sites/1/Media/..." is a root-relative path on baps.org, not a
    // protocol-relative URL — only treat "//" as protocol-relative when the
    // first segment looks like a host (has a dot).
    if (trimmed.startsWith("//") && !trimmed.slice(2).split("/")[0].includes(".")) {
      trimmed = trimmed.slice(1);
    }
    try {
      return new URL(trimmed, base).toString();
    } catch (e) {
      return undefined;
    }
  }

  // ---- image classification ----
  function isLikelyChromeImage(c) {
    if (CONTENT_MEDIA_RE.test(c.src)) return false;
    if (SITE_CHROME_PATH_RE.test(c.src)) return true;
    return CHROME_HINT_RE.test((c.alt || "") + " " + (c.title || "") + " " + c.src);
  }
  function toContentImages(list) {
    return list.filter(function (c) {
      return !isLikelyChromeImage(c);
    });
  }

  function collectImages(doc, baseUrl) {
    const seen = new Set();
    const out = [];
    doc.querySelectorAll("img").forEach(function (node) {
      const raw =
        node.getAttribute("src") ||
        node.getAttribute("data-src") ||
        node.getAttribute("data-lazy-src") ||
        node.getAttribute("data-original") ||
        "";
      const src = absoluteUrl(baseUrl, raw);
      if (!src || seen.has(src)) return;
      seen.add(src);

      const alt = cleanText(node.getAttribute("alt"));
      const title = cleanText(node.getAttribute("title"));
      const anchor = node.closest("a");

      let caption = alt || title;
      const parent = node.parentElement;
      const candidates = [anchor, parent, parent && parent.nextElementSibling];
      for (let i = 0; i < candidates.length && !caption; i++) {
        const el = candidates[i];
        const text = cleanText(el && el.textContent);
        if (text && text.length <= 200) caption = text;
      }

      out.push({
        src: src,
        alt: alt,
        title: title,
        caption: caption,
        href: absoluteUrl(baseUrl, anchor && anchor.getAttribute("href")),
      });
    });
    return out;
  }

  function dateFromFilename(src) {
    const m = src.match(FILENAME_DATE_RE);
    if (!m) return undefined;
    const y = m[1];
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    return day + "-" + MONTHS[month - 1] + "-" + y;
  }

  function findHeading(doc, re) {
    let found;
    doc
      .querySelectorAll("h1,h2,h3,h4,h5,h6,strong,b,span,div,a,p")
      .forEach(function (el) {
        if (found) return;
        const text = cleanText(el.textContent);
        if (text.length > 0 && text.length < 140 && re.test(text)) found = el;
      });
    return found;
  }

  function findLargestGujaratiBlock(doc) {
    let best;
    doc.querySelectorAll("p,div,span,td,li").forEach(function (el) {
      if (el.children.length > 2) return;
      const text = cleanText(el.textContent);
      if (text.length < 40 || !GUJARATI_RE.test(text)) return;
      if (!best || text.length > best.text.length) best = { text: text, el: el };
    });
    return best;
  }

  function collectAudioSources(doc, baseUrl) {
    const out = [];
    const seen = new Set();
    function add(raw, label) {
      if (!raw) return;
      const abs = absoluteUrl(baseUrl, raw);
      if (!abs || !/\.mp3(\?|$)/i.test(abs)) return;
      const key = decodeURIComponent(abs)
        .replace(/.*?[?&]file=/, "")
        .replace(/^https?:\/\/[^/]+\//, "")
        .toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ src: abs, label: label });
    }
    doc.querySelectorAll("audio[src], audio source[src], [data-audio]").forEach(
      function (node) {
        add(
          node.getAttribute("src") || node.getAttribute("data-audio"),
          cleanText(node.getAttribute("title") || node.getAttribute("aria-label")) ||
            undefined,
        );
      },
    );
    doc.querySelectorAll("script").forEach(function (el) {
      const js = el.textContent || "";
      if (js.toLowerCase().indexOf(".mp3") === -1) return;
      const rx = /["']([^"']*\.mp3[^"']*)["']/gi;
      let m;
      while ((m = rx.exec(js))) add(m[1]);
    });
    return out;
  }

  // ---- vicharan (mirror src/lib/scrape/vicharan.ts) ----
  function splitDateLocation(caption) {
    if (!caption) return {};
    const dateMatch = caption.match(DATE_TOKEN_RE);
    if (!dateMatch) return { location: caption };
    const date = dateMatch[0];
    const rest = caption.slice(dateMatch.index + date.length);
    const location =
      cleanText(rest.split(LOCATION_SPLIT_RE).slice(-1)[0]) || undefined;
    return { date: date, location: location };
  }

  function normaliseDate(raw) {
    const m = raw.match(/(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{4})/);
    if (!m) return undefined;
    const month = m[2][0].toUpperCase() + m[2].slice(1, 3).toLowerCase();
    return Number(m[1]) + "-" + month + "-" + m[3];
  }

  function dateSortKey(date) {
    const m = date.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
    if (!m) return 0;
    const month = MONTHS.indexOf(m[2]) + 1;
    if (month === 0) return 0;
    return Number(m[3]) * 10000 + month * 100 + Number(m[1]);
  }

  function collectCaptionsByDate(doc) {
    const byDate = new Map();
    const text = cleanText(doc.body ? doc.body.textContent : "");
    const pattern = new RegExp(
      "(" +
        DATE_TOKEN_RE.source +
        ")\\s*[-–—]\\s*([A-Za-z][A-Za-z .'-]{0,40},\\s*[A-Za-z][A-Za-z .'-]{0,40}?)(?=\\s*(?:[.#]|$|\\d{1,2}[-\\s][A-Z]))",
      "gi",
    );
    let m;
    while ((m = pattern.exec(text))) {
      const date = normaliseDate(m[1]);
      const location = cleanText(m[2]);
      if (date && location && !byDate.has(date)) byDate.set(date, location);
    }
    return byDate;
  }

  const DETAIL_HREF_RE =
    /\/Vicharan\/\d{4}\/(\d{1,2})-([A-Za-z]{3,9})-(\d{4})-\d+\.aspx/i;

  function collectDetailLinksByDate(doc, baseUrl) {
    const byDate = new Map();
    doc.querySelectorAll("a[href]").forEach(function (el) {
      const href = absoluteUrl(baseUrl, el.getAttribute("href"));
      if (!href) return;
      const m = href.match(DETAIL_HREF_RE);
      if (!m) return;
      const date = normaliseDate(m[1] + "-" + m[2] + "-" + m[3]);
      if (date && !byDate.has(date)) byDate.set(date, href);
    });
    return byDate;
  }

  function parseListing(doc, sourceUrl) {
    const contentImages = toContentImages(collectImages(doc, sourceUrl));
    const captionByDate = collectCaptionsByDate(doc);
    const detailByDate = collectDetailLinksByDate(doc, sourceUrl);

    const byDate = new Map();
    contentImages.forEach(function (img) {
      const fromCaption = splitDateLocation(img.caption || undefined);
      const date = fromCaption.date || dateFromFilename(img.src);
      if (!date || byDate.has(date)) return;
      byDate.set(date, {
        date: date,
        location: fromCaption.location || captionByDate.get(date) || "",
        thumbnail: img.src,
        href: img.href || detailByDate.get(date),
      });
    });
    detailByDate.forEach(function (href, date) {
      if (byDate.has(date)) return;
      byDate.set(date, {
        date: date,
        location: captionByDate.get(date) || "",
        thumbnail: "",
        href: href,
      });
    });

    return Array.from(byDate.values()).sort(function (a, b) {
      return dateSortKey(b.date) - dateSortKey(a.date);
    });
  }

  function collectDayPhotos(doc, href) {
    const candidates = toContentImages(collectImages(doc, href));
    const photos = [];
    const seen = new Set();
    candidates.forEach(function (c) {
      if (THUMBNAIL_PATH_RE.test(c.src) || seen.has(c.src)) return;
      seen.add(c.src);
      photos.push({ image: c.src, caption: cleanText(c.caption) || undefined });
    });
    return photos;
  }

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: "include" });
    const html = await res.text();
    if (/just a moment/i.test(html) && html.length < 60000) {
      const err = new Error("Cloudflare challenge");
      err.challenged = true;
      throw err;
    }
    return new DOMParser().parseFromString(html, "text/html");
  }

  async function getVicharan() {
    const doc = await fetchDoc(SOURCES.vicharan);
    const latest = parseListing(doc, SOURCES.vicharan)[0];

    let photos = [];
    if (latest && latest.href) {
      try {
        photos = collectDayPhotos(await fetchDoc(latest.href), latest.href);
      } catch (e) {
        photos = [];
      }
    }
    if (photos.length === 0 && latest && latest.thumbnail) {
      photos = [{ image: latest.thumbnail, caption: latest.location || undefined }];
    }

    let scheduleNote, scheduleHref;
    const heading = findHeading(doc, /vicharan schedule/i);
    if (heading) {
      scheduleNote = cleanText(heading.textContent);
      const anchor =
        heading.tagName === "A"
          ? heading
          : heading.closest("a") || heading.querySelector("a");
      scheduleHref = absoluteUrl(
        SOURCES.vicharan,
        anchor && anchor.getAttribute("href"),
      );
    }

    return {
      date: latest && latest.date,
      location: (latest && latest.location) || undefined,
      detailUrl: latest && latest.href,
      photos: photos,
      scheduleNote: scheduleNote,
      scheduleHref: scheduleHref,
      ok: true,
    };
  }

  // ---- daily satsang (mirror src/lib/scrape/dailySatsang.ts) ----
  const DARSHAN_CAPTIONS_RE =
    /Murti\s+Darshan\s+(.{3,160}?)\s+Swamishri'?s\s+Darshan\s+(.{3,160}?)(?=\s*(?:પ્રેરણા|Prerna|Vachanamrut\s+Gems))/i;
  const SWAMISHRI_FILE_RE = /\d+S\.(?:jpe?g|png|webp)$/i;
  const DAILY_SATSANG_MEDIA_RE = /\/dailysatsang\//i;
  const VACHANAMRUT_TITLE_RE = /vachan[aā]mrut/i;
  const PRERNA_SECTION_RE =
    /પ્રેરણા\s*પરિમલ\s*([\s\S]{40,4000}?)(?=Vachanamrut\s+Gems|Audio\s+Satsang|$)/;
  const AUDIO_TITLES = ["Vachanamrut", "Swamini Vato", "Katha"];

  function extractPrernaParimal(doc, bodyText) {
    const m = bodyText.match(PRERNA_SECTION_RE);
    const sliced = cleanText(m && m[1]);
    const block = findLargestGujaratiBlock(doc);
    const body = sliced || (block && block.text);
    if (!body) return undefined;
    const titleMatch = body.match(
      /^(બ્રહ્મસ્વરૂપ[^।]{0,80}?સ્મૃતિઓ)\s*([\s\S]*)$/,
    );
    const title = titleMatch && titleMatch[1];
    const rest = titleMatch && titleMatch[2];
    return {
      heading: "પ્રેરણા પરિમલ",
      title: title ? cleanText(title) : undefined,
      body: rest ? cleanText(rest) : body,
    };
  }

  function extractVachanamrutGems(doc) {
    const heading = findHeading(doc, /vachanamrut gems?/i);
    const container = heading && heading.closest("div,section,article,td");
    if (!container) return undefined;

    let title;
    const titleEls = container.querySelectorAll("h1,h2,h3,h4,h5,strong,b,a");
    for (let i = 0; i < titleEls.length; i++) {
      if (VACHANAMRUT_TITLE_RE.test(titleEls[i].textContent)) {
        title = cleanText(titleEls[i].textContent) || undefined;
        break;
      }
    }

    let body = "";
    container.querySelectorAll("p,div,span").forEach(function (el) {
      const text = cleanText(el.textContent);
      if (text.length > body.length && text.length > 40) body = text;
    });
    if (!body) body = cleanText(container.textContent).slice(0, 600);

    const citationMatch = cleanText(container.textContent).match(
      /\[?\s*(Gadhad[aā]|Sarangpur|Kariyani|Loya|Panchala|Vartal|Amdavad|Ashlali|Jetalpur)[^[\]]{0,60}[-–]?\s*\d+(\.\d+)?\s*\]?/i,
    );

    return {
      heading: cleanText(heading.textContent) || "Vachanamrut Gems",
      title: title,
      body: body,
      citation:
        citationMatch && citationMatch[0].replace(/[[\]]/g, "").trim(),
    };
  }

  function bucketDarshanImages(images, bodyText) {
    const captions = bodyText.match(DARSHAN_CAPTIONS_RE);
    const murtiCaption = captions ? cleanText(captions[1]) : undefined;
    const swamishriCaption = captions ? cleanText(captions[2]) : undefined;

    const content = toContentImages(images);
    const daily = content.filter(function (img) {
      return DAILY_SATSANG_MEDIA_RE.test(img.src);
    });
    const pool = daily.length > 0 ? daily : content;

    const murti = [];
    const swamishri = [];
    pool.forEach(function (img) {
      if (SWAMISHRI_FILE_RE.test(img.src)) {
        swamishri.push({
          src: img.src,
          caption: swamishriCaption || img.caption || undefined,
        });
      } else {
        murti.push({
          src: img.src,
          caption: murtiCaption || img.caption || undefined,
        });
      }
    });
    return { murti: murti, swamishri: swamishri };
  }

  async function getDailySatsang() {
    const doc = await fetchDoc(SOURCES.dailySatsang);
    const images = collectImages(doc, SOURCES.dailySatsang);
    const audio = collectAudioSources(doc, SOURCES.dailySatsang).map(function (a, i) {
      return { title: a.label || AUDIO_TITLES[i] || "Track " + (i + 1), src: a.src };
    });

    doc.querySelectorAll("script, style, noscript").forEach(function (n) {
      n.remove();
    });
    const bodyText = cleanText(doc.body ? doc.body.textContent : "");
    const samvat = bodyText.match(SAMVAT_RE);

    return {
      hinduDate: samvat ? samvat[1] : undefined,
      prernaParimal: extractPrernaParimal(doc, bodyText),
      vachanamrutGems: extractVachanamrutGems(doc),
      audio: audio,
      darshan: bucketDarshanImages(images, bodyText),
      ok: true,
    };
  }

  async function getDashboard() {
    const results = await Promise.all([
      getVicharan().catch(function (e) {
        return {
          photos: [],
          ok: false,
          error: (e && e.message) || String(e),
          challenged: !!(e && e.challenged),
        };
      }),
      getDailySatsang().catch(function (e) {
        return {
          audio: [],
          darshan: { murti: [], swamishri: [] },
          ok: false,
          error: (e && e.message) || String(e),
          challenged: !!(e && e.challenged),
        };
      }),
    ]);
    return {
      vicharan: results[0],
      satsang: results[1],
      generatedAt: new Date().toISOString(),
    };
  }

  global.BapsScrape = { getDashboard: getDashboard };
})(window);
