import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/models.dart';
import '../../services/location_service.dart';
import '../../services/services.dart';
import '../../services/socket_service.dart';
import '../../state/auth_store.dart';
import '../../widgets/ui.dart';
import '../auth/register_screen.dart' show kBloodGroups;

enum _Step { phone, otp, request, tracking }

/// The no-account path: verify a phone, broadcast a request, then watch donors
/// respond live. Mirrors client/src/pages/public/PublicRequestPage.jsx.
class PublicRequestScreen extends StatefulWidget {
  const PublicRequestScreen({super.key});

  @override
  State<PublicRequestScreen> createState() => _PublicRequestScreenState();
}

class _PublicRequestScreenState extends State<PublicRequestScreen> {
  _Step _step = _Step.phone;

  final _phone = TextEditingController();
  final _otp = TextEditingController();
  final _city = TextEditingController();
  final _notes = TextEditingController();

  String? _sessionId;
  String? _devOtp; // SMS is simulated server-side, so the code comes back inline
  String _bloodGroup = 'O+';
  int _units = 1;
  String _urgency = 'HIGH';
  String _scope = 'RADIUS';
  double? _lat;
  double? _lng;

  bool _loading = false;
  bool _locating = false;
  String? _error;
  String? _activeRequestId;
  List<BloodRequest> _myRequests = const [];

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    _city.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _requestOtp() => _run(() async {
        final (sessionId, otp) = await AuthService.requestOtp(_phone.text.trim());
        setState(() {
          _sessionId = sessionId;
          _devOtp = otp;
          _step = _Step.otp;
        });
      });

  Future<void> _verifyOtp() => _run(() async {
        final token = await AuthService.verifyOtp(_sessionId!, _otp.text.trim());
        // A public session carries no User row — role "public" tells the rest
        // of the app to skip anything that assumes a registered account.
        await context.read<AuthStore>().setAuth(
              AuthUser(id: _sessionId!, role: 'public', email: _phone.text.trim()),
              token,
            );
        setState(() => _step = _Step.request);
        await _loadMyRequests();
      });

  /// History is keyed on the phone number, not the session, so earlier
  /// broadcasts survive re-verifying (each verify issues a fresh session).
  Future<void> _loadMyRequests() async {
    try {
      final list = await RequestService.myPublicRequests();
      if (mounted) setState(() => _myRequests = list);
    } catch (_) {
      // Non-fatal — the new-request form is still perfectly usable.
    }
  }

  Future<void> _detectLocation() async {
    setState(() {
      _locating = true;
      _error = null;
    });
    try {
      final result = await LocationService.instance.getCurrentLocationWithCity();
      setState(() {
        _lat = result.lat;
        _lng = result.lng;
        if (_city.text.trim().isEmpty && result.city != null) _city.text = result.city!;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _submitRequest() => _run(() async {
        if (_lat == null || _lng == null) {
          throw 'Set your location first so nearby donors can be matched.';
        }
        if (_scope == 'CITY' && _city.text.trim().isEmpty) {
          throw 'Enter a city to broadcast to.';
        }

        final request = await RequestService.createAsPublic(
          bloodGroup: _bloodGroup,
          unitsNeeded: _units,
          urgency: _urgency,
          lat: _lat!,
          lng: _lng!,
          city: _scope == 'CITY' ? _city.text.trim() : null,
          notes: _notes.text.trim(),
        );

        setState(() {
          _activeRequestId = request.id;
          _step = _Step.tracking;
        });
        await _loadMyRequests();
      });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_step == _Step.tracking ? 'Your request' : 'Request blood'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          child: switch (_step) {
            _Step.phone => _buildPhoneStep(),
            _Step.otp => _buildOtpStep(),
            _Step.request => _buildRequestStep(),
            _Step.tracking => _RequestTracker(
                requestId: _activeRequestId!,
                onBack: () => setState(() => _step = _Step.request),
              ),
          },
        ),
      ),
    );
  }

  Widget _buildHeader() => Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.blood600,
              borderRadius: BorderRadius.circular(13),
            ),
            child: const Icon(Icons.phone_outlined, color: Colors.white, size: 20),
          ),
          const SizedBox(height: 13),
          const Text(
            'Request blood — no account needed',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 5),
          const Text(
            'Verify your phone, then broadcast a request to eligible donors.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: AppColors.ink500),
          ),
          const SizedBox(height: 22),
        ],
      );

  Widget _buildPhoneStep() => Column(
        children: [
          _buildHeader(),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ErrorBanner(_error),
                LabeledField(
                  label: 'Phone number',
                  child: TextField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(hintText: '+91…'),
                  ),
                ),
                const SizedBox(height: 18),
                AppButton(
                  label: 'Send OTP',
                  expand: true,
                  loading: _loading,
                  onPressed: _requestOtp,
                ),
              ],
            ),
          ),
        ],
      );

  Widget _buildOtpStep() => Column(
        children: [
          _buildHeader(),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ErrorBanner(_error),
                Container(
                  padding: const EdgeInsets.all(11),
                  decoration: BoxDecoration(
                    color: AppColors.warningBg,
                    borderRadius: BorderRadius.circular(9),
                    border: Border.all(color: const Color(0xFFFDE68A)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.verified_user_outlined, size: 15, color: Color(0xFF92400E)),
                      const SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          'SMS delivery is simulated in this build — your OTP is $_devOtp.',
                          style: const TextStyle(fontSize: 12, color: Color(0xFF92400E), height: 1.35),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _otp,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 20, letterSpacing: 8, fontWeight: FontWeight.w600),
                  decoration: const InputDecoration(hintText: '000000', counterText: ''),
                ),
                const SizedBox(height: 14),
                AppButton(label: 'Verify', expand: true, loading: _loading, onPressed: _verifyOtp),
              ],
            ),
          ),
        ],
      );

  Widget _buildRequestStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_myRequests.isNotEmpty) ...[
          const Text(
            'YOUR PREVIOUS REQUESTS',
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: AppColors.ink500,
            ),
          ),
          const SizedBox(height: 8),
          ..._myRequests.take(5).map(
                (r) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: AppCard(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    onTap: () => setState(() {
                      _activeRequestId = r.id;
                      _step = _Step.tracking;
                    }),
                    child: Row(
                      children: [
                        AppBadge(r.bloodGroup, color: AppColors.blood600),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '${r.unitsClaimed}/${r.unitsNeeded} · ${r.status}',
                            style: const TextStyle(fontSize: 12.5),
                          ),
                        ),
                        Text(
                          r.createdAt == null ? '' : DateFormat.yMd().format(r.createdAt!),
                          style: const TextStyle(fontSize: 11, color: AppColors.ink400),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          const SizedBox(height: 18),
        ],

        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ErrorBanner(_error),

              const _StepLabel('1. Your location'),
              AppButton(
                label: _locating
                    ? 'Detecting…'
                    : (_lat == null ? 'Use my current location' : 'Update location'),
                icon: Icons.my_location,
                variant: AppButtonVariant.secondary,
                small: true,
                onPressed: _locating ? null : _detectLocation,
              ),
              if (_lat != null) ...[
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
              const SizedBox(height: 20),

              const _StepLabel('2. Who should see this?'),
              SegmentedToggle<String>(
                value: _scope,
                onChanged: (v) => setState(() => _scope = v),
                options: const [
                  (value: 'RADIUS', label: 'Nearby donors'),
                  (value: 'CITY', label: 'Everyone in a city'),
                ],
              ),
              const SizedBox(height: 9),
              if (_scope == 'RADIUS')
                const Text(
                  'Matches the closest eligible donors first, widening the search area if too few respond.',
                  style: TextStyle(fontSize: 11.5, color: AppColors.ink400, height: 1.35),
                )
              else ...[
                TextField(
                  controller: _city,
                  decoration: const InputDecoration(hintText: 'City, e.g. Kochi'),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Alerts every eligible donor registered in this city, regardless of exact distance.',
                  style: TextStyle(fontSize: 11.5, color: AppColors.ink400, height: 1.35),
                ),
              ],
              const SizedBox(height: 20),

              const _StepLabel("3. What's needed"),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      value: _bloodGroup,
                      items: kBloodGroups.map((g) => DropdownMenuItem(value: g, child: Text(g))).toList(),
                      onChanged: (v) => setState(() => _bloodGroup = v ?? 'O+'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      value: _units,
                      items: List.generate(10, (i) => i + 1)
                          .map((n) => DropdownMenuItem(value: n, child: Text('$n unit${n > 1 ? "s" : ""}')))
                          .toList(),
                      onChanged: (v) => setState(() => _units = v ?? 1),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _urgency,
                items: const [
                  DropdownMenuItem(value: 'CRITICAL', child: Text('Critical')),
                  DropdownMenuItem(value: 'HIGH', child: Text('High')),
                  DropdownMenuItem(value: 'NORMAL', child: Text('Normal')),
                ],
                onChanged: (v) => setState(() => _urgency = v ?? 'HIGH'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _notes,
                maxLines: 2,
                decoration: const InputDecoration(hintText: 'Notes (hospital name, patient context…)'),
              ),
              const SizedBox(height: 20),

              AppButton(
                label: 'Broadcast request',
                icon: Icons.send,
                expand: true,
                loading: _loading,
                onPressed: _submitRequest,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _StepLabel extends StatelessWidget {
  final String text;
  const _StepLabel(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 9),
        child: Text(
          text.toUpperCase(),
          style: const TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
            color: AppColors.ink500,
          ),
        ),
      );
}

/// Live view of one broadcast. Subscribes to the request's socket room so
/// donor accept/cancel events land instantly, with a 15s poll as a safety net
/// for a dropped connection.
class _RequestTracker extends StatefulWidget {
  final String requestId;
  final VoidCallback onBack;

  const _RequestTracker({required this.requestId, required this.onBack});

  @override
  State<_RequestTracker> createState() => _RequestTrackerState();
}

class _RequestTrackerState extends State<_RequestTracker> {
  BloodRequest? _request;
  Timer? _poll;
  VoidCallback? _socketDisposer;
  String? _busyDonorId;

  @override
  void initState() {
    super.initState();
    _load();
    SocketService.instance.subscribeToRequest(widget.requestId);
    _socketDisposer = SocketService.instance.on('request:updated', (_) => _load());
    _poll = Timer.periodic(const Duration(seconds: 15), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _socketDisposer?.call();
    SocketService.instance.unsubscribeFromRequest(widget.requestId);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await RequestService.byId(widget.requestId);
      if (mounted) setState(() => _request = r);
    } catch (_) {
      // Keep showing the last good snapshot rather than blanking the screen.
    }
  }

  Future<void> _mark(String donorId, bool completed) async {
    setState(() => _busyDonorId = donorId);
    try {
      if (completed) {
        await ResponseService.markCompleted(widget.requestId, donorId);
      } else {
        await ResponseService.markNoShow(widget.requestId, donorId);
      }
      await _load();
      if (mounted) {
        showSnack(context, completed ? 'Donation confirmed. Thank you!' : 'Marked as a no-show.');
      }
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), isError: true);
    } finally {
      if (mounted) setState(() => _busyDonorId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final request = _request;
    if (request == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator(color: AppColors.blood600)),
      );
    }

    final accepted = request.responses
        .where((r) => r.status == 'ACCEPTED' || r.status == 'COMPLETED')
        .length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: widget.onBack,
            icon: const Icon(Icons.arrow_back, size: 15, color: AppColors.blood600),
            label: const Text(
              'New request / previous requests',
              style: TextStyle(color: AppColors.blood600, fontSize: 12.5, fontWeight: FontWeight.w600),
            ),
          ),
        ),
        const SizedBox(height: 6),

        AppCard(
          color: AppColors.ink50,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${request.bloodGroup} · ${request.unitsClaimed}/${request.unitsNeeded} units',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                  ),
                  AppBadge.status(request.status),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                accepted == 0
                    ? 'Waiting for a donor to respond…'
                    : '$accepted donor(s) accepted so far.',
                style: const TextStyle(fontSize: 12.5, color: AppColors.ink500),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        if (request.responses.isEmpty)
          const EmptyState(title: 'No donors alerted yet')
        else
          ...request.responses.map(
            (r) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: AppCard(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${r.donorName ?? "Donor"} · ${r.donorBloodGroup ?? ""}',
                            style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                          ),
                        ),
                        AppBadge.status(r.status),
                      ],
                    ),
                    if (r.distanceKm != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        '${r.distanceKm!.toStringAsFixed(1)} km · ETA ${r.etaMinutes ?? "—"} min',
                        style: const TextStyle(fontSize: 11.5, color: AppColors.ink400),
                      ),
                    ],
                    if (r.status == 'ACCEPTED') ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: AppButton(
                              label: 'Mark donated',
                              icon: Icons.check_circle_outline,
                              variant: AppButtonVariant.success,
                              small: true,
                              loading: _busyDonorId == r.donorId,
                              onPressed: () => _mark(r.donorId, true),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: AppButton(
                              label: 'No-show',
                              icon: Icons.cancel_outlined,
                              variant: AppButtonVariant.dangerSubtle,
                              small: true,
                              onPressed: _busyDonorId == r.donorId ? null : () => _mark(r.donorId, false),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
