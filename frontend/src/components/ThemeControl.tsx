import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '../design/theme';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
export function ThemeControl() {
  const { theme, resolved, setTheme } = useTheme();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Choisir le thème" title="Apparence">{resolved === 'dark' ? <Moon /> : <Sun />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" aria-label="Apparence">{([{ id: 'light', label: 'Clair', icon: Sun }, { id: 'dark', label: 'Sombre', icon: Moon }, { id: 'system', label: 'Système', icon: Monitor }] as const).map(({ id, label, icon: Icon }) => <DropdownMenuItem key={id} onSelect={() => setTheme(id)}><Icon />{label}{theme === id && <span className="ml-auto text-primary" aria-label="Sélectionné">✓</span>}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}
