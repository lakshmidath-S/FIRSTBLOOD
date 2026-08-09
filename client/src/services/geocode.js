// Free reverse geocoding via OpenStreetMap's Nominatim — turns lat/lng into
// a city name so donors don't have to type it manually. Nominatim's usage
// policy (https://operations.osmfoundation.org/policies/nominatim/) caps
// this at ~1 request/second and asks for identifiable traffic; fine for a
// donor tapping "detect my city" occasionally, but swap for a paid/self-hosted
// geocoder before this sees real production volume.
export async function reverseGeocodeCity(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Reverse geocoding failed");
  const data = await res.json();
  const a = data.address || {};
  return a.city || a.town || a.village || a.municipality || a.county || null;
}
