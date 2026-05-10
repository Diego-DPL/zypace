// ── Google Analytics 4 ──────────────────────────────────────────────────
// Set VITE_GA4_ID=G-XXXXXXXXXX in .env.local
// If the variable is absent the helpers are silent no-ops.

const GA_ID = import.meta.env.VITE_GA4_ID as string | undefined;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

const CONSENT_STORAGE_KEY = 'zypace_cookie_consent_v1';

/** Returns true if the user has previously accepted analytics cookies. */
export function hasAnalyticsConsent(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return false;
    return JSON.parse(raw)?.analytics === true;
  } catch {
    return false;
  }
}

/** Call once at app startup to inject the gtag.js script and initialise GA4. */
export function initAnalytics(): void {
  if (!GA_ID || typeof window === 'undefined') return;
  if (document.getElementById('ga4-script')) return;

  // Inject async gtag.js script
  const script = document.createElement('script');
  script.id    = 'ga4-script';
  script.async = true;
  script.src   = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  // Disable automatic page_view — we fire them manually on route change
  window.gtag('config', GA_ID, { send_page_view: false });
}

/** Fire a page_view event (call on every route change). */
export function trackPageView(path: string, title?: string): void {
  if (!GA_ID || typeof window.gtag !== 'function') return;
  window.gtag('event', 'page_view', {
    page_path:     path,
    page_title:    title,
    page_location: window.location.href,
  });
}

/**
 * Fire a custom or recommended GA4 event.
 * Key conversion events used in Zypace:
 *   - sign_up          → after successful registration
 *   - begin_checkout   → when user clicks "Empezar prueba gratuita"
 *   - trial_start      → when user lands on /app?sub=ok
 */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!GA_ID || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params ?? {});
}
