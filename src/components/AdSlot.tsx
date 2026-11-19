'use client';

import { useEffect } from 'react';

export interface AdConfig {
  adsEnabled: boolean;
  /** This slot's own switch from the Sheet's Ads tab. */
  slotEnabled: boolean;
  adsenseClient: string;
  slotId: string;
  html: string;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * One ad slot. Renders NOTHING unless ads are enabled in config.
 * Priority: raw ad HTML from the Sheet > AdSense unit > dev placeholder.
 * In production with ads on but no ad code configured, renders nothing
 * (an empty box would look broken to visitors).
 */
export default function AdSlot({ slot, config }: { slot: string; config: AdConfig }) {
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    if (!config.adsEnabled || !config.slotEnabled || !config.adsenseClient || !config.slotId || config.html) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense not loaded yet — harmless, the unit stays blank.
    }
  }, [config]);

  if (!config.adsEnabled || !config.slotEnabled) return null;

  if (config.html) {
    return (
      <div className="ad-slot" data-ad-slot={slot} aria-label="Advertisement">
        <div dangerouslySetInnerHTML={{ __html: config.html }} />
      </div>
    );
  }

  if (config.adsenseClient && config.slotId) {
    return (
      <div className="ad-slot" data-ad-slot={slot} aria-label="Advertisement">
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={config.adsenseClient}
          data-ad-slot={config.slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  if (isDev) {
    return (
      <div className="ad-slot ad-placeholder" data-ad-slot={slot} aria-label="Advertisement placeholder">
        <span>Ad space — {slot}</span>
        <small>Enable ads in your Google Sheet to fill this slot.</small>
      </div>
    );
  }
  return null;
}
