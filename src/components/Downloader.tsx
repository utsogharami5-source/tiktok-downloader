'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TikTokResult } from '@/lib/tiktok';

type Status = 'idle' | 'loading' | 'success' | 'error';

interface RecentItem {
  url: string;
  title: string;
  author: string;
  cover: string;
  type: 'video' | 'slides';
  date: string;
}

const RECENT_KEY = 'ttdl_recent_v1';
const MAX_RECENT = 8;

function formatCount(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(sec: number): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function proxyUrl(mediaUrl: string, filename: string): string {
  return `/api/proxy?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(filename)}`;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'tiktok'
  );
}

export default function Downloader({ siteName }: { siteName: string }) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<TikTokResult | null>(null);
  const [notice, setNotice] = useState('');
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState('');
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [pasteSupported, setPasteSupported] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPasteSupported(
      typeof navigator !== 'undefined' &&
        !!navigator.clipboard &&
        typeof navigator.clipboard.readText === 'function',
    );
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw) as RecentItem[]);
    } catch {
      // Corrupt local history — ignore it.
    }
  }, []);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2600);
  }, []);

  const saveRecent = useCallback((r: TikTokResult, url: string) => {
    setRecent((prev) => {
      const item: RecentItem = {
        url,
        title: r.title || (r.type === 'slides' ? 'Photo slideshow' : 'TikTok video'),
        author: r.authorNickname || r.author || 'TikTok',
        cover: r.cover,
        type: r.type,
        date: new Date().toISOString(),
      };
      const next = [item, ...prev.filter((p) => p.url !== url)].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Storage full/blocked — recent list is a nicety, not core.
      }
      return next;
    });
  }, []);

  const fetchVideo = useCallback(
    async (rawUrl: string) => {
      const url = rawUrl.trim();
      if (!url) {
        setError('Paste a TikTok link first.');
        setStatus('error');
        inputRef.current?.focus();
        return;
      }
      setStatus('loading');
      setError('');
      setResult(null);
      try {
        const res = await fetch(`/api/tiktok?url=${encodeURIComponent(url)}`);
        const json = (await res.json()) as { ok: boolean; data?: TikTokResult; error?: string };
        if (!res.ok || !json.ok || !json.data) {
          throw new Error(json.error || 'Something went wrong. Please try again.');
        }
        setResult(json.data);
        setStatus('success');
        saveRecent(json.data, url);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
        setStatus('error');
      }
    },
    [saveRecent],
  );

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(text.trim());
        flash('Link pasted');
        inputRef.current?.focus();
      } else {
        flash('Clipboard is empty');
      }
    } catch {
      flash('Clipboard access blocked — paste with Ctrl+V');
      inputRef.current?.focus();
    }
  }, [flash]);

  const handleCopyLink = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      flash('Link copied');
    } catch {
      flash('Could not copy — copy it from the address bar');
    }
  }, [result, flash]);

  const handleShare = useCallback(async () => {
    if (!result) return;
    const shareData = { title: result.title || siteName, text: result.title || '', url: result.url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(result.url);
        flash('Link copied — share it anywhere');
      }
    } catch {
      // User cancelled the share sheet — not an error.
    }
  }, [result, siteName, flash]);

  const downloadAllSlides = useCallback(async () => {
    if (!result || result.images.length === 0) return;
    setZipping(true);
    setZipProgress(`Preparing 0/${result.images.length}…`);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (let i = 0; i < result.images.length; i++) {
        setZipProgress(`Downloading ${i + 1}/${result.images.length}…`);
        const res = await fetch(proxyUrl(result.images[i], `slide-${i + 1}.jpg`));
        if (!res.ok) throw new Error(`Could not fetch slide ${i + 1}.`);
        zip.file(`slide-${String(i + 1).padStart(2, '0')}.jpg`, await res.blob());
      }
      setZipProgress('Zipping…');
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tiktok-slides-${slugify(result.author || 'tiktok')}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      flash('ZIP downloaded');
    } catch {
      setError('The ZIP download failed part-way. Try downloading the images one by one below.');
      setStatus('error');
    } finally {
      setZipping(false);
      setZipProgress('');
    }
  }, [result, flash]);

  const baseName = result ? slugify(result.author || 'tiktok') : 'tiktok';
  const videoFile = result?.videoUrl ? proxyUrl(result.videoUrl, `${siteName.toLowerCase()}-${baseName}-no-watermark.mp4`) : '';
  const audioFile = result?.musicUrl ? proxyUrl(result.musicUrl, `${siteName.toLowerCase()}-${baseName}-audio.mp3`) : '';

  return (
    <div className="downloader">
      <form
        className="paste-card"
        onSubmit={(e) => {
          e.preventDefault();
          void fetchVideo(input);
        }}
      >
        <label htmlFor="tiktok-url" className="paste-label">
          Paste a TikTok link
        </label>
        <div className="paste-row">
          <input
            ref={inputRef}
            id="tiktok-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://www.tiktok.com/@user/video/…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={status === 'loading'}
            aria-describedby="paste-hint"
          />
          {pasteSupported && (
            <button type="button" className="btn btn-ghost" onClick={() => void handlePaste()} disabled={status === 'loading'}>
              📋 Paste
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={status === 'loading'}>
            {status === 'loading' ? 'Fetching…' : '⬇ Download'}
          </button>
        </div>
        <p id="paste-hint" className="paste-hint">
          Works with video links, short links (vt.tiktok.com) and photo slideshows. No account needed.
        </p>
        {(input || result) && status !== 'loading' && (
          <button
            type="button"
            className="clear-btn"
            onClick={() => {
              setInput('');
              setResult(null);
              setError('');
              setStatus('idle');
              inputRef.current?.focus();
            }}
          >
            ✕ Clear
          </button>
        )}
      </form>

      {notice && <div className="toast" role="status">{notice}</div>}

      {status === 'loading' && (
        <div className="state-card" role="status" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p><strong>Fetching your TikTok…</strong></p>
          <p className="muted">Resolving the link and finding the no-watermark file. This usually takes a few seconds.</p>
        </div>
      )}

      {status === 'error' && error && (
        <div className="state-card error-card" role="alert">
          <p className="error-title">⚠️ Couldn&apos;t fetch that link</p>
          <p>{error}</p>
          <div className="error-actions">
            <button type="button" className="btn btn-primary" onClick={() => void fetchVideo(input)} disabled={!input.trim()}>
              ↻ Retry
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setError('');
                setStatus('idle');
                inputRef.current?.focus();
              }}
            >
              Try a different link
            </button>
          </div>
        </div>
      )}

      {status === 'success' && result && (
        <article className="result-card" aria-live="polite">
          <div className="result-head">
            {result.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.cover} alt="" className="result-cover" loading="lazy" />
            ) : (
              <div className="result-cover result-cover-fallback" aria-hidden="true">🎵</div>
            )}
            <div className="result-meta">
              <p className="result-author">
                {result.authorNickname || result.author || 'TikTok creator'}
                {result.author ? <span className="muted"> @{result.author}</span> : null}
              </p>
              <h2 className="result-title">{result.title || (result.type === 'slides' ? 'Photo slideshow' : 'TikTok video')}</h2>
              <p className="result-stats">
                {result.type === 'slides' ? (
                  <span>🖼️ {result.images.length} photos</span>
                ) : (
                  <>
                    {result.duration > 0 && <span>⏱ {formatDuration(result.duration)}</span>}
                    <span>❤️ {formatCount(result.stats.likes)}</span>
                    <span>💬 {formatCount(result.stats.comments)}</span>
                    <span>↗ {formatCount(result.stats.shares)}</span>
                    <span>▶ {formatCount(result.stats.plays)}</span>
                  </>
                )}
              </p>
              <span className="badge">{result.type === 'slides' ? 'Photo slides' : 'Video • No watermark'}</span>
            </div>
          </div>

          {result.type === 'video' && result.videoUrl && (
            <video className="result-video" src={result.videoUrl} poster={result.cover || undefined} controls preload="metadata" playsInline />
          )}

          <div className="download-grid">
            {result.videoUrl && (
              <a className="btn btn-primary btn-block" href={videoFile} download>
                ⬇ Download video (HD, no watermark)
              </a>
            )}
            {result.watermarkedUrl && result.watermarkedUrl !== result.videoUrl && (
              <a className="btn btn-ghost btn-block" href={proxyUrl(result.watermarkedUrl, `${siteName.toLowerCase()}-${baseName}-watermarked.mp4`)} download>
                Download with watermark (backup)
              </a>
            )}
            {audioFile && (
              <a className="btn btn-ghost btn-block" href={audioFile} download>
                🎵 Download audio (MP3)
              </a>
            )}
            {result.type === 'slides' && (
              <button type="button" className="btn btn-primary btn-block" onClick={() => void downloadAllSlides()} disabled={zipping}>
                {zipping ? (zipProgress || 'Preparing ZIP…') : `⬇ Download all ${result.images.length} as ZIP`}
              </button>
            )}
            {result.type === 'slides' && result.videoUrl && (
              <a className="btn btn-ghost btn-block" href={videoFile} download>
                ▶ Download slideshow video (MP4)
              </a>
            )}
            <button type="button" className="btn btn-ghost btn-block" onClick={() => void handleCopyLink()}>
              🔗 Copy TikTok link
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => void handleShare()}>
              ↗ Share
            </button>
          </div>

          {result.type === 'slides' && result.images.length > 0 && (
            <div className="slides-grid" aria-label="Slideshow images">
              {result.images.map((src, i) => (
                <figure key={`${src}-${i}`} className="slide-item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Slide ${i + 1}`} loading="lazy" />
                  <figcaption>
                    <span>Slide {i + 1}</span>
                    <a href={proxyUrl(src, `${siteName.toLowerCase()}-${baseName}-slide-${i + 1}.jpg`)} download>
                      Download
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          <p className="source-note muted">
            Resolved via {result.source} • Only download videos you own or have permission to save, for personal use.
          </p>
        </article>
      )}

      {recent.length > 0 && status !== 'loading' && (
        <section className="recent" aria-label="Recent downloads">
          <div className="recent-head">
            <h2>Recent downloads</h2>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                try {
                  localStorage.removeItem(RECENT_KEY);
                } catch {
                  // ignore
                }
                setRecent([]);
              }}
            >
              Clear history
            </button>
          </div>
          <p className="muted small">Saved only in your browser — nothing is uploaded or stored on our server.</p>
          <ul className="recent-list">
            {recent.map((item) => (
              <li key={item.url}>
                <button
                  type="button"
                  className="recent-item"
                  onClick={() => {
                    setInput(item.url);
                    void fetchVideo(item.url);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  {item.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.cover} alt="" loading="lazy" />
                  ) : (
                    <span className="recent-thumb-fallback" aria-hidden="true">🎵</span>
                  )}
                  <span className="recent-text">
                    <strong>{item.title}</strong>
                    <small>
                      @{item.author} • {item.type === 'slides' ? 'Slides' : 'Video'} •{' '}
                      {new Date(item.date).toLocaleDateString()}
                    </small>
                  </span>
                  <span aria-hidden="true">↻</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
