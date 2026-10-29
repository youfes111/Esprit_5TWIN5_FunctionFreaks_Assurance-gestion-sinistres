export type ApiResponse<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };
export interface Health { status: 'ok'; service: string }
export interface OntologySummary {
  name: string; iri: string; classCount: number; individualCount: number;
  objectPropertyCount: number; dataPropertyCount: number;
}
