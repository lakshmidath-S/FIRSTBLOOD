import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../config/env.dart';
import '../../config/theme.dart';
import '../../models/models.dart';
import '../../services/services.dart';
import '../../services/socket_service.dart';
import '../../widgets/ui.dart';

/// One request's live state: donor responses, a map of accepted donors' last
/// known positions, and the buttons to confirm a donation or flag a no-show.
class RequestDetailScreen extends StatefulWidget {
  final String requestId;

  const RequestDetailScreen({super.key, required this.requestId});

  @override
  State<RequestDetailScreen> createState() => _RequestDetailScreenState();
}

class _RequestDetailScreenState extends State<RequestDetailScreen> {
  BloodRequest? _request;
  bool _loading = true;
  String? _busyDonorId;

  /// donorId -> most recent ping. Populated purely from socket events; these
  /// are ~1/min and approximate by design, not turn-by-turn tracking.
  final Map<String, ({double lat, double lng, DateTime at})> _donorLocations = {};

  Timer? _poll;
  final List<VoidCallback> _disposers = [];

  @override
  void initState() {
    super.initState();
    _load().then((_) {
      if (mounted) setState(() => _loading = false);
    });

    SocketService.instance.subscribeToRequest(widget.requestId);
    _disposers.add(SocketService.instance.on('request:updated', (_) => _load()));
    _disposers.add(SocketService.instance.on('notification:new', (_) => _load()));
    _disposers.add(SocketService.instance.on('donor:location_update', (data) {
      if (data is! Map) return;
      final map = data.cast<String, dynamic>();
      final donorId = map['donorId'] as String?;
      final lat = (map['lat'] as num?)?.toDouble();
      final lng = (map['lng'] as num?)?.toDouble();
      if (donorId == null || lat == null || lng == null) return;
      if (!mounted) return;
      setState(() {
        _donorLocations[donorId] = (
          lat: lat,
          lng: lng,
          at: DateTime.tryParse((map['recordedAt'] ?? '') as String)?.toLocal() ?? DateTime.now(),
        );
      });
    }));

    _poll = Timer.periodic(const Duration(seconds: 15), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    for (final d in _disposers) {
      d();
    }
    SocketService.instance.unsubscribeFromRequest(widget.requestId);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await RequestService.byId(widget.requestId);
      if (mounted) setState(() => _request = r);
    } catch (_) {
      // Keep the last good snapshot.
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
        showSnack(context, completed ? 'Donation confirmed.' : 'Marked as a no-show.');
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

    return Scaffold(
      appBar: AppBar(title: const Text('Request')),
      body: _loading || request == null
          ? const Center(child: CircularProgressIndicator(color: AppColors.blood600))
          : RefreshIndicator(
              color: AppColors.blood600,
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                '${request.bloodGroup} · ${request.unitsClaimed}/${request.unitsNeeded} units',
                                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                              ),
                            ),
                            AppBadge.status(request.status),
                          ],
                        ),
                        const SizedBox(height: 7),
                        Row(
                          children: [
                            const Icon(Icons.place_outlined, size: 13, color: AppColors.ink400),
                            const SizedBox(width: 4),
                            Text(
                              request.scopeLabel,
                              style: const TextStyle(fontSize: 12, color: AppColors.ink400),
                            ),
                          ],
                        ),
                        if (request.notes != null && request.notes!.isNotEmpty) ...[
                          const SizedBox(height: 9),
                          Text(
                            request.notes!,
                            style: const TextStyle(fontSize: 13, color: AppColors.ink600, height: 1.4),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),

                  if (_hasMappableDonors(request)) ...[
                    _buildMap(request),
                    const SizedBox(height: 14),
                  ],

                  const SectionHeading(title: 'Donor responses'),
                  if (request.responses.isEmpty)
                    const EmptyState(title: 'No donors alerted yet')
                  else
                    ...request.responses.map(_buildResponseCard),
                ],
              ),
            ),
    );
  }

  bool _hasMappableDonors(BloodRequest request) =>
      request.lat != null &&
      request.responses.any((r) => r.status == 'ACCEPTED') &&
      _donorLocations.isNotEmpty;

  Widget _buildMap(BloodRequest request) {
    final center = LatLng(request.lat!, request.lng!);
    final accepted = request.responses.where((r) => r.status == 'ACCEPTED').toList();

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Column(
        children: [
          SizedBox(
            height: 260,
            child: FlutterMap(
              options: MapOptions(initialCenter: center, initialZoom: 12),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: Env.userAgent,
                ),
                MarkerLayer(
                  markers: [
                    // The request itself.
                    Marker(
                      point: center,
                      width: 22,
                      height: 22,
                      child: const _Dot(color: AppColors.blood500),
                    ),
                    // Accepted donors with at least one ping received.
                    ...accepted
                        .where((r) => _donorLocations.containsKey(r.donorId))
                        .map((r) {
                      final loc = _donorLocations[r.donorId]!;
                      return Marker(
                        point: LatLng(loc.lat, loc.lng),
                        width: 18,
                        height: 18,
                        child: const _Dot(color: AppColors.info),
                      );
                    }),
                  ],
                ),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            color: AppColors.ink50,
            child: const Text(
              'Donor positions refresh roughly once a minute — treat as approximate, not turn-by-turn.',
              style: TextStyle(fontSize: 11, color: AppColors.ink400),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResponseCard(RequestResponseItem r) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AppCard(
        padding: const EdgeInsets.all(13),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${r.donorName ?? r.donorId} · ${r.donorBloodGroup ?? ""}',
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                  ),
                ),
                AppBadge.status(r.status),
              ],
            ),
            const SizedBox(height: 5),
            Text(
              '${r.distanceKm != null ? "${r.distanceKm!.toStringAsFixed(1)} km" : "distance n/a"}'
              ' · ETA ${r.etaMinutes ?? "—"} min',
              style: const TextStyle(fontSize: 11.5, color: AppColors.ink400),
            ),
            if (r.status == 'ACCEPTED') ...[
              const SizedBox(height: 11),
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
    );
  }
}

class _Dot extends StatelessWidget {
  final Color color;
  const _Dot({required this.color});

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2.5),
          boxShadow: const [BoxShadow(color: Color(0x330F172A), blurRadius: 4)],
        ),
      );
}
