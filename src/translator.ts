import * as https from 'https';

const cache = new Map<string, string>();

export async function translate(text: string): Promise<string> {
  if (cache.has(text)) {
    return cache.get(text)!;
  }

  try {
    const result = await fetchTranslation(text);
    const translated = result || fallback(text);
    cache.set(text, translated);
    return translated;
  } catch {
    const fb = fallback(text);
    cache.set(text, fb);
    return fb;
  }
}

function fetchTranslation(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url =
      'https://translate.googleapis.com/translate_a/single' +
      `?client=gtx&sl=zh-CN&tl=en&dt=t&q=${encodeURIComponent(text)}`;

    const req = https.get(url, { timeout: 5000 }, (res) => {
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
