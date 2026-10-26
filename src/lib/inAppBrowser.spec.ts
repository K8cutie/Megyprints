import { describe, it, expect } from 'vitest';
import { inAppBrowserName, isAndroid, openInChromeHref, inAppSignInText } from './inAppBrowser';

const UA = {
  messenger: 'Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 [FB_IAB/MESSENGER;FBAV/480.0.0.40.109;]',
  facebook: 'Mozilla/5.0 (Linux; Android 12; TECNO KG5) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0 Mobile Safari/537.36 [FBAN/EMA;FBLC/en_US;FBAV/400.0]',
  facebookIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.97;FBBV/601446810]',
  instagram: 'Mozilla/5.0 (Linux; Android 13; SM-A135F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36 Instagram 350.0.0.0.0 Android',
  tiktok: 'Mozilla/5.0 (Linux; Android 13; SM-A135F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36 musical_ly_2023409030 BytedanceWebview/d8a21c6',
  otherWebView: 'Mozilla/5.0 (Linux; Android 13; SM-A135F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
};

describe('inAppBrowserName', () => {
  it('names the app whose built-in browser Google refuses', () => {
    expect(inAppBrowserName(UA.messenger)).toBe('Messenger');
    expect(inAppBrowserName(UA.facebook)).toBe('Facebook');
    expect(inAppBrowserName(UA.facebookIos)).toBe('Facebook');
    expect(inAppBrowserName(UA.instagram)).toBe('Instagram');
    expect(inAppBrowserName(UA.tiktok)).toBe('TikTok');
    expect(inAppBrowserName(UA.otherWebView)).toBe('');
  });

  it('leaves real browsers alone', () => {
    for (const ua of [UA.chromeAndroid, UA.samsung, UA.safari, UA.desktop]) expect(inAppBrowserName(ua)).toBeNull();
  });
});

describe('openInChromeHref', () => {
  it('opens the same page in Chrome, falling back to the page itself', () => {
    const href = openInChromeHref('https://megyprints.vercel.app/?x=1#/builder');
    expect(href).toBe('intent://megyprints.vercel.app/?x=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fmegyprints.vercel.app%2F%3Fx%3D1;end');
  });
});

describe('words', () => {
  it('names the app when known', () => {
    expect(inAppSignInText('Messenger')).toMatch(/inside Messenger/);
    expect(inAppSignInText('')).toMatch(/inside this app/);
    expect(inAppSignInText('Messenger')).toMatch(/Chrome/);
  });
  it('isAndroid', () => {
    expect(isAndroid(UA.messenger)).toBe(true);
    expect(isAndroid(UA.facebookIos)).toBe(false);
  });
});
