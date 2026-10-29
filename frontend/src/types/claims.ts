export const statuses = ['Déclaré', 'En cours', 'En expertise', 'Accepté', 'Rejeté', 'Clôturé'];
export interface Claim {
  id: string; insuredId: string | null; contractId: string | null; declarationDate: string | null;
  status: string | null; expertId: string | null; fraudulent: boolean | null; damageAmount: string | null; damageId: string | null;
  revision: string | null; editable: boolean;
}
export interface ClaimInput {
  id: string; insuredId: string; contractId: string; declarationDate: string;
  status: string; expertId: string | null; fraudulent: boolean; damageAmount: string | null; damageId?: string | null;
}
export interface ClaimPage { items: Claim[]; page: number; pageSize: number; hasMore: boolean }
export interface ClaimOptions { insured: string[]; contracts: string[]; experts: string[]; damages:string[]; mutationsEnabled: boolean }
