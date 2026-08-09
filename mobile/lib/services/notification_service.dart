import 'dart:io' show Platform;
import 'dart:math';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'socket_service.dart';

/// Handles messages that arrive while the app is terminated or backgrounded.
/// Must be a top-level function with this pragma — Flutter spins up a
/// separate isolate for it, so nothing from the running app is in scope here.
/// We deliberately do no work: Android/iOS already display the `notification`
/// block of the payload themselves, and re-rendering it locally would show
/// the alert twice.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  debugPrint('[push] background message: ${message.notification?.title}');
}

/// The reason this app exists.
///
/// Three delivery paths feed one visible alert:
///   1. FCM push        — reaches the phone with the app closed/backgrounded.
///   2. FCM foreground  — Android/iOS suppress the OS banner while the app is
///                        open, so we render it ourselves via local notifications.
///   3. Socket event    — instant path while connected; also rendered locally.
///
/// Paths 2 and 3 can both fire for one server-side event, so alerts are
/// de-duplicated on the notification id the server generates.
class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  static const _androidChannelId = 'firstblood_alerts';
  static const _installIdKey = 'firstblood_install_id';

  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();

  bool _localReady = false;
  bool _firebaseReady = false;
  String? _fcmToken;
  VoidCallback? _socketDisposer;

  /// Recently shown alert ids, so the socket and FCM copies of the same
  /// event don't buzz twice.
  final _recentlyShown = <String>{};

  /// Called when the user taps an alert — set by the app shell so it can
  /// route to the relevant request.
  void Function(String? requestId)? onAlertTapped;

  Future<void> init() async {
    await _initLocalNotifications();
    await _initFirebase();
    _listenToSocket();
  }

  Future<void> _initLocalNotifications() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    await _local.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: (response) {
        onAlertTapped?.call(response.payload);
      },
    );

    // The channel id must match what the server sets on outgoing pushes
    // (see server/src/modules/notifications/push.service.js) or Android
    // silently drops the sound/importance settings.
    const channel = AndroidNotificationChannel(
      _androidChannelId,
      'Blood request alerts',
      description: 'Urgent alerts when someone nearby needs your blood type.',
      importance: Importance.max,
    );

    await _local
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    // Android 13+ requires an explicit runtime permission for notifications.
    await _local
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();

    _localReady = true;
  }

  /// Firebase is optional: a developer who hasn't dropped in their
  /// google-services.json still gets a fully working app over sockets, just
  /// without alerts when it's closed. So initialisation failure is logged,
  /// not fatal.
  Future<void> _initFirebase() async {
    try {
      await Firebase.initializeApp();

      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);

      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);

      _fcmToken = await messaging.getToken();
      debugPrint('[push] FCM token acquired: ${_fcmToken != null}');

      // FCM rotates tokens (reinstall, restore-from-backup, app-data clear).
      messaging.onTokenRefresh.listen((token) {
        _fcmToken = token;
        registerDevice();
      });

      // Foreground: the OS won't show a banner, so render one ourselves.
      FirebaseMessaging.onMessage.listen((message) {
        final n = message.notification;
        if (n == null) return;
        _show(
          id: message.data['notificationId'] as String?,
          title: n.title ?? 'FIRSTBLOOD',
          body: n.body ?? '',
          requestId: message.data['requestId'] as String?,
        );
      });

      // Cold-start / background tap → route straight to the request.
      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        onAlertTapped?.call(message.data['requestId'] as String?);
      });

      _firebaseReady = true;
    } catch (e) {
      debugPrint('[push] Firebase unavailable — sockets only. ($e)');
      _firebaseReady = false;
    }
  }

  /// Mirror every socket notification into a real system notification, so an
  /// alert looks identical whether it arrived by socket or by push.
  void _listenToSocket() {
    _socketDisposer?.call();
    _socketDisposer = SocketService.instance.on('notification:new', (data) {
      if (data is! Map) return;
      final map = data.cast<String, dynamic>();
      _show(
        id: map['id'] as String?,
        title: (map['title'] ?? 'FIRSTBLOOD') as String,
        body: (map['body'] ?? '') as String,
        requestId: map['requestId'] as String?,
      );
    });
  }

  Future<void> _show({
    String? id,
    required String title,
    required String body,
    String? requestId,
  }) async {
    if (!_localReady) return;

    // De-dupe: the same server event can reach us over both transports.
    if (id != null) {
      if (_recentlyShown.contains(id)) return;
      _recentlyShown.add(id);
      if (_recentlyShown.length > 100) {
        _recentlyShown.remove(_recentlyShown.first);
      }
    }

    // "CRITICAL"/"Urgent" titles come from the server's urgency labels; they
    // get a full-screen-ish high-importance treatment.
    final isUrgent = title.toLowerCase().contains('critical') || title.toLowerCase().contains('urgent');

    final androidDetails = AndroidNotificationDetails(
      _androidChannelId,
      'Blood request alerts',
      channelDescription: 'Urgent alerts when someone nearby needs your blood type.',
      importance: isUrgent ? Importance.max : Importance.high,
      priority: isUrgent ? Priority.max : Priority.high,
      category: isUrgent ? AndroidNotificationCategory.alarm : AndroidNotificationCategory.message,
      color: const Color(0xFFB91C1C),
      styleInformation: BigTextStyleInformation(body),
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    await _local.show(
      // Notification ids must be 32-bit ints; hash the uuid down to one.
      (id ?? DateTime.now().toIso8601String()).hashCode & 0x7FFFFFFF,
      title,
      body,
      NotificationDetails(android: androidDetails, iOS: iosDetails),
      payload: requestId,
    );
  }

  /// A stable id for this app install, generated locally on first launch.
  ///
  /// This is what proves to the backend that the app exists on this phone,
  /// which is what donor eligibility is checked against. Deliberately
  /// independent of FCM: a donor who denied notification permission, or a
  /// build with no Firebase config, should still be matchable — they'd just
  /// see alerts when they open the app rather than as a push.
  Future<String> _installId() async {
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_installIdKey);
    if (id != null && id.isNotEmpty) return id;

    final rng = Random.secure();
    id = List.generate(32, (_) => rng.nextInt(16).toRadixString(16)).join();
    await prefs.setString(_installIdKey, id);
    return id;
  }

  /// Registers this install with the backend. Called on every login and on
  /// session restore; safe to call repeatedly (the server upserts on
  /// installId). Includes the FCM token when there is one.
  Future<void> registerDevice() async {
    try {
      await api.post('/notifications/devices', {
        'installId': await _installId(),
        if (_fcmToken != null) 'pushToken': _fcmToken,
        'platform': Platform.isIOS ? 'ios' : 'android',
      });
      debugPrint('[push] device registered (push token: ${_fcmToken != null})');
    } catch (e) {
      // Non-fatal for the session, but worth being loud about: until this
      // succeeds the donor won't appear in any search.
      debugPrint('[push] device registration failed: $e');
    }
  }

  /// Removes this install on logout, so a signed-out phone neither receives
  /// the previous user's alerts nor keeps them matchable.
  Future<void> unregisterDevice() async {
    try {
      await api.delete('/notifications/devices', {'installId': await _installId()});
    } catch (e) {
      debugPrint('[push] device removal failed: $e');
    }
  }
}
