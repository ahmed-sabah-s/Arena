-- Migration 030: Venues + venue_owner role.
-- A venue is a physical location where matches are played. It belongs to a
-- single owner (a user with the venue_owner role) and goes through an
-- admin-approval lifecycle before becoming bookable. Lat/lon are stored as
-- DECIMAL(10,7) — precise enough for map display; PostGIS-based proximity
-- search is a future optimization.
--
-- The venue is in the soft-delete tier alongside users and teams: `deletedAt`
-- nullable, partial indexes filter on `WHERE "deletedAt" IS NULL`.

CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "ownerUserId" UUID NOT NULL REFERENCES "user"(id),
  name VARCHAR(150) NOT NULL,
  "nameAr" VARCHAR(150),
  description TEXT,
  city VARCHAR(100) NOT NULL,
  district VARCHAR(100),
  address TEXT,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  country VARCHAR(2) NOT NULL DEFAULT 'IQ',
  "defaultCurrency" VARCHAR(3) NOT NULL DEFAULT 'IQD' REFERENCES currencies(code),
  "contactPhone" VARCHAR(50),
  "contactEmail" VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'active', 'paused', 'rejected', 'archived')),
  "approvedAt" TIMESTAMP,
  "approvedByUserId" UUID REFERENCES "user"(id),
  "rejectionReason" TEXT,
  "primaryPhotoFileId" UUID REFERENCES file(id),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP
);

DROP TRIGGER IF EXISTS update_venues_updated_at ON venues;
CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_venues_owner ON venues("ownerUserId");

CREATE INDEX IF NOT EXISTS idx_venues_active_in_city
  ON venues(city, status)
  WHERE status = 'active' AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_venues_status
  ON venues(status)
  WHERE "deletedAt" IS NULL;

-- ─── venue_owner role + minimal permission set ──────────────────────────────
-- The role grants access to the owner-side surface (manage own venues,
-- pricing, availability, bookings on those venues). Phase 8's admin work
-- will refine and expand the permission grid as needed.

INSERT INTO role (name, description) VALUES (
  'venue_owner',
  'Permission to manage venues, pricing, bookings, and view earnings on the venue owner portal.'
) ON CONFLICT (name) DO NOTHING;

INSERT INTO permission (name, resource, action, description) VALUES
  ('venue:create',           'venue',         'create',         'Create a new venue (becomes its owner).'),
  ('venue:read_own',         'venue',         'read_own',       'View venues owned by the caller.'),
  ('venue:update_own',       'venue',         'update_own',     'Update venues owned by the caller.'),
  ('venue:archive_own',      'venue',         'archive_own',    'Archive (retire) venues owned by the caller.'),
  ('venue:manage_pricing',   'venue',         'manage_pricing', 'Upsert per-game pricing on owned venues.'),
  ('venue:manage_schedule',  'venue',         'manage_schedule','Manage availability rules + blackouts on owned venues.'),
  ('booking:read_own',       'venue_booking', 'read_own',       'View bookings the caller requested.'),
  ('booking:read_venue',     'venue_booking', 'read_venue',     'View bookings on owned venues.'),
  ('booking:request',        'venue_booking', 'request',        'Request a booking at a venue.'),
  ('booking:respond',        'venue_booking', 'respond',        'Confirm or decline a booking on owned venues.'),
  ('booking:cancel',         'venue_booking', 'cancel',         'Cancel a booking the caller is party to.')
ON CONFLICT (name) DO NOTHING;

-- Grant the venue-owner-relevant permissions to the venue_owner role.
INSERT INTO "rolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM role r CROSS JOIN permission p
WHERE r.name = 'venue_owner'
  AND p.name IN (
    'venue:create',
    'venue:read_own',
    'venue:update_own',
    'venue:archive_own',
    'venue:manage_pricing',
    'venue:manage_schedule',
    'booking:read_venue',
    'booking:respond'
  )
ON CONFLICT DO NOTHING;
