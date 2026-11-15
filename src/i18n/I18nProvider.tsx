import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import uz, { type Dict } from './uz';
import ru from './ru';
import en from './en';

export type Lang = 'uz' | 'ru' | 'en';
export const LANGS: Lang[] = ['uz', 'ru', 'en'];
const DICTS: Record<Lang, Dict> = { uz, ru, en };
const STORAGE_KEY = 'qrstudio.lang';

interface I18nValue {
  lang: Lang;
  t: Dict;
  setLang: (lang: Lang) => void;
  formatDate: (iso: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LANGS as string[]).includes(saved)) return saved as Lang;
  } catch {
    /* storage unavailable */
  }
  return 'uz';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nValue>(() => {
    const t = DICTS[lang];
    const fmt = new Intl.DateTimeFormat(t.meta.locale, { day: 'numeric', month: 'short', year: 'numeric' });
    return {
      lang,
      t,
      setLang,
      formatDate: (iso: string) => {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '' : fmt.format(d);
      },
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
