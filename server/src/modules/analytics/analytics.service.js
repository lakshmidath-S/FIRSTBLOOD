const prisma = require("../../config/db");
const llm = require("../../llm/provider");

// Only the LLM-written narrative is cached — it's the expensive, rate-limited
// part. The numeric stats are cheap (indexed COUNT/GROUP BY over a bounded
// date range) and are always recomputed live, so the dashboard's stat cards
// and charts never go stale even between narrative refreshes. Earlier
// versions cached stats *and* narrative together, which meant the numbers
// only updated once a day (or on manual refresh). See src/jobs/cron.js for
// the daily narrative refresh.
let narrativeCache = { generatedAt: null, narrative: null };

const STATUS_LIST = ["OPEN", "PARTIAL", "FULFILLED", "CANCELLED", "EXPIRED"];
const RESPONSE_STATUS_LIST = ["ALERTED", "ACCEPTED", "DECLINED", "CANCELLED", "COMPLETED", "NO_SHOW"];

// Requests created per day over the period, split into fulfilled vs. not —
// feeds the trend chart on the admin dashboard.
async function requestsTimeSeries(since, sinceDays) {
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT date_trunc('day', "createdAt")::date AS day,
           COUNT(*)::int AS "requestCount",
           COUNT(*) FILTER (WHERE status = 'FULFILLED')::int AS "fulfilledCount"
    FROM "BloodRequest"
    WHERE "createdAt" >= $1
    GROUP BY 1
    ORDER BY 1
    `,
    since
  );

  // Fill in zero-count days so the chart has one point per calendar day
  // instead of gaps wherever nothing happened.
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const series = [];
  for (let i = sinceDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key);
    series.push({
      day: key,
      requestCount: row?.requestCount || 0,
      fulfilledCount: row?.fulfilledCount || 0,
    });
  }
  return series;
}

async function aggregateStats(sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);

  const [
    totalRequests,
    fulfilledRequests,
    byBloodGroup,
    byStatus,
    byUrgency,
    byResponseStatus,
    byCityRaw,
    completedDonations,
    noShows,
    avgDistance,
    timeSeries,
    totalDonors,
    availableDonors,
    eligibleDonors,
    avgDonationsAgg,
    totalHospitals,
    verifiedHospitals,
  ] = await Promise.all([
    prisma.bloodRequest.count({ where: { createdAt: { gte: since } } }),
    prisma.bloodRequest.count({ where: { createdAt: { gte: since }, status: "FULFILLED" } }),
    prisma.bloodRequest.groupBy({ by: ["bloodGroup"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.bloodRequest.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.bloodRequest.groupBy({ by: ["urgency"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.requestResponse.groupBy({ by: ["status"], where: { alertedAt: { gte: since } }, _count: true }),
    prisma.bloodRequest.groupBy({
      by: ["city"],
      where: { createdAt: { gte: since }, city: { not: null } },
      _count: true,
      orderBy: { _count: { city: "desc" } },
      take: 6,
    }),
    // Every DonationTransaction row *is* a completed donation — a cancellation
    // or no-show never creates one, so there's no status to filter on.
    prisma.donationTransaction.count({ where: { donatedAt: { gte: since } } }),
    prisma.requestResponse.count({ where: { alertedAt: { gte: since }, status: "NO_SHOW" } }),
    prisma.requestResponse.aggregate({ where: { alertedAt: { gte: since }, status: "ACCEPTED" }, _avg: { distanceKm: true } }),
    requestsTimeSeries(since, sinceDays),
    prisma.donorProfile.count(),
    prisma.donorProfile.count({ where: { isAvailable: true } }),
    prisma.donorProfile.count({ where: { OR: [{ lastDonatedAt: null }, { lastDonatedAt: { lte: ninetyDaysAgo } }] } }),
    prisma.donorProfile.aggregate({ _avg: { totalDonations: true } }),
    prisma.hospitalProfile.count(),
    prisma.hospitalProfile.count({ where: { verified: true } }),
  ]);

  const demandByBloodGroup = byBloodGroup
    .map((r) => ({ bloodGroup: r.bloodGroup, count: r._count }))
    .sort((a, b) => b.count - a.count);

  const statusBreakdown = STATUS_LIST.map((status) => ({
    status,
    count: byStatus.find((r) => r.status === status)?._count || 0,
  }));

  const urgencyBreakdown = byUrgency.map((r) => ({ urgency: r.urgency, count: r._count }));

  const responseOutcomes = RESPONSE_STATUS_LIST.map((status) => ({
    status,
    count: byResponseStatus.find((r) => r.status === status)?._count || 0,
  }));

  const totalResponses = responseOutcomes.reduce((sum, r) => sum + r.count, 0);
  const acceptedResponses = responseOutcomes.find((r) => r.status === "ACCEPTED")?.count || 0;
  const completedResponses = responseOutcomes.find((r) => r.status === "COMPLETED")?.count || 0;
  const noShowResponses = responseOutcomes.find((r) => r.status === "NO_SHOW")?.count || 0;
  const acceptRate = totalResponses ? +((acceptedResponses + completedResponses + noShowResponses) / totalResponses).toFixed(2) : null;
  const noShowRate = acceptedResponses + completedResponses + noShowResponses
    ? +(noShowResponses / (acceptedResponses + completedResponses + noShowResponses)).toFixed(2)
    : null;

  const topCities = byCityRaw.map((r) => ({ city: r.city, count: r._count }));

  return {
    periodDays: sinceDays,
    totalRequests,
    fulfilledRequests,
    fulfillmentRate: totalRequests ? +(fulfilledRequests / totalRequests).toFixed(2) : null,
    demandByBloodGroup,
    statusBreakdown,
    urgencyBreakdown,
    responseOutcomes,
    acceptRate,
    noShowRate,
    topCities,
    completedDonations,
    noShows,
    avgAcceptedDistanceKm: avgDistance._avg.distanceKm ? +avgDistance._avg.distanceKm.toFixed(1) : null,
    timeSeries,
    donors: {
      total: totalDonors,
      available: availableDonors,
      eligibleNow: eligibleDonors,
      avgDonationsPerDonor: avgDonationsAgg._avg.totalDonations ? +avgDonationsAgg._avg.totalDonations.toFixed(1) : 0,
    },
    hospitals: {
      total: totalHospitals,
      verified: verifiedHospitals,
    },
  };
}

async function refreshNarrative(sinceDays = 30) {
  const stats = await aggregateStats(sinceDays);
  const prompt = `You are summarizing blood-donation platform activity for an admin dashboard that already
shows charts for every number below — do not repeat raw numbers back, the reader can already see them.

Instead, in under 130 words total:
1. One short paragraph (2-3 sentences) interpreting what the trends mean overall.
2. Exactly 3 short, concrete, actionable recommendations, each starting with a bold action verb.

Format strictly as plain text, no markdown symbols like # or ** or -, one recommendation per line prefixed with "Rec:".

Stats (last ${sinceDays} days):
${JSON.stringify(stats, null, 2)}`;

  let narrative;
  try {
    narrative = await llm.summarize(prompt);
  } catch (err) {
    narrative = `(LLM summary unavailable: ${err.message}. Charts and stats below are still live.)`;
  }

  narrativeCache = { generatedAt: new Date().toISOString(), narrative };
  return { ...narrativeCache, stats };
}

// What the admin dashboard actually fetches: always-live stats paired with
// whatever narrative is currently cached (generating one on first-ever call
// so the panel isn't empty). The stats here are guaranteed fresh regardless
// of how stale the narrative text is.
async function getSnapshot(sinceDays = 30) {
  if (!narrativeCache.generatedAt) return refreshNarrative(sinceDays);
  const stats = await aggregateStats(sinceDays);
  return { ...narrativeCache, stats };
}

module.exports = { aggregateStats, refreshNarrative, getSnapshot };
