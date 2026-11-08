// Quran Glass Islamic reminder system
// Design note: companion module; keeps current app logic intact and stores only local non-sensitive preferences.

import { escapeOutput, sanitizeText, secureLocalGet, secureLocalSet } from "./security.js";

const SETTINGS_KEY = "qg_reminder_settings";
const HISTORY_KEY = "qg_reminder_history";
const LAST_FIRED_KEY = "qg_reminder_last_fired";

const HIJRI_MONTHS_EN = [
  "Muharram",
  "Safar",
  "Rabi Al-Awwal",
  "Rabi Al-Thani",
  "Jumada Al-Ula",
  "Jumada Al-Akhirah",
  "Rajab",
  "Sha'ban",
  "Ramadan",
  "Shawwal",
  "Dhul-Qa'dah",
  "Dhul-Hijjah",
];

const HIJRI_MONTHS_AR = ["المحرّم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوّال", "ذو القعدة", "ذو الحجة"];

const SACRED_MONTHS = new Set([1, 7, 11, 12]);
const SALAWAT = ["اللهم صل وسلم على نبينا محمد", "Have you sent blessings upon the Prophet ﷺ today?", "صلوا على النبي ﷺ", "اللهم صل على محمد وعلى آل محمد"];

const HADITH = Object.freeze({
  monday: {
    arabic: "عن أبي قتادة رضي الله عنه أن رسول الله صلى الله عليه وسلم سئل عن صوم يوم الاثنين فقال: ذلك يوم ولدت فيه، ويوم بعثت أو أنزل علي فيه.",
    english: "The Messenger of Allah ﷺ was asked about fasting on Mondays. He said: ‘That is the day on which I was born and the day on which I received Revelation.’",
    explanation: "Monday fasting is established by an authentic narration in Sahih Muslim. The reminder presents it as a Sunnah fast without making unsupported claims.",
    reference: "Sahih Muslim, reported in Riyad as-Salihin 1255",
    number: "Muslim; Riyad as-Salihin 1255",
  },
  monthly: {
    arabic: "ثلاث من كل شهر ورمضان إلى رمضان فهذا صيام الدهر كله.",
    english: "Fasting three days every month and Ramadan every year is perpetual fasting.",
    explanation: "The White Days fall on the 13th, 14th and 15th of each Hijri month. The authentic virtue is fasting three days monthly; the date selection follows the known Ayyam Al-Beed practice.",
    reference: "Sahih Muslim 1162a",
    number: "1162a",
  },
  ashura: {
    arabic: "فصامه رسول الله صلى الله عليه وسلم وأمر بصيامه.",
    english: "So Allah's Messenger ﷺ observed fast on the day of Ashura and gave orders that it should be observed.",
    explanation: "Ashura is the 10th of Muharram. Tasu'a is scheduled as a related Muharram reminder while keeping the displayed evidence to authentic Sahih material.",
    reference: "Sahih Muslim 1130c",
    number: "1130c",
  },
  sacred: {
    arabic: "السنة اثنا عشر شهرًا، منها أربعة حرم: ثلاثة متواليات ذو القعدة وذو الحجة والمحرم، ورجب مضر الذي بين جمادى وشعبان.",
    english: "The year is twelve months, out of which four are sacred: Dhul-Qa'dah, Dhul-Hijjah, Muharram, and Rajab of Mudar between Jumada and Sha'ban.",
    explanation: "This reminder marks the beginning of a Sacred Month based on Sahih al-Bukhari. It does not attach unsupported special worship claims.",
    reference: "Sahih al-Bukhari 3197",
    number: "3197",
  },
  rajab: {
    arabic: "السنة اثنا عشر شهرًا، منها أربعة حرم ... ورجب مضر الذي بين جمادى وشعبان.",
    english: "The year is twelve months, out of which four are sacred ... and Rajab of Mudar which comes between Jumada and Sha'ban.",
    explanation: "Rajab is one of the Sacred Months. No authentic Sahih al-Bukhari or Sahih Muslim hadith specifically establishes a unique general virtue for fasting Rajab; users may still schedule voluntary fasting reminders without claiming a special Rajab-specific reward.",
    reference: "Sahih al-Bukhari 3197; no specific Sahih Rajab-fasting virtue found",
    number: "3197",
  },
});

const DEFAULT_SETTINGS = Object.freeze({
  notifications: false,
  sound: true,
  reminderFrequency: 30,
  volume: 0.35,
  prayerReminder: true,
  fastingReminder: true,
  sacredMonths: true,
  salawatReminder: false,
  salawatMode: "both",
  salawatInterval: 30,
  language: "ar",
  theme: "system",
});

let salawatTimer = 0;
let reminderTimer = 0;
let appToast = null;

function getSettings() {
  const saved = secureLocalGet(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

function saveSettings(settings) {
  secureLocalSet(SETTINGS_KEY, { ...getSettings(), ...settings });
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getHijriParts(date) {
  const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const parts = formatter.formatToParts(date);
  const value = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { day: value("day"), month: value("month"), year: value("year") };
}

function reminderTitle(type, lang, details = {}) {
  if (lang === "en") {
    if (type === "monday") return "Tomorrow is Sunnah fasting (Monday).";
    if (type === "thursday") return "Tomorrow is Sunnah fasting (Thursday).";
    if (type === "white") return `Tomorrow is a White Day fast (${details.hijriDay} ${details.monthNameEn}).`;
    if (type === "ashura") return details.hijriDay === 9 ? "Tomorrow is Tasu'a (9 Muharram)." : "Tomorrow is Ashura (10 Muharram).";
    if (type === "rajab") return "Tomorrow is in Rajab: voluntary fasting reminder.";
    if (type === "sacred") return "Tomorrow begins one of the Sacred Months.";
  }
  if (type === "monday") return "غدًا صيام سُنّة يوم الاثنين.";
  if (type === "thursday") return "غدًا صيام سُنّة يوم الخميس.";
  if (type === "white") return `غدًا من الأيام البيض (${details.hijriDay} ${details.monthNameAr}).`;
  if (type === "ashura") return details.hijriDay === 9 ? "غدًا تاسوعاء (9 محرّم)." : "غدًا عاشوراء (10 محرّم).";
  if (type === "rajab") return "غدًا في رجب: تذكير بصيام تطوّع دون دعوى فضل خاص.";
  return "غدًا يبدأ شهر من الأشهر الحُرُم.";
}

function createReminder(type, date) {
  const settings = getSettings();
  const target = addDays(date, 1);
  const hijri = getHijriParts(target);
  const monthNameEn = HIJRI_MONTHS_EN[hijri.month - 1] || "Hijri month";
  const monthNameAr = HIJRI_MONTHS_AR[hijri.month - 1] || "شهر هجري";
  const hadith = type === "monday" || type === "thursday" ? HADITH.monday : type === "white" ? HADITH.monthly : type === "ashura" ? HADITH.ashura : type === "rajab" ? HADITH.rajab : HADITH.sacred;
  return {
    id: `${type}:${dayKey(target)}`,
    type,
    createdAt: new Date().toISOString(),
    targetDate: target.toISOString(),
    title: reminderTitle(type, settings.language, { hijriDay: hijri.day, monthNameEn, monthNameAr }),
    hijri,
    monthNameEn,
    monthNameAr,
    hadith,
  };
}

export function calculateUpcomingReminders(baseDate = new Date(), days = 45) {
  const out = [];
  for (let offset = 0; offset <= days; offset += 1) {
    const notifyDate = addDays(baseDate, offset);
    const target = addDays(notifyDate, 1);
    const dow = target.getDay();
    const hijri = getHijriParts(target);

    if (dow === 1) out.push(createReminder("monday", notifyDate));
    if (dow === 4) out.push(createReminder("thursday", notifyDate));
    if ([13, 14, 15].includes(hijri.day)) out.push(createReminder("white", notifyDate));
    if (hijri.month === 1 && [9, 10].includes(hijri.day)) out.push(createReminder("ashura", notifyDate));
    if (hijri.month === 7 && hijri.day >= 1 && hijri.day <= 29) out.push(createReminder("rajab", notifyDate));
    if (hijri.day === 1 && SACRED_MONTHS.has(hijri.month)) out.push(createReminder("sacred", notifyDate));
  }
  return Array.from(new Map(out.map((r) => [r.id, r])).values()).sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));
}

function addHistory(item) {
  const history = secureLocalGet(HISTORY_KEY, []);
  history.unshift({ ...item, firedAt: new Date().toISOString() });
  secureLocalSet(HISTORY_KEY, history.slice(0, 120));
}

export function getReminderHistory() {
  return secureLocalGet(HISTORY_KEY, []);
}

function playSoftTone(volume = 0.3) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 620;
  gain.gain.value = Math.max(0, Math.min(1, volume)) * 0.12;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
  oscillator.stop(ctx.currentTime + 0.95);
}

async function notify(item) {
  const settings = getSettings();
  if (settings.sound) {
    try { playSoftTone(settings.volume); } catch {}
  }
  appToast?.(item.title, "info");

  if (settings.notifications && "Notification" in window && Notification.permission === "granted") {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    const body = `${item.hadith.english}\n${item.hadith.reference}`;
    if (registration?.showNotification) {
      await registration.showNotification(item.title, { body, tag: item.id, renotify: false, icon: "logo.png.webp", badge: "logo.png.webp", data: item });
    } else {
      new Notification(item.title, { body, tag: item.id, data: item });
    }
  }
  addHistory(item);
}

function fireDueReminders() {
  const settings = getSettings();
  if (!settings.fastingReminder && !settings.sacredMonths) return;
  const today = dayKey(new Date());
  const last = secureLocalGet(LAST_FIRED_KEY, {});
  const due = calculateUpcomingReminders(new Date(), 0).filter((item) => {
    if (!settings.fastingReminder && ["monday", "thursday", "white", "ashura", "rajab"].includes(item.type)) return false;
    if (!settings.sacredMonths && item.type === "sacred") return false;
    return last[item.id] !== today;
  });
  for (const item of due) {
    last[item.id] = today;
    notify(item);
  }
  secureLocalSet(LAST_FIRED_KEY, last);
}

function salawatReminder() {
  const settings = getSettings();
  if (!settings.salawatReminder) return;
  const text = SALAWAT[Math.floor(Date.now() / 60_000) % SALAWAT.length];
  const mode = settings.salawatMode;
  if (["voice", "both"].includes(mode) && !settings.sound) return;
  if (["voice", "both"].includes(mode)) {
    try { playSoftTone(settings.volume); } catch {}
  }
  if (["notification", "both"].includes(mode)) {
    const item = { id: `salawat:${Date.now()}`, type: "salawat", title: text, hadith: { english: text, reference: "Qur'an 33:56" } };
    notify(item);
  } else {
    appToast?.(text, "info");
  }
}

export async function requestReminderPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "default") return Notification.requestPermission();
  return Notification.permission;
}

export async function registerReminderServiceWorker() {
  if (!("serviceWorker" in navigator)) return false;
  try {
    await navigator.serviceWorker.register("./qg-reminder-sw.js", { scope: "./" });
    return true;
  } catch {
    return false;
  }
}

export function initReminderSystem({ toast } = {}) {
  appToast = toast || null;
  registerReminderServiceWorker();
  window.clearInterval(reminderTimer);
  window.clearInterval(salawatTimer);
  fireDueReminders();
  reminderTimer = window.setInterval(fireDueReminders, 1000 * 60 * 20);
  const settings = getSettings();
  salawatTimer = window.setInterval(salawatReminder, Math.max(5, Number(settings.salawatInterval || 30)) * 60_000);
}

function hadithHTML(hadith) {
  return `<div class="hadithBox"><div class="hadithBox__ar" dir="rtl">${escapeOutput(hadith.arabic || "")}</div><div class="hadithBox__en" dir="ltr">${escapeOutput(hadith.english || "")}</div><div class="muted">${escapeOutput(hadith.explanation || "")}</div><div class="hadithBox__ref">${escapeOutput(hadith.reference || "")} ${hadith.number ? `• ${escapeOutput(hadith.number)}` : ""}</div></div>`;
}

const REMINDER_TYPE_LABELS_AR = {
  monday: "صيام الاثنين",
  thursday: "صيام الخميس",
  white: "الأيام البيض",
  ashura: "عاشوراء/تاسوعاء",
  rajab: "رجب",
  sacred: "الأشهر الحرم",
  salawat: "الصلاة على النبي ﷺ",
};
function reminderTypeLabelAr(type) {
  return REMINDER_TYPE_LABELS_AR[type] || type;
}

export function renderReminderDashboard(root) {
  if (!root) return;
  const settings = getSettings();
  const upcoming = calculateUpcomingReminders(new Date(), 45).slice(0, 12);
  const history = getReminderHistory().slice(0, 8);
  root.innerHTML = `
    <section class="glass panel reminderPanel">
      <h3 class="panel__title">نظام التذكيرات الإسلامية</h3>
      <p class="muted">يعتمد التقويم الهجري على Intl Islamic Umm al-Qura في المتصفح، مع إشعارات محلية وسجل محفوظ على جهازك.</p>
      <div class="reminderGrid">
        ${upcoming.map((item) => `<article class="reminderCard"><div class="reminderCard__date">${escapeOutput(new Date(item.targetDate).toLocaleDateString(settings.language === "ar" ? "ar-EG" : "en-US"))}</div><strong>${escapeOutput(item.title)}</strong>${hadithHTML(item.hadith)}</article>`).join("")}
      </div>
    </section>
    <section class="glass panel reminderPanel">
      <h3 class="panel__title">سجل الإشعارات</h3>
      <div class="settings">${history.length ? history.map((item) => `<div class="setRow"><div><div class="setRow__title">${escapeOutput(item.title)}</div><div class="muted">${escapeOutput(new Date(item.firedAt).toLocaleString())}</div></div><span class="chip">${escapeOutput(reminderTypeLabelAr(item.type))}</span></div>`).join("") : `<div class="empty"><div class="empty__title">لا يوجد سجل بعد</div><div class="empty__desc">ستظهر التذكيرات هنا بعد تشغيلها.</div></div>`}</div>
    </section>`;
}

export function bindReminderSettings() {
  const settings = getSettings();
  const pairs = {
    toggleNotifications: "notifications",
    toggleReminderSound: "sound",
    togglePrayerReminder: "prayerReminder",
    toggleFastingReminder: "fastingReminder",
    toggleSacredMonths: "sacredMonths",
    toggleSalawatReminder: "salawatReminder",
  };
  for (const [id, key] of Object.entries(pairs)) {
    const input = document.getElementById(id);
    if (!input) continue;
    input.checked = Boolean(settings[key]);
    input.addEventListener("change", () => {
      saveSettings({ [key]: input.checked });
      initReminderSystem({ toast: appToast });
    });
  }

  const controls = [
    ["reminderFrequency", "reminderFrequency", Number],
    ["reminderVolume", "volume", Number],
    ["salawatInterval", "salawatInterval", Number],
    ["salawatMode", "salawatMode", String],
    ["reminderLanguage", "language", String],
    ["reminderTheme", "theme", String],
  ];
  for (const [id, key, cast] of controls) {
    const input = document.getElementById(id);
    if (!input) continue;
    input.value = String(settings[key]);
    input.addEventListener("change", () => {
      saveSettings({ [key]: cast(sanitizeText(input.value, 40)) });
      initReminderSystem({ toast: appToast });
    });
  }

  document.getElementById("btnNotificationPermission")?.addEventListener("click", async () => {
    const result = await requestReminderPermission();
    const deniedLabel = result === "denied" ? "مرفوض" : "غير محدد";
    appToast?.(result === "granted" ? "تم تفعيل إذن الإشعارات" : `إذن الإشعارات: ${deniedLabel}`, result === "granted" ? "success" : "warn");
  });

  document.getElementById("btnResetReminderSettings")?.addEventListener("click", () => {
    secureLocalSet(SETTINGS_KEY, DEFAULT_SETTINGS);
    bindReminderSettings();
    initReminderSystem({ toast: appToast });
    appToast?.("تمت إعادة إعدادات التذكير", "success");
  });
}
