import { zhCN } from './zh-CN';
import { enUS } from './en-US';

export type Locale = 'zh-CN' | 'en-US';

export const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const;

export type Messages = typeof messages;
export type MessageKey = keyof typeof zhCN;

// Default locale
let currentLocale: Locale = 'zh-CN';

export function setLocale(locale: Locale) {
  currentLocale = locale;
  localStorage.setItem('ywcoder-locale', locale);
}

export function getLocale(): Locale {
  const saved = localStorage.getItem('ywcoder-locale') as Locale;
  if (saved && messages[saved]) {
    currentLocale = saved;
  }
  return currentLocale;
}

export function t(key: string, params?: Record<string, string>): string {
  const locale = getLocale();
  const messageSet = messages[locale] as Record<string, any>;

  // Support nested keys like 'chat.send'
  const keys = key.split('.');
  let value: any = messageSet;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Fallback to zh-CN if key not found
      const fallback = messages['zh-CN'] as Record<string, any>;
      let fallbackValue: any = fallback;
      for (const fk of keys) {
        if (fallbackValue && typeof fallbackValue === 'object' && fk in fallbackValue) {
          fallbackValue = fallbackValue[fk];
        } else {
          return key; // Return key if not found
        }
      }
      value = fallbackValue;
      break;
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // Replace params
  if (params) {
    return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
      return params[paramKey] ?? match;
    });
  }

  return value;
}

// Get verbs array for waiting indicator
export function getVerbs(): string[] {
  const locale = getLocale();
  const messageSet = messages[locale] as Record<string, any>;
  return messageSet.verbs || (messages['zh-CN'] as Record<string, any>).verbs;
}

export { zhCN, enUS };
