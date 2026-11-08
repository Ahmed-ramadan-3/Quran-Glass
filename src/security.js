// Quran Glass security hardening module
// Design note: preserve existing emerald/gold glass app; security behavior is production-only and non-invasive.
//
// NOTE: earlier versions of this module also blocked right-click, blocked F12/Ctrl+Shift+I/Ctrl+U,
// and tried to "detect" devtools from window size. Those were removed: they are exactly the kind of
// client-side trick the project's own security requirements call out as not real security (a browser
// user fully controls their local client), they produced false positives for legitimate users
// (docked sidebars, zoomed windows), and they got in the way of accessibility tools and QA testing.
// Real protection here is server/edge-side: the CSP and security headers in index.html / public/_headers,
// plus the input sanitization and safe local-storage helpers below, which every other module uses.

export function sanitizeText(input, maxLength = 800) {
  return String(input ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>`]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function escapeOutput(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function secureJSONParse(value, fallback) {
  try {
    if (!value || value.length > 200_000) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function secureLocalSet(key, value) {
  const safeKey = sanitizeText(key, 80).replace(/[^a-zA-Z0-9:_-]/g, "");
  if (!safeKey) return;
  localStorage.setItem(safeKey, JSON.stringify(value));
}

export function secureLocalGet(key, fallback) {
  const safeKey = sanitizeText(key, 80).replace(/[^a-zA-Z0-9:_-]/g, "");
  return secureJSONParse(localStorage.getItem(safeKey), fallback);
}

export function initSecurityHardening() {
  // Intentionally a no-op beyond the exported helpers above (sanitizeText, escapeOutput,
  // secureLocalGet/secureLocalSet). Kept exported/callable so existing call sites and the
  // module's public API don't change. Real security lives in the CSP/security headers and
  // in consistently using the sanitize/escape helpers wherever user or API data is rendered
  // or stored — not in trying to block a user's own browser controls.
}
