import { getSiteConfig } from '@/lib/config';
import Downloader from '@/components/Downloader';
import AdSlot from '@/components/AdSlot';
import Faq from '@/components/Faq';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const config = await getSiteConfig();

  return (
    <>
      <section className="hero">
        <h1>
          Download TikTok videos <span>without watermark</span>
        </h1>
        <p>
          {config.tagline ||
            'Paste a link, get the HD video, the MP3 audio, or every photo from a slideshow — free, no account, no app to install.'}
        </p>
        <div className="hero-points">
          <span>✨ No watermark, HD</span>
          <span>🖼️ Slides as images / ZIP</span>
          <span>🎵 Audio as MP3</span>
          <span>🔒 No sign-up</span>
          <span>📱 Works on mobile</span>
        </div>
      </section>

      <AdSlot
        slot="top_banner"
        config={{
          adsEnabled: config.adsEnabled,
          slotEnabled: config.topBannerEnabled,
          adsenseClient: config.adsenseClient,
          slotId: config.adsenseSlotTop,
          html: config.adTopHtml,
        }}
      />

      <Downloader siteName={config.siteName} />

      <AdSlot
        slot="below_result"
        config={{
          adsEnabled: config.adsEnabled,
          slotEnabled: config.belowResultEnabled,
          adsenseClient: config.adsenseClient,
          slotId: config.adsenseSlotResult,
          html: config.adResultHtml,
        }}
      />

      <section className="how" id="how-it-works" aria-label="How it works">
        <h2>How it works</h2>
        <div className="how-grid">
          <div className="how-step">
            <span className="num">1</span>
            <h3>Copy the TikTok link</h3>
            <p>Open TikTok, tap Share → Copy link on any video or photo slideshow.</p>
          </div>
          <div className="how-step">
            <span className="num">2</span>
            <h3>Paste it here</h3>
            <p>Paste the link in the box above and press Download. We fetch the preview in seconds.</p>
          </div>
          <div className="how-step">
            <span className="num">3</span>
            <h3>Save what you want</h3>
            <p>Download the HD video without watermark, the MP3 audio, or all slide images — individually or as one ZIP.</p>
          </div>
        </div>
      </section>

      <Faq />
    </>
  );
}
