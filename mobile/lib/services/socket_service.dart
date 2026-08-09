import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/env.dart';

/// Wraps the single Socket.IO connection, mirroring the web client's
/// `services/socket.js` but with a small pub/sub layer on top so several
/// screens can listen to the same event without fighting over one handler.
///
/// The server authenticates the handshake with the same JWT used for REST
/// (see server/src/sockets/index.js), so the token must be set before connect.
class SocketService {
  SocketService._();
  static final SocketService instance = SocketService._();

  io.Socket? _socket;
  String? _token;

  /// event name -> set of callbacks. Using a set of listeners rather than
  /// socket.on directly means a screen disposing doesn't tear down another
  /// screen's subscription to the same event.
  final Map<String, List<void Function(dynamic)>> _listeners = {};

  bool get isConnected => _socket?.connected == true;

  void connect(String token) {
    if (_socket != null && _token == token) {
      if (!_socket!.connected) _socket!.connect();
      return;
    }

    // Token changed (different user) — tear the old connection down first.
    disconnect();
    _token = token;

    _socket = io.io(
      Env.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(8000)
          .build(),
    );

    _socket!.onConnect((_) => debugPrint('[socket] connected'));
    _socket!.onDisconnect((_) => debugPrint('[socket] disconnected'));
    _socket!.onConnectError((e) => debugPrint('[socket] connect error: $e'));

    // Re-attach every registered listener to the fresh socket instance.
    for (final entry in _listeners.entries) {
      _socket!.on(entry.key, (data) {
        for (final cb in List.of(entry.value)) {
          cb(data);
        }
      });
    }

    _socket!.connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _token = null;
  }

  /// Subscribe to a server event. Returns a disposer — call it in the
  /// widget's dispose() to avoid setState-after-unmount.
  VoidCallback on(String event, void Function(dynamic data) callback) {
    final isNewEvent = !_listeners.containsKey(event);
    _listeners.putIfAbsent(event, () => []).add(callback);

    // Only bind to the underlying socket the first time we see this event —
    // subsequent subscribers are fanned out by our own dispatcher above.
    if (isNewEvent && _socket != null) {
      _socket!.on(event, (data) {
        for (final cb in List.of(_listeners[event] ?? const [])) {
          cb(data);
        }
      });
    }

    return () {
      _listeners[event]?.remove(callback);
      if (_listeners[event]?.isEmpty ?? false) _listeners.remove(event);
    };
  }

  void emit(String event, dynamic data) => _socket?.emit(event, data);

  /// Join/leave a request's room so the server pushes that request's
  /// accept/cancel/completion events to this client.
  void subscribeToRequest(String requestId) => emit('request:subscribe', requestId);
  void unsubscribeFromRequest(String requestId) => emit('request:unsubscribe', requestId);

  /// Coarse (~1/min) location while a donor is en route on an accepted
  /// request — the hospital's map plots these.
  void sendLocationPing(String requestId, double lat, double lng) =>
      emit('location:ping', {'requestId': requestId, 'lat': lat, 'lng': lng});
}
