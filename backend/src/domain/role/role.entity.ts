export interface Role {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleWithPermissions extends Role {
  permissions: Array<{
    id: string;
    name: string;
    resource: string;
    action: string;
  }>;
}
