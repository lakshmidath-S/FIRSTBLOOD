import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'config/theme.dart';
import 'screens/admin/admin_dashboard.dart';
import 'screens/auth/login_screen.dart';
import 'screens/donor/donor_dashboard.dart';
import 'screens/hospital/hospital_dashboard.dart';
import 'screens/landing_screen.dart';
import 'services/api_client.dart';
import 'services/notification_service.dart';
import 'state/auth_store.dart';

final navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final auth = AuthStore();

  // A 401 anywhere means the JWT is dead — drop the session so the user gets
  // the login screen instead of a dashboard that silently fails every call.
  api.onUnauthorized = () => auth.logout();

  // Notifications are set up before the first frame so an alert that arrives
  // during startup still gets rendered.
  await NotificationService.instance.init();

  await auth.restore();

  runApp(
    ChangeNotifierProvider.value(value: auth, child: const FirstBloodApp()),
  );
}

class FirstBloodApp extends StatelessWidget {
  const FirstBloodApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FIRSTBLOOD',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      theme: buildAppTheme(),
      home: const _RootRouter(),
    );
  }
}

/// Sends each role to its own dashboard, exactly like the web app's
/// ProtectedRoute + HOME_BY_ROLE pairing.
class _RootRouter extends StatelessWidget {
  const _RootRouter();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthStore>();

    if (auth.restoring) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.blood600)),
      );
    }

    if (!auth.isLoggedIn) return const LandingScreen();

    return switch (auth.role) {
      'DONOR' => const DonorDashboard(),
      'HOSPITAL' => const HospitalDashboard(),
      'ADMIN' => const AdminDashboard(),
      // A restored public/OTP session has no dashboard of its own — the
      // request flow is entered deliberately from the landing screen.
      _ => const LandingScreen(),
    };
  }
}

/// Shared app bar with a sign-out action, used by all three dashboards.
class DashboardAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final List<Widget> actions;

  const DashboardAppBar({super.key, required this.title, this.actions = const []});

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthStore>();
    return AppBar(
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: AppColors.blood600,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.water_drop, color: Colors.white, size: 16),
          ),
          const SizedBox(width: 9),
          Text(title),
        ],
      ),
      actions: [
        ...actions,
        IconButton(
          tooltip: 'Log out',
          icon: const Icon(Icons.logout, size: 20),
          onPressed: () async {
            await auth.logout();
            if (context.mounted) {
              Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const LoginScreen()),
                (route) => false,
              );
            }
          },
        ),
      ],
    );
  }
}
