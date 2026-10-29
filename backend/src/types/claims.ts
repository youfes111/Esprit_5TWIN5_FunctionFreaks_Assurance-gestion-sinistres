export const claimStatuses = ['Déclaré', 'En cours', 'En expertise', 'Accepté', 'Rejeté', 'Clôturé'] as const;
export interface ClaimInput {
  id: string;
  insuredId: string;
  contractId: string;
  declarationDate: string;
  status: typeof claimStatuses[number];
  expertId: string | null;
  fraudulent: boolean;
  damageAmount: string | null;
  damageId?: string | null;
}
export interface Claim extends Omit<ClaimInput, 'status' | 'insuredId' | 'declarationDate' | 'fraudulent' | 'contractId'> {
  status: string | null;
  insuredId: string | null;
  contractId: string | null;
  declarationDate: string | null;
  fraudulent: boolean | null;
  revision: string | null;
  editable: boolean;
}
export type ClaimPatch = Partial<Omit<ClaimInput, 'id'>> & { revision: string };
export interface ClaimFilters {
  search?: string; status?: string; insuredId?: string; expertId?: string; contractId?: string;
  page: number; pageSize: number;
}
