import { ContextType } from './contextAnalyzer';

export interface I18nConfig {
  functionStyle:    string;
  functionTemplate: string;
}

export function buildReplacement(
  key: string,
  contextType: ContextType,
  config: I18nConfig
): string {
  const call = buildCallExpr(key, config);

  switch (contextType) {
    case ContextType.JSX_TEXT:      return `{${call}}`;
    case ContextType.JSX_ATTR_STR:  return `{${call}}`;
    case ContextType.JSX_ATTR_EXPR: return call;
    case ContextType.JS_STRING:     return call;
    case ContextType.TEMPLATE_EXPR: return `\${${call}}`;
    case ContextType.UNKNOWN:
    default:                        return call;
  }
}

function buildCallExpr(key: string, config: I18nConfig): string {
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
