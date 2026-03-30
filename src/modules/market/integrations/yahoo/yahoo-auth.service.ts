import { Injectable, Logger } from '@nestjs/common';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

@Injectable()
export class YahooAuthService {
  private readonly logger = new Logger(YahooAuthService.name);
  private cookies = '';
  private crumb   = '';
  private ready   = false;

  async init() {
    if (this.ready) return;

    try {
      const cookieRes = await fetch('https://fc.yahoo.com', {
        headers: { 'User-Agent': BROWSER_UA },
        redirect: 'follow',
      });

      // Bug fix: old code used get('set-cookie') which returns only the FIRST
      // Set-Cookie header. Yahoo sends multiple cookies; we need all of them.
      // getSetCookie() returns an array of all Set-Cookie values.
      const rawCookies: string[] =
        (cookieRes.headers as any).getSetCookie?.() ??
        [cookieRes.headers.get('set-cookie') ?? ''];

      this.cookies = rawCookies
        .map((c: string) => c.split(';')[0])
        .filter(Boolean)
        .join('; ');

      const crumbRes = await fetch(
        'https://query1.finance.yahoo.com/v1/test/getcrumb',
        {
          headers: {
            'User-Agent':      BROWSER_UA,   // Bug fix: was missing User-Agent
            'Accept':          '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie':          this.cookies,
          },
        },
      );

      const crumb = await crumbRes.text();

      if (!crumb || crumb.includes('<') || crumb.length > 20) {
        throw new Error(`Unexpected crumb response: ${crumb.slice(0, 50)}`);
      }

      this.crumb = crumb;
      this.ready = true;
      this.logger.log(`Yahoo credentials ready. Crumb: ${this.crumb}`);
    } catch (err: any) {
      this.logger.error(`Failed to fetch Yahoo credentials: ${err.message}`);
      this.ready = false;
    }
  }

  // Invalidate so the next call to init() re-fetches.
  reset() {
    this.ready = false;
  }

  getHeaders() {
    return {
      'User-Agent': BROWSER_UA,
      'Cookie':     this.cookies,
    };
  }

  getCookies() {
    return this.cookies;
  }

  getCrumb() {
    return this.crumb;
  }
}