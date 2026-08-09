import 'package:flutter/material.dart';

import '../config/theme.dart';

/// Shared widgets mirroring client/src/components/ui.jsx, so the mobile app
/// and the web app look like the same product.

enum AppButtonVariant { primary, secondary, subtle, danger, dangerSubtle, success }

class AppButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final IconData? icon;
  final bool loading;
  final bool expand;
  final bool small;

  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.icon,
    this.loading = false,
    this.expand = false,
    this.small = false,
  });

  ({Color bg, Color fg, Color? border}) get _colors => switch (variant) {
        AppButtonVariant.primary => (bg: AppColors.blood600, fg: Colors.white, border: null),
        AppButtonVariant.secondary => (bg: Colors.white, fg: AppColors.ink800, border: AppColors.ink200),
        AppButtonVariant.subtle => (bg: AppColors.ink100, fg: AppColors.ink700, border: null),
        AppButtonVariant.danger => (bg: AppColors.danger, fg: Colors.white, border: null),
        AppButtonVariant.dangerSubtle => (bg: AppColors.dangerBg, fg: AppColors.blood700, border: null),
        AppButtonVariant.success => (bg: AppColors.success, fg: Colors.white, border: null),
      };

  @override
  Widget build(BuildContext context) {
    final c = _colors;
    final disabled = onPressed == null || loading;

    final child = loading
        ? SizedBox(
            height: small ? 14 : 18,
            width: small ? 14 : 18,
            child: CircularProgressIndicator(strokeWidth: 2, color: c.fg),
          )
        : Row(
            mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: small ? 14 : 17, color: c.fg),
                const SizedBox(width: 6),
              ],
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: small ? 12 : 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          );

    return Opacity(
      opacity: disabled ? 0.55 : 1,
      child: Material(
        color: c.bg,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: disabled ? null : onPressed,
          child: Container(
            width: expand ? double.infinity : null,
            padding: EdgeInsets.symmetric(
              horizontal: small ? 12 : 18,
              vertical: small ? 8 : 13,
            ),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: c.border != null ? Border.all(color: c.border!) : null,
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;

  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final card = Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.ink200),
        boxShadow: const [
          BoxShadow(color: Color(0x0A0F172A), blurRadius: 3, offset: Offset(0, 1)),
        ],
      ),
      child: child,
    );

    if (onTap == null) return card;
    return InkWell(borderRadius: BorderRadius.circular(14), onTap: onTap, child: card);
  }
}

class AppBadge extends StatelessWidget {
  final String text;
  final Color? color;

  const AppBadge(this.text, {super.key, this.color});

  /// Maps a request/response status onto its shared colour.
  factory AppBadge.status(String status, {Key? key}) => AppBadge(
        status,
        key: key,
        color: kRequestStatusColor[status] ?? kResponseStatusColor[status] ?? AppColors.ink400,
      );

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.ink400;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String? hint;
  final IconData? icon;
  final Color? valueColor;

  const StatCard({
    super.key,
    required this.label,
    required this.value,
    this.hint,
    this.icon,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.ink50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.ink200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, color: AppColors.ink500, fontWeight: FontWeight.w500),
                ),
              ),
              if (icon != null) Icon(icon, size: 14, color: AppColors.ink400),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: valueColor ?? AppColors.ink900,
            ),
          ),
          if (hint != null)
            Text(hint!, style: const TextStyle(fontSize: 10, color: AppColors.ink400)),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final String title;
  final String? description;
  final Widget? action;

  const EmptyState({super.key, required this.title, this.description, this.action});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.ink200, style: BorderStyle.solid),
        color: Colors.white.withValues(alpha: 0.5),
      ),
      child: Column(
        children: [
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.ink600),
          ),
          if (description != null) ...[
            const SizedBox(height: 6),
            Text(
              description!,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: AppColors.ink400),
            ),
          ],
          if (action != null) ...[const SizedBox(height: 14), action!],
        ],
      ),
    );
  }
}

/// Pill-style segmented control — the mobile version of the web's
/// "By distance / Everyone in my city" style toggles.
class SegmentedToggle<T> extends StatelessWidget {
  final List<({T value, String label})> options;
  final T value;
  final ValueChanged<T> onChanged;

  const SegmentedToggle({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.ink100,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: options.map((opt) {
          final selected = opt.value == value;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(opt.value),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                padding: const EdgeInsets.symmetric(vertical: 9),
                decoration: BoxDecoration(
                  color: selected ? Colors.white : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: selected
                      ? const [BoxShadow(color: Color(0x140F172A), blurRadius: 3, offset: Offset(0, 1))]
                      : null,
                ),
                child: Text(
                  opt.label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: selected ? AppColors.blood700 : AppColors.ink500,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class SectionHeading extends StatelessWidget {
  final String title;
  final String? eyebrow;
  final Widget? action;

  const SectionHeading({super.key, required this.title, this.eyebrow, this.action});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow != null)
                  Text(
                    eyebrow!.toUpperCase(),
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                      color: AppColors.blood600,
                    ),
                  ),
                Text(
                  title,
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.ink900),
                ),
              ],
            ),
          ),
          if (action != null) action!,
        ],
      ),
    );
  }
}

/// Consistent inline error styling for form/API failures.
class ErrorBanner extends StatelessWidget {
  final String? message;
  const ErrorBanner(this.message, {super.key});

  @override
  Widget build(BuildContext context) {
    if (message == null || message!.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.dangerBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.blood100),
      ),
      child: Text(message!, style: const TextStyle(color: AppColors.blood700, fontSize: 13)),
    );
  }
}

/// Small labelled field wrapper so every form looks identical.
class LabeledField extends StatelessWidget {
  final String label;
  final Widget child;
  const LabeledField({super.key, required this.label, required this.child});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 5),
          child: Text(
            label,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.ink500),
          ),
        ),
        child,
      ],
    );
  }
}

void showSnack(BuildContext context, String message, {bool isError = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.danger : AppColors.ink800,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
}
