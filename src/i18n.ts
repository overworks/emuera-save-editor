import { messages } from './messages';
import type { Message, MessageKey, MessageParams } from './core/diagnostic';

export const locales = ['en', 'ko', 'ja'] as const;
export type Locale = typeof locales[number];
export const localeNames: Record<Locale, string> = { en: 'English', ko: '한국어', ja: '日本語' };
const localeIndex: Record<Locale, 0 | 1 | 2> = { en: 0, ko: 1, ja: 2 };

export function resolveLocale(languages: readonly string[], requested?: string | null): Locale {
  const supported = (tag: string): Locale | undefined => {
    const language = tag.toLowerCase().replace(/_/g, '-').split('-')[0];
    return locales.find(locale => locale === language);
  };
  return (requested && supported(requested)) || languages.map(supported).find(Boolean) || 'en';
}

export type Translator = (key: MessageKey, params?: MessageParams) => string;
export function translator(locale: Locale): Translator {
  const numbers = new Intl.NumberFormat(locale);
  const plurals = new Intl.PluralRules(locale);
  return (key, params = {}) => {
    const entry = messages[key][localeIndex[locale]];
    const template = typeof entry === 'string' ? entry : entry[plurals.select(Number(params.count ?? 0)) === 'one' ? 'one' : 'other'];
    return template.replace(/\{(\w+)\}/g, (token, name: string) => {
      const value = params[name];
      return value === undefined ? token : typeof value === 'number' ? numbers.format(value) : value;
    });
  };
}

export function formatMessage(t: Translator, message: Message): string {
  let text = t(message.key, message.params);
  if (message.location) text += ` (${t(message.location.unit === 'byte' ? 'atByte' : 'atLine', { position: message.location.position })})`;
  if (message.source) text = `${message.source.filename}${message.source.line === undefined ? '' : `:${message.source.line}`}: ${text}`;
  return text;
}
