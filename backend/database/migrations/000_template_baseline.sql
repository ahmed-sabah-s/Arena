-- Clean Architecture Database Schema
-- PostgreSQL 14+
-- Naming: camelCase for tables and columns (aligns with backend/TypeScript).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "user" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar TEXT,
    phone VARCHAR(50),
    "isActive" BOOLEAN DEFAULT true,
    "emailVerified" BOOLEAN DEFAULT false,
    "emailVerifiedAt" TIMESTAMP,
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN DEFAULT false,
    "lastLoginAt" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email);

CREATE TABLE IF NOT EXISTS role (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_role_name ON role(name);

CREATE TABLE IF NOT EXISTS permission (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource, action)
);

CREATE INDEX IF NOT EXISTS idx_permission_resource_action ON permission(resource, action);

-- Junction: user ↔ role
CREATE TABLE IF NOT EXISTS "userRole" (
    "userId" UUID REFERENCES "user"(id) ON DELETE CASCADE,
    "roleId" UUID REFERENCES role(id) ON DELETE CASCADE,
    "assignedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId", "roleId")
);

CREATE INDEX IF NOT EXISTS idx_user_role_user_id ON "userRole"("userId");
CREATE INDEX IF NOT EXISTS idx_user_role_role_id ON "userRole"("roleId");

-- Junction: role ↔ permission
CREATE TABLE IF NOT EXISTS "rolePermission" (
    "roleId" UUID REFERENCES role(id) ON DELETE CASCADE,
    "permissionId" UUID REFERENCES permission(id) ON DELETE CASCADE,
    PRIMARY KEY ("roleId", "permissionId")
);

CREATE INDEX IF NOT EXISTS idx_role_permission_role_id ON "rolePermission"("roleId");
CREATE INDEX IF NOT EXISTS idx_role_permission_permission_id ON "rolePermission"("permissionId");

CREATE TABLE IF NOT EXISTS "refreshToken" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token TEXT UNIQUE NOT NULL,
    "userId" UUID REFERENCES "user"(id) ON DELETE CASCADE,
    "expiresAt" TIMESTAMP NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_token ON "refreshToken"(token);
CREATE INDEX IF NOT EXISTS idx_refresh_token_user_id ON "refreshToken"("userId");

CREATE TABLE IF NOT EXISTS file (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    url TEXT NOT NULL,
    bucket VARCHAR(255) NOT NULL,
    size INTEGER NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "uploadedBy" UUID,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_file_key ON file(key);

CREATE TABLE IF NOT EXISTS "auditLog" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID REFERENCES "user"(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    details JSONB,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON "auditLog"("userId");
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON "auditLog"(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON "auditLog"("createdAt");

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_updated_at ON "user";
CREATE TRIGGER update_user_updated_at BEFORE UPDATE ON "user"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_role_updated_at ON role;
CREATE TRIGGER update_role_updated_at BEFORE UPDATE ON role
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_permission_updated_at ON permission;
CREATE TRIGGER update_permission_updated_at BEFORE UPDATE ON permission
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
