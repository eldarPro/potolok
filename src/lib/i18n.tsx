import React, { createContext, useContext, useState } from 'react';
import { ru } from '../locales/ru';
import { en } from '../locales/en';
import { uk } from '../locales/uk';
import { pl } from '../locales/pl';
import { de } from '../locales/de';
import { fr } from '../locales/fr';
import { es } from '../locales/es';
import { tr } from '../locales/tr';

export type Lang = 'ru' | 'en' | 'uk' | 'pl' | 'de' | 'fr' | 'es' | 'tr';

export const LANGS: { code: Lang; name: string; flag: string }[] = [
  { code: 'ru', name: 'Русский',    flag: '🇷🇺' },
  { code: 'en', name: 'English',    flag: '🇬🇧' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'pl', name: 'Polski',     flag: '🇵🇱' },
  { code: 'de', name: 'Deutsch',    flag: '🇩🇪' },
  { code: 'fr', name: 'Français',   flag: '🇫🇷' },
  { code: 'es', name: 'Español',    flag: '🇪🇸' },
  { code: 'tr', name: 'Türkçe',     flag: '🇹🇷' },
];

export interface Locale {
  strings: Record<string, string>;
  roomsPlural: (n: number) => string;
}

const locales: Record<Lang, Locale> = { ru, en, uk, pl, de, fr, es, tr };

interface I18nCtx {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  nRooms: (n: number) => string;
}

const Ctx = createContext<I18nCtx>(null!);

const STORAGE_KEY = 'app_lang';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    return saved && locales[saved] ? saved : 'ru';
  });

  const setLang = (l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  };

  const locale = locales[lang];

  const t = (key: string, vars?: Record<string, string | number>): string => {
    let s = locale.strings[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };

  const nRooms = (n: number) => locale.roomsPlural(n);

  return <Ctx.Provider value={{ lang, setLang, t, nRooms }}>{children}</Ctx.Provider>;
};

export const useT = () => useContext(Ctx);
