import { NextResponse } from 'next/server';
import { getSiteConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/config — returns the live site config (Sheet or defaults). */
export async function GET() {
  const config = await getSiteConfig();
  return NextResponse.json({ ok: true, config });
}
