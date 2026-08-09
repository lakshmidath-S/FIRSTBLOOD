// Straight-line (Haversine) distance in km — used client-side-friendly for
// quick estimates; the authoritative ranking for donor matching is done in
// SQL via the earthdistance extension (see modules/requests/matching.js).
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Very rough ETA assuming average urban travel speed of 30 km/h — an
// approximation, not real routing (see project plan: live tracking section).
function roughEtaMinutes(distanceKm, avgSpeedKmh = 30) {
  return Math.max(1, Math.round((distanceKm / avgSpeedKmh) * 60));
}

module.exports = { haversineKm, roughEtaMinutes };
