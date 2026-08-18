/**
 * Dhaka (GMT+6) Date Utilities
 * Consistent date handling across CEx Insights — same pattern as CQMS
 */

const DHAKA_OFFSET_MS = 6 * 3600000;

/** Get current time in Dhaka */
export const getDhakaNow = () => new Date(Date.now() + DHAKA_OFFSET_MS);

/** Start of day in Dhaka (00:00:00.000) */
export const getDhakaStartOfDay = (date) => {
  const d = date ? new Date(date) : getDhakaNow();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** End of day in Dhaka (23:59:59.999) */
export const getDhakaEndOfDay = (date) => {
  const d = date ? new Date(date) : getDhakaNow();
  d.setHours(23, 59, 59, 999);
  return d;
};

/** Convert Dhaka local Date to UTC ISO string (subtract 6 hours) */
export const dhakaDateToUTCISO = (date) => {
  const utcTime = date.getTime() - DHAKA_OFFSET_MS;
  return new Date(utcTime).toISOString();
};

/** Convert UTC string to Dhaka Date object (add 6 hours) */
export const toDhakaTime = (utcString) => {
  const utcDate = new Date(utcString);
  return new Date(utcDate.getTime() + DHAKA_OFFSET_MS);
};

/** Format Date to YYYY-MM-DD (for HTML inputs) */
export const formatDateForInput = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Parse YYYY-MM-DD string to Date */
export const parseDateInput = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Get first day of month in Dhaka */
export const getDhakaFirstDayOfMonth = (date) => {
  const d = date ? new Date(date) : getDhakaNow();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

/** Get last day of month in Dhaka */
export const getDhakaLastDayOfMonth = (date) => {
  const d = date ? new Date(date) : getDhakaNow();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
};

/** Get Sunday of the current week */
export const getDhakaStartOfWeek = (date) => {
  const d = date ? new Date(date) : getDhakaNow();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Preset date ranges (all in Dhaka timezone)
 * Returns { from: Date, to: Date, label: string }
 */
export const getPresetRange = (preset) => {
  const now = getDhakaNow();
  const today = getDhakaStartOfDay(now);

  switch (preset) {
    case 'today':
      return { from: getDhakaStartOfDay(today), to: getDhakaEndOfDay(today), label: 'Today' };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: getDhakaStartOfDay(y), to: getDhakaEndOfDay(y), label: 'Yesterday' };
    }
    case 'this_week':
      return { from: getDhakaStartOfWeek(today), to: getDhakaEndOfDay(today), label: 'This Week' };
    case 'last_7_days': {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      return { from: getDhakaStartOfDay(d), to: getDhakaEndOfDay(today), label: 'Last 7 Days' };
    }
    case 'this_month':
      return { from: getDhakaFirstDayOfMonth(today), to: getDhakaEndOfDay(today), label: 'This Month' };
    case 'last_month': {
      const first = getDhakaFirstDayOfMonth(today);
      first.setMonth(first.getMonth() - 1);
      return { from: first, to: getDhakaEndOfDay(getDhakaLastDayOfMonth(first)), label: 'Last Month' };
    }
    case 'last_30_days': {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return { from: getDhakaStartOfDay(d), to: getDhakaEndOfDay(today), label: 'Last 30 Days' };
    }
    case 'last_90_days': {
      const d = new Date(today);
      d.setDate(d.getDate() - 90);
      return { from: getDhakaStartOfDay(d), to: getDhakaEndOfDay(today), label: 'Last 90 Days' };
    }
    case 'last_3_months': {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      return { from: getDhakaStartOfDay(d), to: getDhakaEndOfDay(today), label: 'Last 3 Months' };
    }
    default:
      return { from: getDhakaStartOfDay(today), to: getDhakaEndOfDay(today), label: 'Today' };
  }
};

/**
 * Convert preset range to Supabase-compatible filter values
 * Returns { fromISO: string, toISO: string } in UTC
 */
export const getSupabaseDateRange = (preset) => {
  const { from, to } = getPresetRange(preset);
  return {
    fromISO: dhakaDateToUTCISO(from),
    toISO: dhakaDateToUTCISO(to),
  };
};

/**
 * Convert From/To date inputs (YYYY-MM-DD) to Supabase filter values
 * Interprets inputs as Dhaka dates
 */
export const dateInputsToSupabase = (fromStr, toStr) => {
  const from = getDhakaStartOfDay(parseDateInput(fromStr));
  const to = getDhakaEndOfDay(parseDateInput(toStr));
  return {
    fromISO: dhakaDateToUTCISO(from),
    toISO: dhakaDateToUTCISO(to),
  };
};

/** Format a UTC ISO timestamp to Dhaka display string */
export const formatDhakaDisplay = (isoStr) => {
  if (!isoStr) return '-';
  const d = toDhakaTime(isoStr);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'UTC' // already shifted
  });
};
