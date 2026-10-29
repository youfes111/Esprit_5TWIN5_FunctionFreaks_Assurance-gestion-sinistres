import type { StylesheetStyle } from 'cytoscape';
export interface GraphPalette { foreground: string; muted: string; surface: string; primary: string; classes: string; individuals: string; properties: string; edges: string; warning: string }
export function graphStyles(p: GraphPalette): StylesheetStyle[] {
  return [
    { selector:'node', style:{ label:'data(label)', 'font-family':'Manrope Variable', 'font-size':12, 'font-weight':600, color:p.foreground, width:48, height:48, 'text-valign':'bottom', 'text-margin-y':10, 'text-wrap':'wrap', 'text-max-width':'125px', 'min-zoomed-font-size':10, 'border-width':2, 'border-color':p.surface } },
    { selector:'node[category = "class"]', style:{ 'background-color':p.classes, shape:'round-rectangle' } },
    { selector:'node[category = "individual"]', style:{ 'background-color':p.individuals, shape:'ellipse' } },
    { selector:'node[category = "property"]', style:{ 'background-color':p.properties, shape:'diamond' } },
    { selector:'edge', style:{ 'curve-style':'bezier', 'target-arrow-shape':'triangle', 'line-color':p.edges, 'target-arrow-color':p.edges, width:1.6, label:'data(label)', color:p.muted, 'font-family':'Manrope Variable', 'font-size':9, 'min-zoomed-font-size':9, 'text-rotation':'autorotate', 'text-background-color':p.surface, 'text-background-opacity':.95, 'text-background-padding':'4px' } },
    { selector:'.context-dim', style:{ opacity:.16 } },
    { selector:'.context-node', style:{ opacity:1, 'border-width':2, 'border-color':p.primary } },
    { selector:'.context-edge', style:{ opacity:1, width:2.8, 'line-color':p.primary, 'target-arrow-color':p.primary, color:p.foreground, 'font-size':10 } },
    { selector:'node:selected', style:{ opacity:1, 'border-width':4, 'border-color':p.primary, 'overlay-color':p.primary, 'overlay-opacity':.1, 'overlay-padding':10, 'min-zoomed-font-size':0 } },
    { selector:'.search-match', style:{ 'border-width':4, 'border-color':p.warning } },
    { selector:'.filtered-out', style:{ display:'none' } },
  ];
}
