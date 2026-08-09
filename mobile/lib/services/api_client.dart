import 'package:dio/dio.dart';

import '../config/env.dart';

/// Thrown for any failed API call. Carries the server's own `{ error: "..." }`
/// message so screens can show something meaningful instead of a Dio dump.
class ApiException implements Exception {
  final String message;
  final int? statusCode;
  const ApiException(this.message, [this.statusCode]);

  @override
  String toString() => message;
}

/// Single REST client for the whole app — the Dart equivalent of the web
/// client's `services/api.js` axios instance, including its two interceptors
/// (attach JWT on the way out, unwrap the error message on the way back).
class ApiClient {
  ApiClient._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: Env.apiUrl,
      // Render's free tier cold-starts after ~15 min idle and can take the
      // better part of a minute to wake, so these are deliberately generous.
      connectTimeout: const Duration(seconds: 60),
      receiveTimeout: const Duration(seconds: 60),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final token = _accessToken;
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (e, handler) {
        // A 401 means the JWT expired or was revoked — tell the app to sign
        // out rather than leaving the user on a screen that silently fails.
        if (e.response?.statusCode == 401) {
          onUnauthorized?.call();
        }
        handler.next(e);
      },
    ));
  }

  static final ApiClient instance = ApiClient._internal();

  late final Dio _dio;
  String? _accessToken;

  /// Invoked when the server rejects our token; wired to AuthStore.logout().
  void Function()? onUnauthorized;

  void setToken(String? token) => _accessToken = token;

  /// Turns any Dio failure into an ApiException carrying the server's message.
  Never _rethrowAsApiException(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map && data['error'] is String) {
        throw ApiException(data['error'] as String, error.response?.statusCode);
      }
      if (data is Map && data['message'] is String) {
        throw ApiException(data['message'] as String, error.response?.statusCode);
      }
      if (error.type == DioExceptionType.connectionTimeout ||
          error.type == DioExceptionType.receiveTimeout) {
        throw const ApiException(
          "The server took too long to respond. It may be waking from sleep — try again in a moment.",
        );
      }
      if (error.type == DioExceptionType.connectionError) {
        throw const ApiException("Can't reach the server. Check your connection.");
      }
      throw ApiException(error.message ?? 'Request failed', error.response?.statusCode);
    }
    throw ApiException(error.toString());
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    try {
      final res = await _dio.get(path, queryParameters: query);
      return res.data;
    } catch (e) {
      _rethrowAsApiException(e);
    }
  }

  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    try {
      final res = await _dio.post(path, data: body);
      return res.data;
    } catch (e) {
      _rethrowAsApiException(e);
    }
  }

  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) async {
    try {
      final res = await _dio.patch(path, data: body);
      return res.data;
    } catch (e) {
      _rethrowAsApiException(e);
    }
  }

  Future<dynamic> delete(String path, [Map<String, dynamic>? body]) async {
    try {
      final res = await _dio.delete(path, data: body);
      return res.data;
    } catch (e) {
      _rethrowAsApiException(e);
    }
  }

  /// Convenience helpers that assert the shape the caller expects, so a
  /// surprising response fails loudly here rather than deep inside a widget.
  Future<Map<String, dynamic>> getObject(String path) async {
    final data = await get(path);
    return (data as Map).cast<String, dynamic>();
  }

  Future<List<Map<String, dynamic>>> getList(String path) async {
    final data = await get(path);
    return ((data as List?) ?? const [])
        .map((e) => (e as Map).cast<String, dynamic>())
        .toList();
  }

  Future<Map<String, dynamic>> postObject(String path, [Map<String, dynamic>? body]) async {
    final data = await post(path, body);
    return (data as Map).cast<String, dynamic>();
  }
}

final api = ApiClient.instance;
