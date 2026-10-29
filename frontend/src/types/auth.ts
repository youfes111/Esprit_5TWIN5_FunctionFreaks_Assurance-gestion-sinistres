export type Role='ADMIN'|'AGENT'|'VIEWER';
export interface AppUser {id:string;fullName:string;email:string;role:Role;status:'PENDING'|'ACTIVE'|'DISABLED';createdAt:string;updatedAt:string;lastLoginAt:string|null;createdBy:string|null}
export interface SetupLink {activationUrl:string;expiresAt:string}
export interface UserPage {items:AppUser[];page:number;pageSize:number;total:number}
export interface UserInput {fullName:string;email:string;role:Role}
