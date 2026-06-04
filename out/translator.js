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
const https = __importStar(require("https"));
const cache = new Map();
async function translate(text) {
    if (cache.has(text)) {
        return cache.get(text);
    }
    try {
        const result = await fetchTranslation(text);
        const translated = result || fallback(text);
        cache.set(text, translated);
        return translated;
    }
    catch {
        const fb = fallback(text);
        cache.set(text, fb);
        return fb;
    }
}
function fetchTranslation(text) {
    return new Promise((resolve, reject) => {
        const url = 'https://translate.googleapis.com/translate_a/single' +
            `?client=gtx&sl=zh-CN&tl=en&dt=t&q=${encodeURIComponent(text)}`;
        const req = https.get(url, { timeout: 5000 }, (res) => {
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
