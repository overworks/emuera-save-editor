import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Languages } from 'lucide-react';
import { formatMessage, localeNames, locales, resolveLocale, translator } from './i18n';
import type { Locale, Translator } from './i18n';
import type { Message } from './core/diagnostic';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translator;
  message: (message: Message) => string;
  number: (value: number) => string;
}
const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);
const browserLocale = () => resolveLocale(navigator.languages, new URL(window.location.href).searchParams.get('lang'));

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setActiveLocale] = useState(browserLocale);
  const value = useMemo<LocaleContextValue>(() => {
    const t = translator(locale);
    const numbers = new Intl.NumberFormat(locale);
    return {
      locale, t, number: n => numbers.format(n), message: message => formatMessage(t, message),
      setLocale: next => {
        const url = new URL(window.location.href);
        url.searchParams.set('lang', next);
        window.history.replaceState(window.history.state, '', url);
        setActiveLocale(next);
      },
    };
  }, [locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = value.t('pageTitle');
    document.querySelector('meta[name="description"]')?.setAttribute('content', value.t('pageDescription'));
  }, [locale, value]);
  useEffect(() => {
    const restore = () => setActiveLocale(browserLocale());
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale requires LocaleProvider');
  return context;
}

export function LanguageSelect() {
  const { locale, setLocale, t } = useLocale();
  return <label className="language-picker">
    <Languages size={16} aria-hidden="true" />
    <span className="visually-hidden">{t('language')}</span>
    <select value={locale} onChange={event => setLocale(event.target.value as Locale)}>
      {locales.map(language => <option key={language} value={language} lang={language}>{localeNames[language]}</option>)}
    </select>
  </label>;
}
