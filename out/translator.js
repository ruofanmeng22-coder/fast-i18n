"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.translate = translate;
exports.translateToZh = translateToZh;
const https = __importStar(require("https"));
const cache = new Map();
const MAX_CACHE = 500;
const EVICT_COUNT = 100;
function cacheSet(key, value) {
    if (cache.size >= MAX_CACHE) {
        let evicted = 0;
        for (const k of cache.keys()) {
            cache.delete(k);
            if (++evicted >= EVICT_COUNT) {
                break;
            }
        }
    }
    cache.set(key, value);
}
async function translate(text) {
    if (cache.has(text)) {
        return cache.get(text);
    }
    try {
        const result = await fetchTranslation(text);
        const translated = result; // trust the resolve; catch handles failures
        cacheSet(text, translated);
        return translated;
    }
    catch (e) {
        const fb = fallback(text);
        if (e.message === 'parse error') {
            cacheSet(text, fb); // API responded but was unparseable — stable, cache it
        }
        // timeout/network errors: return fallback but don't cache (allow retry next time)
        return fb;
    }
}
async function translateToZh(text) {
    const cacheKey = `zh:${text}`;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }
    try {
        const result = await fetchTranslationToZh(text);
        cacheSet(cacheKey, result);
        return result;
    }
    catch (e) {
        const fb = fallback(text);
        if (e.message === 'parse error') {
            cacheSet(cacheKey, fb);
        }
        return fb;
    }
}
function fetchTranslationToZh(text) {
    return new Promise((resolve, reject) => {
        const url = 'https://translate.googleapis.com/translate_a/single' +
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
                    const translated = json[0]
                        .map((part) => part[0])
                        .join('');
                    resolve(translated.trim());
                }
                catch {
                    reject(new Error('parse error'));
                }
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
    });
}
function fetchTranslation(text) {
    return new Promise((resolve, reject) => {
        const url = 'https://translate.googleapis.com/translate_a/single' +
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
                    const translated = json[0]
                        .map((part) => part[0])
                        .join('');
                    resolve(translated.trim());
                }
                catch {
                    reject(new Error('parse error'));
                }
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
    });
}
/** Unicode hex 降级：每个字符的 codepoint 拼成 hex 字符串 */
function fallback(text) {
    return Array.from(text)
        .map((c) => c.codePointAt(0).toString(16).toUpperCase())
        .join('');
}
