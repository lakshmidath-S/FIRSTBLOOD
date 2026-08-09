import 'dart:async';

import 'package:flutter/material.dart';

import '../../config/theme.dart';
import '../../main.dart' show DashboardAppBar;
import '../../models/models.dart';
import '../../services/location_service.dart';
import '../../services/services.dart';
import '../../services/socket_service.dart';
import '../../widgets/ui.dart';

class DonorDashboard extends StatefulWidget {
  const DonorDashboard({super.key});

  @override
  State<DonorDashboard> createState() => _DonorDashboardState();
}

class _DonorDashboardState extends State<DonorDashboard> {
  DonorProfile? _profile;
  List<RequestResponseItem> _responses = const [];
  final _city = TextEditingController();
  bool _cityTouched = false;
  bool _loading = true;
  String? _locStatus;
  String? _busyRequestId;

  Timer? _poll;
  Timer? _pingTimer;
  VoidCallback? _notifDisposer;
  VoidCallback? _updateDisposer;

  @override
  void initState() {
    super.initState();
    _loadAll();

    // Live-refresh on any alert or request change, same as the web dashboard.
    _notifDisposer = SocketService.instance.on('notification:new', (_) => _loadResponses());
    _updateDisposer = SocketService.instance.on('request:updated', (_) => _loadResponses());
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _loadResponses());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _pingTimer?.cancel();
    _notifDisposer?.call();
    _updateDisposer?.call();
    _city.dispose();
    super.dispose();
  }

  Future<void> _loadAll() async {
    await Future.wait([_loadProfile(), _loadResponses()]);
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadProfile() async {
    try {
      final p = await DonorService.me();
      if (!mounted) return;
      setState(() {
        _profile = p;
        // Don't clobber an edit in progress on a background refresh.
        if (!_cityTouched && p.city != null) _city.text = p.city!;
      });
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), isError: true);
    }
  }

  Future<void> _loadResponses() async {
    try {
      final list = await DonorService.myResponses();
      if (!mounted) return;
      setState(() => _responses = list);
      _syncLocationPings();
    } catch (_) {
      // Keep the last good list rather than blanking the screen.
    }
  }

  /// While any response is ACCEPTED, push a coarse location ping ~once a
  /// minute so the requester's map can show the donor is en route. Stops as
  /// soon as nothing is accepted, to avoid draining the battery.
  void _syncLocationPings() {
    final accepted = _responses.where((r) => r.status == 'ACCEPTED').toList();

    if (accepted.isEmpty) {
      _pingTimer?.cancel();
      _pingTimer = null;
      return;
    }
    if (_pingTimer != null) return; // already running

    Future<void> tick() async {
      final active = _responses.where((r) => r.status == 'ACCEPTED').toList();
      if (active.isEmpty) return;
      try {
        final pos = await LocationService.instance.getCurrentPosition();
        for (final r in active) {
          SocketService.instance.sendLocationPing(r.requestId, pos.latitude, pos.longitude);
        }
      } catch (_) {
        // A single failed fix is fine — the next tick will try again.
      }
    }

    tick();
    _pingTimer = Timer.periodic(const Duration(minutes: 1), (_) => tick());
  }

  Future<void> _toggleAvailability(bool value) async {
    try {
      await DonorService.setAvailability(value);
      await _loadProfile();
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), isError: true);
    }
  }

  Future<void> _shareLocation() async {
    setState(() => _locStatus = 'Getting location…');
    try {
      final result = await LocationService.instance.getCurrentLocationWithCity();
      await DonorService.updateLocation(result.lat, result.lng, city: result.city);
      if (result.city != null) {
        _city.text = result.city!;
        _cityTouched = false;
      }
      setState(() => _locStatus = result.city != null
          ? 'Location updated — detected city: ${result.city}.'
          : "Location updated (couldn't detect city automatically).");
      await _loadProfile();
    } catch (e) {
      if (mounted) setState(() => _locStatus = e.toString());
    }
  }

  Future<void> _saveCity() async {
    try {
      await DonorService.updateCity(_city.text);
      _cityTouched = false;
      await _loadProfile();
      if (mounted) showSnack(context, 'City saved.');
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), isError: true);
    }
  }

  Future<void> _respond(String requestId, String action) async {
    setState(() => _busyRequestId = requestId);
    try {
      switch (action) {
        case 'accept':
          await ResponseService.accept(requestId);
        case 'decline':
          await ResponseService.decline(requestId);
        case 'cancel':
          await ResponseService.cancel(requestId);
      }
      await _loadResponses();
      if (mounted && action == 'accept') {
        showSnack(context, "You're in. The requester can now see you're on the way.");
      }
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), isError: true);
    } finally {
      if (mounted) setState(() => _busyRequestId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = _profile;
    final alerted = _responses.where((r) => r.status == 'ALERTED').toList();
    final others = _responses.where((r) => r.status != 'ALERTED').toList();

    return Scaffold(
      appBar: const DashboardAppBar(title: 'FIRSTBLOOD'),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.blood600))
          : RefreshIndicator(
              color: AppColors.blood600,
              onRefresh: _loadAll,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  if (profile != null) _buildProfileCard(profile),
                  const SizedBox(height: 22),

                  SectionHeading(
                    title: 'Incoming alerts',
                    eyebrow: 'Live',
                    action: alerted.isEmpty
                        ? null
                        : AppBadge('${alerted.length} active', color: AppColors.blood600),
                  ),
                  if (alerted.isEmpty)
                    const EmptyState(
                      title: 'No active alerts right now',
                      description: "You'll get a push notification the instant a matching request comes in.",
                    )
                  else
                    ...alerted.map(_buildAlertCard),

                  const SizedBox(height: 24),
                  const SectionHeading(title: 'Your responses', eyebrow: 'History'),
                  if (others.isEmpty)
                    const EmptyState(title: 'No past responses yet')
                  else
                    ...others.map(_buildHistoryCard),
                ],
              ),
            ),
    );
  }

  Widget _buildProfileCard(DonorProfile profile) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.blood50,
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(Icons.water_drop, color: AppColors.blood600, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      profile.fullName,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Text(
                          profile.bloodGroup,
                          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
                        ),
                        const Text(' · ', style: TextStyle(color: AppColors.ink300)),
                        Flexible(
                          child: Text(
                            profile.isEligibleToDonate
                                ? 'eligible to donate now'
                                : 'not yet eligible (90-day rule)',
                            style: TextStyle(
                              fontSize: 12.5,
                              color: profile.isEligibleToDonate ? AppColors.success : AppColors.warning,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      profile.isMatchable
                          ? '● Visible to donor searches'
                          : '○ Not currently appearing in searches',
                      style: TextStyle(
                        fontSize: 11,
                        color: profile.isMatchable ? AppColors.success : AppColors.ink400,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.ink50,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.ink200),
            ),
            child: Row(
              children: [
                const Expanded(
                  child: Text('Available for requests', style: TextStyle(fontSize: 13.5)),
                ),
                Switch(
                  value: profile.isAvailable,
                  activeColor: AppColors.blood600,
                  onChanged: _toggleAvailability,
                ),
              ],
            ),
          ),
          const Divider(height: 24),
          AppButton(
            label: 'Update my location',
            icon: Icons.my_location,
            variant: AppButtonVariant.secondary,
            small: true,
            onPressed: _shareLocation,
          ),
          if (_locStatus != null) ...[
            const SizedBox(height: 8),
            Text(_locStatus!, style: const TextStyle(fontSize: 11.5, color: AppColors.ink500)),
          ],
          const SizedBox(height: 14),
          const Text(
            'City (used for "broadcast to everyone in a city" requests)',
            style: TextStyle(fontSize: 11.5, color: AppColors.ink500),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _city,
                  onChanged: (_) => _cityTouched = true,
                  decoration: const InputDecoration(
                    hintText: 'e.g. Kochi',
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              AppButton(
                label: 'Save',
                variant: AppButtonVariant.subtle,
                small: true,
                onPressed: _city.text.trim().isEmpty ? null : _saveCity,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAlertCard(RequestResponseItem r) {
    final request = r.request;
    final color = kUrgencyColor[request?.urgency ?? 'NORMAL'] ?? AppColors.blood600;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [BoxShadow(color: Color(0x1A0F172A), blurRadius: 10, offset: Offset(0, 3))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${request?.bloodGroup ?? ""} needed · ${request?.unitsRemaining ?? 0} unit(s) left',
                  style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
              Row(
                children: [
                  const Icon(Icons.place, size: 12, color: Colors.white70),
                  const SizedBox(width: 3),
                  Text(
                    r.distanceKm != null ? '${r.distanceKm!.toStringAsFixed(1)} km' : 'in your city',
                    style: const TextStyle(color: Colors.white70, fontSize: 11.5),
                  ),
                ],
              ),
            ],
          ),
          if (request?.notes != null && request!.notes!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              request.notes!,
              style: const TextStyle(color: Colors.white70, fontSize: 13, height: 1.35),
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Accept',
                  icon: Icons.check_circle_outline,
                  variant: AppButtonVariant.secondary,
                  small: true,
                  loading: _busyRequestId == r.requestId,
                  onPressed: () => _respond(r.requestId, 'accept'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: GestureDetector(
                  onTap: _busyRequestId == r.requestId ? null : () => _respond(r.requestId, 'decline'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Text(
                      'Decline',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryCard(RequestResponseItem r) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AppCard(
        padding: const EdgeInsets.all(13),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        r.request?.bloodGroup ?? '',
                        style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(width: 8),
                      AppBadge.status(r.status),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${r.distanceKm != null ? "${r.distanceKm!.toStringAsFixed(1)} km" : "distance n/a"}'
                    ' · ETA ${r.etaMinutes ?? "—"} min',
                    style: const TextStyle(fontSize: 11.5, color: AppColors.ink400),
                  ),
                ],
              ),
            ),
            if (r.status == 'ACCEPTED')
              AppButton(
                label: 'Cancel',
                variant: AppButtonVariant.dangerSubtle,
                small: true,
                loading: _busyRequestId == r.requestId,
                onPressed: () => _respond(r.requestId, 'cancel'),
              ),
          ],
        ),
      ),
    );
  }
}
