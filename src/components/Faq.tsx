const FAQS = [
  {
    q: 'Is this downloader really free?',
    a: 'Yes. Video, audio and slide downloads are free with no account and no daily limit set by us. The free third-party resolvers we use may rate-limit during very busy periods — if that happens, wait a minute and press Retry.',
  },
  {
    q: 'Are the videos really without a watermark?',
    a: 'Yes — for public videos, we fetch the no-watermark HD file. For photo-slide posts, the images never had a watermark in the first place. If a video only returns the watermarked version, we say so instead of pretending otherwise.',
  },
  {
    q: 'How do I download a TikTok photo slideshow?',
    a: 'Paste the link the same way. When the post is a slideshow, you will see every image in a grid. Download them one by one, or press "Download all as ZIP" to get them all in one file.',
  },
  {
    q: 'Can I download private or deleted videos?',
    a: 'No — and no downloader honestly can. Private, deleted, age-restricted and region-locked videos cannot be fetched. You will get a clear message explaining why, instead of a broken file.',
  },
  {
    q: 'Is it legal to download TikTok videos?',
    a: 'Download only videos you own, or that you have permission to save, and only for personal use. Do not re-upload someone else’s work as your own — that is their copyright, and reposting it can get your account removed.',
  },
  {
    q: 'Do you store my links or videos?',
    a: 'No. Links are resolved on the server and never saved. Your recent downloads list lives only in your own browser (localStorage) and can be cleared at any time.',
  },
  {
    q: 'Why did my download fail?',
    a: 'The most common reasons are: the link was copied wrong, the video is private or deleted, or TikTok is temporarily blocking the resolver. Check the link, try again, and if it still fails, try again in a few minutes — TikTok-side blocks usually clear on their own.',
  },
];

export default function Faq() {
  return (
    <section className="faq" id="faq" aria-label="Frequently asked questions">
      <h2>Frequently asked questions</h2>
      <div className="faq-list">
        {FAQS.map((f) => (
          <details key={f.q} className="faq-item">
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
