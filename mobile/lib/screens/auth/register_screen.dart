import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../services/location_service.dart';
import '../../services/services.dart';
import '../../state/auth_store.dart';
import '../../widgets/ui.dart';

const kBloodGroups = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _phone = TextEditingController();
  final _fullName = TextEditingController();
  final _hospitalName = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();

  String _role = 'DONOR';
  String _bloodGroup = 'O+';

  // A hospital's coordinates are captured once here and reused for every
  // request it creates later, so they're mandatory at signup.
  double? _lat;
  double? _lng;
  bool _locating = false;
  String? _locStatus;

  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _phone.dispose();
    _fullName.dispose();
    _hospitalName.dispose();
    _address.dispose();
    _city.dispose();
    super.dispose();
  }

  Future<void> _detectLocation() async {
    setState(() {
      _locating = true;
      _locStatus = 'Getting location…';
    });
    try {
      final result = await LocationService.instance.getCurrentLocationWithCity();
      setState(() {
        _lat = result.lat;
        _lng = result.lng;
        if (result.city != null && result.city!.isNotEmpty) _city.text = result.city!;
        _locStatus = result.city != null
            ? "Detected ${result.city} — adjust below if that's not quite right."
            : 'Location detected. Enter your city below.';
      });
    } catch (e) {
      setState(() => _locStatus = e.toString());
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_role == 'HOSPITAL') {
      if (_city.text.trim().isEmpty) {
        return setState(() => _error = 'Set your hospital\'s city.');
      }
      if (_lat == null || _lng == null) {
        return setState(() => _error =
            'Set your hospital\'s location with "Detect my location" before creating an account.');
      }
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final profile = _role == 'DONOR'
          ? {'fullName': _fullName.text.trim(), 'bloodGroup': _bloodGroup}
          : {
              'hospitalName': _hospitalName.text.trim(),
              'address': _address.text.trim(),
              'city': _city.text.trim(),
              'lat': _lat,
              'lng': _lng,
            };

      final (user, token) = await AuthService.register(
        role: _role,
        email: _email.text.trim(),
        password: _password.text,
        phone: _phone.text.trim(),
        profile: profile,
      );
      await context.read<AuthStore>().setAuth(user, token);
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isHospital = _role == 'HOSPITAL';

    return Scaffold(
      appBar: AppBar(title: const Text('Create an account')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          child: AppCard(
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SegmentedToggle<String>(
                    value: _role,
                    onChanged: (v) => setState(() {
                      _role = v;
                      _error = null;
                    }),
                    options: const [
                      (value: 'DONOR', label: 'Donor'),
                      (value: 'HOSPITAL', label: 'Hospital'),
                    ],
                  ),
                  const SizedBox(height: 18),
                  ErrorBanner(_error),

                  LabeledField(
                    label: 'Email',
                    child: TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: const InputDecoration(hintText: 'you@example.com'),
                      validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
                    ),
                  ),
                  const SizedBox(height: 14),
                  LabeledField(
                    label: 'Password',
                    child: TextFormField(
                      controller: _password,
                      obscureText: true,
                      decoration: const InputDecoration(hintText: 'Min 8 characters'),
                      validator: (v) =>
                          (v == null || v.length < 8) ? 'Password must be at least 8 characters' : null,
                    ),
                  ),
                  const SizedBox(height: 14),
                  LabeledField(
                    label: 'Phone (optional)',
                    child: TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(hintText: '+91…'),
                    ),
                  ),
                  const SizedBox(height: 14),

                  if (!isHospital) ...[
                    LabeledField(
                      label: 'Full name',
                      child: TextFormField(
                        controller: _fullName,
                        decoration: const InputDecoration(hintText: 'Your name'),
                        validator: (v) => (!isHospital && (v == null || v.trim().isEmpty))
                            ? 'Enter your name'
                            : null,
                      ),
                    ),
                    const SizedBox(height: 14),
                    LabeledField(
                      label: 'Blood group',
                      child: DropdownButtonFormField<String>(
                        value: _bloodGroup,
                        items: kBloodGroups
                            .map((g) => DropdownMenuItem(value: g, child: Text(g)))
                            .toList(),
                        onChanged: (v) => setState(() => _bloodGroup = v ?? 'O+'),
                      ),
                    ),
                  ],

                  if (isHospital) ...[
                    LabeledField(
                      label: 'Hospital name',
                      child: TextFormField(
                        controller: _hospitalName,
                        decoration: const InputDecoration(hintText: 'e.g. Kochi City General Hospital'),
                        validator: (v) => (isHospital && (v == null || v.trim().isEmpty))
                            ? 'Enter the hospital name'
                            : null,
                      ),
                    ),
                    const SizedBox(height: 14),
                    LabeledField(
                      label: 'Address (optional)',
                      child: TextFormField(
                        controller: _address,
                        decoration: const InputDecoration(hintText: 'Street, area'),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.ink50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.ink200),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.place_outlined, size: 14, color: AppColors.ink500),
                              SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  'Set your city and location once — every request you create '
                                  'afterwards reuses it automatically.',
                                  style: TextStyle(fontSize: 12, color: AppColors.ink500, height: 1.35),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          AppButton(
                            label: _locating ? 'Detecting…' : 'Detect my location',
                            icon: Icons.my_location,
                            variant: AppButtonVariant.secondary,
                            small: true,
                            onPressed: _locating ? null : _detectLocation,
                          ),
                          if (_locStatus != null) ...[
                            const SizedBox(height: 8),
                            Text(
                              _locStatus!,
                              style: const TextStyle(fontSize: 11.5, color: AppColors.ink500),
                            ),
                          ],
                          const SizedBox(height: 10),
                          TextFormField(
                            controller: _city,
                            decoration: const InputDecoration(hintText: 'City, e.g. Kochi'),
                          ),
                          if (_lat != null && _lng != null) ...[
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                const Icon(Icons.check_circle, size: 14, color: AppColors.success),
                                const SizedBox(width: 5),
                                Text(
                                  'Location set (${_lat!.toStringAsFixed(4)}, ${_lng!.toStringAsFixed(4)})',
                                  style: const TextStyle(fontSize: 11.5, color: AppColors.success),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],

                  const SizedBox(height: 22),
                  AppButton(
                    label: 'Create account',
                    expand: true,
                    loading: _loading,
                    onPressed: _submit,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
