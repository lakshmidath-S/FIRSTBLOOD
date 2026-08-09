import '../models/models.dart';
import 'api_client.dart';

/// One thin function per backend endpoint. Screens call these instead of
/// touching `api` directly, so route strings live in exactly one place — if
/// the backend ever remounts `/api/auth` somewhere else, this file is the
/// only thing that changes.

class AuthService {
  /// Returns (user, accessToken).
  static Future<(AuthUser, String)> login(String email, String password) async {
    final data = await api.postObject('/auth/login', {'email': email, 'password': password});
    return (
      AuthUser.fromJson((data['user'] as Map).cast<String, dynamic>()),
      data['accessToken'] as String,
    );
  }

  static Future<(AuthUser, String)> register({
    required String role, // DONOR | HOSPITAL (ADMIN is seed-only)
    required String email,
    required String password,
    String? phone,
    required Map<String, dynamic> profile,
  }) async {
    final data = await api.postObject('/auth/register', {
      'role': role,
      'email': email,
      'password': password,
      if (phone != null && phone.isNotEmpty) 'phone': phone,
      'profile': profile,
    });
    return (
      AuthUser.fromJson((data['user'] as Map).cast<String, dynamic>()),
      data['accessToken'] as String,
    );
  }

  /// SMS delivery is simulated server-side, so the OTP comes straight back in
  /// the response for dev/demo. Returns (sessionId, otp).
  static Future<(String, String?)> requestOtp(String phone) async {
    final data = await api.postObject('/auth/otp/request', {'phone': phone});
    return (data['sessionId'] as String, data['otp']?.toString());
  }

  static Future<String> verifyOtp(String sessionId, String otp) async {
    final data = await api.postObject('/auth/otp/verify', {'sessionId': sessionId, 'otp': otp});
    return data['accessToken'] as String;
  }
}

class DonorService {
  static Future<DonorProfile> me() async =>
      DonorProfile.fromJson(await api.getObject('/donors/me'));

  static Future<void> setAvailability(bool isAvailable) =>
      api.patch('/donors/me/availability', {'isAvailable': isAvailable});

  static Future<void> updateLocation(double lat, double lng, {String? city}) =>
      api.patch('/donors/me/location', {
        'lat': lat,
        'lng': lng,
        if (city != null && city.trim().isNotEmpty) 'city': city.trim(),
      });

  static Future<void> updateCity(String city) =>
      api.patch('/donors/me/city', {'city': city.trim()});

  static Future<List<RequestResponseItem>> myResponses() async {
    final list = await api.getList('/donors/me/responses');
    return list.map(RequestResponseItem.fromJson).toList();
  }
}

class HospitalService {
  static Future<HospitalProfile> me() async =>
      HospitalProfile.fromJson(await api.getObject('/hospitals/me'));

  static Future<void> updateProfile({String? city, double? lat, double? lng}) =>
      api.patch('/hospitals/me', {
        if (city != null) 'city': city.trim(),
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
      });

  static Future<List<BloodRequest>> myRequests() async {
    final list = await api.getList('/hospitals/me/requests');
    return list.map(BloodRequest.fromJson).toList();
  }
}

class RequestService {
  static Future<BloodRequest> byId(String id) async =>
      BloodRequest.fromJson(await api.getObject('/requests/$id'));

  /// Hospitals never send a location — the server reuses the one saved on
  /// their profile. All they choose is radius-vs-city scope.
  static Future<BloodRequest> createAsHospital({
    required String bloodGroup,
    required int unitsNeeded,
    required String urgency,
    required String broadcastScope, // RADIUS | CITY
    int? searchRadiusKm,
    String? notes,
    int? expiresInHours,
  }) async {
    final data = await api.postObject('/requests', {
      'bloodGroup': bloodGroup,
      'unitsNeeded': unitsNeeded,
      'urgency': urgency,
      'broadcastScope': broadcastScope,
      if (broadcastScope == 'RADIUS' && searchRadiusKm != null) 'searchRadiusKm': searchRadiusKm,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      if (expiresInHours != null) 'expiresInHours': expiresInHours,
    });
    return BloodRequest.fromJson(data);
  }

  /// Independent receivers have no stored profile, so they pass their own
  /// location (and optionally a city, which switches to city-wide broadcast).
  static Future<BloodRequest> createAsPublic({
    required String bloodGroup,
    required int unitsNeeded,
    required String urgency,
    required double lat,
    required double lng,
    String? city,
    String? notes,
    int? expiresInHours,
  }) async {
    final data = await api.postObject('/requests/public', {
      'bloodGroup': bloodGroup,
      'unitsNeeded': unitsNeeded,
      'urgency': urgency,
      'lat': lat,
      'lng': lng,
      if (city != null && city.trim().isNotEmpty) 'city': city.trim(),
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      if (expiresInHours != null) 'expiresInHours': expiresInHours,
    });
    return BloodRequest.fromJson(data);
  }

  /// Looked up by the phone on the OTP token rather than the session id, so
  /// history survives re-verifying (a new session is issued every login).
  static Future<List<BloodRequest>> myPublicRequests() async {
    final list = await api.getList('/requests/public/mine');
    return list.map(BloodRequest.fromJson).toList();
  }
}

class ResponseService {
  static Future<void> accept(String requestId) => api.post('/responses/$requestId/accept');
  static Future<void> decline(String requestId) => api.post('/responses/$requestId/decline');
  static Future<void> cancel(String requestId) => api.post('/responses/$requestId/cancel');

  /// Marking a donation complete / a donor a no-show. The server enforces
  /// ownership: hospitals only on their own requests, public sessions only on
  /// requests tied to their verified phone number.
  static Future<void> markCompleted(String requestId, String donorId) =>
      api.post('/responses/$requestId/donors/$donorId/complete');

  static Future<void> markNoShow(String requestId, String donorId) =>
      api.post('/responses/$requestId/donors/$donorId/no-show');
}

class AdminService {
  static Future<AnalyticsSnapshot> analytics() async =>
      AnalyticsSnapshot.fromJson(await api.getObject('/admin/analytics'));

  static Future<AnalyticsSnapshot> refreshAnalytics() async =>
      AnalyticsSnapshot.fromJson(await api.postObject('/admin/analytics/refresh', {'sinceDays': 30}));

  static Future<List<FlaggedDonor>> flaggedDonors() async {
    final list = await api.getList('/admin/donors/flagged');
    return list.map(FlaggedDonor.fromJson).toList();
  }

  static Future<void> banDonor(String donorId) => api.post('/admin/donors/$donorId/ban');

  static Future<List<BloodRequest>> allRequests() async {
    final list = await api.getList('/admin/requests');
    return list.map(BloodRequest.fromJson).toList();
  }
}
