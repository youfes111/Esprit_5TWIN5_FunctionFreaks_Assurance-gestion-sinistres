import { useEffect, useMemo, useRef } from 'react';
import cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import type { OntologyGraph, GraphCategory } from '../types/visualization';
import { visibleGraph } from '../utils/graph';
import { graphLayout, positionedGraphElements } from '../utils/graph-layout';
import type { ReactNode } from 'react';
import { graphStyles } from '../utils/graph-style';
import { useTheme } from '../design/theme';
import { GraphControls } from './GraphControls';
function currentPalette() {
  const css = getComputedStyle(document.documentElement);
  const color = (name: string) => css.getPropertyValue(name).trim();
  return { foreground:color('--foreground'), muted:color('--muted-foreground'), surface:color('--card'), primary:color('--primary'), classes:color('--graph-class'), individuals:color('--graph-individual'), properties:color('--graph-property'), edges:color('--graph-edge'), warning:color('--warning') };
}
export function OntologyCanvas({ graph, category, onCategory, labels, onLabels, search, selected, onSelect, toolbar }: {
  graph: OntologyGraph; category: GraphCategory | 'all'; onCategory: (category: GraphCategory | 'all') => void;
  labels: boolean; onLabels: (value: boolean) => void; search: string; selected: string | null; onSelect: (id: string) => void; toolbar?: ReactNode;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const core = useRef<Core | null>(null);
  const { resolved } = useTheme();
  const visible = useMemo(() => visibleGraph(graph, category), [graph, category]);
  useEffect(() => {
    if (!container.current) return;
    const cy = cytoscape({ container:container.current, elements:positionedGraphElements(graph), minZoom:.12, maxZoom:3, layout:graphLayout(graph.nodes.length), style:graphStyles(currentPalette()) });
    core.current = cy;
    const handler = (event: cytoscape.EventObject) => onSelect(event.target.id());
    cy.on('tap','node',handler);
    const observer = new ResizeObserver(() => { if (!cy.destroyed()) cy.resize(); });
    observer.observe(container.current);
    return () => { observer.disconnect(); cy.off('tap','node',handler); cy.destroy(); core.current = null; };
  }, [graph, onSelect]);
  useEffect(() => {
    const cy = core.current; if (!cy) return;
    const ids = new Set([...visible.nodes.map(node=>node.id), ...visible.edges.map(edge=>edge.id)]);
    cy.batch(() => { cy.elements().forEach(element => { element.toggleClass('filtered-out', !ids.has(element.id())); }); });
    cy.fit(cy.elements(':visible'),40);
  }, [visible]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { const cy=core.current; if(cy&&!cy.destroyed()) { cy.style(graphStyles(currentPalette())); cy.edges().style('label',labels?'data(label)':''); } });
    return () => cancelAnimationFrame(frame);
  }, [resolved, graph, labels]);
  useEffect(() => {
    const cy=core.current; if(!cy)return;
    cy.nodes().removeClass('search-match'); if(!search.trim())return;
    const term=search.toLocaleLowerCase('fr');
    const found=cy.nodes().filter(node=>node.visible() && (String(node.data('label')).toLocaleLowerCase('fr').includes(term)||node.id().toLocaleLowerCase('fr').includes(term)));
    found.addClass('search-match'); if(found.length)cy.fit(found.closedNeighborhood().filter(element=>element.visible()),50);
  }, [search,visible]);
  useEffect(()=>{
    const cy=core.current;if(!cy)return;
    cy.batch(()=>{
      cy.elements().removeClass('context-dim context-node context-edge'); cy.nodes().unselect();
      if(!selected)return;
      const node=cy.getElementById(selected); if(!node.length||!node.visible())return;
      const edges=node.connectedEdges().filter(edge=>edge.visible()); const neighborhood=edges.connectedNodes().union(node);
      cy.elements(':visible').difference(neighborhood.union(edges)).addClass('context-dim');
      neighborhood.addClass('context-node'); edges.addClass('context-edge'); node.select();
    });
    if(selected){const node=cy.getElementById(selected);if(node.length&&node.visible())cy.center(node);}
  },[selected,visible]);
  return <div><div className="graph-commandbar">{toolbar}<GraphControls category={category} onCategory={onCategory} labels={labels} onLabels={onLabels} onZoom={factor=>{const cy=core.current;if(cy)cy.zoom(Math.max(cy.minZoom(),Math.min(cy.maxZoom(),cy.zoom()*factor)));}} onFit={()=>{core.current?.fit(core.current.elements(':visible'),56);}} onReset={()=>{core.current?.elements(':visible').layout(graphLayout(visible.nodes.length)).run();}} /></div><div className="ontology-canvas" ref={container} aria-hidden="true" /><p className="data-caption">Glisser pour déplacer · Défiler pour zoomer · Sélectionner pour isoler les relations</p></div>;
}
