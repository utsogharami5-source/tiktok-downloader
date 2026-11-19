/**
 * TikTok resolver — server-side only.
 *
 * TikTok has NO official download API, so this uses free, key-free,
 * third-party resolvers. They are unofficial and can break or rate-limit
 * when TikTok changes something — that is an honest, known limitation,
 * not a bug in this app. We try resolvers in order and surface a clear
 * error when all of them fail.
 *
 * Primary: TikWM  (POST https://www.tikwm.com/api/ , hd=1)
 *   Response: { code: 0, data: { play, wmplay, hdplay, cover, title,
 *   duration, music, images[], author{unique_id,nickname,avatar},
 *   digg_count, comment_count, share_count, play_count } }
 * Fallback 1: TikWM GET (same endpoint, ?url=) — sometimes works when
 *   the POST form is rate-limited.
 * Fallback 2: Cobalt (POST https://api.cobalt.tools/ {url}) — open
 *   source downloader; returns { status: "redirect"|"picker"|"stream",
 *   url, picker?: [{url, type}] }. NOTE (verified 2026-11-19): the public
 *   Cobalt instance now requires an API key (error.api.auth.jwt.missing
 *   without one), so this fallback only runs when COBALT_API_KEY is set.
 *   Without it, the chain is TikWM POST → TikWM GET → clear error.
 */

export type TikTokResultType = 'video' | 'slides';

export interface TikTokResult {
  type: TikTokResultType;
  /** Canonical TikTok URL the user pasted (after short-link resolution). */
  url: string;
  author: string;
  authorNickname: string;
  authorAvatar: string;
  title: string;
  cover: string;
  /** No-watermark HD video URL (video only). */
  videoUrl: string | null;
  /** Watermarked video URL, kept as a last-resort link. */
  watermarkedUrl: string | null;
  /** Audio track URL (usually MP3). */
  musicUrl: string | null;
  musicTitle: string;
  /** Photo-slide images (slides only). */
  images: string[];
  duration: number;
  stats: { likes: number; comments: number; shares: number; plays: number };
  /** Which resolver succeeded — shown in the UI so failures are diagnosable. */
  source: string;
}

export class ResolveError extends Error {
  public code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const TIKTOK_URL_RE =
  /^(https?:\/\/)?(www\.|m\.|vm\.|vt\.)?(tiktok\.com|tiktokv\.com)\/.+/i;

export function isTikTokUrl(raw: string): boolean {
  return TIKTOK_URL_RE.test(raw.trim());
}

/** Follow short links (vt.tiktok.com / vm.tiktok.com) to the canonical URL. */
async function expandUrl(raw: string): Promise<string> {
  const url = raw.trim();
  if (!/^(https?:\/\/)?(vm\.|vt\.)tiktok\.com/i.test(url)) return url;
  try {
    const res = await fetch(url.startsWith('http') ? url : `https://${url}`, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

function fetchWithTimeout(url: string, init: RequestInit, ms = 15000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function pickString(...vals: unknown[]): string {
  for (const v of vals) if (typeof v === 'string' && v) return v;
  return '';
}

/**
 * TikWM often returns RELATIVE media paths (e.g. "/video/media/play/….mp4"
 * or "/video/cover/….webp") — those live on tikwm.com, so resolve them.
 * Absolute URLs pass through unchanged.
 */
function absUrl(v: string): string {
  if (!v) return '';
  if (v.startsWith('/')) return `https://www.tikwm.com${v}`;
  return v;
}

/**
 * Prefer a direct CDN URL over a tikwm.com relay path: TikWM's own
 * /video/music/… relay 403s from servers, while the tiktokcdn audio URL
 * in music_info.play streams fine. Falls back to the first value,
 * resolved against tikwm.com, when nothing absolute is available.
 */
function pickMediaUrl(...vals: unknown[]): string {
  const strs = vals.filter((v): v is string => typeof v === 'string' && !!v);
  const absolute = strs.find((s) => s.startsWith('http'));
  if (absolute) return absolute;
  return absUrl(strs[0] ?? '');
}

/** Normalise a TikWM `data` object into our shape. Throws on bad data. */
function fromTikWm(data: Record<string, unknown>, originalUrl: string, source: string): TikTokResult {
  const author = (data.author ?? {}) as Record<string, unknown>;
  const musicInfo = (data.music_info ?? {}) as Record<string, unknown>;
  const images = Array.isArray(data.images)
    ? (data.images as unknown[])
        .filter((x): x is string => typeof x === 'string' && !!x)
        .map(absUrl)
    : [];
  const play = pickMediaUrl(data.hdplay, data.play);
  // Photo posts usually carry an images[] array AND an auto-generated
  // slideshow video. A /photo/ URL is always a slideshow; otherwise a
  // post is slides only when it has images but no video.
  const isSlides = images.length > 0 && (!play || originalUrl.includes('/photo/'));
  if (!play && images.length === 0) {
    throw new ResolveError('EMPTY', 'TikWM returned no video or images for this link.');
  }
  return {
    type: isSlides ? 'slides' : 'video',
    url: originalUrl,
    author: pickString(author.unique_id, author.nickname),
    authorNickname: pickString(author.nickname, author.unique_id),
    authorAvatar: absUrl(pickString(author.avatar)),
    title: pickString(data.title, musicInfo.title),
    cover: pickMediaUrl(data.cover, data.origin_cover),
    videoUrl: play || null,
    watermarkedUrl: pickMediaUrl(data.wmplay) || null,
    musicUrl: pickMediaUrl(musicInfo.play, data.music) || null,
    musicTitle: pickString(musicInfo.title, musicInfo.author),
    images,
    duration: num(data.duration),
    stats: {
      likes: num(data.digg_count),
      comments: num(data.comment_count),
      shares: num(data.share_count),
      plays: num(data.play_count),
    },
    source,
  };
}

async function tryTikWmPost(url: string): Promise<TikTokResult> {
  const body = new URLSearchParams({ url, hd: '1', count: '12', cursor: '0', web: '1' });
  const res = await fetchWithTimeout('https://www.tikwm.com/api/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body,
  });
  if (!res.ok) throw new ResolveError('UPSTREAM', `TikWM replied HTTP ${res.status}.`);
  const json = (await res.json()) as Record<string, unknown>;
  if (json.code !== 0 || !json.data || typeof json.data !== 'object') {
    const msg = typeof json.msg === 'string' ? json.msg : 'TikWM could not resolve this link.';
    throw new ResolveError('NOT_FOUND', msg);
  }
  return fromTikWm(json.data as Record<string, unknown>, url, 'tikwm');
}

async function tryTikWmGet(url: string): Promise<TikTokResult> {
  const res = await fetchWithTimeout(
    `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
    { headers: { 'User-Agent': UA } },
  );
  if (!res.ok) throw new ResolveError('UPSTREAM', `TikWM replied HTTP ${res.status}.`);
  const json = (await res.json()) as Record<string, unknown>;
  if (json.code !== 0 || !json.data || typeof json.data !== 'object') {
    throw new ResolveError('NOT_FOUND', 'TikWM could not resolve this link.');
  }
  return fromTikWm(json.data as Record<string, unknown>, url, 'tikwm-get');
}

async function tryCobalt(url: string): Promise<TikTokResult> {
  const apiKey = process.env.COBALT_API_KEY?.trim();
  if (!apiKey) throw new ResolveError('SKIPPED', 'Cobalt fallback is off (no COBALT_API_KEY set).');
  const res = await fetchWithTimeout('https://api.cobalt.tools/', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Authorization: `Api-Key ${apiKey}`,
    },
    body: JSON.stringify({ url }),
  }, 20000);
  if (!res.ok) throw new ResolveError('UPSTREAM', `Cobalt replied HTTP ${res.status}.`);
  const json = (await res.json()) as Record<string, unknown>;
  const status = json.status as string | undefined;
  if (status === 'error') {
    const errObj = (json.error ?? {}) as Record<string, unknown>;
    throw new ResolveError('NOT_FOUND', `Cobalt: ${String(errObj.code ?? json.text ?? 'could not resolve this link')}.`);
  }
  const picker = Array.isArray(json.picker) ? (json.picker as Record<string, unknown>[]) : [];
  const imageItems = picker.filter((p) => String(p.type ?? '').startsWith('image'));
  const videoItems = picker.filter((p) => String(p.type ?? '').startsWith('video'));
  const videoUrl =
    status === 'redirect' || status === 'stream'
      ? pickString(json.url)
      : pickString(videoItems[0]?.url);
  const images = imageItems.map((p) => String(p.url)).filter(Boolean);
  if (!videoUrl && images.length === 0) {
    throw new ResolveError('EMPTY', 'Cobalt returned no media for this link.');
  }
  return {
    type: images.length > 0 && !videoUrl ? 'slides' : 'video',
    url,
    author: '',
    authorNickname: '',
    authorAvatar: '',
    title: '',
    cover: images[0] ?? '',
    videoUrl: videoUrl || null,
    watermarkedUrl: null,
    musicUrl: pickString(json.audio) || null,
    musicTitle: '',
    images,
    duration: 0,
    stats: { likes: 0, comments: 0, shares: 0, plays: 0 },
    source: 'cobalt',
  };
}

const FRIENDLY: Record<string, string> = {
  EMPTY: 'The video was found, but no downloadable media came back. It may be private, deleted, or region-locked.',
  NOT_FOUND:
    'We could not fetch this TikTok. It may be private, deleted, age-restricted, or region-locked — or TikTok is blocking the resolver right now. Please double-check the link and try again.',
  UPSTREAM:
    'The download service is temporarily down or rate-limited. Please wait a minute and press Retry.',
};

/** Resolve a TikTok URL, trying each resolver in order. */
export async function resolveTikTok(rawUrl: string): Promise<TikTokResult> {
  const url = await expandUrl(rawUrl);
  const attempts: Array<() => Promise<TikTokResult>> = [
    () => tryTikWmPost(url),
    () => tryTikWmGet(url),
  ];
  // Cobalt only if an API key is configured (public instance requires auth).
  if (process.env.COBALT_API_KEY?.trim()) attempts.push(() => tryCobalt(url));
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      const err = e instanceof ResolveError ? e : new ResolveError('UPSTREAM', String(e));
      if (err.code === 'SKIPPED') continue;
      errors.push(err.message);
      // A "not found" from TikWM can still be worth retrying via Cobalt,
      // so keep going through every resolver before giving up.
    }
  }
  const detail = errors.filter(Boolean).join(' ');
  throw new ResolveError(
    'ALL_FAILED',
    `${FRIENDLY.UPSTREAM} (Tried TikWM — ${detail})`,
  );
}

export function friendlyErrorMessage(code: string): string {
  return FRIENDLY[code] ?? FRIENDLY.UPSTREAM;
}
