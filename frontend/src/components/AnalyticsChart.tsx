import { motion, useReducedMotion } from 'motion/react';
import { entrance } from '../design/motion';
import { TableCaption, TableHead, TableRow, TableHeader, TableCell, TableBody, Table } from './ui/table';
import { Card } from './ui/card';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Distribution } from '../types/visualization';
import { DataState } from './DataState';
const MotionCard = motion.create(Card);
export function AnalyticsChart({ title, description, data, amount = false }: {
    title: string;
    description: string;
    data: Distribution;
    amount?: boolean;
}) {
    const reduce = useReducedMotion();
    const meaningful = data.items.some((item) => item.value > 0);
    return <MotionCard {...entrance(reduce)} className="detail-card analytics-chart"><h2>{title}</h2><p className="data-caption">{description}</p>
    {data.items.length === 1 ? <div className="single-chart-value" role="group" aria-label={title}><span>{data.items[0]!.label}</span><strong>{data.items[0]!.exactValue ?? data.items[0]!.value.toLocaleString('fr-FR')}</strong><small>{amount ? 'Montant déclaré · aucune devise définie' : 'Une catégorie retournée par le graphe'}</small></div> : meaningful ? <figure aria-label={title}><figcaption className="sr-only">{title}, valeurs complètes dans le tableau suivant.</figcaption><div className="chart-height" style={{height:Math.max(180,Math.min(280,data.items.length*38+35))}}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={data.items.slice(0, 12)} accessibilityLayer margin={{ top: 8, right: 24, bottom: 8, left: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false}/><XAxis type="number" allowDecimals={amount} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} /><YAxis type="category" dataKey="label" width={112} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(label: string)=>label.length>18?label.slice(0,17)+'…':label}/><Tooltip contentStyle={{ background: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} /><Bar dataKey="value" name={amount ? 'Montant estimé (sans devise)' : 'Nombre'} fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}/></BarChart></ResponsiveContainer></div></figure> : <DataState empty label="Aucune valeur positive à représenter. Les zéros éventuels restent visibles dans le tableau."/>}
    {data.items.length > 12 && <p className="data-caption">Graphique limité aux 12 premières catégories ; tableau complet ci-dessous.</p>}{data.truncated && <p role="status" className="data-caption">Données limitées aux 100 premières lignes.</p>}
    <details><summary>Tableau des données : {title}</summary><div className="data-table-scroll"><Table className="data-table"><TableCaption>{title} — données retournées par le backend</TableCaption><TableHeader><TableRow><TableHead scope="col">Catégorie / ressource</TableHead><TableHead scope="col">{amount ? 'Montant exact, sans devise' : 'Nombre'}</TableHead></TableRow></TableHeader><TableBody>{data.items.map((item, index) => <TableRow key={item.iri ? `${item.iri}:${index}` : index}><TableHead scope="row">{item.label}{item.iri && <small>{item.iri}</small>}</TableHead><TableCell>{item.exactValue ?? item.value.toLocaleString('fr-FR')}</TableCell></TableRow>)}</TableBody></Table></div></details>
  </MotionCard>;
}
