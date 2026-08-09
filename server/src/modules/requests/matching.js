const prisma = require("../../config/db");
const { eligibleDonorGroups } = require("../../utils/bloodCompat");

// Donors are only matchable if the mobile app is installed on at least one of
// their devices. The reasoning: an alert is worthless if it can't interrupt
// someone. A browser tab that's closed — which is most of the time — cannot
// be notified, so a web-only donor would be silently unreachable while still
// occupying a slot in every search result, pushing genuinely reachable donors
// further down the list.
//
// Donors can still register and manage their profile entirely on the web;
// this only governs whether they enter the matching pool.
//
// Set REQUIRE_DONOR_MOBILE_APP=false to disable (useful for a web-only demo,
// or while migrating an existing donor base onto the app).
const requireMobileApp = process.env.REQUIRE_DONOR_MOBILE_APP !== "false";

/**
 * Finds compatible, available, eligible (90-day rule) donors for a request,
 * using Postgres's cube/earthdistance extensions so filtering/ranking
 * happens in the database rather than in app code.
 *
 * Every request is a broadcast; there are two mutually exclusive scopes:
 *   - radius (default): nearest donors within `radiusKm` of (lat, lng).
 *   - city: every eligible donor whose DonorProfile.city matches `city`
 *     (case-insensitive), regardless of distance — for "broadcast to
 *     everyone in Kochi" style requests (hospitals use their own saved
 *     city; independent receivers pick one per request).
 * Distance is still computed/returned when the donor has coordinates, purely
 * for display (closest-first ordering, ETA), even in city scope.
 *
 * @param {object} opts
 * @param {string} opts.requestId
 * @param {number} opts.lat
 * @param {number} opts.lng
 * @param {string} opts.bloodGroup - the RECIPIENT's blood group
 * @param {number} opts.radiusKm
 * @param {string} [opts.city] - if set, switches to city-scoped matching
 * @param {number} [opts.limit]
 */
async function findRankedEligibleDonors({ requestId, lat, lng, bloodGroup, radiusKm, city, limit = 50 }) {
  const groups = eligibleDonorGroups(bloodGroup);

  // Interpolated rather than parameterised because it's a fixed SQL fragment
  // chosen by a server-side boolean, never by user input.
  const mobileAppClause = requireMobileApp
    ? `AND EXISTS (SELECT 1 FROM "Device" d WHERE d."userId" = dp."userId")`
    : "";

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      dp."userId" AS "donorId",
      dp."fullName",
      dp."bloodGroup",
      dp.lat,
      dp.lng,
      dp.city,
      CASE WHEN dp.lat IS NOT NULL AND dp.lng IS NOT NULL
        THEN earth_distance(ll_to_earth(dp.lat, dp.lng), ll_to_earth($1, $2)) / 1000.0
        ELSE NULL
      END AS "distanceKm"
    FROM "DonorProfile" dp
    JOIN "User" u ON u.id = dp."userId"
    WHERE dp."isAvailable" = true
      AND u."isBanned" = false
      AND u."isActive" = true
      AND dp."bloodGroup" = ANY($3::text[])
      AND (dp."lastDonatedAt" IS NULL OR dp."lastDonatedAt" <= now() - interval '90 days')
      AND dp."userId" NOT IN (
        SELECT "donorId" FROM "RequestResponse" WHERE "requestId" = $4
      )
      ${mobileAppClause}
      AND (
        ($6::text IS NOT NULL AND dp.city IS NOT NULL AND LOWER(dp.city) = LOWER($6::text))
        OR (
          $6::text IS NULL
          AND dp.lat IS NOT NULL AND dp.lng IS NOT NULL
          AND earth_distance(ll_to_earth(dp.lat, dp.lng), ll_to_earth($1, $2)) <= $5 * 1000
        )
      )
    ORDER BY "distanceKm" ASC NULLS LAST
    LIMIT $7
    `,
    lat,
    lng,
    groups,
    requestId,
    radiusKm,
    city || null,
    limit
  );

  return rows;
}

module.exports = { findRankedEligibleDonors, requireMobileApp };
