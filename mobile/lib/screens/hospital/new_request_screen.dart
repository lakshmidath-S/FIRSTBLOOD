import 'package:flutter/material.dart';

import '../../config/theme.dart';
import '../../models/models.dart';
import '../../services/services.dart';
import '../../widgets/ui.dart';
import '../auth/register_screen.dart' show kBloodGroups;
import 'request_detail_screen.dart';

/// Deliberately short: the hospital's location and city live on its profile,
/// so this form only asks what actually changes per request. Everything else
/// (coordinates, city) is filled in server-side from the saved profile.
class NewRequestScreen extends StatefulWidget {
  final HospitalProfile? profile;

  const NewRequestScreen({super.key, required this.profile});

  @override
  State<NewRequestScreen> createState() => _NewRequestScreenState();
}

class _NewRequestScreenState extends State<NewRequestScreen> {
  String _bloodGroup = 'O+';
  int _units = 1;
  String _urgency = 'HIGH';
  String _scope = 'RADIUS';
  int _radiusKm = 10;
  int _expiresInHours = 12;
  final _notes = TextEditingController();

  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  bool get _hasLocation => widget.profile?.hasLocation == true;
  bool get _hasCity => widget.profile?.hasCity == true;

  Future<void> _submit() async {
    if (!_hasLocation) {
      return setState(() => _error = "Set your hospital's location from the dashboard first.");
    }
    if (_scope == 'CITY' && !_hasCity) {
      return setState(() => _error = "Set your hospital's city from the dashboard first.");
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final request = await RequestService.createAsHospital(
        bloodGroup: _bloodGroup,
        unitsNeeded: _units,
        urgency: _urgency,
        broadcastScope: _scope,
        searchRadiusKm: _scope == 'RADIUS' ? _radiusKm : null,
        notes: _notes.text.trim(),
        expiresInHours: _expiresInHours,
      );

      if (!mounted) return;
      // Replace this screen with the new request's detail view, and tell the
      // dashboard to refresh when the user eventually pops back.
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => RequestDetailScreen(requestId: request.id)),
      );
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New blood request')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.profile != null && !_hasLocation)
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.warningBg,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFFDE68A)),
                  ),
                  child: const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.warning_amber_rounded, size: 17, color: Color(0xFF92400E)),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          "Your hospital's location isn't set yet — set it on your dashboard "
                          'before creating a request.',
                          style: TextStyle(fontSize: 12.5, color: Color(0xFF92400E), height: 1.35),
                        ),
                      ),
                    ],
                  ),
                ),

              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ErrorBanner(_error),

                    Row(
                      children: [
                        Expanded(
                          child: LabeledField(
                            label: 'Blood group',
                            child: DropdownButtonFormField<String>(
                              value: _bloodGroup,
                              items: kBloodGroups
                                  .map((g) => DropdownMenuItem(value: g, child: Text(g)))
                                  .toList(),
                              onChanged: (v) => setState(() => _bloodGroup = v ?? 'O+'),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: LabeledField(
                            label: 'Units needed',
                            child: DropdownButtonFormField<int>(
                              value: _units,
                              items: List.generate(20, (i) => i + 1)
                                  .map((n) => DropdownMenuItem(value: n, child: Text('$n')))
                                  .toList(),
                              onChanged: (v) => setState(() => _units = v ?? 1),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    LabeledField(
                      label: 'Urgency',
                      child: DropdownButtonFormField<String>(
                        value: _urgency,
                        items: const [
                          DropdownMenuItem(value: 'CRITICAL', child: Text('Critical')),
                          DropdownMenuItem(value: 'HIGH', child: Text('High')),
                          DropdownMenuItem(value: 'NORMAL', child: Text('Normal')),
                        ],
                        onChanged: (v) => setState(() => _urgency = v ?? 'HIGH'),
                      ),
                    ),
                    const SizedBox(height: 16),

                    const Text(
                      'Who should see this?',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.ink500),
                    ),
                    const SizedBox(height: 7),
                    SegmentedToggle<String>(
                      value: _scope,
                      onChanged: (v) => setState(() => _scope = v),
                      options: const [
                        (value: 'RADIUS', label: 'By distance'),
                        (value: 'CITY', label: 'Everyone in my city'),
                      ],
                    ),
                    const SizedBox(height: 12),

                    if (_scope == 'RADIUS') ...[
                      LabeledField(
                        label: 'Search radius — $_radiusKm km',
                        child: Slider(
                          value: _radiusKm.toDouble(),
                          min: 1,
                          max: 50,
                          divisions: 49,
                          activeColor: AppColors.blood600,
                          label: '$_radiusKm km',
                          onChanged: (v) => setState(() => _radiusKm = v.round()),
                        ),
                      ),
                      Text(
                        'Nearest eligible donors around your hospital'
                        '${widget.profile?.address != null ? " (${widget.profile!.address})" : ""}. '
                        'Widens automatically if it stays unfilled.',
                        style: const TextStyle(fontSize: 11.5, color: AppColors.ink400, height: 1.35),
                      ),
                    ] else
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.place_outlined, size: 14, color: AppColors.ink400),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              _hasCity
                                  ? 'Alerts every eligible donor registered in ${widget.profile!.city}.'
                                  : "Your hospital doesn't have a city set yet.",
                              style: const TextStyle(fontSize: 11.5, color: AppColors.ink500, height: 1.35),
                            ),
                          ),
                        ],
                      ),
                    const SizedBox(height: 16),

                    LabeledField(
                      label: 'Notes / patient context',
                      child: TextField(
                        controller: _notes,
                        maxLines: 2,
                        decoration: const InputDecoration(hintText: 'Optional'),
                      ),
                    ),
                    const SizedBox(height: 14),

                    LabeledField(
                      label: 'Expires in — $_expiresInHours hours',
                      child: Slider(
                        value: _expiresInHours.toDouble(),
                        min: 1,
                        max: 72,
                        divisions: 71,
                        activeColor: AppColors.blood600,
                        label: '$_expiresInHours h',
                        onChanged: (v) => setState(() => _expiresInHours = v.round()),
                      ),
                    ),
                    const SizedBox(height: 14),

                    AppButton(
                      label: 'Create request',
                      icon: Icons.send,
                      expand: true,
                      loading: _loading,
                      onPressed: _hasLocation ? _submit : null,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
