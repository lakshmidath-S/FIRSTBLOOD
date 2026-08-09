import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../config/env.dart';

class LocationResult {
  final double lat;
  final double lng;
  final String? city;
  const LocationResult(this.lat, this.lng, this.city);
}

/// GPS + reverse geocoding. This is the one place the mobile app is
/// meaningfully better than the web client: `getCurrentPosition` on a phone
/// is a real GPS fix rather than a coarse browser/IP estimate, which makes
/// the distance-ranked matching genuinely accurate.
class LocationService {
  LocationService._();
  static final LocationService instance = LocationService._();

  final Dio _geoDio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 12),
    receiveTimeout: const Duration(seconds: 12),
    // Nominatim's usage policy asks for identifiable traffic.
    headers: {'User-Agent': Env.userAgent, 'Accept': 'application/json'},
  ));

  /// Throws a human-readable message the caller can show directly, since
  /// every failure here is something the user can act on (turn on GPS,
  /// grant the permission, open settings).
  Future<Position> _getPosition() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw 'Location services are turned off. Enable them and try again.';
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw 'Location permission denied — needed to match you with nearby requests.';
    }
    if (permission == LocationPermission.deniedForever) {
      throw 'Location permission is permanently denied. Enable it in your device settings.';
    }

    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
    );
  }

  /// Coordinates only — used for the ~1/min en-route pings, where resolving a
  /// city name every minute would be a pointless hammering of Nominatim.
  Future<Position> getCurrentPosition() => _getPosition();

  /// Coordinates plus a best-effort city name. City resolution failing is
  /// non-fatal: the coordinates are what matter for matching, and the user
  /// can always type the city themselves.
  Future<LocationResult> getCurrentLocationWithCity() async {
    final pos = await _getPosition();
    String? city;
    try {
      city = await reverseGeocodeCity(pos.latitude, pos.longitude);
    } catch (e) {
      debugPrint('[location] reverse geocode failed: $e');
    }
    return LocationResult(pos.latitude, pos.longitude, city);
  }

  /// Same free OSM Nominatim endpoint and same field-preference order the web
  /// client uses (client/src/services/geocode.js), so a donor who registered
  /// on the web and one who registered on mobile end up with matching city
  /// strings — which matters, because city matching is an exact comparison.
  Future<String?> reverseGeocodeCity(double lat, double lng) async {
    final res = await _geoDio.get(Env.nominatimUrl, queryParameters: {
      'format': 'jsonv2',
      'lat': lat,
      'lon': lng,
      'zoom': 10,
      'addressdetails': 1,
    });

    final data = res.data is String
        ? jsonDecode(res.data as String) as Map<String, dynamic>
        : (res.data as Map).cast<String, dynamic>();

    final address = (data['address'] as Map?)?.cast<String, dynamic>() ?? const {};
    return (address['city'] ??
            address['town'] ??
            address['village'] ??
            address['municipality'] ??
            address['county']) as String?;
  }
}
