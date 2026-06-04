"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReplacement = buildReplacement;
const contextAnalyzer_1 = require("./contextAnalyzer");
function buildReplacement(key, contextType, config) {
    const call = buildCallExpr(key, config);
    switch (contextType) {
        case contextAnalyzer_1.ContextType.JSX_TEXT: return `{${call}}`;
        case contextAnalyzer_1.ContextType.JSX_ATTR_STR: return `{${call}}`;
        case contextAnalyzer_1.ContextType.JSX_ATTR_EXPR: return call;
        case contextAnalyzer_1.ContextType.JS_STRING: return call;
        case contextAnalyzer_1.ContextType.TEMPLATE_EXPR: return `\${${call}}`;
        case contextAnalyzer_1.ContextType.UNKNOWN:
        default: return call;
    }
}
function buildCallExpr(key, config) {
    switch (config.functionStyle) {
        case 't':
            return `t('${key}')`;
        case 'formatMessage':
            return `formatMessage({ id: '${key}' })`;
        case 'intl.formatMessage':
            return `intl.formatMessage({ id: '${key}' })`;
        case 'custom':
            return config.functionTemplate
                ? config.functionTemplate.replace('{{key}}', key)
                : key;
        default:
            return key; // 裸 key
    }
}
