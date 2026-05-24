// Quran Glass — Vanilla App Logic (HTML/CSS/JS)
// ------------------------------------------------
// API placeholder (swap easily):
export const QURAN_API = "https://api.alquran.cloud/v1";
// Example placeholder you can use instead (may require a CORS-friendly proxy depending on host):
// const QURAN_API = "https://alquran.cloud/api";
// ------------------------------------------------

const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));

const LS = {
  theme: "qg_theme",
  lang: "qg_lang",
  settings: "qg_settings",
  lastRead: "qg_last_read",
  favAyahs: "qg_fav_ayahs",
  favSurahs: "qg_fav_surahs",
  progress: "qg_progress",
  tasbih: "qg_tasbih",
  daily: "qg_daily",
  seenDailyPopup: "qg_seen_daily_popup",
};

const DEFAULT_SETTINGS = {
  motion: true,
  fx: true,
  ayahSize: 28,
  ayahLine: 2.1,
  ayahFont: "amiri", // amiri | cairo | tajawal
  translation: "en.asad", // default translation edition (alquran.cloud style)
  reciter: "ar.alafasy", // default reciter edition
};

const state = {
  lang: "ar", // ar | en
  route: "home",
  searchMode: "mixed",
  surahs: [],
  currentSurah: null,
  ayahs: [],
  audioQueue: [], // { kind, surahNumber, ayahNumber, title, url }
  audioIndex: 0,
  listen: { surahNumber: 1, ayahs: [] },
  daily: null,
  settings: { ...DEFAULT_SETTINGS },
  isOnline: true,
};

function nowISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function toast(msg, type = "info") {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.dataset.type = type;
  el.classList.add("is-on");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("is-on"), 2200);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(LS.theme, theme);
  // icon
  const icon = $("#btnTheme i");
  if (icon) icon.className = theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
}

function setLang(lang) {
  state.lang = lang;
  localStorage.setItem(LS.lang, lang);
  const app = $("#app");
  if (app) app.dataset.lang = lang;
  document.documentElement.lang = lang === "ar" ? "ar" : "en";
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  const btn = $("#btnLang .icon-btn__text");
  if (btn) btn.textContent = lang === "ar" ? "AR" : "EN";

  // Minimal UI text switch (keep Arabic-first; English is a helper)
  if (lang === "en") {
    $("#globalSearch")?.setAttribute("placeholder", "Search surah, ayah, keyword...");
  } else {
    $("#globalSearch")?.setAttribute("placeholder", "ابحث عن سورة، آية، كلمة...");
  }
}

function applyReadingCSS() {
  document.documentElement.style.setProperty("--ayah-size", `${state.settings.ayahSize}px`);
  document.documentElement.style.setProperty("--ayah-line", `${state.settings.ayahLine}`);
  const ff = state.settings.ayahFont;
  const map = { amiri: '"Amiri","Tajawal",serif', cairo: '"Cairo",sans-serif', tajawal: '"Tajawal",sans-serif' };
  document.documentElement.style.setProperty("--ayah-font", map[ff] || map.amiri);
}

function setMotion(on) {
  state.settings.motion = !!on;
  document.documentElement.style.setProperty("--motion", on ? "1" : "0");
}

function setFx(on) {
  state.settings.fx = !!on;
  document.documentElement.style.setProperty("--fx", on ? "1" : "0");
  const canvas = $("#bg-particles");
  const photo = $("#bgPhoto");
  const overlay = $(".bg-overlay");
  const glow = $(".bg-glow");
  const grain = $(".grain");
  const display = on ? "block" : "none";
  if (canvas) canvas.style.display = display;
  if (photo) photo.style.display = display;
  if (overlay) overlay.style.display = display;
  if (glow) glow.style.display = display;
  if (grain) grain.style.display = display;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJSON(url, { retries = 2, timeout = 12000 } = {}) {
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      clearTimeout(t);
      if (i === retries) throw e;
      await sleep(380 * (i + 1));
    }
  }
}

function routeFromHash() {
  const h = (location.hash || "#/home").replace(/^#\/?/, "");
  return h.split("?")[0] || "home";
}

function go(route) {
  location.hash = `#/${route}`;
}

function setRoute(route) {
  state.route = route;

  // Page transition: fade/blur between routes (CSS-driven)
  $$(".route").forEach((s) => {
    const isTarget = s.dataset.route === route;
    if (isTarget) {
      s.hidden = false;
      s.classList.remove("route--leave");
      s.classList.add("route--enter");
      requestAnimationFrame(() => s.classList.add("route--enter-active"));
      setTimeout(() => s.classList.remove("route--enter", "route--enter-active"), 420);
    } else if (!s.hidden) {
      s.classList.add("route--leave");
      setTimeout(() => {
        s.hidden = true;
        s.classList.remove("route--leave");
      }, 260);
    }
  });

  $$("[data-route].is-active").forEach((a) => a.classList.remove("is-active"));
  $$(`[data-route="${route}"]`).forEach((a) => a.classList.add("is-active"));

  if (route === "bookmarks") renderBookmarks();
  if (route === "progress") renderProgress();
  if (route === "listen") {
    initListenUI();
    renderListenAyahs();
  }
  if (route === "daily") renderDaily();
}

function startClock() {
  const el = $("#liveClock");
  if (!el) return;
  const timeEl = $(".clock__time", el);
  const dateEl = $(".clock__date", el);
  const tick = () => {
    const d = new Date();
    // 12-hour format with AM/PM
    timeEl.textContent = d.toLocaleTimeString(state.lang === "ar" ? "en-US" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    dateEl.textContent = d.toLocaleDateString(state.lang === "ar" ? "ar-EG" : "en-US", {
      weekday: "short",
      month: "short",
      day: "2-digit",
    });
  };
  tick();
  setInterval(tick, 30_000);
}

const BG_URLS = [
  new URL("./assets/backgrounds/image_w3000_h1919_Ornate_islamic_archi.webp", import.meta.url).href,
  new URL("./assets/backgrounds/image_w5000_h3333_Highlighting_a_spiri.webp", import.meta.url).href,
  new URL("./assets/backgrounds/image_w4288_h2848_30k+_Desert_Night_Sk.webp", import.meta.url).href,
  new URL("./assets/backgrounds/image_w3000_h2143_Silhouette_of_birds_.webp", import.meta.url).href,
  new URL("./assets/backgrounds/image_w3000_h1993_500+_Forest_Mist_Pic.webp", import.meta.url).href,
];

function initBackgroundRotator() {
  const el = $("#bgPhoto");
  if (!el) return;
  let i = Math.floor(Math.random() * BG_URLS.length);

  const apply = (idx) => {
    el.style.backgroundImage = `url('${BG_URLS[idx]}')`;
  };

  apply(i);

  // change every minute
  setInterval(() => {
    i = (i + 1) % BG_URLS.length;
    apply(i);
  }, 60_000);
}

function initParticles() {
  const canvas = $("#bg-particles");
  if (!canvas) return () => {};
  const ctx = canvas.getContext("2d");
  let w = 0,
    h = 0,
    raf = 0;
  const dots = [];

  const resize = () => {
    w = canvas.width = Math.floor(window.innerWidth * devicePixelRatio);
    h = canvas.height = Math.floor(window.innerHeight * devicePixelRatio);
  };
  resize();
  window.addEventListener("resize", resize);

  const count = Math.round(clamp(window.innerWidth / 22, 40, 110));
  for (let i = 0; i < count; i++) {
    dots.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (Math.random() * 1.6 + 0.6) * devicePixelRatio,
      vx: (Math.random() - 0.5) * 0.18 * devicePixelRatio,
      vy: (Math.random() - 0.5) * 0.18 * devicePixelRatio,
      a: Math.random() * 0.22 + 0.06,
    });
  }

  const draw = () => {
    if (!state.settings.fx) {
      raf = requestAnimationFrame(draw);
      return;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    for (const p of dots) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -50) p.x = w + 50;
      if (p.x > w + 50) p.x = -50;
      if (p.y < -50) p.y = h + 50;
      if (p.y > h + 50) p.y = -50;

      ctx.beginPath();
      ctx.fillStyle = `rgba(44,246,215,${p.a})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  };
}

function gsapIntro() {
  const ok = typeof window.gsap !== "undefined" && state.settings.motion;
  if (!ok) return;
  try {
    const gsap = window.gsap;
    gsap.registerPlugin(window.ScrollTrigger);
    gsap.from(".hero__copy", { y: 18, opacity: 0, duration: 0.8, ease: "power2.out" });
    gsap.from(".hero__cards .card", { y: 18, opacity: 0, duration: 0.8, ease: "power2.out", stagger: 0.08, delay: 0.1 });
    gsap.utils.toArray(".feat").forEach((el) => {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: "top 85%" },
        y: 18,
        opacity: 0,
        duration: 0.6,
        ease: "power2.out",
      });
    });
  } catch {
    // no-op
  }
}

function bindUI() {
  // Defensive: prevent "dead" looking buttons (buttons without listeners)
  // If an element has [data-coming-soon], we show a toast instead of doing nothing.
  $$('[data-coming-soon]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      toast(state.lang === 'ar' ? 'قريبًا' : 'Coming soon');
    });
  });
  // Sidebar
  const sidebar = $("#sidebar");
  const closeSidebar = () => sidebar?.classList.remove("is-open");
  const openSidebar = () => sidebar?.classList.add("is-open");

  $("#btnMenu")?.addEventListener("click", openSidebar);
  $("#btnCloseSidebar")?.addEventListener("click", closeSidebar);

  // close on outside click
  sidebar?.addEventListener("click", (e) => {
    if (e.target === sidebar) closeSidebar();
  });

  // close when clicking any nav item
  $$(".nav__item", sidebar || document).forEach((a) => a.addEventListener("click", closeSidebar));

  // Route links
  $$('[data-go]').forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

  window.addEventListener("hashchange", () => setRoute(routeFromHash()));

  // Theme / lang
  $("#btnTheme")?.addEventListener("click", toggleTheme);
  $("#btnTheme2")?.addEventListener("click", toggleTheme);
  $("#btnLang")?.addEventListener("click", () => setLang(state.lang === "ar" ? "en" : "ar"));

  // Settings bindings
  $("#toggleMotion")?.addEventListener("change", (e) => {
    setMotion(e.target.checked);
    persistSettings();
  });
  $("#toggleFx")?.addEventListener("change", (e) => {
    setFx(e.target.checked);
    persistSettings();
  });
  $("#fontSize")?.addEventListener("input", (e) => {
    state.settings.ayahSize = Number(e.target.value);
    applyReadingCSS();
    persistSettings();
  });
  $("#lineHeight")?.addEventListener("input", (e) => {
    state.settings.ayahLine = Number(e.target.value);
    applyReadingCSS();
    persistSettings();
  });
  $("#fontFamily")?.addEventListener("change", (e) => {
    state.settings.ayahFont = e.target.value;
    applyReadingCSS();
    persistSettings();
  });

  // Scroll to top
  const fab = $("#fabTop");
  const onScroll = () => {
    if (!fab) return;
    fab.classList.toggle("is-on", window.scrollY > 600);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  fab?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  $("#btnScrollTop")?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  // Global search (top bar) -> real search page
  const gSearch = $("#globalSearch");
  gSearch?.addEventListener("focus", () => go("search"));
  gSearch?.addEventListener(
    "input",
    debounce(() => {
      go("search");
      const q = gSearch.value || "";
      const inp = $("#searchInput");
      if (inp) inp.value = q;

      // sync type selector with chip mode (optional)
      const sel = $("#searchType");
      if (sel) sel.value = state.searchMode === "mixed" ? "mixed" : state.searchMode;

      runSearch();
    }, 140)
  );

  gSearch?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    go("search");
    setTimeout(() => {
      const first = document.querySelector("#searchResults [data-open], #searchResults [data-open-surah]");
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, 120);
  });

  // Search mode chip
  $("#btnSearchMode")?.addEventListener("click", () => {
    const cycle = ["mixed", "surah", "ayah", "keyword"];
    const i = cycle.indexOf(state.searchMode);
    state.searchMode = cycle[(i + 1) % cycle.length];
    const map = { mixed: state.lang === "ar" ? "الكُل" : "All", surah: state.lang === "ar" ? "سور" : "Surah", ayah: state.lang === "ar" ? "آية" : "Ayah", keyword: state.lang === "ar" ? "كلمة" : "Keyword" };
    $("#btnSearchMode").textContent = map[state.searchMode];
  });

  // Search page
  $("#searchInput")?.addEventListener("input", debounce(() => runSearch(), 180));
  $("#searchType")?.addEventListener("change", () => runSearch());

  // Daily
  $("#btnRefreshDaily")?.addEventListener("click", () => loadDaily(true));
  $("#btnNewReminder")?.addEventListener("click", () => setReminder(true));

  // Bookmarks
  $("#btnClearBookmarks")?.addEventListener("click", clearBookmarks);
  $("#btnGoLastRead")?.addEventListener("click", () => {
    const lr = readJSON(LS.lastRead, null);
    if (!lr) return toast(state.lang === "ar" ? "لا يوجد موضع محفوظ" : "No saved position");
    go("reader");
    openSurah(lr.surahNumber, { highlightAyah: lr.ayahNumber, autoscroll: true });
  });
  $("#btnContinue")?.addEventListener("click", () => {
    const lr = readJSON(LS.lastRead, null);
    if (!lr) return toast(state.lang === "ar" ? "لا يوجد موضع محفوظ" : "No saved position");
    go("reader");
    openSurah(lr.surahNumber, { highlightAyah: lr.ayahNumber, autoscroll: true });
  });
}

function persistSettings() {
  writeJSON(LS.settings, state.settings);
}

function toggleTheme() {
  const cur = document.documentElement.dataset.theme || "dark";
  setTheme(cur === "dark" ? "light" : "dark");
}

function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const cache = new Map();
async function apiGet(path) {
  const url = `${QURAN_API}${path}`;
  if (cache.has(url)) return cache.get(url);
  const p = fetchJSON(url, { retries: 2, timeout: 14000 });
  cache.set(url, p);
  return p;
}

async function pingApi() {
  try {
    await apiGet("/surah");
    state.isOnline = true;
    $("#apiStatus").textContent = state.lang === "ar" ? "متصل" : "Online";
  } catch {
    state.isOnline = false;
    $("#apiStatus").textContent = state.lang === "ar" ? "غير متاح" : "Unavailable";
  }
}

async function loadSurahs() {
  $("#surahList").innerHTML = `<div class="skeletonList" aria-hidden="true"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>`;
  try {
    const json = await apiGet("/surah");
    state.surahs = json.data || [];
    renderSurahList();
    // listen page dropdown
    initListenUI();
  } catch (e) {
    $("#surahList").innerHTML = `<div class="empty"><div class="empty__icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty__title">${state.lang === "ar" ? "تعذّر تحميل السور" : "Failed to load surahs"}</div><div class="empty__desc">${String(e)}</div></div>`;
  }
}

function renderSurahList(filter = "") {
  const list = $("#surahList");
  if (!list) return;
  const f = filter.trim();
  const rows = state.surahs
    .filter((s) => {
      if (!f) return true;
      return (
        String(s.number).includes(f) ||
        (s.englishName || "").toLowerCase().includes(f.toLowerCase()) ||
        (s.name || "").includes(f) ||
        (s.englishNameTranslation || "").toLowerCase().includes(f.toLowerCase())
      );
    })
    .map((s) => {
      const active = state.currentSurah?.number === s.number ? "is-active" : "";
      return `
        <div class="surahItem ${active}" data-surah="${s.number}">
          <div>
            <div class="surahItem__name">${s.name}</div>
            <div class="surahItem__meta">${s.englishName} • ${s.numberOfAyahs} ayahs</div>
          </div>
          <div class="chip">${s.number}</div>
        </div>
      `;
    })
    .join("");

  list.innerHTML = rows || `<div class="empty"><div class="empty__icon"><i class="fa-solid fa-circle-info"></i></div><div class="empty__title">${state.lang === "ar" ? "لا نتائج" : "No results"}</div></div>`;

  $$(".surahItem", list).forEach((el) => {
    el.addEventListener("click", () => {
      const n = Number(el.dataset.surah);
      go("reader");
      openSurah(n, { autoscroll: false });
    });
  });
}

async function loadSurahBundle(surahNumber) {
  // Arabic text (Uthmani), Translation, Audio (reciter)
  const [ar, tr, au] = await Promise.all([
    apiGet(`/surah/${surahNumber}/quran-uthmani`),
    apiGet(`/surah/${surahNumber}/${state.settings.translation}`),
    apiGet(`/surah/${surahNumber}/${state.settings.reciter}`),
  ]);

  const arabicAyahs = ar.data?.ayahs || [];
  const trAyahs = tr.data?.ayahs || [];
  const auAyahs = au.data?.ayahs || [];

  const byNum = new Map();
  for (const a of arabicAyahs) byNum.set(a.numberInSurah, { ...a });
  for (const t of trAyahs) {
    const x = byNum.get(t.numberInSurah) || {};
    byNum.set(t.numberInSurah, { ...x, tr: t.text });
  }
  for (const a of auAyahs) {
    const x = byNum.get(a.numberInSurah) || {};
    byNum.set(a.numberInSurah, { ...x, audio: a.audio });
  }

  const merged = Array.from(byNum.values()).sort((a, b) => a.numberInSurah - b.numberInSurah);
  return {
    surahMeta: {
      number: surahNumber,
      name: ar.data?.name,
      englishName: ar.data?.englishName,
      numberOfAyahs: ar.data?.numberOfAyahs,
      revelationType: ar.data?.revelationType,
    },
    ayahs: merged,
  };
}

async function openSurah(surahNumber, { highlightAyah = null, autoscroll = false } = {}) {
  const s = state.surahs.find((x) => x.number === surahNumber);
  state.currentSurah = s || { number: surahNumber, name: `سورة ${surahNumber}`, englishName: `Surah ${surahNumber}` };

  $("#readerTitle").textContent = state.currentSurah.name || "";
  $("#readerSub").textContent = `${state.currentSurah.englishName || ""} • ${state.currentSurah.numberOfAyahs || ""}`;
  $("#ayahList").innerHTML = `<div class="empty"><div class="empty__icon"><i class="fa-solid fa-spinner fa-spin"></i></div><div class="empty__title">${state.lang === "ar" ? "جاري تحميل الآيات" : "Loading ayahs"}</div><div class="empty__desc">${state.lang === "ar" ? "قد يستغرق ثوانٍ" : "May take a moment"}</div></div>`;

  // mark active in list
  $$(".surahItem").forEach((it) => it.classList.toggle("is-active", Number(it.dataset.surah) === surahNumber));

  try {
    const bundle = await loadSurahBundle(surahNumber);
    state.ayahs = bundle.ayahs;
    $("#readerTitle").textContent = bundle.surahMeta.name;
    $("#readerSub").textContent = `${bundle.surahMeta.englishName} • ${bundle.surahMeta.revelationType}`;

    renderAyahs({ highlightAyah });
    saveLastRead(surahNumber, highlightAyah || 1);

    if (autoscroll && highlightAyah) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`ayah-${highlightAyah}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  } catch (e) {
    $("#ayahList").innerHTML = `<div class="empty"><div class="empty__icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty__title">${state.lang === "ar" ? "تعذّر تحميل السورة" : "Failed to load surah"}</div><div class="empty__desc">${String(e)}</div></div>`;
  }
}

function ayahCard(a) {
  const trHtml = a.tr ? `<div class="ayah__tr">${escapeHTML(a.tr)}</div>` : "";
  return `
    <article class="ayah" id="ayah-${a.numberInSurah}" data-ayah="${a.numberInSurah}">
      <div class="ayah__top">
        <div class="ayah__idx">${state.currentSurah?.name || ""} • ${a.numberInSurah}</div>
        <div class="ayah__actions">
          <button class="icon-btn" data-action="play" title="Play"><i class="fa-solid fa-play"></i></button>
          <button class="icon-btn" data-action="save" title="Save"><i class="fa-solid fa-bookmark"></i></button>
        </div>
      </div>
      <div class="ayah__text">${escapeHTML(a.text || "")}</div>
      ${trHtml}
    </article>
  `;
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(htmlSafeText, query) {
  const q = String(query || "").trim();
  if (!q) return htmlSafeText;
  // highlight each token (Arabic/English)
  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6);
  let out = htmlSafeText;
  for (const t of tokens) {
    const re = new RegExp(escapeRegExp(t), "gi");
    out = out.replace(re, (m) => `<mark class="hit">${m}</mark>`);
  }
  return out;
}

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAyahs({ highlightAyah = null } = {}) {
  const wrap = $("#ayahList");
  if (!wrap) return;

  const html = state.ayahs.map(ayahCard).join("");
  wrap.innerHTML = html || `<div class="empty"><div class="empty__title">${state.lang === "ar" ? "لا توجد بيانات" : "No data"}</div></div>`;

  $$(".ayah", wrap).forEach((el) => {
    const n = Number(el.dataset.ayah);
    if (highlightAyah && n === Number(highlightAyah)) el.classList.add("is-highlight");

    el.addEventListener("click", (evt) => {
      // don't hijack button clicks
      if (evt.target.closest("button")) return;
      saveLastRead(state.currentSurah.number, n);
      toast(state.lang === "ar" ? "تم حفظ موضع القراءة" : "Reading position saved");
    });

    el.addEventListener("click", (evt) => {
      const b = evt.target.closest("button");
      if (!b) return;
      const action = b.dataset.action;
      if (action === "save") toggleFavAyah(state.currentSurah.number, n);
      if (action === "play") playAyah(state.currentSurah.number, n);
    });
  });

  // Auto-highlight the ayah in view (soft "auto scrolling" feel)
  observeAyahs(wrap);
}

let ayahObserver = null;
function observeAyahs(container) {
  if (ayahObserver) ayahObserver.disconnect();
  if (!("IntersectionObserver" in window)) return;

  const opts = { root: null, threshold: 0.55 };
  ayahObserver = new IntersectionObserver((entries) => {
    // choose the most visible entry
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;

    const el = visible.target;
    const n = Number(el.dataset.ayah);
    if (!n || !state.currentSurah) return;

    // soft highlight
    $$(".ayah.is-highlight", container).forEach((x) => x.classList.remove("is-highlight"));
    el.classList.add("is-highlight");

    // autosave position (throttled by browser)
    saveLastRead(state.currentSurah.number, n);
  }, opts);

  $$(".ayah", container).forEach((el) => ayahObserver.observe(el));
}

function saveLastRead(surahNumber, ayahNumber) {
  writeJSON(LS.lastRead, { surahNumber, ayahNumber, t: Date.now() });
}

function toggleFavAyah(surahNumber, ayahNumber) {
  const fav = readJSON(LS.favAyahs, []);
  const key = `${surahNumber}:${ayahNumber}`;
  const idx = fav.findIndex((x) => x.key === key);
  if (idx >= 0) {
    fav.splice(idx, 1);
    toast(state.lang === "ar" ? "تمت إزالة الحفظ" : "Removed");
  } else {
    const a = state.ayahs.find((x) => x.numberInSurah === ayahNumber);
    fav.unshift({
      key,
      surahNumber,
      ayahNumber,
      surahName: state.currentSurah?.name,
      text: (a?.text || "").slice(0, 140),
      t: Date.now(),
    });
    toast(state.lang === "ar" ? "تم حفظ الآية" : "Saved");
  }
  writeJSON(LS.favAyahs, fav.slice(0, 200));
  renderBookmarks();
}

function toggleFavSurah(surahNumber) {
  const fav = readJSON(LS.favSurahs, []);
  const idx = fav.findIndex((x) => x.surahNumber === surahNumber);
  if (idx >= 0) {
    fav.splice(idx, 1);
    toast(state.lang === "ar" ? "تمت إزالة السورة من المفضلة" : "Removed from favorites");
  } else {
    const s = state.surahs.find((x) => x.number === surahNumber) || state.currentSurah;
    fav.unshift({ surahNumber, name: s?.name, englishName: s?.englishName, t: Date.now() });
    toast(state.lang === "ar" ? "تم حفظ السورة" : "Saved surah");
  }
  writeJSON(LS.favSurahs, fav.slice(0, 200));
  renderBookmarks();
}

function clearBookmarks() {
  localStorage.removeItem(LS.favAyahs);
  localStorage.removeItem(LS.favSurahs);
  toast(state.lang === "ar" ? "تم المسح" : "Cleared");
  renderBookmarks();
}

function renderBookmarks() {
  const lr = readJSON(LS.lastRead, null);
  $("#lastRead").textContent = lr
    ? `${state.lang === "ar" ? "سورة" : "Surah"} ${lr.surahNumber} • ${state.lang === "ar" ? "آية" : "Ayah"} ${lr.ayahNumber}`
    : state.lang === "ar"
      ? "لا يوجد موضع محفوظ"
      : "No saved position";

  const ayWrap = $("#favAyahs");
  const suWrap = $("#favSurahs");
  if (!ayWrap || !suWrap) return;

  const favA = readJSON(LS.favAyahs, []);
  const favS = readJSON(LS.favSurahs, []);

  ayWrap.innerHTML = favA.length
    ? favA
        .map(
          (x) => `
    <div class="listItem">
      <div class="listItem__main">
        <div class="listItem__title">${x.surahName || (state.lang === "ar" ? "آية محفوظة" : "Saved ayah")}</div>
        <div class="listItem__sub">${x.key} • ${escapeHTML(x.text || "")}</div>
      </div>
      <div class="listItem__actions">
        <button class="icon-btn" data-open="${x.key}" aria-label="Open"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
        <button class="icon-btn" data-del="${x.key}" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`
        )
        .join("")
    : `<div class="empty"><div class="empty__title">${state.lang === "ar" ? "لا توجد آيات محفوظة" : "No saved ayahs"}</div></div>`;

  suWrap.innerHTML = favS.length
    ? favS
        .map(
          (x) => `
    <div class="listItem">
      <div class="listItem__main">
        <div class="listItem__title">${x.name || "—"}</div>
        <div class="listItem__sub">${x.englishName || ""} • ${x.surahNumber}</div>
      </div>
      <div class="listItem__actions">
        <button class="icon-btn" data-open-surah="${x.surahNumber}" aria-label="Open"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
        <button class="icon-btn" data-del-surah="${x.surahNumber}" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`
        )
        .join("")
    : `<div class="empty"><div class="empty__title">${state.lang === "ar" ? "لا توجد سور محفوظة" : "No saved surahs"}</div></div>`;

  // events
  $$('[data-open]').forEach((b) =>
    b.addEventListener("click", () => {
      const [s, a] = b.dataset.open.split(":").map(Number);
      go("reader");
      openSurah(s, { highlightAyah: a, autoscroll: true });
    })
  );
  $$('[data-del]').forEach((b) =>
    b.addEventListener("click", () => {
      const fav = readJSON(LS.favAyahs, []);
      writeJSON(
        LS.favAyahs,
        fav.filter((x) => x.key !== b.dataset.del)
      );
      renderBookmarks();
    })
  );
  $$('[data-open-surah]').forEach((b) =>
    b.addEventListener("click", () => {
      go("reader");
      openSurah(Number(b.dataset.openSurah));
    })
  );
  $$('[data-del-surah]').forEach((b) =>
    b.addEventListener("click", () => {
      const fav = readJSON(LS.favSurahs, []);
      writeJSON(
        LS.favSurahs,
        fav.filter((x) => x.surahNumber !== Number(b.dataset.delSurah))
      );
      renderBookmarks();
    })
  );
}

// Audio player
function initPlayer() {
  const audio = $("#audio");
  const player = $("#player");
  const seek = $("#seek");
  const vol = $("#vol");
  const eq = $(".eq");

  $("#btnClosePlayer")?.addEventListener("click", () => {
    // NOTE: CSS sets .player{display:grid}; so we must explicitly support [hidden]
    player.setAttribute("hidden", "");
    audio.pause();
    // fully stop network + ensure it doesn't immediately resume
    audio.removeAttribute("src");
    audio.load();
  });

  $("#btnPlay")?.addEventListener("click", () => {
    if (audio.paused) audio.play();
    else audio.pause();
  });
  $("#btnPrev")?.addEventListener("click", () => playIndex(state.audioIndex - 1));
  $("#btnNext")?.addEventListener("click", () => playIndex(state.audioIndex + 1));

  vol?.addEventListener("input", () => (audio.volume = Number(vol.value)));

  seek?.addEventListener("input", () => {
    if (!audio.duration) return;
    audio.currentTime = (Number(seek.value) / 100) * audio.duration;
  });

  audio.addEventListener("play", () => {
    $("#btnPlay i").className = "fa-solid fa-pause";
    eq?.classList.add("is-on");
  });
  audio.addEventListener("pause", () => {
    $("#btnPlay i").className = "fa-solid fa-play";
    eq?.classList.remove("is-on");
  });

  audio.addEventListener("timeupdate", () => {
    if (!audio.duration) return;
    seek.value = String((audio.currentTime / audio.duration) * 100);
    $("#tNow").textContent = fmtTime(audio.currentTime);
    $("#tDur").textContent = fmtTime(audio.duration);
  });

  audio.addEventListener("ended", () => {
    if (state.audioIndex < state.audioQueue.length - 1) playIndex(state.audioIndex + 1);
    else eq?.classList.remove("is-on");
  });

  // surah player btn
  $("#btnPlaySurah")?.addEventListener("click", () => {
    if (!state.currentSurah) return toast(state.lang === "ar" ? "اختر سورة أولًا" : "Pick a surah first");
    playSurah(state.currentSurah.number);
  });
  $("#btnBookmarkSurah")?.addEventListener("click", () => {
    if (!state.currentSurah) return;
    toggleFavSurah(state.currentSurah.number);
  });

  // daily play buttons
  $("#btnDailyPlay")?.addEventListener("click", () => state.daily && playAyah(state.daily.surahNumber, state.daily.ayahNumber, state.daily.audio));
  $("#btnDailyPlay2")?.addEventListener("click", () => state.daily && playAyah(state.daily.surahNumber, state.daily.ayahNumber, state.daily.audio));
  $("#btnModalPlay")?.addEventListener("click", () => state.daily && playAyah(state.daily.surahNumber, state.daily.ayahNumber, state.daily.audio));

  // daily save buttons
  $("#btnDailySave")?.addEventListener("click", () => state.daily && saveDailyAsFav());
  $("#btnDailySave2")?.addEventListener("click", () => state.daily && saveDailyAsFav());
  $("#btnModalSave")?.addEventListener("click", () => state.daily && saveDailyAsFav());

  $("#btnDailyOpen")?.addEventListener("click", () => {
    if (!state.daily) return;
    go("reader");
    openSurah(state.daily.surahNumber, { highlightAyah: state.daily.ayahNumber, autoscroll: true });
  });
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function playIndex(i) {
  if (i < 0 || i >= state.audioQueue.length) return;
  state.audioIndex = i;
  const item = state.audioQueue[i];
  const audio = $("#audio");
  const player = $("#player");
  player.hidden = false;
  $("#playerTitle").textContent = item.title;
  $("#playerSub").textContent = item.sub || "";
  audio.src = item.url;
  audio.play().catch(() => toast(state.lang === "ar" ? "تعذّر تشغيل الصوت" : "Failed to play"));

  // sync listen view
  try {
    updateListenNow(item);
  } catch {}
}

function playAyah(surahNumber, ayahNumber, directUrl = null) {
  const a = state.ayahs.find((x) => x.numberInSurah === ayahNumber);
  const url = directUrl || a?.audio;
  if (!url) return toast(state.lang === "ar" ? "لا يوجد صوت لهذه الآية" : "No audio for this ayah");

  state.audioQueue = [
    {
      kind: "ayah",
      surahNumber,
      ayahNumber,
      title: `${state.lang === "ar" ? "آية" : "Ayah"} ${ayahNumber}`,
      sub: `${state.currentSurah?.name || ""}`,
      url,
    },
  ];
  playIndex(0);
}

function playSurah(surahNumber) {
  if (!state.ayahs?.length) return;
  const q = state.ayahs
    .filter((x) => !!x.audio)
    .map((x) => ({
      kind: "surah",
      surahNumber,
      ayahNumber: x.numberInSurah,
      title: `${state.currentSurah?.name || ""}`,
      sub: `${state.lang === "ar" ? "آية" : "Ayah"} ${x.numberInSurah}`,
      url: x.audio,
    }));
  if (!q.length) return toast(state.lang === "ar" ? "لا يوجد صوت" : "No audio");
  state.audioQueue = q;
  playIndex(0);
}

function updateListenNow(item) {
  // Only if listen route exists
  const wrap = $("#listenAyahs");
  if (!wrap) return;

  // item may be ayah or surah queue
  const ayahNumber = item.ayahNumber;
  if (!ayahNumber) return;

  $$(".ayah", wrap).forEach((el) => {
    el.classList.toggle("is-highlight", Number(el.dataset.ayah) === Number(ayahNumber));
  });

  // auto scroll in listen panel
  const el = wrap.querySelector(`#ayah-${ayahNumber}`);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function loadListenSurah(surahNumber) {
  const wrap = $("#listenAyahs");
  if (!wrap) return;

  wrap.innerHTML = `<div class="empty"><div class="empty__icon"><i class="fa-solid fa-spinner fa-spin"></i></div><div class="empty__title">جاري التحميل</div><div class="empty__desc">يتم جلب النص + الترجمة + الصوت</div></div>`;

  try {
    const bundle = await loadSurahBundle(surahNumber);
    state.listen.surahNumber = surahNumber;
    state.listen.ayahs = bundle.ayahs;

    // keep compatibility with existing player/search
    state.currentSurah = bundle.surahMeta;
    state.ayahs = bundle.ayahs;

    renderListenAyahs();
  } catch (e) {
    wrap.innerHTML = `<div class="empty"><div class="empty__icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty__title">تعذّر التحميل</div><div class="empty__desc">${escapeHTML(String(e))}</div></div>`;
  }
}

function renderListenAyahs() {
  const wrap = $("#listenAyahs");
  if (!wrap) return;

  wrap.innerHTML = (state.listen.ayahs || []).map(ayahCard).join("") || `<div class="empty"><div class="empty__title">لا توجد بيانات</div></div>`;

  // click an ayah => play it
  $$(".ayah", wrap).forEach((el) => {
    el.addEventListener("click", (evt) => {
      const n = Number(el.dataset.ayah);
      if (!n) return;
      // do not trigger when clicking save/play buttons inside
      if (evt.target.closest("button")) return;
      playAyah(state.listen.surahNumber, n);
    });
  });
}

function initListenUI() {
  const selSurah = $("#listenSurah");
  const selRec = $("#listenReciter");
  if (!selSurah || !selRec) return;

  // populate surahs
  selSurah.innerHTML = (state.surahs || [])
    .map((s) => `<option value="${s.number}">${escapeHTML(s.name)} • ${s.number}</option>`)
    .join("");

  // default selection
  const lr = readJSON(LS.lastRead, null);
  const startSurah = lr?.surahNumber || 1;
  selSurah.value = String(startSurah);

  // reciter
  selRec.value = state.settings.reciter || "ar.alafasy";

  selSurah.addEventListener("change", () => {
    loadListenSurah(Number(selSurah.value));
  });

  selRec.addEventListener("change", () => {
    state.settings.reciter = selRec.value;
    persistSettings();
    // reload to get the new audio urls
    loadListenSurah(Number(selSurah.value));
  });

  $("#btnListenPlay")?.addEventListener("click", () => {
    const n = Number(selSurah.value);
    if (!state.ayahs?.length || state.currentSurah?.number !== n) {
      loadListenSurah(n).then(() => playSurah(n));
    } else {
      playSurah(n);
    }
  });

  $("#btnListenStop")?.addEventListener("click", () => {
    $("#btnClosePlayer")?.click();
  });

  // initial load
  loadListenSurah(Number(selSurah.value));
}

function saveDailyAsFav() {
  const key = `${state.daily.surahNumber}:${state.daily.ayahNumber}`;
  const fav = readJSON(LS.favAyahs, []);
  if (fav.some((x) => x.key === key)) return toast(state.lang === "ar" ? "محفوظة بالفعل" : "Already saved");
  fav.unshift({
    key,
    surahNumber: state.daily.surahNumber,
    ayahNumber: state.daily.ayahNumber,
    surahName: state.daily.surahName,
    text: (state.daily.ar || "").slice(0, 140),
    t: Date.now(),
  });
  writeJSON(LS.favAyahs, fav.slice(0, 200));
  toast(state.lang === "ar" ? "تم حفظ آية اليوم" : "Saved verse of the day");
}

// Daily content
const REMINDERS = [
  "اقرأ بطمأنينة… القليل مع الاستمرار يصنع أثرًا كبيرًا.",
  "اجعل للقرآن وردًا ثابتًا ولو آية واحدة.",
  "تأنَّ… جمال التلاوة في حضور القلب.",
  "كل مرة تعود فيها للقرآن هي بداية جديدة.",
  "اللهم اجعل القرآن ربيع قلوبنا.",
];

const HADITHS = [
  "خيركم من تعلم القرآن وعلمه.",
  "اقرؤوا القرآن فإنه يأتي يوم القيامة شفيعًا لأصحابه.",
  "مثل الذي يقرأ القرآن وهو حافظ له مع السفرة الكرام البررة.",
];

function setReminder(forceNew = false) {
  const el = $("#randomReminder");
  const el2 = $("#dailyReminder");
  if (!el) return;
  let i = Math.floor(Math.random() * REMINDERS.length);
  if (forceNew) i = (i + 1) % REMINDERS.length;
  el.textContent = REMINDERS[i];
  if (el2) el2.textContent = REMINDERS[(i + 2) % REMINDERS.length];
}

async function loadDaily(force = false) {
  const today = nowISODate();
  const saved = readJSON(LS.daily, null);
  if (!force && saved?.date === today) {
    state.daily = saved;
    renderDaily();
    renderDailyHome();
    return;
  }

  // Pick a deterministic-ish random using date
  const seed = today.split("-").join("");
  const n = Number(seed.slice(-3));
  const surahNumber = (n % 114) + 1;

  // Get surah meta to pick ayah count
  let surahMeta = state.surahs.find((s) => s.number === surahNumber);
  if (!surahMeta) {
    try {
      await loadSurahs();
      surahMeta = state.surahs.find((s) => s.number === surahNumber);
    } catch {}
  }
  const ayahNumber = surahMeta ? (n % surahMeta.numberOfAyahs) + 1 : 1;

  try {
    // alquran.cloud: /ayah/{surah}:{ayah}/editions/quran-uthmani,en.asad,ar.alafasy
    const editions = `quran-uthmani,${state.settings.translation},${state.settings.reciter}`;
    const json = await apiGet(`/ayah/${surahNumber}:${ayahNumber}/editions/${editions}`);
    const arr = json.data || [];
    const ar = arr.find((x) => x.edition?.identifier === "quran-uthmani")?.text;
    const tr = arr.find((x) => x.edition?.identifier === state.settings.translation)?.text;
    const audio = arr.find((x) => x.edition?.identifier === state.settings.reciter)?.audio;

    state.daily = {
      date: today,
      surahNumber,
      ayahNumber,
      surahName: surahMeta?.name || `سورة ${surahNumber}`,
      ar,
      tr,
      audio,
    };

    writeJSON(LS.daily, state.daily);
    renderDaily();
    renderDailyHome();

    // popup once per day
    const seen = localStorage.getItem(LS.seenDailyPopup);
    if (seen !== today) {
      openDailyModal();
      localStorage.setItem(LS.seenDailyPopup, today);
    }
  } catch (e) {
    $("#dailyAyahText").textContent = state.lang === "ar" ? "تعذّر تحميل آية اليوم" : "Failed to load daily verse";
    $("#dailyHadith").textContent = state.lang === "ar" ? "تعذّر تحميل" : "Failed";
    toast(state.lang === "ar" ? "فشل تحميل آية اليوم" : "Daily verse failed");
  }
}

function renderDailyHome() {
  if (!state.daily) return;
  $("#dailyAyahMeta").textContent = `${state.daily.surahName} • ${state.daily.ayahNumber}`;
  $("#dailyAyahText").textContent = state.daily.ar || "—";
  $("#dailyAyahFull").textContent = state.daily.ar || "—";
}

function renderDaily() {
  if (!state.daily) return;
  $("#dailyAyahFull").textContent = state.daily.ar || "—";
  const hadith = HADITHS[Math.floor(Math.random() * HADITHS.length)];
  $("#dailyHadith").textContent = hadith;
}

function openDailyModal() {
  if (!state.daily) return;
  $("#modalMeta").textContent = `${state.daily.surahName} • ${state.daily.ayahNumber}`;
  $("#modalText").textContent = state.daily.ar || "—";
  const modal = $("#modal");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function bindModal() {
  const modal = $("#modal");
  modal?.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

function closeModal() {
  const modal = $("#modal");
  modal?.classList.remove("is-open");
  modal?.setAttribute("aria-hidden", "true");
}

// Tasbih
function initTasbih() {
  const LIMITED = [
    { text: "سبحان الله", max: 33 },
    { text: "الحمد لله", max: 33 },
    { text: "الله أكبر", max: 33 },
    { text: "لا إله إلا الله", max: 33 },
  ];
  const FREE_DHIKR = [
    "سبحان الله",
    "الحمد لله",
    "الله أكبر",
    "لا إله إلا الله",
    "استغفر الله",
    "سبحان الله العظيم",
    "لا حول ولا قوة إلا بالله",
  ];

  // Backward-compatible storage migration
  const raw = readJSON(LS.tasbih, null);
  const store = normalizeTasbihStore(raw);
  writeJSON(LS.tasbih, store);

  const elCount = $("#tasbihCount");
  const elLabel = $("#tasbihLabel");
  const elProg = $("#tasbihProgress");
  const btnLimited = $("#tasbihModeLimited");
  const btnFree = $("#tasbihModeFree");

  const paintMode = () => {
    const s = readJSON(LS.tasbih, store);
    btnLimited?.classList.toggle("is-active", s.mode === "limited");
    btnFree?.classList.toggle("is-active", s.mode === "free");

    // keep aria state
    btnLimited?.setAttribute("aria-pressed", String(s.mode === "limited"));
    btnFree?.setAttribute("aria-pressed", String(s.mode === "free"));

    if (s.mode === "limited") {
      const cur = LIMITED[s.limited.idx % LIMITED.length];
      elLabel.textContent = cur.text;
      elCount.textContent = String(s.limited.count);
      elProg.textContent = `${s.limited.count} / ${cur.max}`;
    } else {
      const d = s.free.dhikr;
      elLabel.textContent = d;
      elCount.textContent = String(s.free.counts[d] || 0);
      elProg.textContent = `${s.free.counts[d] || 0} / ∞`;
    }

    // chips: rebuild for free mode (more dhikr) — keep design
    const chipsWrap = $(".tasbih__chips");
    if (chipsWrap) {
      const list = s.mode === "free" ? FREE_DHIKR : LIMITED.map((x) => x.text);
      chipsWrap.innerHTML = list
        .map((t) => `<button class="chip" data-dhikr="${escapeHTML(t)}">${escapeHTML(t)}</button>`)
        .join("");
      $$('[data-dhikr]', chipsWrap).forEach((b) => {
        b.addEventListener("click", () => {
          const ss = readJSON(LS.tasbih, store);
          if (ss.mode === "limited") {
            // in limited mode, dhikr changes automatically — ignore manual changes
            toast(state.lang === "ar" ? "الوضع 33 ينتقل تلقائيًا" : "33 mode auto-advances");
            return;
          }
          ss.free.dhikr = b.dataset.dhikr;
          writeJSON(LS.tasbih, ss);
          paintMode();
        });
      });
    }
  };

  const punch = () => {
    if (navigator.vibrate) navigator.vibrate(12);
    if (state.settings.motion && window.gsap) {
      window.gsap.fromTo("#tasbihCount", { scale: 1.0 }, { scale: 1.06, yoyo: true, repeat: 1, duration: 0.12 });
    }
  };

  const tap = () => {
    const s = readJSON(LS.tasbih, store);

    if (s.mode === "limited") {
      const cur = LIMITED[s.limited.idx % LIMITED.length];
      s.limited.count += 1;

      if (s.limited.count >= cur.max) {
        // congratulate every 33
        toast("أحسنت 🤍 تقبل الله منك", "success");

        // advance
        s.limited.idx = (s.limited.idx + 1) % LIMITED.length;
        s.limited.count = 0;

        // full cycle completed
        if (s.limited.idx === 0) {
          toast("ما شاء الله ✨ اكتملت الدورة", "success");
        }
      }

      writeJSON(LS.tasbih, s);
      paintMode();
      punch();
      return;
    }

    // free mode
    const d = s.free.dhikr;
    s.free.counts[d] = (s.free.counts[d] || 0) + 1;
    writeJSON(LS.tasbih, s);
    paintMode();
    punch();
  };

  $("#btnTasbihTap")?.addEventListener("click", tap);

  $("#btnTasbihReset")?.addEventListener("click", () => {
    const s = readJSON(LS.tasbih, store);
    if (s.mode === "limited") {
      s.limited.count = 0;
    } else {
      const d = s.free.dhikr;
      s.free.counts[d] = 0;
    }
    writeJSON(LS.tasbih, s);
    paintMode();
    toast(state.lang === "ar" ? "تمت إعادة العداد" : "Reset");
  });

  btnLimited?.addEventListener("click", () => {
    const s = readJSON(LS.tasbih, store);
    s.mode = "limited";
    writeJSON(LS.tasbih, s);
    paintMode();
  });

  btnFree?.addEventListener("click", () => {
    const s = readJSON(LS.tasbih, store);
    s.mode = "free";
    writeJSON(LS.tasbih, s);
    paintMode();
  });

  paintMode();
}

function normalizeTasbihStore(raw) {
  // new schema:
  // { mode: 'limited'|'free', limited:{idx,count}, free:{dhikr, counts:{[dhikr]:count}} }
  if (raw && raw.mode && raw.limited && raw.free) return raw;

  // old schema: {count, dhikr}
  if (raw && typeof raw === "object" && ("count" in raw || "dhikr" in raw)) {
    const dh = raw.dhikr || "سبحان الله";
    const c = Number(raw.count || 0);
    return {
      mode: "free",
      limited: { idx: 0, count: 0 },
      free: { dhikr: dh, counts: { [dh]: c } },
    };
  }

  return {
    mode: "limited",
    limited: { idx: 0, count: 0 },
    free: { dhikr: "سبحان الله", counts: { "سبحان الله": 0 } },
  };
}

// Progress tracking (lightweight local stats)
const session = { start: 0, route: "" };
function startSession(route) {
  session.start = Date.now();
  session.route = route;
}
function endSession() {
  if (!session.start) return;
  const minutes = Math.round((Date.now() - session.start) / 60000);
  session.start = 0;
  if (minutes <= 0) return;

  const p = readJSON(LS.progress, { days: {}, sessions: 0, minutes: 0, streak: 0, lastDay: null });
  const day = nowISODate();
  p.days[day] = (p.days[day] || 0) + minutes;
  p.sessions += 1;
  p.minutes += minutes;

  // streak
  if (p.lastDay === day) {
    // no change
  } else {
    const d0 = new Date(day);
    const d1 = p.lastDay ? new Date(p.lastDay) : null;
    if (!d1) p.streak = 1;
    else {
      const diff = Math.round((d0 - d1) / 86400000);
      p.streak = diff === 1 ? p.streak + 1 : 1;
    }
    p.lastDay = day;
  }

  writeJSON(LS.progress, p);
}

function renderProgress() {
  const p = readJSON(LS.progress, { days: {}, sessions: 0, minutes: 0, streak: 0, lastDay: null });
  $("#pStreak").textContent = String(p.streak || 0);
  $("#pSessions").textContent = String(p.sessions || 0);
  $("#pMinutes").textContent = String(p.minutes || 0);

  // home stats
  $("#statStreak").textContent = String(p.streak || 0);
  $("#statMinutes").textContent = String(p.minutes || 0);

  // completion %: approximate based on last read surah/ayah
  const lr = readJSON(LS.lastRead, null);
  const percent = lr ? clamp(Math.round((lr.surahNumber / 114) * 100), 0, 100) : 0;
  $("#statPercent").textContent = `${percent}%`;
  $("#progressFill").style.width = `${percent}%`;

  drawProgressChart(p.days);
}

function drawProgressChart(days) {
  const c = $("#progressChart");
  if (!c) return;
  const ctx = c.getContext("2d");
  const w = c.width = c.clientWidth * devicePixelRatio;
  const h = c.height = c.clientHeight * devicePixelRatio;
  ctx.clearRect(0, 0, w, h);

  const keys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    keys.push(k);
  }
  const vals = keys.map((k) => days[k] || 0);
  const max = Math.max(10, ...vals);

  const pad = 18 * devicePixelRatio;
  const bw = (w - pad * 2) / vals.length;

  // axes glow
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = "rgba(44,246,215,.18)";
  ctx.lineWidth = 1 * devicePixelRatio;
  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();

  for (let i = 0; i < vals.length; i++) {
    const x = pad + i * bw + bw * 0.2;
    const barW = bw * 0.6;
    const barH = (vals[i] / max) * (h - pad * 2);
    const y = h - pad - barH;

    const grad = ctx.createLinearGradient(x, y, x, h - pad);
    grad.addColorStop(0, "rgba(44,246,215,.70)");
    grad.addColorStop(1, "rgba(216,179,90,.30)");
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, barW, barH, 10 * devicePixelRatio);
    ctx.fill();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Search
async function runSearch() {
  const q = ($("#searchInput")?.value || "").trim();
  const type = $("#searchType")?.value || "mixed";
  const out = $("#searchResults");
  if (!out) return;

  if (!q) {
    out.innerHTML = `<div class="empty"><div class="empty__icon"><i class="fa-solid fa-magnifying-glass"></i></div><div class="empty__title">${state.lang === "ar" ? "ابدأ الكتابة" : "Start typing"}</div></div>`;
    return;
  }

  // 1) Surah name search (local)
  const surahHits = (type === "mixed" || type === "surah")
    ? state.surahs
        .filter((s) => (s.name || "").includes(q) || (s.englishName || "").toLowerCase().includes(q.toLowerCase()))
        .slice(0, 12)
        .map(
          (s) => `
        <div class="searchHit">
          <div class="searchHit__meta">${state.lang === "ar" ? "سورة" : "Surah"} • ${s.number}</div>
          <div class="searchHit__text">${highlightText(escapeHTML(s.name), q)}</div>
          <div class="searchHit__actions">
            <button class="ghost" data-open-surah="${s.number}"><i class="fa-solid fa-book-quran"></i><span>${state.lang === "ar" ? "فتح" : "Open"}</span></button>
            <button class="ghost" data-fav-surah="${s.number}"><i class="fa-solid fa-bookmark"></i><span>${state.lang === "ar" ? "مفضلة" : "Favorite"}</span></button>
          </div>
        </div>`
        )
        .join("")
    : "";

  // 2) Ayah text search via API (alquran.cloud supports /search/{keyword}/all/{edition})
  let ayahHits = "";
  if (type === "mixed" || type === "ayah" || type === "keyword") {
    out.innerHTML = `<div class="empty"><div class="empty__icon"><i class="fa-solid fa-spinner fa-spin"></i></div><div class="empty__title">${state.lang === "ar" ? "جاري البحث" : "Searching"}</div><div class="empty__desc">${state.lang === "ar" ? "النتائج تظهر خلال لحظات" : "Results in a moment"}</div></div>`;
    try {
      const edition = type === "ayah" ? "quran-uthmani" : state.settings.translation;
      const json = await apiGet(`/search/${encodeURIComponent(q)}/all/${edition}`);
      const matches = json.data?.matches || [];
      ayahHits = matches.slice(0, 18).map((m) => {
        const ref = `${m.surah?.name || ""} • ${m.numberInSurah}`;
        return `
          <div class="searchHit">
            <div class="searchHit__meta">${escapeHTML(ref)}</div>
            <div class="searchHit__text">${highlightText(escapeHTML(m.text || ""), q)}</div>
            <div class="searchHit__actions">
              <button class="ghost" data-open="${m.surah.number}:${m.numberInSurah}"><i class="fa-solid fa-arrow-up-right-from-square"></i><span>${state.lang === "ar" ? "فتح" : "Open"}</span></button>
              <button class="ghost" data-save="${m.surah.number}:${m.numberInSurah}"><i class="fa-solid fa-bookmark"></i><span>${state.lang === "ar" ? "حفظ" : "Save"}</span></button>
            </div>
          </div>`;
      }).join("");
    } catch (e) {
      ayahHits = `<div class="empty"><div class="empty__icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty__title">${state.lang === "ar" ? "فشل البحث عبر API" : "API search failed"}</div><div class="empty__desc">${escapeHTML(String(e))}</div></div>`;
    }
  }

  out.innerHTML = `${surahHits}${ayahHits}` || `<div class="empty"><div class="empty__title">${state.lang === "ar" ? "لا نتائج" : "No results"}</div></div>`;

  $$('[data-open-surah]').forEach((b) => b.addEventListener("click", () => { go("reader"); openSurah(Number(b.dataset.openSurah)); }));
  $$('[data-fav-surah]').forEach((b) => b.addEventListener("click", () => toggleFavSurah(Number(b.dataset.favSurah))));
  $$('[data-open]').forEach((b) => b.addEventListener("click", () => { const [s,a]=b.dataset.open.split(":").map(Number); go("reader"); openSurah(s,{highlightAyah:a,autoscroll:true}); }));
  $$('[data-save]').forEach((b) => b.addEventListener("click", () => { const [s,a]=b.dataset.save.split(":").map(Number); go("reader"); openSurah(s,{highlightAyah:a,autoscroll:true}); setTimeout(()=>toggleFavAyah(s,a),300); }));
}

export function initApp() {
  // Load prefs
  state.settings = { ...DEFAULT_SETTINGS, ...readJSON(LS.settings, {}) };
  const theme = localStorage.getItem(LS.theme) || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const lang = localStorage.getItem(LS.lang) || "ar";

  setTheme(theme);
  setLang(lang);
  setMotion(state.settings.motion);
  setFx(state.settings.fx);
  applyReadingCSS();

  // Sync UI controls
  $("#toggleMotion").checked = !!state.settings.motion;
  $("#toggleFx").checked = !!state.settings.fx;
  $("#fontSize").value = String(state.settings.ayahSize);
  $("#lineHeight").value = String(state.settings.ayahLine);
  $("#fontFamily").value = state.settings.ayahFont;

  // init
  $("#year").textContent = String(new Date().getFullYear());
  startClock();
  setReminder(false);
  bindModal();
  bindUI();
  initPlayer();
  initTasbih();
  initBackgroundRotator();

  // router
  setRoute(routeFromHash());

  // sessions
  startSession(state.route);
  window.addEventListener("hashchange", () => {
    endSession();
    setRoute(routeFromHash());
    startSession(state.route);
  });

  // API + data
  pingApi();
  loadSurahs();
  loadDaily(false);

  // Reader reload button
  $("#btnReloadSurahs")?.addEventListener("click", () => loadSurahs());

  // Hide loading
  const done = () => {
    $("#app-loading")?.remove();
    gsapIntro();
  };
  // Give fonts a moment (avoids jank)
  setTimeout(done, 600);

  // Safety: persist on unload
  window.addEventListener("beforeunload", () => endSession());
}
