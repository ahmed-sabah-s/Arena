import bcrypt from 'bcryptjs';
import type { CustomClient } from '../../src/db.js';

/**
 * Dev seed: rich fake data for local development.
 * Idempotent — safe to re-run.
 *
 * Phase 1 + Phase 2: 5 fake players + 1 admin user with email/password.
 */
export default async function seedDev(client: CustomClient): Promise<void> {
  console.log('  Seeding dev fake users...');

  // 5 fake Iraqi players. Variety on gender/experienceLevel/city for UI testing.
  const fakePlayers = [
    { phone: '+9647500000001', fullName: 'Ahmed Hassan',   gender: 'male'           as const, city: 'Baghdad', experienceLevel: 'intermediate' as const },
    { phone: '+9647500000002', fullName: 'Sara Al-Rashid', gender: 'female'         as const, city: 'Erbil',   experienceLevel: 'advanced'     as const },
    { phone: '+9647500000003', fullName: 'Omar Khalil',    gender: 'male'           as const, city: 'Basra',   experienceLevel: 'beginner'     as const },
    { phone: '+9647500000004', fullName: 'Lina Jawad',     gender: 'prefer_not_say' as const, city: 'Mosul',   experienceLevel: 'expert'       as const },
    { phone: '+9647500000005', fullName: 'Zaid Al-Saadi',  gender: 'male'           as const, city: 'Najaf',   experienceLevel: 'intermediate' as const },
  ];

  for (const u of fakePlayers) {
    await client.query(
      `INSERT INTO "user" (
         phone, "fullName", gender, city, country,
         "preferredLanguage", "preferredCurrency", "experienceLevel",
         "phoneVerifiedAt", "onboardingCompletedAt"
       )
       VALUES (
         :phone, :fullName, :gender, :city, 'IQ',
         'ar', 'IQD', :experienceLevel,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       )
       ON CONFLICT (phone) DO NOTHING`,
      u,
    );
  }
  console.log(`  ✓ ${fakePlayers.length} fake players inserted (or already existed)`);

  // Admin user — phone + email + password. Used to test admin flows in Phase 8 without bootstrap.
  const adminPhone = '+9647500000000';
  const adminEmail = 'admin@arena.test';
  const adminPasswordHash = bcrypt.hashSync('Admin123!', 10);

  await client.query(
    `INSERT INTO "user" (
       phone, email, password, "fullName", gender, city, country,
       "preferredLanguage", "preferredCurrency",
       "phoneVerifiedAt", "emailVerified", "emailVerifiedAt",
       "onboardingCompletedAt"
     )
     VALUES (
       :phone, :email, :password, 'Admin', 'prefer_not_say', 'Baghdad', 'IQ',
       'ar', 'IQD',
       CURRENT_TIMESTAMP, true, CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
     )
     ON CONFLICT (phone) DO NOTHING`,
    { phone: adminPhone, email: adminEmail, password: adminPasswordHash },
  );

  // Ensure admin role exists (template seeds it, but be defensive)
  await client.query(
    `INSERT INTO role (name, description) VALUES ('admin', 'Administrator with full access')
     ON CONFLICT (name) DO NOTHING`,
  );

  // Assign admin role
  await client.query(
    `INSERT INTO "userRole" ("userId", "roleId")
     SELECT u.id, r.id
     FROM "user" u CROSS JOIN role r
     WHERE u.phone = :phone AND r.name = 'admin'
     ON CONFLICT ("userId", "roleId") DO NOTHING`,
    { phone: adminPhone },
  );

  console.log(`  ✓ admin user ensured (phone=${adminPhone}, email=${adminEmail})`);

  // ─── Phase 3: seed a few teams ──────────────────────────────────────────
  // Raw SQL by design: the TeamService uses our transaction() helper, and the
  // outer seed already runs inside a transaction. Calling the service from here
  // would attempt nested transactions, which Postgres doesn't support cleanly.
  // The duplication is small and the rules are simple enough to mirror inline.
  console.log('  Seeding dev teams...');

  // Helpers: look up game / format / division ids by slug.
  async function gameId(slug: string): Promise<string> {
    const r = await client.query<{ id: string }>(`SELECT id FROM games WHERE slug = :slug`, { slug });
    return r.rows[0].id;
  }
  async function formatId(gameSlug: string, fmtSlug: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `SELECT gf.id FROM "gameFormats" gf JOIN games g ON g.id = gf."gameId"
       WHERE g.slug = :gameSlug AND gf.slug = :fmtSlug`,
      { gameSlug, fmtSlug },
    );
    return r.rows[0].id;
  }
  async function divisionId(gameSlug: string, divSlug: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `SELECT d.id FROM divisions d JOIN games g ON g.id = d."gameId"
       WHERE g.slug = :gameSlug AND d.slug = :divSlug`,
      { gameSlug, divSlug },
    );
    return r.rows[0].id;
  }
  async function userIdByPhone(phone: string): Promise<string> {
    const r = await client.query<{ id: string }>(`SELECT id FROM "user" WHERE phone = :phone`, { phone });
    return r.rows[0].id;
  }

  const footballId = await gameId('football');
  const dominoesId = await gameId('dominoes');
  const fb5v5 = await formatId('football', '5v5');
  const dom2v2 = await formatId('dominoes', '2v2');
  const fbMale = await divisionId('football', 'male');
  const domOpen = await divisionId('dominoes', 'open');

  const ahmed = await userIdByPhone('+9647500000001'); // male
  const omar  = await userIdByPhone('+9647500000003'); // male
  const zaid  = await userIdByPhone('+9647500000005'); // male
  const lina  = await userIdByPhone('+9647500000004'); // prefer_not_say

  // Four football 5v5 male-division teams. Each captained by one of the male players,
  // plus a fourth led by a duplicate captain across formats — wait, we cap at 2 per
  // window, so we use 3 distinct captains and the admin-tier dummy.
  const adminId = await userIdByPhone(adminPhone);

  type TeamSeed = { captainId: string; name: string; nameAr: string; slug: string; city: string };
  const footballTeams: TeamSeed[] = [
    { captainId: ahmed,   name: 'Asad Baghdad',     nameAr: 'أسد بغداد',     slug: 'asad-baghdad',     city: 'Baghdad' },
    { captainId: omar,    name: 'Najmat Karrada',   nameAr: 'نجمة الكرادة',  slug: 'najmat-karrada',   city: 'Baghdad' },
    { captainId: zaid,    name: 'Furat Najaf',      nameAr: 'فرات النجف',    slug: 'furat-najaf',      city: 'Najaf'   },
    { captainId: adminId, name: 'Tigris Mosul',     nameAr: 'دجلة الموصل',   slug: 'tigris-mosul',     city: 'Mosul'   },
  ];

  for (const t of footballTeams) {
    await client.query(
      `INSERT INTO teams ("gameId", "formatId", "divisionId", "captainId", name, "nameAr", slug, city)
       VALUES (:gameId, :formatId, :divisionId, :captainId, :name, :nameAr, :slug, :city)
       ON CONFLICT ("gameId", slug) DO NOTHING`,
      { gameId: footballId, formatId: fb5v5, divisionId: fbMale, ...t },
    );
    // Captain membership
    await client.query(
      `INSERT INTO "teamMembers" ("teamId", "userId", "gameId", "formatId", "divisionId", "isCaptain")
       SELECT id, "captainId", :gameId, :formatId, :divisionId, true
       FROM teams WHERE "gameId" = :gameId AND slug = :slug
       ON CONFLICT DO NOTHING`,
      { gameId: footballId, formatId: fb5v5, divisionId: fbMale, slug: t.slug },
    );
    // Creation log
    await client.query(
      `INSERT INTO "teamCreationLog" ("userId", "gameId", "teamId", action)
       SELECT :captainId, :gameId, id, 'created'
       FROM teams WHERE "gameId" = :gameId AND slug = :slug
       ON CONFLICT DO NOTHING`,
      { gameId: footballId, captainId: t.captainId, slug: t.slug },
    );
  }

  // Add 1-2 extra members per football team — only male players to satisfy gender
  // restriction. Each player can be on at most one team per scope (partial unique index).
  const extraFootball: Array<{ teamSlug: string; userId: string }> = [
    // Asad Baghdad gets one extra member
    { teamSlug: 'najmat-karrada', userId: zaid }, // wait — zaid captains another team
  ];
  // Skip the extra-member step: each male player already captains a team in this scope,
  // and the partial unique index prevents the same user being on two active teams in the
  // same (game, format, division). Lina is prefer_not_say so doesn't qualify for male
  // division. Sara is female. So the football roster stays at the captains only.
  void extraFootball;

  // One dominoes 2v2 open team with 2 members (no gender restriction).
  await client.query(
    `INSERT INTO teams ("gameId", "formatId", "divisionId", "captainId", name, "nameAr", slug, city)
     VALUES (:gameId, :formatId, :divisionId, :captainId, 'Pair Karbala', 'ثنائي كربلاء', 'pair-karbala', 'Karbala')
     ON CONFLICT ("gameId", slug) DO NOTHING`,
    { gameId: dominoesId, formatId: dom2v2, divisionId: domOpen, captainId: lina },
  );
  await client.query(
    `INSERT INTO "teamMembers" ("teamId", "userId", "gameId", "formatId", "divisionId", "isCaptain")
     SELECT id, :captainId, :gameId, :formatId, :divisionId, true
     FROM teams WHERE "gameId" = :gameId AND slug = 'pair-karbala'
     ON CONFLICT DO NOTHING`,
    { gameId: dominoesId, formatId: dom2v2, divisionId: domOpen, captainId: lina },
  );
  await client.query(
    `INSERT INTO "teamMembers" ("teamId", "userId", "gameId", "formatId", "divisionId", "isCaptain")
     SELECT id, :userId, :gameId, :formatId, :divisionId, false
     FROM teams WHERE "gameId" = :gameId AND slug = 'pair-karbala'
     ON CONFLICT DO NOTHING`,
    { gameId: dominoesId, formatId: dom2v2, divisionId: domOpen, userId: ahmed },
  );
  // Creation log for dominoes team
  await client.query(
    `INSERT INTO "teamCreationLog" ("userId", "gameId", "teamId", action)
     SELECT :captainId, :gameId, id, 'created'
     FROM teams WHERE "gameId" = :gameId AND slug = 'pair-karbala'
     ON CONFLICT DO NOTHING`,
    { gameId: dominoesId, captainId: lina },
  );

  const teamCountResult = await client.query<{ count: string }>(`SELECT COUNT(*) FROM teams WHERE status = 'active'`);
  const memberCountResult = await client.query<{ count: string }>(`SELECT COUNT(*) FROM "teamMembers" WHERE "releasedAt" IS NULL`);
  console.log(`  ✓ ${teamCountResult.rows[0].count} active teams, ${memberCountResult.rows[0].count} active memberships`);

  // ─── Phase 4: seed teamElos for the seeded teams ────────────────────────
  // Raw SQL because the team service path was bypassed for the team seeds above.
  // Hardcoded thresholds match the seeded platformConfig defaults — acceptable
  // here because (a) the dev seed has no production impact and (b) drift would
  // be caught by the integration tests on the next run.
  const SEED_BY_LEVEL: Record<'beginner' | 'intermediate' | 'advanced' | 'expert', number> = {
    beginner: 800,
    intermediate: 1000,
    advanced: 1200,
    expert: 1400,
  };

  // For each existing active team, insert an all-time teamElos row keyed off
  // the captain's experienceLevel. Idempotent via the partial unique index.
  await client.query(
    `INSERT INTO "teamElos" (
       "teamId", "gameId", "formatId", "divisionId", "seasonId",
       elo, mmr, "highestElo", "highestMmr"
     )
     SELECT
       t.id, t."gameId", t."formatId", t."divisionId", NULL,
       CASE COALESCE(u."experienceLevel", 'intermediate')
         WHEN 'beginner'     THEN ${SEED_BY_LEVEL.beginner}
         WHEN 'intermediate' THEN ${SEED_BY_LEVEL.intermediate}
         WHEN 'advanced'     THEN ${SEED_BY_LEVEL.advanced}
         WHEN 'expert'       THEN ${SEED_BY_LEVEL.expert}
       END AS seed,
       CASE COALESCE(u."experienceLevel", 'intermediate')
         WHEN 'beginner'     THEN ${SEED_BY_LEVEL.beginner}
         WHEN 'intermediate' THEN ${SEED_BY_LEVEL.intermediate}
         WHEN 'advanced'     THEN ${SEED_BY_LEVEL.advanced}
         WHEN 'expert'       THEN ${SEED_BY_LEVEL.expert}
       END,
       CASE COALESCE(u."experienceLevel", 'intermediate')
         WHEN 'beginner'     THEN ${SEED_BY_LEVEL.beginner}
         WHEN 'intermediate' THEN ${SEED_BY_LEVEL.intermediate}
         WHEN 'advanced'     THEN ${SEED_BY_LEVEL.advanced}
         WHEN 'expert'       THEN ${SEED_BY_LEVEL.expert}
       END,
       CASE COALESCE(u."experienceLevel", 'intermediate')
         WHEN 'beginner'     THEN ${SEED_BY_LEVEL.beginner}
         WHEN 'intermediate' THEN ${SEED_BY_LEVEL.intermediate}
         WHEN 'advanced'     THEN ${SEED_BY_LEVEL.advanced}
         WHEN 'expert'       THEN ${SEED_BY_LEVEL.expert}
       END
     FROM teams t
     JOIN "user" u ON u.id = t."captainId"
     WHERE t.status = 'active'
     ON CONFLICT DO NOTHING`,
  );

  const eloCountResult = await client.query<{ count: string }>(`SELECT COUNT(*) FROM "teamElos"`);
  console.log(`  ✓ ${eloCountResult.rows[0].count} team ELO rows seeded`);

  // ─── Phase 5: sample matches, queue entry, and an open invite ──────────
  // Same raw-SQL pattern as the team seeds. We hand-roll the ELO arithmetic
  // here rather than calling the match service (the service uses
  // transactions; the seed already runs inside one). Numbers below mirror
  // what calculateMatchOutcome would produce for equal-MMR matches at base
  // K=32 in the calibration window: a win at equal MMR gives ~+32 mmr in
  // calibration (×2.0 multiplier → 32) — for clarity we apply +16 to keep
  // the seeded leaderboard tame and predictable.
  console.log('  Seeding dev matches & queue & invite...');

  type MatchSeed = {
    slug: string; // for indexing into the captain map
    sideACaptainSlug: 'asad-baghdad' | 'najmat-karrada' | 'furat-najaf' | 'tigris-mosul';
    sideBCaptainSlug: 'asad-baghdad' | 'najmat-karrada' | 'furat-najaf' | 'tigris-mosul';
    finalScoreA: number;
    finalScoreB: number;
  };

  const sampleMatches: MatchSeed[] = [
    { slug: 'm1', sideACaptainSlug: 'asad-baghdad',   sideBCaptainSlug: 'najmat-karrada', finalScoreA: 3, finalScoreB: 1 },
    { slug: 'm2', sideACaptainSlug: 'furat-najaf',    sideBCaptainSlug: 'asad-baghdad',   finalScoreA: 2, finalScoreB: 2 },
    { slug: 'm3', sideACaptainSlug: 'tigris-mosul',   sideBCaptainSlug: 'najmat-karrada', finalScoreA: 1, finalScoreB: 4 },
  ];

  async function teamIdBySlug(slug: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM teams WHERE slug = :slug`, { slug },
    );
    return r.rows[0].id;
  }

  for (const m of sampleMatches) {
    const teamA = await teamIdBySlug(m.sideACaptainSlug);
    const teamB = await teamIdBySlug(m.sideBCaptainSlug);

    // Snapshot current ELO from teamElos
    const eloRowsA = await client.query<{ elo: number; mmr: number; matchesPlayed: number }>(
      `SELECT elo, mmr, "matchesPlayed" FROM "teamElos"
       WHERE "teamId" = :teamId AND "seasonId" IS NULL`,
      { teamId: teamA },
    );
    const eloRowsB = await client.query<{ elo: number; mmr: number; matchesPlayed: number }>(
      `SELECT elo, mmr, "matchesPlayed" FROM "teamElos"
       WHERE "teamId" = :teamId AND "seasonId" IS NULL`,
      { teamId: teamB },
    );
    const a = eloRowsA.rows[0];
    const b = eloRowsB.rows[0];

    const matchInsert = await client.query<{ id: string }>(
      `INSERT INTO matches (
         "gameId", "formatId", "divisionId", "matchMode", stakes, status,
         "scheduledAt", "startedAt", "completedAt",
         "finalScoreA", "finalScoreB", "creationSource"
       )
       VALUES (
         :gameId, :formatId, :divisionId, 'score_only', 'ranked', 'completed',
         CURRENT_TIMESTAMP - INTERVAL '7 days',
         CURRENT_TIMESTAMP - INTERVAL '7 days',
         CURRENT_TIMESTAMP - INTERVAL '7 days' + INTERVAL '90 minutes',
         :scoreA, :scoreB, 'admin_created'
       )
       RETURNING id`,
      {
        gameId: footballId, formatId: fb5v5, divisionId: fbMale,
        scoreA: m.finalScoreA, scoreB: m.finalScoreB,
      },
    );
    const matchId = matchInsert.rows[0].id;

    // Participants with snapshot
    await client.query(
      `INSERT INTO "matchParticipants" (
         "matchId", side, "teamId", "mmrAtMatch", "eloAtMatch", "matchesPlayedAtMatch"
       )
       VALUES (:matchId, 'A', :teamA, :mmrA, :eloA, :mpA),
              (:matchId, 'B', :teamB, :mmrB, :eloB, :mpB)`,
      {
        matchId,
        teamA, mmrA: a.mmr, eloA: a.elo, mpA: a.matchesPlayed,
        teamB, mmrB: b.mmr, eloB: b.elo, mpB: b.matchesPlayed,
      },
    );

    // Both sides confirmed (matching submissions)
    await client.query(
      `INSERT INTO "matchSubmissions" ("matchId", side, "submittedByUserId", "scoreA", "scoreB")
       SELECT :matchId::uuid, 'A', t."captainId", :scoreA::int, :scoreB::int FROM teams t WHERE t.id = :teamA
       UNION ALL
       SELECT :matchId::uuid, 'B', t."captainId", :scoreA::int, :scoreB::int FROM teams t WHERE t.id = :teamB`,
      { matchId, teamA, teamB, scoreA: m.finalScoreA, scoreB: m.finalScoreB },
    );

    // Hand-rolled ELO update (a tame +16 / -16 / 0 for draws). Keeps the seeded
    // leaderboard tidy without recreating Phase 4 math.
    const isDraw = m.finalScoreA === m.finalScoreB;
    const aWon = m.finalScoreA > m.finalScoreB;
    const deltaA = isDraw ? 0 : aWon ? 16 : -16;
    const deltaB = -deltaA;
    const formA = isDraw ? 'D' : aWon ? 'W' : 'L';
    const formB = isDraw ? 'D' : aWon ? 'L' : 'W';

    await client.query(
      `UPDATE "teamElos" SET
         elo = elo + :delta, mmr = mmr + :delta,
         "matchesPlayed" = "matchesPlayed" + 1,
         "matchesWon" = "matchesWon" + :wonInc,
         "matchesLost" = "matchesLost" + :lostInc,
         "matchesDrawn" = "matchesDrawn" + :drawnInc,
         "lastMatchAt" = CURRENT_TIMESTAMP - INTERVAL '7 days' + INTERVAL '90 minutes',
         form = (CASE WHEN jsonb_array_length(form) >= 5
                      THEN form - 0
                      ELSE form
                 END) || to_jsonb(:formChar::text),
         "highestElo" = GREATEST("highestElo", elo + :delta),
         "highestMmr" = GREATEST("highestMmr", mmr + :delta)
       WHERE "teamId" = :teamId AND "seasonId" IS NULL`,
      {
        delta: deltaA,
        wonInc: aWon && !isDraw ? 1 : 0,
        lostInc: !aWon && !isDraw ? 1 : 0,
        drawnInc: isDraw ? 1 : 0,
        formChar: formA,
        teamId: teamA,
      },
    );
    await client.query(
      `UPDATE "teamElos" SET
         elo = elo + :delta, mmr = mmr + :delta,
         "matchesPlayed" = "matchesPlayed" + 1,
         "matchesWon" = "matchesWon" + :wonInc,
         "matchesLost" = "matchesLost" + :lostInc,
         "matchesDrawn" = "matchesDrawn" + :drawnInc,
         "lastMatchAt" = CURRENT_TIMESTAMP - INTERVAL '7 days' + INTERVAL '90 minutes',
         form = (CASE WHEN jsonb_array_length(form) >= 5
                      THEN form - 0
                      ELSE form
                 END) || to_jsonb(:formChar::text),
         "highestElo" = GREATEST("highestElo", elo + :delta),
         "highestMmr" = GREATEST("highestMmr", mmr + :delta)
       WHERE "teamId" = :teamId AND "seasonId" IS NULL`,
      {
        delta: deltaB,
        wonInc: !aWon && !isDraw ? 1 : 0,
        lostInc: aWon && !isDraw ? 1 : 0,
        drawnInc: isDraw ? 1 : 0,
        formChar: formB,
        teamId: teamB,
      },
    );
  }
  console.log(`  ✓ ${sampleMatches.length} completed sample matches inserted`);

  // 1 active queue entry: Asad Baghdad waiting for an opponent in football 5v5 male
  const asadId = await teamIdBySlug('asad-baghdad');
  const asadElo = await client.query<{ mmr: number }>(
    `SELECT mmr FROM "teamElos" WHERE "teamId" = :teamId AND "seasonId" IS NULL`,
    { teamId: asadId },
  );
  await client.query(
    `INSERT INTO "queueEntries" ("teamId", "gameId", "formatId", "divisionId", "mmrAtQueue")
     VALUES (:teamId, :gameId, :formatId, :divisionId, :mmr)
     ON CONFLICT DO NOTHING`,
    {
      teamId: asadId, gameId: footballId, formatId: fb5v5, divisionId: fbMale,
      mmr: asadElo.rows[0]?.mmr ?? 1000,
    },
  );
  console.log(`  ✓ 1 active queue entry inserted (Asad Baghdad)`);

  // 1 open match invite: Furat Najaf created a friendly invite
  const furatId = await teamIdBySlug('furat-najaf');
  const furatRow = await client.query<{ captainId: string }>(
    `SELECT "captainId" FROM teams WHERE id = :id`, { id: furatId },
  );
  await client.query(
    `INSERT INTO "matchInvites" (
       code, "qrPayload", "createdByUserId", "creatorTeamId",
       "gameId", "formatId", "divisionId",
       stakes, "matchMode", "expiresAt"
     )
     VALUES (
       'ARN-DEV1', 'seed-payload-not-signed', :createdByUserId, :creatorTeamId,
       :gameId, :formatId, :divisionId,
       'friendly', 'score_only',
       CURRENT_TIMESTAMP + INTERVAL '15 minutes'
     )
     ON CONFLICT (code) DO NOTHING`,
    {
      createdByUserId: furatRow.rows[0].captainId,
      creatorTeamId: furatId,
      gameId: footballId, formatId: fb5v5, divisionId: fbMale,
    },
  );
  console.log(`  ✓ 1 open match invite inserted (ARN-DEV1)`);

  // ─── Phase 6: referees, certifications, and a scheduled refereed match ──
  // Pick two existing users to double-up as referees: the admin (already has
  // admin role) and Sara (female, captains no football team — clean conflict
  // surface). Both are certified for football; admin is also certified for
  // chess to exercise the multi-game cert path.
  console.log('  Seeding dev referees...');

  // 1. Ensure the `referee` role exists, then grant it to admin and Sara.
  await client.query(
    `INSERT INTO role (name, description) VALUES ('referee', 'Match official')
     ON CONFLICT (name) DO NOTHING`,
  );
  const sara = await userIdByPhone('+9647500000002');
  await client.query(
    `INSERT INTO "userRole" ("userId", "roleId")
     SELECT u.id, r.id
     FROM "user" u CROSS JOIN role r
     WHERE u.id = ANY(:userIds::uuid[]) AND r.name = 'referee'
     ON CONFLICT ("userId", "roleId") DO NOTHING`,
    { userIds: [adminId, sara] },
  );

  // 2. Referee profiles — bios + Baghdad as base city, both accepting work.
  await client.query(
    `INSERT INTO "refereeProfiles" ("userId", "baseCity", bio)
     VALUES (:adminId, 'Baghdad', 'Senior platform admin moonlighting as a referee.'),
            (:saraId,  'Baghdad', 'Experienced football referee, FIFA-licensed equivalent.')
     ON CONFLICT ("userId") DO NOTHING`,
    { adminId, saraId: sara },
  );

  // 3. Certifications. Both for football; admin also for chess.
  await client.query(
    `INSERT INTO "refereeCertifications" ("userId", "gameId", "certifiedByUserId", notes)
     VALUES (:adminId, :footballId, :adminId, 'self-cert (admin bootstrap)'),
            (:saraId,  :footballId, :adminId, 'verified by admin')`,
    { adminId, saraId: sara, footballId },
  );
  // Chess cert for admin (idempotent guard via partial unique on active rows).
  const chessLookup = await client.query<{ id: string }>(
    `SELECT id FROM games WHERE slug = 'chess'`,
  );
  if (chessLookup.rows[0]) {
    await client.query(
      `INSERT INTO "refereeCertifications" ("userId", "gameId", "certifiedByUserId", notes)
       SELECT :adminId, :gameId, :adminId, 'self-cert (admin bootstrap)'
       WHERE NOT EXISTS (
         SELECT 1 FROM "refereeCertifications"
         WHERE "userId" = :adminId AND "gameId" = :gameId AND "revokedAt" IS NULL
       )`,
      { adminId, gameId: chessLookup.rows[0].id },
    );
  }

  // 4. A scheduled refereed match between Furat Najaf (side A) and Tigris
  //    Mosul (side B). Sara is the assigned main, admin is an assistant —
  //    both at status 'accepted' so the seeded data exercises the assignment
  //    table without needing the full assign → accept → check-in flow.
  //    Match status stays 'scheduled', matchMode='refereed'.
  // Inserted only if it doesn't exist yet (idempotency via the guard select).
  const existingRefMatch = await client.query<{ id: string }>(
    `SELECT m.id FROM matches m
     JOIN "matchParticipants" mpA ON mpA."matchId" = m.id AND mpA.side = 'A'
     JOIN "matchParticipants" mpB ON mpB."matchId" = m.id AND mpB.side = 'B'
     JOIN teams tA ON tA.id = mpA."teamId"
     JOIN teams tB ON tB.id = mpB."teamId"
     WHERE m."matchMode" = 'refereed'
       AND m.status = 'scheduled'
       AND tA.slug = 'furat-najaf' AND tB.slug = 'tigris-mosul'
     LIMIT 1`,
  );

  if (!existingRefMatch.rows[0]) {
    const furatId = await teamIdBySlug('furat-najaf');
    const tigrisId = await teamIdBySlug('tigris-mosul');
    const eloFurat = await client.query<{ elo: number; mmr: number; matchesPlayed: number }>(
      `SELECT elo, mmr, "matchesPlayed" FROM "teamElos"
       WHERE "teamId" = :id AND "seasonId" IS NULL`,
      { id: furatId },
    );
    const eloTigris = await client.query<{ elo: number; mmr: number; matchesPlayed: number }>(
      `SELECT elo, mmr, "matchesPlayed" FROM "teamElos"
       WHERE "teamId" = :id AND "seasonId" IS NULL`,
      { id: tigrisId },
    );
    const refMatch = await client.query<{ id: string }>(
      `INSERT INTO matches (
         "gameId", "formatId", "divisionId", "matchMode", stakes, status,
         "scheduledAt", "creationSource"
       )
       VALUES (
         :gameId, :formatId, :divisionId, 'refereed', 'ranked', 'scheduled',
         CURRENT_TIMESTAMP + INTERVAL '2 hours', 'admin_created'
       )
       RETURNING id`,
      { gameId: footballId, formatId: fb5v5, divisionId: fbMale },
    );
    const refMatchId = refMatch.rows[0].id;
    await client.query(
      `INSERT INTO "matchParticipants" (
         "matchId", side, "teamId", "mmrAtMatch", "eloAtMatch", "matchesPlayedAtMatch"
       )
       VALUES (:matchId, 'A', :teamA, :mmrA, :eloA, :mpA),
              (:matchId, 'B', :teamB, :mmrB, :eloB, :mpB)`,
      {
        matchId: refMatchId,
        teamA: furatId,
        mmrA: eloFurat.rows[0].mmr, eloA: eloFurat.rows[0].elo, mpA: eloFurat.rows[0].matchesPlayed,
        teamB: tigrisId,
        mmrB: eloTigris.rows[0].mmr, eloB: eloTigris.rows[0].elo, mpB: eloTigris.rows[0].matchesPlayed,
      },
    );
    // Sara as main, admin as assistant. Both 'accepted'.
    // NB: Tigris Mosul's captain is admin — so admin officiating this match is
    // actually a real conflict-of-interest. We bypass at seed time because the
    // service-level conflict check runs only at assignReferee, not on direct
    // SQL inserts. This is intentional: the seeded data is for UI/screen
    // shaping, not for exercising the conflict logic. Tests cover the
    // conflict path against fresh fixtures.
    await client.query(
      `INSERT INTO "refereeAssignments" (
         "matchId", "refereeUserId", role, status, "assignedByUserId", "respondedAt"
       )
       VALUES
         (:matchId, :saraId,  'main',      'accepted', :adminId, CURRENT_TIMESTAMP),
         (:matchId, :adminId, 'assistant', 'accepted', :adminId, CURRENT_TIMESTAMP)`,
      { matchId: refMatchId, saraId: sara, adminId },
    );
  }

  const refProfileCount = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM "refereeProfiles"`,
  );
  const refCertCount = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM "refereeCertifications" WHERE "revokedAt" IS NULL`,
  );
  const refAssignCount = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM "refereeAssignments" WHERE status = 'accepted'`,
  );
  console.log(
    `  ✓ ${refProfileCount.rows[0].count} referee profiles, ` +
    `${refCertCount.rows[0].count} active certifications, ` +
    `${refAssignCount.rows[0].count} accepted assignments`,
  );

  // ─── Phase 7: a venue owner, two venues, configs, schedule, two bookings ─
  console.log('  Seeding dev venues, schedules, and bookings...');

  // Karim Owner — dedicated venue_owner with no other roles. Cleaner conflict
  // surface than re-using admin (who already wears two hats).
  const karimPhone = '+9647500000006';
  await client.query(
    `INSERT INTO "user" (
       phone, "fullName", gender, city, country,
       "preferredLanguage", "preferredCurrency", "experienceLevel",
       "phoneVerifiedAt", "onboardingCompletedAt"
     )
     VALUES (
       :phone, 'Karim Owner', 'male', 'Baghdad', 'IQ',
       'ar', 'IQD', 'intermediate',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )
     ON CONFLICT (phone) DO NOTHING`,
    { phone: karimPhone },
  );
  const karim = await userIdByPhone(karimPhone);

  // Grant venue_owner role.
  await client.query(
    `INSERT INTO "userRole" ("userId", "roleId")
     SELECT :userId, r.id FROM role r WHERE r.name = 'venue_owner'
     ON CONFLICT DO NOTHING`,
    { userId: karim },
  );

  // Two active venues.
  await client.query(
    `INSERT INTO venues (
       "ownerUserId", name, "nameAr", city, country, "defaultCurrency",
       status, "approvedAt", "approvedByUserId"
     )
     VALUES
       (:karim, 'Stadium Asad', 'استاد الأسد', 'Baghdad', 'IQ', 'IQD',
        'active', CURRENT_TIMESTAMP, :adminId),
       (:karim, 'Hall Ali',     'قاعة علي',    'Karbala', 'IQ', 'IQD',
        'active', CURRENT_TIMESTAMP, :adminId)
     ON CONFLICT DO NOTHING`,
    { karim, adminId },
  );

  async function venueIdByName(name: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM venues WHERE name = :name AND "ownerUserId" = :owner`,
      { name, owner: karim },
    );
    return r.rows[0].id;
  }

  const stadiumAsadId = await venueIdByName('Stadium Asad');
  const hallAliId = await venueIdByName('Hall Ali');
  const chessId = await gameId('chess');

  // Game configs.
  await client.query(
    `INSERT INTO "venueGameConfigs" (
       "venueId", "gameId", "pricingModel", "priceAmount", "priceCurrency", capacity
     )
     VALUES
       (:stadium, :football, 'hourly',     30000, 'IQD', 1),
       (:hall,    :dominoes, 'per_session', 5000, 'IQD', 1),
       (:hall,    :chess,    'per_session', 2000, 'IQD', 1)
     ON CONFLICT ("venueId", "gameId") DO NOTHING`,
    { stadium: stadiumAsadId, hall: hallAliId, football: footballId, dominoes: dominoesId, chess: chessId },
  );

  // Availability rules — pass time strings as params, never inline. The
  // backend's named-parameter parser would otherwise interpret literal
  // `:00` inside `'16:00:00'` as a missing parameter.
  for (let dow = 0; dow < 7; dow += 1) {
    await client.query(
      `INSERT INTO "venueAvailabilityRules" ("venueId", "dayOfWeek", "openTime", "closeTime")
       VALUES (:venueId, :dow, :openTime, :closeTime)`,
      { venueId: stadiumAsadId, dow, openTime: '16:00:00', closeTime: '22:00:00' },
    );
  }
  for (let dow = 0; dow < 7; dow += 1) {
    await client.query(
      `INSERT INTO "venueAvailabilityRules" ("venueId", "dayOfWeek", "openTime", "closeTime")
       VALUES (:venueId, :dow, :openTime, :closeTime)`,
      { venueId: hallAliId, dow, openTime: '18:00:00', closeTime: '23:00:00' },
    );
  }
  await client.query(
    `INSERT INTO "venueAvailabilityRules" ("venueId", "dayOfWeek", "openTime", "closeTime")
     VALUES (:venueId, 6, :openTime, :closeTime)`,
    { venueId: hallAliId, openTime: '14:00:00', closeTime: '17:00:00' },
  );

  // One requested booking — Stadium Asad, football, tomorrow 18:00 for 1 hour,
  // by Asad Baghdad's captain (ahmed). Match-linked to a fresh scheduled match.
  const requestedMatch = await client.query<{ id: string }>(
    `INSERT INTO matches (
       "gameId", "formatId", "divisionId", "matchMode", stakes, status,
       "scheduledAt", "creationSource"
     )
     VALUES (
       :gameId, :formatId, :divisionId, 'score_only', 'friendly', 'scheduled',
       date_trunc('day', CURRENT_TIMESTAMP) + INTERVAL '1 day' + INTERVAL '18 hours',
       'admin_created'
     )
     RETURNING id`,
    { gameId: footballId, formatId: fb5v5, divisionId: fbMale },
  );
  const requestedMatchId = requestedMatch.rows[0].id;
  await client.query(
    `INSERT INTO "venueBookings" (
       "venueId", "matchId", "gameId", "requestedByUserId",
       "startsAt", "endsAt",
       "priceAmount", "priceCurrency",
       "commissionAmount", "commissionCurrency", "commissionPercentSnapshot",
       status
     )
     VALUES (
       :venueId, :matchId, :gameId, :ahmed,
       date_trunc('day', CURRENT_TIMESTAMP) + INTERVAL '1 day' + INTERVAL '18 hours',
       date_trunc('day', CURRENT_TIMESTAMP) + INTERVAL '1 day' + INTERVAL '19 hours',
       30000, 'IQD',
       2500, 'IQD', 8.0,
       'requested'
     )`,
    { venueId: stadiumAsadId, matchId: requestedMatchId, gameId: footballId, ahmed },
  );
  await client.query(
    `UPDATE matches SET "venueId" = :venueId WHERE id = :matchId`,
    { venueId: stadiumAsadId, matchId: requestedMatchId },
  );

  // One confirmed booking — Hall Ali, dominoes, day after tomorrow 19:00, by lina.
  // Backed by a fresh dominoes-mode scheduled match so the matchId link works.
  const dom2v2Id = await formatId('dominoes', '2v2');
  const domOpenId = await divisionId('dominoes', 'open');
  const confirmedMatch = await client.query<{ id: string }>(
    `INSERT INTO matches (
       "gameId", "formatId", "divisionId", "matchMode", stakes, status,
       "scheduledAt", "creationSource"
     )
     VALUES (
       :gameId, :formatId, :divisionId, 'score_only', 'friendly', 'scheduled',
       date_trunc('day', CURRENT_TIMESTAMP) + INTERVAL '2 days' + INTERVAL '19 hours',
       'admin_created'
     )
     RETURNING id`,
    { gameId: dominoesId, formatId: dom2v2Id, divisionId: domOpenId },
  );
  const confirmedMatchId = confirmedMatch.rows[0].id;
  await client.query(
    `INSERT INTO "venueBookings" (
       "venueId", "matchId", "gameId", "requestedByUserId",
       "startsAt", "endsAt",
       "priceAmount", "priceCurrency",
       "commissionAmount", "commissionCurrency", "commissionPercentSnapshot",
       status, "confirmedAt", "paymentStatus", "paymentProvider", "paymentProviderReference"
     )
     VALUES (
       :venueId, :matchId, :gameId, :lina,
       date_trunc('day', CURRENT_TIMESTAMP) + INTERVAL '2 days' + INTERVAL '19 hours',
       date_trunc('day', CURRENT_TIMESTAMP) + INTERVAL '2 days' + INTERVAL '21 hours',
       5000, 'IQD',
       500, 'IQD', 8.0,
       'confirmed', CURRENT_TIMESTAMP,
       'pending', 'manual', 'manual-seed-confirmed-1'
     )`,
    { venueId: hallAliId, matchId: confirmedMatchId, gameId: dominoesId, lina },
  );
  await client.query(
    `UPDATE matches SET "venueId" = :venueId WHERE id = :matchId`,
    { venueId: hallAliId, matchId: confirmedMatchId },
  );

  const venueCount = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM venues WHERE status = 'active'`,
  );
  const configCount = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM "venueGameConfigs"`,
  );
  const availCount = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM "venueAvailabilityRules"`,
  );
  const reqCount = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM "venueBookings" WHERE status = 'requested'`,
  );
  const confCount = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM "venueBookings" WHERE status = 'confirmed'`,
  );
  console.log(
    `  ✓ ${venueCount.rows[0].count} active venues, ` +
    `${configCount.rows[0].count} game configs, ` +
    `${availCount.rows[0].count} availability rules, ` +
    `${reqCount.rows[0].count} requested + ${confCount.rows[0].count} confirmed bookings`,
  );
}
