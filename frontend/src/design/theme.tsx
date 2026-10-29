import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
export type Theme = 'light' | 'dark' | 'system';
const ThemeContext = createContext<{ theme: Theme; resolved: 'light' | 'dark'; setTheme: (value: Theme) => void } | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const value = localStorage.getItem('assurance-theme'); return value === 'light' || value === 'dark' ? value : 'system'; } catch { return 'system'; }
  });
  const [systemDark, setSystemDark] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const resolved = theme === 'system' ? systemDark ? 'dark' : 'light' : theme;
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => setSystemDark(query.matches);
    query.addEventListener('change', changed); return () => query.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.style.colorScheme = resolved;
    try { localStorage.setItem('assurance-theme', theme); } catch { /* Preferences remain usable in memory. */ }
  }, [theme, resolved]);
  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('ThemeProvider is required.'); return value; }
