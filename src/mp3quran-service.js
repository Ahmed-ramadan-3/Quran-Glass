// MP3Quran dedicated API service for Quran Glass
// Design note: independent extension service; never touches the existing alquran.cloud service.

import { escapeOutput, sanitizeText, secureLocalGet, secureLocalSet } from "./security.js";

const API_ROOT = "https://mp3quran.net/api/v3";
const CACHE_PREFIX = "qg_mp3quran_cache:";
const CACHE_TTL = 1000 * 60 * 60 * 24;
const REQUEST_TIMEOUT = 9000;
const RETRIES = 2;

const ENDPOINTS = Object.freeze({
  recitersAr: `${API_ROOT}/reciters?language=ar`,
  recitersEn: `${API_ROOT}/reciters?language=eng`,
  riwayat: `${API_ROOT}/riwayat?language=ar`,
  moshaf: `${API_ROOT}/moshaf?language=ar`,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(url) {
  return `${CACHE_PREFIX}${btoa(url).replace(/=+$/g, "")}`;
}

function readCache(url) {
  const cached = secureLocalGet(cacheKey(url), null);
  if (!cached || typeof cached !== "object") return null;
  if (Date.now() - Number(cached.savedAt || 0) > CACHE_TTL) return null;
  return cached.payload || null;
}

function writeCache(url, payload) {
  secureLocalSet(cacheKey(url), { savedAt: Date.now(), payload });
}

async function fetchWithRetry(url) {
  const cached = readCache(url);
  if (!navigator.onLine && cached) return { payload: cached, stale: true };

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-cache",
      });
      window.clearTimeout(timer);
      if (!response.ok) throw new Error(`MP3Quran HTTP ${response.status}`);
      const payload = await response.json();
      writeCache(url, payload);
      return { payload, stale: false };
    } catch (error) {
      window.clearTimeout(timer);
      if (attempt === RETRIES) {
        if (cached) return { payload: cached, stale: true, warning: String(error?.message || error) };
        throw error;
      }
      await sleep(350 * (attempt + 1));
    }
  }
  throw new Error("MP3Quran request failed");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeMoshaf(item) {
  const surahList = String(item?.surah_list || "")
    .split(",")
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 114);

  return {
    id: Number(item?.id || 0),
    name: sanitizeText(item?.name || "", 160),
    server: sanitizeText(item?.server || "", 260),
    surahTotal: Number(item?.surah_total || surahList.length || 0),
    moshafType: Number(item?.moshaf_type || 0),
    riwayah: sanitizeText(item?.name || "", 160),
    surahList,
  };
}

function normalizeReciter(raw, language) {
  const id = Number(raw?.id || 0);
  if (!id) return null;
  const moshaf = asArray(raw?.moshaf).map(normalizeMoshaf).filter((m) => m.id && m.server);
  return {
    id,
    language,
    name: sanitizeText(raw?.name || "", 180),
    letter: sanitizeText(raw?.letter || "", 8),
    moshaf,
  };
}

function validateReciters(payload, language) {
  return asArray(payload?.reciters).map((item) => normalizeReciter(item, language)).filter(Boolean);
}

function validateLookup(payload, key) {
  return asArray(payload?.[key]).map((item) => ({ ...item })).filter((item) => item && Number(item.id || item.ID || 0) >= 0);
}

function padSurah(number) {
  return String(Number(number)).padStart(3, "0");
}

export function buildMp3QuranSurahUrl(moshaf, surahNumber) {
  if (!moshaf?.server) return "";
  const base = String(moshaf.server).replace(/\/+$/g, "");
  const n = Number(surahNumber);
  if (!Number.isInteger(n) || n < 1 || n > 114) return "";
  return `${base}/${padSurah(n)}.mp3`;
}

export async function loadMp3QuranData() {
  const results = await Promise.allSettled([
    fetchWithRetry(ENDPOINTS.recitersAr),
    fetchWithRetry(ENDPOINTS.recitersEn),
    fetchWithRetry(ENDPOINTS.riwayat),
    fetchWithRetry(ENDPOINTS.moshaf),
  ]);

  const [ar, en, riwayat, moshaf] = results.map((r) => (r.status === "fulfilled" ? r.value : { payload: null, error: String(r.reason) }));
  const arabic = validateReciters(ar.payload, "ar");
  const english = validateReciters(en.payload, "eng");
  const englishById = new Map(english.map((r) => [r.id, r]));

  const reciters = arabic.map((r) => ({
    ...r,
    englishName: englishById.get(r.id)?.name || r.name,
    arabicName: r.name,
  }));

  for (const extra of english) {
    if (!reciters.some((r) => r.id === extra.id)) {
      reciters.push({ ...extra, englishName: extra.name, arabicName: extra.name });
    }
  }

  return {
    reciters,
    riwayat: validateLookup(riwayat.payload, "riwayat"),
    moshaf: validateLookup(moshaf.payload, "moshaf"),
    status: {
      recitersAr: results[0].status,
      recitersEn: results[1].status,
      riwayat: results[2].status,
      moshaf: results[3].status,
      stale: Boolean(ar.stale || en.stale || riwayat.stale || moshaf.stale),
    },
  };
}

export function createReciterOptionHTML(reciter, selectedId) {
  const selected = Number(selectedId) === Number(reciter.id) ? " selected" : "";
  return `<option value="${reciter.id}"${selected}>${escapeOutput(reciter.arabicName)} — ${escapeOutput(reciter.englishName)}</option>`;
}

export function findPreferredMoshaf(reciter, preferredMoshafId) {
  if (!reciter?.moshaf?.length) return null;
  const exact = reciter.moshaf.find((m) => Number(m.id) === Number(preferredMoshafId));
  return exact || reciter.moshaf.find((m) => m.surahList.length >= 114) || reciter.moshaf[0];
}

export function filterReciters(reciters, { query = "", riwayah = "all", moshaf = "all" } = {}) {
  const q = sanitizeText(query, 80).toLowerCase();
  return reciters.filter((reciter) => {
    const haystack = `${reciter.arabicName} ${reciter.englishName}`.toLowerCase();
    const byName = !q || haystack.includes(q);
    const byRiwayah = riwayah === "all" || reciter.moshaf.some((m) => m.name.includes(riwayah));
    const byMoshaf = moshaf === "all" || reciter.moshaf.some((m) => String(m.id) === String(moshaf));
    return byName && byRiwayah && byMoshaf;
  });
}
