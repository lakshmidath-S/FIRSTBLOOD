import 'package:flutter/material.dart';

import '../config/theme.dart';
import '../widgets/ui.dart';
import 'auth/login_screen.dart';
import 'auth/register_screen.dart';
import 'public/public_request_screen.dart';

/// Mobile counterpart of the web landing page: hero, quick facts, and a
/// deliberately prominent Register call-to-action.
class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 28, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(
                      color: AppColors.blood600,
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: const Icon(Icons.water_drop, color: Colors.white, size: 19),
                  ),
                  const SizedBox(width: 10),
                  const Text(
                    'FIRSTBLOOD',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -0.4),
                  ),
                ],
              ),
              const SizedBox(height: 30),

              Container(
                padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.blood50,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.bolt, size: 13, color: AppColors.blood700),
                    SizedBox(width: 4),
                    Text(
                      'Live donor matching',
                      style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.blood700),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              const Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: 'A faster path between '),
                    TextSpan(text: 'donors', style: TextStyle(color: AppColors.blood600)),
                    TextSpan(text: ' and the people who need them.'),
                  ],
                ),
                style: TextStyle(
                  fontSize: 30,
                  height: 1.2,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.6,
                  color: AppColors.ink900,
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Get alerted the moment someone nearby needs your blood type — '
                'even with the app closed.',
                style: TextStyle(fontSize: 15, color: AppColors.ink500, height: 1.45),
              ),
              const SizedBox(height: 26),

              AppButton(
                label: 'Create an account',
                icon: Icons.arrow_forward,
                expand: true,
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const RegisterScreen()),
                ),
              ),
              const SizedBox(height: 10),
              AppButton(
                label: 'Need blood now?',
                icon: Icons.phone_outlined,
                variant: AppButtonVariant.secondary,
                expand: true,
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const PublicRequestScreen()),
                ),
              ),
              const SizedBox(height: 32),

              const _Fact(
                icon: Icons.notifications_active_outlined,
                title: 'Push alerts',
                body: "Alerts reach your phone even when the app isn't open.",
              ),
              const _Fact(
                icon: Icons.place_outlined,
                title: 'Distance-ranked',
                body: 'Nearest eligible donors are matched first, automatically.',
              ),
              const _Fact(
                icon: Icons.people_outline,
                title: 'No account needed',
                body: 'Recipients can broadcast with just a phone number.',
              ),
              const SizedBox(height: 26),

              const Divider(),
              const SizedBox(height: 14),
              Center(
                child: TextButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                  ),
                  child: const Text(
                    'Already have an account? Log in',
                    style: TextStyle(color: AppColors.blood600, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;

  const _Fact({required this.icon, required this.title, required this.body});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(9),
              border: Border.all(color: AppColors.ink200),
            ),
            child: Icon(icon, size: 17, color: AppColors.blood600),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(body, style: const TextStyle(fontSize: 12.5, color: AppColors.ink500, height: 1.35)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
