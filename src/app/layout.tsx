import type { Metadata } from 'next';
import { getSiteConfig } from '@/lib/config';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tiktok-downloader-hazel-eight.vercel.app';

const SEO_DESCRIPTION =
  'Download TikTok videos in HD without watermark, save audio as MP3, and download photo slideshows as images or a ZIP — free, fast, no account or app needed.';

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig();
  const title = `${config.siteName} — Download TikTok Videos & Slides Without Watermark`;
  const description = SEO_DESCRIPTION;
  const ogImage = `${SITE_URL}/og-image.png`;
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    keywords: ['tiktok downloader', 'download tiktok video', 'tiktok no watermark', 'tiktok mp3', 'tiktok slides download', 'tiktok photo downloader', 'save tiktok video', 'tiktok video downloader hd'],
    authors: [{ name: config.siteName }],
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      url: SITE_URL,
      title,
      description,
      siteName: config.siteName,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${config.siteName} — Download TikTok videos & slides without watermark, free` }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await getSiteConfig();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: config.siteName,
    url: SITE_URL,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any',
    description: SEO_DESCRIPTION,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      'Download TikTok videos without watermark',
      'Download TikTok audio as MP3',
      'Download TikTok photo slideshows as images or ZIP',
    ],
  };
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {config.adsEnabled && config.adsenseClient ? (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.adsenseClient)}`}
            crossOrigin="anonymous"
          />
        ) : null}
      </head>
      <body>
        <div className="page">
          {config.maintenanceMode && (
            <div className="announcement" role="status">
              ⚙️ Maintenance mode is on — downloads may be paused. Check back soon.
            </div>
          )}
          {config.announcement && !config.maintenanceMode && (
            <div className="announcement" role="status">{config.announcement}</div>
          )}
          <header className="header">
            <a className="logo" href="/">
              Tik<span>Save</span>
            </a>
            <nav className="nav" aria-label="Main">
              <a href="#how-it-works">How it works</a>
              <a href="#faq">FAQ</a>
            </nav>
          </header>
          <main className="main">{children}</main>
          <footer className="footer">
            <p>
              <strong>{config.siteName}</strong> — free TikTok video, audio &amp; slide downloader.
            </p>
            <p>
              Only download videos you own or have permission to save, for personal use.
              Not affiliated with TikTok or ByteDance. TikTok is a trademark of ByteDance Ltd.
            </p>
            <p>
              <a href="#how-it-works">How it works</a> · <a href="#faq">FAQ</a>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
