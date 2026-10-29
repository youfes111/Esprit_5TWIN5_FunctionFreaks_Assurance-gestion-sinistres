import { ZoomIn, ZoomOut, Scan, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { NativeSelect } from './ui/native-select';
import { Switch } from './ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import type { GraphCategory } from '../types/visualization';
export function GraphControls({ category,onCategory,labels,onLabels,onZoom,onFit,onReset }: { category:GraphCategory|'all';onCategory:(value:GraphCategory|'all')=>void;labels:boolean;onLabels:(value:boolean)=>void;onZoom:(factor:number)=>void;onFit:()=>void;onReset:()=>void }) {
  const controls=[{label:'Zoom avant',icon:ZoomIn,action:()=>onZoom(1.25)},{label:'Zoom arrière',icon:ZoomOut,action:()=>onZoom(.8)},{label:'Ajuster la vue',icon:Scan,action:onFit},{label:'Réinitialiser la disposition',icon:RotateCcw,action:onReset}];
  return <div className="graph-controls">{controls.map(({label,icon:Icon,action})=><Tooltip key={label}><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label={label} onClick={action}><Icon /></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>)}<label className="ml-1"><span className="sr-only">Catégorie</span><NativeSelect value={category} onChange={event=>onCategory(event.target.value as GraphCategory|'all')}><option value="all">Toutes les catégories</option><option value="class">Classes OWL</option><option value="individual">Individus</option><option value="property">Propriétés objet</option></NativeSelect></label><label className="graph-checkbox ml-auto" htmlFor="graph-labels"><Switch id="graph-labels" size="sm" checked={labels} onCheckedChange={onLabels} />Relations</label></div>;
}
