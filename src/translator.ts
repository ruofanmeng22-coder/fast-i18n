import * as https from 'https';

const cache = new Map<string, string>();
const MAX_CACHE = 500;
const EVICT_COUNT = 100;

function cacheSet(key: string, value: string): void {
  if (cache.size >= MAX_CACHE) {
    let evicted = 0;
    for (const k of cache.keys()) {
      cache.delete(k);
      if (++evicted >= EVICT_COUNT) { break; }
    }
  }
  cache.set(key, value);
}

export async function translate(text: string): Promise<string> {
  if (cache.has(text)) {
    return cache.get(text)!;
  }

  try {
    const result = await fetchTranslation(text);
    const translated = result; // trust the resolve; catch handles failures
    cacheSet(text, translated);
    return translated;
  } catch (e) {
    const fb = fallback(text);
    if ((e as Error).message === 'parse error') {
      cacheSet(text, fb); // API responded but was unparseable — stable, cache it
    }
    // timeout/network errors: return fallback but don't cache (allow retry next time)
    return fb;
  }
}

export async function translateToZh(text: string): Promise<string> {
  const cacheKey = `zh:${text}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  try {
    const result = await fetchTranslationToZh(text);
    cacheSet(cacheKey, result);
    return result;
  } catch (e) {
    const fb = fallback(text);
    if ((e as Error).message === 'parse error') {
      cacheSet(cacheKey, fb);
    }
    return fb;
  }
}

function fetchTranslationToZh(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url =
      'https://translate.googleapis.com/translate_a/single' +
      `?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;

    const req = https.get(url, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          const translated: string = json[0]
            .map((part: any[]) => part[0])
            .join('');
          resolve(translated.trim());
        } catch {
          reject(new Error('parse error'));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function fetchTranslation(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url =
      'https://translate.googleapis.com/translate_a/single' +
      `?client=gtx&sl=zh-CN&tl=en&dt=t&q=${encodeURIComponent(text)}`;

    const req = https.get(url, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          // 响应格式：[[[["translated", "original", ...]]], ...]
          const translated: string = json[0]
            .map((part: any[]) => part[0])
            .join('');
          resolve(translated.trim());
        } catch {
          reject(new Error('parse error'));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

/** Unicode hex 降级：每个字符的 codepoint 拼成 hex 字符串 */
function fallback(text: string): string {
  return Array.from(text)
    .map((c) => c.codePointAt(0)!.toString(16).toUpperCase())
    .join('');
}
