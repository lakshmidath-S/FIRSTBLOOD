import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/notification_service.dart';
import '../services/socket_service.dart';

/// App-wide auth state — the Dart counterpart of the web client's zustand
/// store, with the same persistence idea (session survives an app restart)
/// but backed by SharedPreferences instead of localStorage.
///
/// Also owns the side effects that must happen on every login/logout:
/// pointing the API client at the new token, (re)connecting the socket, and
/// registering/unregistering this device for push.
class AuthStore extends ChangeNotifier {
  static const _storageKey = 'firstblood_auth';

  AuthUser? _user;
  String? _accessToken;
  bool _restoring = true;

  AuthUser? get user => _user;
  String? get accessToken => _accessToken;
  bool get isLoggedIn => _accessToken != null && _accessToken!.isNotEmpty;
  bool get restoring => _restoring;
  String get role => _user?.role ?? '';

  /// Reads any persisted session at startup so a returning user lands on
  /// their dashboard instead of the login screen.
  Future<void> restore() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_storageKey);
      if (raw != null && raw.isNotEmpty) {
        final json = jsonDecode(raw) as Map<String, dynamic>;
        final token = json['accessToken'] as String?;
        final userJson = json['user'] as Map<String, dynamic>?;
        if (token != null && userJson != null) {
          _accessToken = token;
          _user = AuthUser.fromJson(userJson);
          api.setToken(token);
          // A restored public/OTP token is very likely expired (1h TTL) and
          // there's nothing useful to reconnect it to, so only registered
          // roles get a live socket back.
          if (!_user!.isPublic) {
            SocketService.instance.connect(token);
            unawaited(NotificationService.instance.registerDevice());
          }
        }
      }
    } catch (_) {
      // Corrupt/stale storage shouldn't brick startup — just start signed out.
      _user = null;
      _accessToken = null;
    } finally {
      _restoring = false;
      notifyListeners();
    }
  }

  Future<void> setAuth(AuthUser user, String token) async {
    _user = user;
    _accessToken = token;
    api.setToken(token);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _storageKey,
      jsonEncode({'user': user.toJson(), 'accessToken': token}),
    );

    if (!user.isPublic) {
      SocketService.instance.connect(token);
      // Register this install *after* the token is live, since the endpoint
      // is authenticated. For donors this is what makes them matchable at
      // all, so failures are logged loudly in NotificationService — but it's
      // still not awaited, because a registration hiccup shouldn't block the
      // login itself.
      unawaited(NotificationService.instance.registerDevice());
    } else {
      // Independent receivers still want live donor-response updates while
      // they're watching the tracking screen.
      SocketService.instance.connect(token);
    }

    notifyListeners();
  }

  Future<void> logout() async {
    // Unregister this handset first — while we still have a valid token —
    // so a signed-out phone stops buzzing for the previous user's alerts.
    if (_user != null && !_user!.isPublic) {
      await NotificationService.instance.unregisterDevice();
    }

    _user = null;
    _accessToken = null;
    api.setToken(null);
    SocketService.instance.disconnect();

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);

    notifyListeners();
  }
}

/// Small helper so we can fire-and-forget without an `unawaited_futures` lint.
void unawaited(Future<void> future) {
  future.catchError((Object e) {
    debugPrint('[auth] background task failed: $e');
  });
}
