/// Backend endpoints, supplied at build time so one codebase can point at a
/// local server or the deployed Render instance without a code edit:
///
///   flutter run --dart-define=API_URL=http://10.0.2.2:4000/api \
///               --dart-define=SOCKET_URL=http://10.0.2.2:4000
///
/// Note 10.0.2.2, not localhost: on the Android emulator localhost is the
/// *emulator's* own loopback, so it can't see a server on your laptop. On a
/// physical device use your machine's LAN IP instead.
///
/// The defaults point at the deployed backend so a fresh `flutter run` on a
/// real phone works with no flags at all.
class Env {
  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://firstblood-zpcp.onrender.com/api',
  );

  static const String socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: 'https://firstblood-zpcp.onrender.com',
  );

  /// Free reverse geocoding via OpenStreetMap Nominatim — turns coordinates
  /// into a city name so donors/hospitals don't have to type one. Same
  /// service (and same ~1 req/sec courtesy limit) the web client uses.
  static const String nominatimUrl = 'https://nominatim.openstreetmap.org/reverse';

  /// Sent as User-Agent to Nominatim, whose usage policy asks for
  /// identifiable traffic rather than anonymous bulk requests.
  static const String userAgent = 'FIRSTBLOOD-mobile/1.0 (blood donation app)';
}
