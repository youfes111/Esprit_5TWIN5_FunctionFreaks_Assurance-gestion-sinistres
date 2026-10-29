export const roles = ['ADMIN', 'AGENT', 'VIEWER'] as const;
export type Role = typeof roles[number];
export type Status = 'PENDING' | 'ACTIVE' | 'DISABLED';
export interface UserRow {
  id:string; full_name:string; email:string; password_hash:string|null; role:Role; status:Status;
  created_at:number; updated_at:number; last_login_at:number|null; created_by:string|null;
}
export function publicUser(user: UserRow) {
  return { id:user.id, fullName:user.full_name, email:user.email, role:user.role, status:user.status,
    createdAt:new Date(user.created_at).toISOString(), updatedAt:new Date(user.updated_at).toISOString(),
    lastLoginAt:user.last_login_at ? new Date(user.last_login_at).toISOString() : null, createdBy:user.created_by };
}
export interface AuthSession { user:UserRow; token:string; tokenHash:string }
declare global { namespace Express { interface Request { auth?:AuthSession } } }
export const permissions = {
  ADMIN:['read','claims:write','users:manage','profile:edit'],
  AGENT:['read','claims:write','profile:edit'], VIEWER:['read','profile:edit'],
} satisfies Record<Role,string[]>;
export type Permission = 'read'|'claims:write'|'users:manage'|'profile:edit';
export function hasPermission(role:Role, permission:Permission) { return (permissions[role] as readonly string[]).includes(permission); }
