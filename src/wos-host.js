const OFFICIAL_WOS_HOST_PATTERN = /(^|\.)(webofscience\.com|webofknowledge\.com|isiknowledge\.com)$/i;
const PROXIED_WOS_HOST_PATTERN = /(^|[.-])(webofscience|webofknowledge|isiknowledge)(?=[.-]|$)/i;
const WOS_URL_TOKEN_PATTERN = /(webofscience|webofknowledge|isiknowledge)/i;

const normalizeHostname = (hostname) => String(hostname || "")
  .trim()
  .toLowerCase()
  .replace(/^\.+|\.+$/g, "");

const classifyWosHost = (hostname, href = "") => {
  const normalized = normalizeHostname(hostname);
  if (OFFICIAL_WOS_HOST_PATTERN.test(normalized)) return "official";
  if (PROXIED_WOS_HOST_PATTERN.test(normalized)) return "proxy";

  try {
    const decodedUrl = decodeURIComponent(String(href || ""));
    if (WOS_URL_TOKEN_PATTERN.test(decodedUrl)) return "proxy";
  } catch (_error) {
    if (WOS_URL_TOKEN_PATTERN.test(String(href || ""))) return "proxy";
  }
  return "unsupported";
};

const isWosLocation = (hostname, href = "") =>
  classifyWosHost(hostname, href) !== "unsupported";

module.exports = {
  classifyWosHost,
  isWosLocation,
  normalizeHostname
};
