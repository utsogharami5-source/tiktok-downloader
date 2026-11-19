import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/proxy?url=<remote media url>&filename=<name>
 * Streams a remote file (video / audio / image) to the browser as a
 * download. This avoids CORS and hotlink blocks in the browser, and
 * lets us force a friendly filename.
 *
 * Only hosts we expect TikTok media to come from are allowed — this is
 * an open-proxy guard so the endpoint can't be abused to fetch arbitrary
 * internal/private URLs.
 */
const ALLOWED_HOSTS = [
  /(^|\.)tiktokcdn(-[a-z]+)?\.com$/, // tiktokcdn.com, tiktokcdn-us.com, tiktokcdn-eu.com, …
  /(^|\.)tiktok\.com$/,
  /(^|\.)tikwm\.com$/,
  /(^|\.)akamaized\.net$/,
  /(^|\.)ibytedtos\.com$/,
  /(^|\.)muscdn\.com$/,
  /(^|\.)musical\.ly$/,
];

function safeFilename(raw: string | null, fallback: string): string {
  const cleaned = (raw ?? '').replace(/[^\w.\-() ]+/g, '').trim().slice(0, 120);
  return cleaned || fallback;
}

export async function GET(req: NextRequest) {
  const remote = req.nextUrl.searchParams.get('url') ?? '';
  const filename = safeFilename(req.nextUrl.searchParams.get('filename'), 'tiktok-download');

  // 60 downloads per minute per IP.
  const limit = checkRateLimit(`proxy:${clientIp(req.headers)}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests — please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(remote);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid file URL.' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return NextResponse.json({ ok: false, error: 'Invalid file URL.' }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.some((re) => re.test(parsed.hostname))) {
    return NextResponse.json(
      { ok: false, error: 'That file host is not allowed.' },
      { status: 403 },
    );
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Referer: 'https://www.tiktok.com/',
      },
      signal: AbortSignal.timeout(55000),
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { ok: false, error: `Could not fetch the file (HTTP ${upstream.status}). The media link may have expired — try fetching the TikTok link again.` },
        { status: 502 },
      );
    }
    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'The file could not be downloaded. The media link may have expired — try fetching the TikTok link again.' },
      { status: 502 },
    );
  }
}
