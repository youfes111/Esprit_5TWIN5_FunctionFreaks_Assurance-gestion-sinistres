import type { OntologyGraph } from '../types/visualization';
import { graphElements } from './graph';
export function graphLayout(count: number) {
  if (count < 2) return { name:'preset' as const, fit:true, padding:56, animate:false };
  if (count > 180) return { name:'grid' as const, fit:true, padding:56, spacingFactor:1.7, avoidOverlap:true, nodeDimensionsIncludeLabels:true, animate:false };
  return { name:'cose' as const, fit:true, padding:56, animate:false, randomize:false, nodeDimensionsIncludeLabels:true, idealEdgeLength:140, nodeRepulsion:12000, nodeOverlap:28, componentSpacing:100, gravity:.2, numIter:700, initialTemp:100, coolingFactor:.95, minTemp:1 };
}
export function positionedGraphElements(graph: OntologyGraph) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(graph.nodes.length)));
  return graphElements(graph).map((element, index) => 'source' in element.data ? element : { ...element, position:{ x:(index % columns)*180, y:Math.floor(index/columns)*150 } });
}
