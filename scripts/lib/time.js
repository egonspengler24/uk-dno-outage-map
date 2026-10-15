// Timestamp parsing. DNO feeds mix UTC-with-offset, naive UK local time and
// placeholder dates such as 0001-01-01, so everything goes through here and
// comes out as an ISO 8601 UTC string (or null).

const TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

const londonParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// Offset of Europe/London from UTC (in ms) at the given instant.
function londonOffsetMs(utcMs) {
  const seconds = Math.floor(utcMs / 1000) * 1000;
  const p = Object.fromEntries(
    londonParts.formatToParts(new Date(seconds)).map(({ type, value }) => [type, value])
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - seconds;
}

// Converts a UK wall-clock time to a UTC epoch (ms).
export function londonWallTimeToUtc(year, month, day, hour = 0, minute = 0, second = 0) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = wall - londonOffsetMs(wall);
  utc = wall - londonOffsetMs(utc);
  return utc;
}

/**
 * @param {unknown} value raw timestamp from a feed
 * @param {{ignoreOffset?: boolean}} [opts] ignoreOffset: treat the wall-clock
 *   part as UK local time even if the value carries a UTC offset (for feeds
 *   that mislabel local time as +00:00).
 * @returns {string|null} ISO 8601 UTC string
 */
export function parseTimestamp(value, { ignoreOffset = false } = {}) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;

  const m = TIMESTAMP_RE.exec(text);
  if (!m) {
    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
  }

  const [, y, mo, d, h = "0", mi = "0", s = "0", offset] = m;
  // Placeholder dates like 0001-01-01 mean "not set".
  if (+y < 1900) return null;

  if (offset && !ignoreOffset) {
    const parsed = new Date(text.replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return new Date(londonWallTimeToUtc(+y, +mo, +d, +h, +mi, +s)).toISOString();
}
