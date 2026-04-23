-- Seed Data for Clean Architecture Template
-- Run after schema.sql

INSERT INTO permission (name, resource, action, description) VALUES
('users.create', 'users', 'create', 'Create new users'),
('users.read', 'users', 'read', 'View user information'),
('users.update', 'users', 'update', 'Update user information'),
('users.delete', 'users', 'delete', 'Delete users'),
('roles.create', 'roles', 'create', 'Create new roles'),
('roles.read', 'roles', 'read', 'View roles'),
('roles.update', 'roles', 'update', 'Update roles'),
('roles.delete', 'roles', 'delete', 'Delete roles'),
('permissions.create', 'permissions', 'create', 'Create new permissions'),
('permissions.read', 'permissions', 'read', 'View permissions'),
('files.upload', 'files', 'upload', 'Upload files'),
('files.read', 'files', 'read', 'View and download files'),
('files.delete', 'files', 'delete', 'Delete files'),
('auth.2fa', 'auth', '2fa', 'Enable/disable 2FA'),
('auth.reset-password', 'auth', 'reset-password', 'Reset password')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role (name, description) VALUES
('admin', 'Administrator with full access'),
('user', 'Regular user with limited access')
ON CONFLICT (name) DO NOTHING;

-- Assign all permissions to admin role
INSERT INTO "rolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM role r
CROSS JOIN permission p
WHERE r.name = 'admin'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Assign limited permissions to user role
INSERT INTO "rolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM role r
CROSS JOIN permission p
WHERE r.name = 'user' AND p.name IN ('users.read', 'files.upload', 'auth.2fa', 'auth.reset-password')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Create default admin user (password: Admin123!) — hashes generated with bcryptjs 10 rounds
INSERT INTO "user" (email, password, name, "emailVerified")
VALUES (
    'admin@example.com',
    '$2a$10$aCPyTs3ZZdxOFgGBEgFitOhO.OL9ou9ccYV55GpMBbdJpr8bZ52DG',
    'Admin User',
    true
) ON CONFLICT (email) DO NOTHING;

-- Create default regular user (password: Test123!) — hashes generated with bcryptjs 10 rounds
INSERT INTO "user" (email, password, name, "emailVerified")
VALUES (
    'user@example.com',
    '$2a$10$7Km7XAVG9z4fKLFhSyhKluUjEpGbPjJ42NUsIO4Cnd1undmyxFMza',
    'Test User',
    true
) ON CONFLICT (email) DO NOTHING;

-- Assign admin role to admin user
INSERT INTO "userRole" ("userId", "roleId")
SELECT u.id, r.id
FROM "user" u
CROSS JOIN role r
WHERE u.email = 'admin@example.com' AND r.name = 'admin'
ON CONFLICT ("userId", "roleId") DO NOTHING;

-- Assign user role to regular user
INSERT INTO "userRole" ("userId", "roleId")
SELECT u.id, r.id
FROM "user" u
CROSS JOIN role r
WHERE u.email = 'user@example.com' AND r.name = 'user'
ON CONFLICT ("userId", "roleId") DO NOTHING;
