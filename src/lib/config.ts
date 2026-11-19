/**
 * Site config from Google Sheets (read-only, no auth in v1).
 *
 * The site reads a PUBLISHED / "anyone with the link can view" Google
 * Sheet as CSV via Google's gviz endpoint — no API key, no OAuth, no
 * service account needed. If SHEET_ID is not set (or the Sheet cannot
 * be read), sensible defaults are used and no ads are shown.
 *
 * Real sheet (already created 2026-11-19, "TikTok Downloader — Control
 * Panel", ID 1qcw-fQwclMqSjhFp2QFH6s9k39C-WqMMk971JPrVtN8):
 *
 *   Tab "Settings" — two columns, header row "Setting | Value":
 *     site_name          | TikTok Downloader
 *     tagline            | Download TikTok videos & slides — no watermark, free
 *     ads_enabled        | FALSE
 *     adsense_client     | ca-pub-1234567890123456
 *     adsense_slot_top   | 1234567890
 *     adsense_slot_result| 0987654321
 *     announcement       | (banner text, empty = no banner)
 *     maintenance_mode   | FALSE
 *
 *   Tab "Ads" — header "Slot | Enabled | AdSense Slot / Code | Notes":
 *     top_banner   | FALSE | (slot id or raw ad HTML) | 728x90 — under header
 *     below_result | FALSE | (slot id or raw ad HTML) | under download results
 *     in_feed      | FALSE | (slot id or raw ad HTML) | between FAQ items
 *
 * A legacy tab named "Config" with the same key/value layout is also
 * accepted (Settings wins if both exist). Ad keys in Settings are the
 * fallback when the Ads tab has no value for that slot.
 *
 * NOTE: because the Sheet is public-readable, never put secrets in it.
 * Ad code and display settings are fine — passwords and API keys are not.
 */

export interface SiteConfig {
  siteName: string;
  tagline: string;
  announcement: string;
  maintenanceMode: boolean;
  adsEnabled: boolean;
  adsenseClient: string;
  adsenseSlotTop: string;
  adsenseSlotResult: string;
  adTopHtml: string;
  adResultHtml: string;
  topBannerEnabled: boolean;
  belowResultEnabled: boolean;
  inFeedEnabled: boolean;
  /** True when any config actually came from a Sheet (vs. defaults). */
  fromSheet: boolean;
}

export const DEFAULT_CONFIG: SiteConfig = {
  siteName: 'TikTok Downloader',
  tagline: 'Download TikTok videos & slides — no watermark, free',
  announcement: '',
  maintenanceMode: false,
  adsEnabled: false,
  adsenseClient: process.env.ADSENSE_CLIENT ?? '',
  adsenseSlotTop: process.env.ADSENSE_SLOT_TOP ?? '',
  adsenseSlotResult: process.env.ADSENSE_SLOT_RESULT ?? '',
  adTopHtml: '',
  adResultHtml: '',
  topBannerEnabled: false,
  belowResultEnabled: false,
  inFeedEnabled: false,
  fromSheet: false,
};

/** Minimal CSV parser that honours quoted fields ("a, b" and "" escapes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

async function fetchSheetTab(sheetId: string, tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}&headers=0`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
    // Cache for 5 minutes so every visitor doesn't hammer the Sheet.
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Sheet ${tab} HTTP ${res.status}`);
  return parseCsv(await res.text());
}

function toBool(v: string | undefined): boolean {
  return ['true', 'yes', '1', 'on'].includes((v ?? '').trim().toLowerCase());
}

export interface BlockedEntry {
  pattern: string;
  reason: string;
}

/**
 * Reads the "Blocked" tab (header: URL or username | Reason | Added on).
 * A pasted link matching a pattern (substring, case-insensitive) is
 * refused by /api/tiktok. Cached 5 minutes like the rest of config.
 */
export async function getBlockedList(): Promise<BlockedEntry[]> {
  const sheetId = process.env.SHEET_ID?.trim();
  if (!sheetId) return [];
  try {
    const rows = await fetchSheetTab(sheetId, 'Blocked');
    const out: BlockedEntry[] = [];
    for (const row of rows) {
      const pattern = (row[0] ?? '').trim();
      if (!pattern || pattern.toLowerCase().startsWith('url or username')) continue;
      out.push({ pattern, reason: (row[1] ?? '').trim() });
    }
    return out;
  } catch {
    return [];
  }
}

function isHtml(v: string): boolean {
  return v.includes('<') && v.includes('>');
}

/** Server-side only — reads env vars, so never import this in a client component. */
export async function getSiteConfig(): Promise<SiteConfig> {
  const config: SiteConfig = { ...DEFAULT_CONFIG };
  const sheetId = process.env.SHEET_ID?.trim();
  const adsSheetId = process.env.SHEET_ADS_ID?.trim();
  if (!sheetId && !adsSheetId) return config;

  try {
    const kv: Record<string, string> = {};
    // Settings tab is the real layout; Config is the legacy fallback.
    if (sheetId) {
      for (const tab of ['Settings', 'Config']) {
        try {
          for (const [key, value] of await fetchSheetTab(sheetId, tab)) {
            const k = (key ?? '').trim().toLowerCase();
            if (!k || k === 'setting' || k === 'key') continue;
            if (kv[k] === undefined) kv[k] = (value ?? '').trim();
          }
          if (Object.keys(kv).length > 0) break;
        } catch {
          // Tab missing — try the next name.
        }
      }
    }

    // Ads tab: per-slot enabled + slot id or raw HTML.
    const adsRows: string[][] = [];
    const adsSource = adsSheetId || sheetId;
    if (adsSource) {
      try {
        adsRows.push(...(await fetchSheetTab(adsSource, 'Ads')));
      } catch {
        // No Ads tab — per-slot settings stay off.
      }
    }
    const adsBySlot: Record<string, { enabled: boolean; code: string }> = {};
    for (const row of adsRows) {
      const slot = (row[0] ?? '').trim().toLowerCase();
      if (!slot || slot === 'slot') continue;
      adsBySlot[slot] = { enabled: toBool(row[1]), code: (row[2] ?? '').trim() };
    }

    if (Object.keys(kv).length === 0 && Object.keys(adsBySlot).length === 0) return config;
    config.fromSheet = true;

    if (kv.site_name) config.siteName = kv.site_name;
    if (kv.tagline) config.tagline = kv.tagline;
    if (kv.announcement !== undefined) config.announcement = kv.announcement;
    if (kv.maintenance_mode !== undefined) config.maintenanceMode = toBool(kv.maintenance_mode);
    if (kv.ads_enabled !== undefined) config.adsEnabled = toBool(kv.ads_enabled);
    if (kv.adsense_client) config.adsenseClient = kv.adsense_client;
    if (kv.adsense_slot_top) config.adsenseSlotTop = kv.adsense_slot_top;
    if (kv.adsense_slot_result) config.adsenseSlotResult = kv.adsense_slot_result;
    if (kv.ad_top_html) config.adTopHtml = kv.ad_top_html;
    if (kv.ad_result_html) config.adResultHtml = kv.ad_result_html;

    const top = adsBySlot['top_banner'];
    if (top) {
      config.topBannerEnabled = top.enabled;
      if (top.code) {
        if (isHtml(top.code)) config.adTopHtml = top.code;
        else if (!config.adsenseSlotTop) config.adsenseSlotTop = top.code;
      }
    }
    const below = adsBySlot['below_result'];
    if (below) {
      config.belowResultEnabled = below.enabled;
      if (below.code) {
        if (isHtml(below.code)) config.adResultHtml = below.code;
        else if (!config.adsenseSlotResult) config.adsenseSlotResult = below.code;
      }
    }
    const inFeed = adsBySlot['in_feed'];
    if (inFeed) config.inFeedEnabled = inFeed.enabled;
  } catch {
    // Sheet unreadable (not shared publicly, wrong ID, Google down):
    // fail soft — the site still works with defaults and no ads.
    return config;
  }
  return config;
}
