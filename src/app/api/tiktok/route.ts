import { NextRequest, NextResponse } from 'next/server';
import { isTikTokUrl, resolveTikTok, ResolveError, friendlyErrorMessage } from '@/lib/tiktok';
import { getBlockedList } from '@/lib/config';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Hobby functions cap at ~60s; resolvers are quick, 25s is plenty.
export const maxDuration = 25;

/**
 * GET /api/tiktok?url=<tiktok link>
 * Resolves a TikTok video or photo-slide post server-side and returns
 * normalised metadata + no-watermark media URLs.
 *
 * Success:  { ok: true, data: TikTokResult }
 * Failure:  { ok: false, error: string, code: string }  (400/404/502)
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')?.trim() ?? '';

  // 30 resolves per minute per IP — keeps the free function budget safe
  // from casual abuse without bothering normal users.
  const limit = checkRateLimit(`tiktok:${clientIp(req.headers)}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, code: 'RATE_LIMITED', error: 'Too many requests — please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  if (!url) {
    return NextResponse.json(
      { ok: false, code: 'NO_URL', error: 'Paste a TikTok link first.' },
      { status: 400 },
    );
  }
  if (url.length > 2048 || !isTikTokUrl(url)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'INVALID_URL',
        error: 'That does not look like a TikTok link. Copy the link from the TikTok app or website — it should start with tiktok.com or vt.tiktok.com.',
      },
      { status: 400 },
    );
  }

  try {
    // Owner blocklist from the Google Sheet ("Blocked" tab).
    const blocked = await getBlockedList();
    const hit = blocked.find((b) => url.toLowerCase().includes(b.pattern.toLowerCase()));
    if (hit) {
      return NextResponse.json(
        {
          ok: false,
          code: 'BLOCKED',
          error: `This link is blocked on this site${hit.reason ? `: ${hit.reason}` : '.'}`,
        },
        { status: 403 },
      );
    }

    const data = await resolveTikTok(url);
    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e) {
    const err = e instanceof ResolveError ? e : new ResolveError('UPSTREAM', String(e));
    const code = err.code === 'ALL_FAILED' ? 'UPSTREAM' : err.code;
    const status = code === 'NOT_FOUND' ? 404 : 502;
    return NextResponse.json(
      { ok: false, code, error: friendlyErrorMessage(code) },
      { status },
    );
  }
}
