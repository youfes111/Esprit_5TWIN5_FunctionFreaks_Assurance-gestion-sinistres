export type ResourceKind='insured'|'contract'|'expert'|'damage';
export interface ResourceRecord {
 id:string;kind:ResourceKind;name:string;identifier?:string;email?:string;phone?:string;address?:string;type?:string;status?:string;
 startDate?:string;endDate?:string;coverage?:string;specialization?:string;availability?:string;description?:string;amount?:string;
 insuredId?:string;claimId?:string;contracts:string[];claims:string[];revision:string|null;editable:boolean;
}
export type ResourceInput={id:string;name:string;identifier?:string;email?:string;phone?:string;address?:string;type?:string;status?:string;startDate?:string;endDate?:string;coverage?:string;specialization?:string;availability?:string;description?:string;amount?:string;insuredId?:string;claimId?:string};
export interface ResourcePage{items:ResourceRecord[];page:number;pageSize:number;hasMore:boolean}
