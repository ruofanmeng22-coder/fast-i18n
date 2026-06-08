import * as https from 'https';
import * as crypto from 'crypto';
import * as vscode from 'vscode';

type TranslationService = 'google' | 'baidu' | 'deepl' | 'openai' | 'custom';

interface TranslationConfig {
  service: TranslationService;
  apiKey: string;
  appId: string;
  secretKey: string;
  apiUrl: string;
  model: string;
}

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

function getConfig(): TranslationConfig {
  const cfg = vscode.workspace.getConfiguration('fast-i18n');
  return {
    service:   cfg.get<TranslationService>('translationService', 'google'),
    apiKey:    cfg.get<string>('translationApiKey', ''),
    appId:     cfg.get<string>('translationAppId', ''),
    secretKey: cfg.get<string>('translationSecretKey', ''),
    apiUrl:    cfg.get<string>('translationApiUrl', ''),
    model:     cfg.get<string>('translationModel', 'gpt-3.5-turbo'),
  };
}

export async function translate(text: string): Promise<string> {
  const cacheKey = `zh2en:${text}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  try {
    const result = await doTranslate(text, 'zh-CN', 'en');
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

export async function translateToZh(text: string): Promise<string> {
  const cacheKey = `en2zh:${text}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  try {
    const result = await doTranslate(text, 'en', 'zh-CN');
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

async function doTranslate(text: string, from: string, to: string): Promise<string> {
  const config = getConfig();
  switch (config.service) {
    case 'google':  return googleTranslate(text, from, to);
    case 'baidu':   return baiduTranslate(text, from, to, config);
    case 'deepl':   return deeplTranslate(text, from, to, config);
    case 'openai':  return openaiTranslate(text, from, to, config);
    case 'custom':  return customTranslate(text, from, to, config);
    default:        return googleTranslate(text, from, to);
  }
}

function googleTranslate(text: string, from: string, to: string): Promise<string> {
  const url =
    'https://translate.googleapis.com/translate_a/single' +
    `?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;

  return httpGetJson(url).then(json => {
    const translated: string = json[0]
      .map((part: any[]) => part[0])
      .join('');
    return translated.trim();
  });
}

function baiduTranslate(
  text: string,
  from: string,
  to: string,
  config: TranslationConfig
): Promise<string> {
  if (!config.appId || !config.secretKey) {
    return Promise.reject(new Error('百度翻译需要配置 appId 和 secretKey'));
  }

  const salt = Date.now().toString();
  const sign = crypto
    .createHash('md5')
    .update(config.appId + text + salt + config.secretKey)
    .digest('hex');

  const baiduFrom = from === 'zh-CN' ? 'zh' : from;
  const baiduTo = to === 'zh-CN' ? 'zh' : to;

  const url =
    'https://fanyi-api.baidu.com/api/trans/vip/translate' +
    `?q=${encodeURIComponent(text)}` +
    `&from=${baiduFrom}&to=${baiduTo}` +
    `&appid=${config.appId}&salt=${salt}&sign=${sign}`;

  return httpGetJson(url).then(json => {
    if (json.error_code) {
      throw new Error(`百度翻译错误: ${json.error_msg}`);
    }
    const translated: string = json.trans_result
      .map((item: { dst: string }) => item.dst)
      .join('\n');
    return translated.trim();
  });
}

function deeplTranslate(
  text: string,
  from: string,
  to: string,
  config: TranslationConfig
): Promise<string> {
  if (!config.apiKey) {
    return Promise.reject(new Error('DeepL 翻译需要配置 apiKey'));
  }

  const isFree = config.apiKey.endsWith(':fx');
  const host = isFree ? 'api-free.deepl.com' : 'api.deepl.com';
  const deepLFrom = from === 'zh-CN' ? 'ZH' : from.toUpperCase();
  const deepLTo = to === 'zh-CN' ? 'ZH' : to.toUpperCase();

  const body = JSON.stringify({
    auth_key: config.apiKey,
    text: [text],
    source_lang: deepLFrom,
    target_lang: deepLTo,
  });

  return httpPostJson(`https://${host}/v2/translate`, body).then(json => {
    const translated: string = json.translations
      .map((t: { text: string }) => t.text)
      .join('\n');
    return translated.trim();
  });
}

function openaiTranslate(
  text: string,
  from: string,
  to: string,
  config: TranslationConfig
): Promise<string> {
  if (!config.apiKey) {
    return Promise.reject(new Error('OpenAI 翻译需要配置 apiKey'));
  }

  const baseUrl = config.apiUrl || 'https://api.openai.com';
  const fromLabel = from === 'zh-CN' ? 'Chinese' : 'English';
  const toLabel = to === 'zh-CN' ? 'Chinese' : 'English';

  const body = JSON.stringify({
    model: config.model || 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You are a translator. Translate the following text from ${fromLabel} to ${toLabel}. Only output the translation, nothing else.`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0.3,
  });

  return httpPostJson(`${baseUrl}/v1/chat/completions`, body, {
    Authorization: `Bearer ${config.apiKey}`,
  }).then(json => {
    const translated = json.choices?.[0]?.message?.content?.trim();
    if (!translated) {
      throw new Error('parse error');
    }
    return translated;
  });
}

function customTranslate(
  text: string,
  from: string,
  to: string,
  config: TranslationConfig
): Promise<string> {
  if (!config.apiUrl) {
    return Promise.reject(new Error('自定义翻译需要配置 apiUrl'));
  }

  const body = JSON.stringify({ text, from, to });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  return httpPostJson(config.apiUrl, body, headers).then(json => {
    const translated =
      json.translation || json.result || json.text || json.translated;
    if (typeof translated !== 'string') {
      throw new Error('parse error');
    }
    return translated.trim();
  });
}

function httpGetJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('parse error')); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function httpPostJson(
  url: string,
  body: string,
  extraHeaders?: Record<string, string>
): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...extraHeaders,
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('parse error')); }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function fallback(text: string): string {
  return Array.from(text)
    .map((c) => c.codePointAt(0)!.toString(16).toUpperCase())
    .join('');
}
