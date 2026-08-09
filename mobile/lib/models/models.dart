/// Dart mirrors of the JSON the Express API returns. Kept deliberately
/// tolerant — every field that the server can omit or null is nullable here,
/// because a parse crash on a missing field is a far worse failure mode than
/// a blank line in the UI.

int _asInt(dynamic v, [int fallback = 0]) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? fallback;
  return fallback;
}

double? _asDouble(dynamic v) {
  if (v is double) return v;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

DateTime? _asDate(dynamic v) {
  if (v is String && v.isNotEmpty) return DateTime.tryParse(v)?.toLocal();
  return null;
}

/// The `user` object returned by /auth/login and /auth/register.
class AuthUser {
  final String id;
  final String role; // ADMIN | DONOR | HOSPITAL, or "public" for OTP sessions
  final String? email;

  const AuthUser({required this.id, required this.role, this.email});

  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
        id: (j['id'] ?? '') as String,
        role: (j['role'] ?? '') as String,
        email: j['email'] as String?,
      );

  Map<String, dynamic> toJson() => {'id': id, 'role': role, 'email': email};

  bool get isPublic => role == 'public';
}

class DonorProfile {
  final String userId;
  final String fullName;
  final String bloodGroup;
  final String? city;
  final bool isAvailable;
  final bool isEligibleToDonate;
  /// True once this account has registered at least one mobile install.
  final bool hasMobileApp;
  /// Whether the server is enforcing the mobile-app requirement at all.
  final bool mobileAppRequired;
  /// The single flag mirroring exactly what the matching query will decide.
  final bool isMatchable;
  final double? lat;
  final double? lng;
  final int totalDonations;
  final DateTime? lastDonatedAt;

  const DonorProfile({
    required this.userId,
    required this.fullName,
    required this.bloodGroup,
    required this.isAvailable,
    required this.isEligibleToDonate,
    required this.hasMobileApp,
    required this.mobileAppRequired,
    required this.isMatchable,
    required this.totalDonations,
    this.city,
    this.lat,
    this.lng,
    this.lastDonatedAt,
  });

  factory DonorProfile.fromJson(Map<String, dynamic> j) => DonorProfile(
        userId: (j['userId'] ?? '') as String,
        fullName: (j['fullName'] ?? '') as String,
        bloodGroup: (j['bloodGroup'] ?? '') as String,
        city: j['city'] as String?,
        isAvailable: j['isAvailable'] == true,
        // Server computes this from the 90-day rule; treat a missing value as
        // "not eligible" so we never wrongly tell someone they can donate.
        isEligibleToDonate: j['isEligibleToDonate'] == true,
        hasMobileApp: j['hasMobileApp'] == true,
        mobileAppRequired: j['mobileAppRequired'] == true,
        isMatchable: j['isMatchable'] == true,
        lat: _asDouble(j['lat']),
        lng: _asDouble(j['lng']),
        totalDonations: _asInt(j['totalDonations']),
        lastDonatedAt: _asDate(j['lastDonatedAt']),
      );
}

class HospitalProfile {
  final String userId;
  final String hospitalName;
  final String? address;
  final String? city;
  final double? lat;
  final double? lng;
  final bool verified;

  const HospitalProfile({
    required this.userId,
    required this.hospitalName,
    required this.verified,
    this.address,
    this.city,
    this.lat,
    this.lng,
  });

  factory HospitalProfile.fromJson(Map<String, dynamic> j) => HospitalProfile(
        userId: (j['userId'] ?? '') as String,
        hospitalName: (j['hospitalName'] ?? '') as String,
        address: j['address'] as String?,
        city: j['city'] as String?,
        lat: _asDouble(j['lat']),
        lng: _asDouble(j['lng']),
        verified: j['verified'] == true,
      );

  bool get hasLocation => lat != null && lng != null;
  bool get hasCity => city != null && city!.trim().isNotEmpty;
}

/// A donor's row on a request. `request` is only populated on the donor's own
/// /donors/me/responses feed; `donor` only on a request's detail view.
class RequestResponseItem {
  final String id;
  final String requestId;
  final String donorId;
  final String status;
  final double? distanceKm;
  final int? etaMinutes;
  final String? donorName;
  final String? donorBloodGroup;
  final BloodRequest? request;

  const RequestResponseItem({
    required this.id,
    required this.requestId,
    required this.donorId,
    required this.status,
    this.distanceKm,
    this.etaMinutes,
    this.donorName,
    this.donorBloodGroup,
    this.request,
  });

  factory RequestResponseItem.fromJson(Map<String, dynamic> j) {
    final donor = j['donor'] as Map<String, dynamic>?;
    final req = j['request'] as Map<String, dynamic>?;
    return RequestResponseItem(
      id: (j['id'] ?? '') as String,
      requestId: (j['requestId'] ?? '') as String,
      donorId: (j['donorId'] ?? '') as String,
      status: (j['status'] ?? 'ALERTED') as String,
      distanceKm: _asDouble(j['distanceKm']),
      etaMinutes: j['etaMinutes'] == null ? null : _asInt(j['etaMinutes']),
      donorName: donor?['fullName'] as String?,
      donorBloodGroup: donor?['bloodGroup'] as String?,
      request: req == null ? null : BloodRequest.fromJson(req),
    );
  }
}

class BloodRequest {
  final String id;
  final String bloodGroup;
  final int unitsNeeded;
  final int unitsClaimed;
  final String status;
  final String urgency;
  final String? notes;
  final String? city;
  final int searchRadiusKm;
  final double? lat;
  final double? lng;
  final DateTime? createdAt;
  final List<RequestResponseItem> responses;

  const BloodRequest({
    required this.id,
    required this.bloodGroup,
    required this.unitsNeeded,
    required this.unitsClaimed,
    required this.status,
    required this.urgency,
    required this.searchRadiusKm,
    required this.responses,
    this.notes,
    this.city,
    this.lat,
    this.lng,
    this.createdAt,
  });

  factory BloodRequest.fromJson(Map<String, dynamic> j) => BloodRequest(
        id: (j['id'] ?? '') as String,
        bloodGroup: (j['bloodGroup'] ?? '') as String,
        unitsNeeded: _asInt(j['unitsNeeded'], 1),
        unitsClaimed: _asInt(j['unitsClaimed']),
        status: (j['status'] ?? 'OPEN') as String,
        urgency: (j['urgency'] ?? 'NORMAL') as String,
        notes: j['notes'] as String?,
        city: j['city'] as String?,
        searchRadiusKm: _asInt(j['searchRadiusKm'], 10),
        lat: _asDouble(j['lat']),
        lng: _asDouble(j['lng']),
        createdAt: _asDate(j['createdAt']),
        responses: ((j['responses'] as List<dynamic>?) ?? const [])
            .map((r) => RequestResponseItem.fromJson(r as Map<String, dynamic>))
            .toList(),
      );

  int get unitsRemaining => (unitsNeeded - unitsClaimed).clamp(0, unitsNeeded);

  /// How this request was broadcast — city-scoped requests ignore the radius.
  String get scopeLabel =>
      (city != null && city!.isNotEmpty) ? 'Everyone in $city' : 'Radius $searchRadiusKm km';

  int get acceptedCount => responses.where((r) => r.status == 'ACCEPTED').length;
}

class FlaggedDonor {
  final String userId;
  final String fullName;
  final String bloodGroup;
  final String? email;
  final String flagReason;
  final bool isBanned;

  const FlaggedDonor({
    required this.userId,
    required this.fullName,
    required this.bloodGroup,
    required this.flagReason,
    required this.isBanned,
    this.email,
  });

  factory FlaggedDonor.fromJson(Map<String, dynamic> j) {
    final user = j['user'] as Map<String, dynamic>?;
    return FlaggedDonor(
      userId: (j['userId'] ?? '') as String,
      fullName: (j['fullName'] ?? '') as String,
      bloodGroup: (j['bloodGroup'] ?? '') as String,
      email: user?['email'] as String?,
      flagReason: (j['flagReason'] ?? '') as String,
      isBanned: user?['isBanned'] == true,
    );
  }
}

/// A single {label, count} pair — used for every categorical chart on the
/// admin dashboard (blood group demand, status split, response outcomes).
class CountBucket {
  final String label;
  final int count;
  const CountBucket(this.label, this.count);
}

class TimeSeriesPoint {
  final DateTime day;
  final int requestCount;
  final int fulfilledCount;
  const TimeSeriesPoint(this.day, this.requestCount, this.fulfilledCount);
}

class AnalyticsSnapshot {
  final String? narrative;
  final DateTime? generatedAt;
  final int periodDays;
  final int totalRequests;
  final int fulfilledRequests;
  final double? fulfillmentRate;
  final int completedDonations;
  final int noShows;
  final double? acceptRate;
  final double? noShowRate;
  final double? avgAcceptedDistanceKm;
  final List<CountBucket> demandByBloodGroup;
  final List<CountBucket> statusBreakdown;
  final List<CountBucket> responseOutcomes;
  final List<CountBucket> topCities;
  final List<TimeSeriesPoint> timeSeries;
  final int donorsTotal;
  final int donorsAvailable;
  final int hospitalsTotal;
  final int hospitalsVerified;

  const AnalyticsSnapshot({
    required this.periodDays,
    required this.totalRequests,
    required this.fulfilledRequests,
    required this.completedDonations,
    required this.noShows,
    required this.demandByBloodGroup,
    required this.statusBreakdown,
    required this.responseOutcomes,
    required this.topCities,
    required this.timeSeries,
    required this.donorsTotal,
    required this.donorsAvailable,
    required this.hospitalsTotal,
    required this.hospitalsVerified,
    this.narrative,
    this.generatedAt,
    this.fulfillmentRate,
    this.acceptRate,
    this.noShowRate,
    this.avgAcceptedDistanceKm,
  });

  static List<CountBucket> _buckets(dynamic list, String labelKey) =>
      ((list as List<dynamic>?) ?? const [])
          .map((e) => CountBucket(
                ((e as Map<String, dynamic>)[labelKey] ?? '—').toString(),
                _asInt(e['count']),
              ))
          .toList();

  factory AnalyticsSnapshot.fromJson(Map<String, dynamic> j) {
    final s = (j['stats'] as Map<String, dynamic>?) ?? const {};
    final donors = (s['donors'] as Map<String, dynamic>?) ?? const {};
    final hospitals = (s['hospitals'] as Map<String, dynamic>?) ?? const {};

    return AnalyticsSnapshot(
      narrative: j['narrative'] as String?,
      generatedAt: _asDate(j['generatedAt']),
      periodDays: _asInt(s['periodDays'], 30),
      totalRequests: _asInt(s['totalRequests']),
      fulfilledRequests: _asInt(s['fulfilledRequests']),
      fulfillmentRate: _asDouble(s['fulfillmentRate']),
      completedDonations: _asInt(s['completedDonations']),
      noShows: _asInt(s['noShows']),
      acceptRate: _asDouble(s['acceptRate']),
      noShowRate: _asDouble(s['noShowRate']),
      avgAcceptedDistanceKm: _asDouble(s['avgAcceptedDistanceKm']),
      demandByBloodGroup: _buckets(s['demandByBloodGroup'], 'bloodGroup'),
      statusBreakdown: _buckets(s['statusBreakdown'], 'status'),
      responseOutcomes: _buckets(s['responseOutcomes'], 'status'),
      topCities: _buckets(s['topCities'], 'city'),
      timeSeries: ((s['timeSeries'] as List<dynamic>?) ?? const [])
          .map((e) {
            final m = e as Map<String, dynamic>;
            return TimeSeriesPoint(
              DateTime.tryParse((m['day'] ?? '') as String) ?? DateTime.now(),
              _asInt(m['requestCount']),
              _asInt(m['fulfilledCount']),
            );
          })
          .toList(),
      donorsTotal: _asInt(donors['total']),
      donorsAvailable: _asInt(donors['available']),
      hospitalsTotal: _asInt(hospitals['total']),
      hospitalsVerified: _asInt(hospitals['verified']),
    );
  }
}
