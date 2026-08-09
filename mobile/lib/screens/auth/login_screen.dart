import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../services/services.dart';
import '../../state/auth_store.dart';
import '../../widgets/ui.dart';
import '../public/public_request_screen.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final (user, token) = await AuthService.login(_email.text.trim(), _password.text);
      // setAuth also connects the socket and registers this device for push,
      // so nothing else needs doing here.
      await context.read<AuthStore>().setAuth(user, token);
      // The root router rebuilds on the auth change and lands the user on
      // their role's dashboard, so just unwind back to it.
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Log in')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.blood600,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: const Icon(Icons.login, color: Colors.white, size: 21),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Welcome back',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 5),
              const Text(
                'Log in to your donor, hospital, or admin account.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13.5, color: AppColors.ink500),
              ),
              const SizedBox(height: 24),

              AppCard(
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ErrorBanner(_error),
                      LabeledField(
                        label: 'Email',
                        child: TextFormField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          autocorrect: false,
                          decoration: const InputDecoration(hintText: 'you@example.com'),
                          validator: (v) =>
                              (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
                        ),
                      ),
                      const SizedBox(height: 14),
                      LabeledField(
                        label: 'Password',
                        child: TextFormField(
                          controller: _password,
                          obscureText: _obscure,
                          decoration: InputDecoration(
                            hintText: '••••••••',
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                                size: 19,
                                color: AppColors.ink400,
                              ),
                              onPressed: () => setState(() => _obscure = !_obscure),
                            ),
                          ),
                          validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
                        ),
                      ),
                      const SizedBox(height: 20),
                      AppButton(
                        label: 'Log in',
                        expand: true,
                        loading: _loading,
                        onPressed: _submit,
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),
              TextButton(
                onPressed: () => Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => const RegisterScreen()),
                ),
                child: const Text(
                  'New here? Create an account',
                  style: TextStyle(color: AppColors.blood600, fontWeight: FontWeight.w600),
                ),
              ),
              TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const PublicRequestScreen()),
                ),
                child: const Text(
                  'No account? Request blood with your phone',
                  style: TextStyle(color: AppColors.ink500, fontSize: 12.5),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
