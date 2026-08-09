import 'package:flutter/material.dart';

/// Mirrors the web client's Tailwind palette (client/tailwind.config.js) so
/// the two front-ends look like the same product: `blood` for the primary
/// red scale, `ink` for the neutral slate scale.
class AppColors {
  static const blood50 = Color(0xFFFEF2F2);
  static const blood100 = Color(0xFFFEE2E2);
  static const blood200 = Color(0xFFFECACA);
  static const blood300 = Color(0xFFFCA5A5);
  static const blood500 = Color(0xFFDC2626);
  static const blood600 = Color(0xFFB91C1C);
  static const blood700 = Color(0xFF991B1B);

  static const ink50 = Color(0xFFF8FAFC);
  static const ink100 = Color(0xFFF1F5F9);
  static const ink200 = Color(0xFFE2E8F0);
  static const ink300 = Color(0xFFCBD5E1);
  static const ink400 = Color(0xFF94A3B8);
  static const ink500 = Color(0xFF64748B);
  static const ink600 = Color(0xFF475569);
  static const ink700 = Color(0xFF334155);
  static const ink800 = Color(0xFF1E293B);
  static const ink900 = Color(0xFF0F172A);

  static const success = Color(0xFF10B981);
  static const successBg = Color(0xFFECFDF5);
  static const warning = Color(0xFFF59E0B);
  static const warningBg = Color(0xFFFFFBEB);
  static const danger = Color(0xFFDC2626);
  static const dangerBg = Color(0xFFFEF2F2);
  static const info = Color(0xFF3B82F6);
  static const infoBg = Color(0xFFEFF6FF);
}

/// Status colours shared by request cards, badges, and the admin charts —
/// kept in one place so a FULFILLED request is the same green everywhere.
const Map<String, Color> kRequestStatusColor = {
  'OPEN': AppColors.ink400,
  'PARTIAL': AppColors.warning,
  'FULFILLED': AppColors.success,
  'CANCELLED': AppColors.danger,
  'EXPIRED': AppColors.ink300,
};

const Map<String, Color> kResponseStatusColor = {
  'ALERTED': AppColors.ink400,
  'ACCEPTED': AppColors.info,
  'DECLINED': AppColors.ink300,
  'CANCELLED': AppColors.danger,
  'COMPLETED': AppColors.success,
  'NO_SHOW': AppColors.warning,
};

/// Urgency drives the alert card colour, matching the web donor dashboard.
const Map<String, Color> kUrgencyColor = {
  'CRITICAL': Color(0xFFDC2626),
  'HIGH': Color(0xFFF97316),
  'NORMAL': AppColors.blood600,
};

ThemeData buildAppTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.blood600,
      primary: AppColors.blood600,
      surface: Colors.white,
    ),
    scaffoldBackgroundColor: AppColors.ink50,
  );

  return base.copyWith(
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: AppColors.ink900,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: AppColors.ink900,
        fontSize: 18,
        fontWeight: FontWeight.w700,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.ink200),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.ink200),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.blood500, width: 1.6),
      ),
      hintStyle: const TextStyle(color: AppColors.ink400, fontSize: 14),
      labelStyle: const TextStyle(color: AppColors.ink500, fontSize: 13),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.blood600,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    textTheme: base.textTheme.apply(
      bodyColor: AppColors.ink800,
      displayColor: AppColors.ink900,
    ),
    dividerTheme: const DividerThemeData(color: AppColors.ink200, thickness: 1),
  );
}
