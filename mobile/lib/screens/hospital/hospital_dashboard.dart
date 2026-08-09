import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../config/theme.dart';
import '../../main.dart' show DashboardAppBar;
import '../../models/models.dart';
import '../../services/location_service.dart';
import '../../services/services.dart';
import '../../services/socket_service.dart';
import '../../widgets/ui.dart';
import 'new_request_screen.dart';
import 'request_detail_screen.dart';

class HospitalDashboard extends StatefulWidget {
  const HospitalDashboard({super.key});

  @override
  State<HospitalDashboard> createState() => _HospitalDashboardState();
}

class _HospitalDashboardState extends State<HospitalDashboard> {
  HospitalProfile? _profile;
  List<BloodRequest> _requests = const [];
  bool _loading = true;

  Timer? _poll;
  VoidCallback? _notifDisposer;
  VoidCallback? _updateDisposer;

  @override
  void initState() {
    super.initState();
    _loadAll();
    _notifDisposer = SocketService.instance.on('notification:new', (_) => _loadRequests());
    _updateDisposer = SocketService.instance.on('request:updated', (_) => _loadRequests());
    _poll = Timer.periodic(const Duration(seconds: 15), (_) => _loadRequests());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _notifDisposer?.call();
    _updateDisposer?.call();
    super.dispose();
  }

  Future<void> _loadAll() async {
    await Future.wait([_loadProfile(), _loadRequests()]);
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadProfile() async {
    try {
      final p = await HospitalService.me();
      if (mounted) setState(() => _profile = p);
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), isError: true);
    }
  }

  Future<void> _loadRequests() async {
    try {
      final list = await HospitalService.myRequests();
      if (mounted) setState(() => _requests = list);
    } catch (_) {
      // Keep the last good list.
    }
  }

  Future<void> _openNewRequest() async {
    // The new-request screen replaces itself with the request detail view, so
    // whatever the user does there, refresh the list when they come back.
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => NewRequestScreen(profile: _profile)),
    );
    if (mounted) _loadRequests();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const DashboardAppBar(title: 'FIRSTBLOOD'),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.blood600,
        foregroundColor: Colors.white,
        onPressed: _openNewRequest,
        icon: const Icon(Icons.add),
        label: const Text('New request'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.blood600))
          : RefreshIndicator(
              color: AppColors.blood600,
              onRefresh: _loadAll,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                children: [
                  if (_profile != null)
                    _HospitalProfileCard(profile: _profile!, onSaved: _loadProfile),
                  const SizedBox(height: 22),
                  SectionHeading(
                    title: 'Your requests',
                    eyebrow: 'Activity',
                    action: Text(
                      '${_requests.length} total',
                      style: const TextStyle(fontSize: 12, color: AppColors.ink400),
                    ),
                  ),
                  if (_requests.isEmpty)
                    const EmptyState(
                      title: 'No requests yet',
                      description: 'Create your first request to start alerting nearby eligible donors.',
                    )
                  else
                    ..._requests.map(_buildRequestCard),
                ],
              ),
            ),
    );
  }

  Widget _buildRequestCard(BloodRequest r) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        onTap: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => RequestDetailScreen(requestId: r.id)),
          );
          _loadRequests();
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${r.bloodGroup} · ${r.unitsClaimed}/${r.unitsNeeded} units',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                ),
                AppBadge.status(r.status),
              ],
            ),
            const SizedBox(height: 7),
            Text(
              '${r.scopeLabel} · ${r.acceptedCount} donor(s) accepted'
              '${r.createdAt != null ? " · ${DateFormat.yMMMd().add_jm().format(r.createdAt!)}" : ""}',
              style: const TextStyle(fontSize: 11.5, color: AppColors.ink400, height: 1.35),
            ),
          ],
        ),
      ),
    );
  }
}

/// The hospital's fixed city + coordinates, set at registration and reused by
/// every request. Editable here in case it was wrong or the hospital moved.
class _HospitalProfileCard extends StatefulWidget {
  final HospitalProfile profile;
  final Future<void> Function() onSaved;

  const _HospitalProfileCard({required this.profile, required this.onSaved});

  @override
  State<_HospitalProfileCard> createState() => _HospitalProfileCardState();
}

class _HospitalProfileCardState extends State<_HospitalProfileCard> {
  bool _editing = false;
  bool _saving = false;
  bool _locating = false;
  String? _locStatus;
  double? _lat;
  double? _lng;
  final _city = TextEditingController();

  @override
  void dispose() {
    _city.dispose();
    super.dispose();
  }

  void _startEditing() {
    setState(() {
      _city.text = widget.profile.city ?? '';
      _lat = widget.profile.lat;
      _lng = widget.profile.lng;
      _editing = true;
    });
  }

  Future<void> _detect() async {
    setState(() {
      _locating = true;
      _locStatus = 'Getting location…';
    });
    try {
      final result = await LocationService.instance.getCurrentLocationWithCity();
      setState(() {
        _lat = result.lat;
        _lng = result.lng;
        if (result.city != null) _city.text = result.city!;
        _locStatus = 'Location detected.';
      });
    } catch (e) {
      setState(() => _locStatus = e.toString());
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _save() async {
    if (_city.text.trim().isEmpty || _lat == null || _lng == null) return;
    setState(() => _saving = true);
    try {
      await HospitalService.updateProfile(city: _city.text.trim(), lat: _lat, lng: _lng);
      await widget.onSaved();
      if (mounted) {
        setState(() {
          _editing = false;
          _locStatus = null;
        });
        showSnack(context, 'Location saved.');
      }
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.profile;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.infoBg,
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(Icons.local_hospital_outlined, color: AppColors.info, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p.hospitalName,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                    if (!_editing) ...[
                      const SizedBox(height: 3),
                      if (p.hasCity)
                        Row(
                          children: [
                            const Icon(Icons.place_outlined, size: 12, color: AppColors.ink400),
                            const SizedBox(width: 4),
                            Text(p.city!, style: const TextStyle(fontSize: 12.5, color: AppColors.ink500)),
                          ],
                        )
                      else
                        const Text(
                          'No city set — city broadcasts unavailable.',
                          style: TextStyle(fontSize: 12, color: AppColors.warning),
                        ),
                      if (!p.hasLocation)
                        const Text(
                          'No location set.',
                          style: TextStyle(fontSize: 12, color: AppColors.warning),
                        ),
                    ],
                  ],
                ),
              ),
              if (!_editing)
                IconButton(
                  tooltip: 'Edit city / location',
                  icon: const Icon(Icons.edit_outlined, size: 18, color: AppColors.ink500),
                  onPressed: _startEditing,
                ),
            ],
          ),
          if (_editing) ...[
            const Divider(height: 24),
            AppButton(
              label: _locating ? 'Detecting…' : 'Detect my location',
              icon: Icons.my_location,
              variant: AppButtonVariant.secondary,
              small: true,
              onPressed: _locating ? null : _detect,
            ),
            if (_locStatus != null) ...[
              const SizedBox(height: 8),
              Text(_locStatus!, style: const TextStyle(fontSize: 11.5, color: AppColors.ink500)),
            ],
            const SizedBox(height: 12),
            TextField(
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
            const SizedBox(height: 14),
            Row(
              children: [
                AppButton(
                  label: 'Save',
                  small: true,
                  loading: _saving,
                  onPressed: (_city.text.trim().isEmpty || _lat == null) ? null : _save,
                ),
                const SizedBox(width: 8),
                AppButton(
                  label: 'Cancel',
                  variant: AppButtonVariant.secondary,
                  small: true,
                  onPressed: () => setState(() => _editing = false),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
