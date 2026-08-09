import 'dart:async';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../config/theme.dart';
import '../../main.dart' show DashboardAppBar;
import '../../models/models.dart';
import '../../services/services.dart';
import '../../services/socket_service.dart';
import '../../widgets/ui.dart';

/// Splits the LLM narrative into an intro paragraph plus a recommendations
/// list. The server now asks for plain text with "Rec:"-prefixed lines, but
/// older cached narratives can still contain markdown-lite (**bold**, "- ",
/// "1. "), so both shapes are handled — otherwise raw asterisks leak into
/// the UI, which was the original complaint about this panel.
({List<String> paragraphs, List<String> recs}) parseNarrative(String? text) {
  if (text == null || text.trim().isEmpty) return (paragraphs: const [], recs: const []);

  final paragraphs = <String>[];
  final recs = <String>[];

  for (final raw in text.split(RegExp(r'\n+'))) {
    final line = raw.trim();
    if (line.isEmpty) continue;

    final isRec = RegExp(r'^rec:', caseSensitive: false).hasMatch(line) ||
        RegExp(r'^\d+\.\s*').hasMatch(line) ||
        RegExp(r'^[-*]\s+').hasMatch(line);

    final cleaned = line
        .replaceAll(RegExp(r'^rec:\s*', caseSensitive: false), '')
        .replaceAll(RegExp(r'^\d+\.\s*'), '')
        .replaceAll(RegExp(r'^[-*]\s+'), '')
        .replaceAll('**', '')
        .replaceAll(RegExp(r'^#+\s*'), '')
        .trim();

    if (cleaned.isEmpty) continue;
    if (isRec) {
      recs.add(cleaned);
    } else {
      paragraphs.add(cleaned);
    }
  }

  return (paragraphs: paragraphs, recs: recs);
}

class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key});

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  AnalyticsSnapshot? _analytics;
  List<FlaggedDonor> _flagged = const [];
  List<BloodRequest> _requests = const [];
  bool _loading = true;
  bool _refreshingInsights = false;

  Timer? _poll;
  final List<VoidCallback> _disposers = [];

  @override
  void initState() {
    super.initState();
    _loadAll();

    // Any request lifecycle event refreshes immediately rather than waiting
    // for the next 20s tick.
    for (final event in ['admin:request_created', 'admin:request_updated', 'admin:donation_completed']) {
      _disposers.add(SocketService.instance.on(event, (_) => _loadStats()));
    }
    _poll = Timer.periodic(const Duration(seconds: 20), (_) => _loadStats());
  }

  @override
  void dispose() {
    _poll?.cancel();
    for (final d in _disposers) {
      d();
    }
    super.dispose();
  }

  Future<void> _loadAll() async {
    await Future.wait([_loadStats(), _loadFlagged()]);
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadStats() async {
    try {
      final results = await Future.wait([
        AdminService.analytics(),
        AdminService.allRequests(),
      ]);
      if (!mounted) return;
      setState(() {
        _analytics = results[0] as AnalyticsSnapshot;
        _requests = results[1] as List<BloodRequest>;
      });
    } catch (_) {
      // Keep the last good snapshot.
    }
  }

  Future<void> _loadFlagged() async {
    try {
      final list = await AdminService.flaggedDonors();
      if (mounted) setState(() => _flagged = list);
    } catch (_) {}
  }

  Future<void> _refreshInsights() async {
    setState(() => _refreshingInsights = true);
    try {
      final snapshot = await AdminService.refreshAnalytics();
      if (mounted) setState(() => _analytics = snapshot);
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), isError: true);
    } finally {
      if (mounted) setState(() => _refreshingInsights = false);
    }
  }

  Future<void> _ban(String donorId) async {
    try {
      await AdminService.banDonor(donorId);
      await _loadFlagged();
      if (mounted) showSnack(context, 'Donor banned.');
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = _analytics;

    return Scaffold(
      appBar: DashboardAppBar(
        title: 'Admin',
        actions: [
          IconButton(
            tooltip: 'Refresh insights',
            icon: _refreshingInsights
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.ink500),
                  )
                : const Icon(Icons.auto_awesome_outlined, size: 19),
            onPressed: _refreshingInsights ? null : _refreshInsights,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.blood600))
          : RefreshIndicator(
              color: AppColors.blood600,
              onRefresh: _loadAll,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  Text(
                    'Live network activity, last ${a?.periodDays ?? 30} days.',
                    style: const TextStyle(fontSize: 13, color: AppColors.ink500),
                  ),
                  const SizedBox(height: 16),

                  if (a != null) _buildStatGrid(a),
                  const SizedBox(height: 18),

                  if (a != null) _buildInsights(a),
                  const SizedBox(height: 18),

                  if (a != null && a.timeSeries.isNotEmpty) ...[
                    _buildTrendChart(a),
                    const SizedBox(height: 18),
                  ],

                  if (a != null && a.demandByBloodGroup.isNotEmpty) ...[
                    _buildBloodGroupChart(a),
                    const SizedBox(height: 18),
                  ],

                  if (a != null && a.statusBreakdown.any((s) => s.count > 0)) ...[
                    _buildStatusPie(a),
                    const SizedBox(height: 18),
                  ],

                  if (a != null && a.responseOutcomes.any((s) => s.count > 0)) ...[
                    _buildResponseFunnel(a),
                    const SizedBox(height: 18),
                  ],

                  if (a != null && a.topCities.isNotEmpty) ...[
                    _buildTopCities(a),
                    const SizedBox(height: 18),
                  ],

                  _buildFlagged(),
                  const SizedBox(height: 18),
                  _buildRecentRequests(),
                ],
              ),
            ),
    );
  }

  Widget _buildStatGrid(AnalyticsSnapshot a) {
    final cards = [
      StatCard(icon: Icons.show_chart, label: 'Requests', value: '${a.totalRequests}'),
      StatCard(
        icon: Icons.trending_up,
        label: 'Fulfilled',
        value: '${a.fulfilledRequests}',
        hint: a.fulfillmentRate != null ? '${(a.fulfillmentRate! * 100).round()}% rate' : null,
        valueColor: AppColors.success,
      ),
      StatCard(
        icon: Icons.water_drop_outlined,
        label: 'Donations',
        value: '${a.completedDonations}',
        valueColor: AppColors.success,
      ),
      StatCard(
        icon: Icons.gpp_maybe_outlined,
        label: 'No-shows',
        value: '${a.noShows}',
        valueColor: a.noShows > 0 ? AppColors.danger : null,
      ),
      StatCard(
        icon: Icons.people_outline,
        label: 'Donors',
        value: '${a.donorsTotal}',
        hint: '${a.donorsAvailable} available',
      ),
      StatCard(
        icon: Icons.local_hospital_outlined,
        label: 'Hospitals',
        value: '${a.hospitalsTotal}',
        hint: '${a.hospitalsVerified} verified',
      ),
    ];

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.75,
      children: cards,
    );
  }

  Widget _buildInsights(AnalyticsSnapshot a) {
    final narrative = parseNarrative(a.narrative);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: AppColors.blood50,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: const Icon(Icons.auto_awesome, size: 15, color: AppColors.blood600),
              ),
              const SizedBox(width: 9),
              const Expanded(
                child: Text('Insights', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          if (a.generatedAt != null) ...[
            const SizedBox(height: 4),
            Text(
              'Generated ${DateFormat.yMMMd().add_jm().format(a.generatedAt!)}',
              style: const TextStyle(fontSize: 10.5, color: AppColors.ink400),
            ),
          ],
          const SizedBox(height: 12),
          ...narrative.paragraphs.map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(p, style: const TextStyle(fontSize: 13, color: AppColors.ink600, height: 1.45)),
            ),
          ),
          if (narrative.recs.isNotEmpty) ...[
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.blood50.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.blood100),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'RECOMMENDATIONS',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                      color: AppColors.blood700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...narrative.recs.asMap().entries.map(
                        (e) => Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${e.key + 1}.',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.blood500,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  e.value,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.ink700,
                                    height: 1.4,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTrendChart(AnalyticsSnapshot a) {
    final points = a.timeSeries;
    // Label roughly 5 ticks so the axis doesn't turn into mush on a phone.
    final labelEvery = (points.length / 5).ceil().clamp(1, points.length);

    List<FlSpot> spots(int Function(TimeSeriesPoint) pick) => [
          for (var i = 0; i < points.length; i++) FlSpot(i.toDouble(), pick(points[i]).toDouble()),
        ];

    final maxY = points
        .map((p) => p.requestCount)
        .fold<int>(1, (a, b) => a > b ? a : b)
        .toDouble();

    return _ChartCard(
      eyebrow: 'Trend',
      title: 'Requests over time',
      legend: const [
        (label: 'Requests', color: AppColors.blood600),
        (label: 'Fulfilled', color: AppColors.success),
      ],
      child: LineChart(
        LineChartData(
          minY: 0,
          maxY: maxY * 1.25,
          gridData: FlGridData(
            show: true,
            drawVerticalLine: false,
            getDrawingHorizontalLine: (_) => const FlLine(color: AppColors.ink200, strokeWidth: 1),
          ),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 28,
                getTitlesWidget: (value, _) => Text(
                  value % 1 == 0 ? value.toInt().toString() : '',
                  style: const TextStyle(fontSize: 10, color: AppColors.ink400),
                ),
              ),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 26,
                getTitlesWidget: (value, _) {
                  final i = value.toInt();
                  if (i < 0 || i >= points.length || i % labelEvery != 0) {
                    return const SizedBox.shrink();
                  }
                  return Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      DateFormat.MMMd().format(points[i].day),
                      style: const TextStyle(fontSize: 9.5, color: AppColors.ink400),
                    ),
                  );
                },
              ),
            ),
          ),
          lineBarsData: [
            LineChartBarData(
              spots: spots((p) => p.requestCount),
              isCurved: true,
              color: AppColors.blood600,
              barWidth: 2.5,
              dotData: const FlDotData(show: false),
              belowBarData: BarAreaData(
                show: true,
                color: AppColors.blood600.withValues(alpha: 0.15),
              ),
            ),
            LineChartBarData(
              spots: spots((p) => p.fulfilledCount),
              isCurved: true,
              color: AppColors.success,
              barWidth: 2.5,
              dotData: const FlDotData(show: false),
              belowBarData: BarAreaData(
                show: true,
                color: AppColors.success.withValues(alpha: 0.15),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBloodGroupChart(AnalyticsSnapshot a) {
    final data = a.demandByBloodGroup;
    final maxY = data.map((d) => d.count).fold<int>(1, (a, b) => a > b ? a : b).toDouble();

    return _ChartCard(
      eyebrow: 'Breakdown',
      title: 'Demand by blood group',
      child: BarChart(
        BarChartData(
          maxY: maxY * 1.2,
          gridData: FlGridData(
            show: true,
            drawVerticalLine: false,
            getDrawingHorizontalLine: (_) => const FlLine(color: AppColors.ink200, strokeWidth: 1),
          ),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 28,
                getTitlesWidget: (value, _) => Text(
                  value % 1 == 0 ? value.toInt().toString() : '',
                  style: const TextStyle(fontSize: 10, color: AppColors.ink400),
                ),
              ),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 24,
                getTitlesWidget: (value, _) {
                  final i = value.toInt();
                  if (i < 0 || i >= data.length) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      data[i].label,
                      style: const TextStyle(fontSize: 10, color: AppColors.ink500),
                    ),
                  );
                },
              ),
            ),
          ),
          barGroups: [
            for (var i = 0; i < data.length; i++)
              BarChartGroupData(
                x: i,
                barRods: [
                  BarChartRodData(
                    toY: data[i].count.toDouble(),
                    color: AppColors.blood600,
                    width: 16,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(5)),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusPie(AnalyticsSnapshot a) {
    final data = a.statusBreakdown.where((s) => s.count > 0).toList();
    final total = data.fold<int>(0, (sum, d) => sum + d.count);

    return _ChartCard(
      eyebrow: 'Breakdown',
      title: 'Request status',
      legend: [
        for (final d in data)
          (label: '${d.label} (${d.count})', color: kRequestStatusColor[d.label] ?? AppColors.ink400),
      ],
      child: PieChart(
        PieChartData(
          sectionsSpace: 2,
          centerSpaceRadius: 42,
          sections: [
            for (final d in data)
              PieChartSectionData(
                value: d.count.toDouble(),
                color: kRequestStatusColor[d.label] ?? AppColors.ink400,
                radius: 34,
                title: total == 0 ? '' : '${((d.count / total) * 100).round()}%',
                titleStyle: const TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildResponseFunnel(AnalyticsSnapshot a) {
    final data = a.responseOutcomes;
    final maxCount = data.map((d) => d.count).fold<int>(1, (a, b) => a > b ? a : b);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeading(title: 'Donor response outcomes', eyebrow: 'Funnel'),
          ...data.map((d) {
            final color = kResponseStatusColor[d.label] ?? AppColors.ink400;
            return Padding(
              padding: const EdgeInsets.only(bottom: 9),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          d.label,
                          style: const TextStyle(fontSize: 11.5, color: AppColors.ink600),
                        ),
                      ),
                      Text(
                        '${d.count}',
                        style: const TextStyle(fontSize: 11.5, color: AppColors.ink400),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: maxCount == 0 ? 0 : d.count / maxCount,
                      minHeight: 6,
                      backgroundColor: AppColors.ink100,
                      valueColor: AlwaysStoppedAnimation(color),
                    ),
                  ),
                ],
              ),
            );
          }),
          if (a.acceptRate != null) ...[
            const SizedBox(height: 4),
            Text(
              'Accept rate ${(a.acceptRate! * 100).round()}%'
              '${a.noShowRate != null ? " · No-show rate ${(a.noShowRate! * 100).round()}%" : ""}'
              '${a.avgAcceptedDistanceKm != null ? " · Avg. distance ${a.avgAcceptedDistanceKm} km" : ""}',
              style: const TextStyle(fontSize: 11, color: AppColors.ink400),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTopCities(AnalyticsSnapshot a) {
    final max = a.topCities.first.count;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeading(title: 'Top cities', eyebrow: 'City broadcasts'),
          ...a.topCities.map(
            (c) => Padding(
              padding: const EdgeInsets.only(bottom: 9),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.place_outlined, size: 12, color: AppColors.ink400),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          c.label,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                      ),
                      Text('${c.count}', style: const TextStyle(fontSize: 11.5, color: AppColors.ink400)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: max == 0 ? 0 : c.count / max,
                      minHeight: 6,
                      backgroundColor: AppColors.ink100,
                      valueColor: const AlwaysStoppedAnimation(AppColors.blood500),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFlagged() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeading(title: 'Flagged donors (${_flagged.length})', eyebrow: 'Trust & safety'),
          if (_flagged.isEmpty)
            const EmptyState(title: 'No flagged donors right now')
          else
            ..._flagged.map(
              (d) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.ink200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${d.fullName} · ${d.bloodGroup}',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                      if (d.email != null)
                        Text(
                          d.email!,
                          style: const TextStyle(fontSize: 11, color: AppColors.ink400),
                        ),
                      const SizedBox(height: 4),
                      Text(
                        d.flagReason,
                        style: const TextStyle(fontSize: 11.5, color: AppColors.warning),
                      ),
                      const SizedBox(height: 9),
                      if (d.isBanned)
                        const AppBadge('Banned', color: AppColors.danger)
                      else
                        AppButton(
                          label: 'Ban donor',
                          variant: AppButtonVariant.danger,
                          small: true,
                          onPressed: () => _ban(d.userId),
                        ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildRecentRequests() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeading(title: 'Recent requests', eyebrow: 'Activity'),
          if (_requests.isEmpty)
            const EmptyState(title: 'No requests yet')
          else
            ..._requests.take(20).map(
                  (r) => Padding(
                    padding: const EdgeInsets.only(bottom: 7),
                    child: Row(
                      children: [
                        AppBadge.status(r.status),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '${r.bloodGroup} · ${r.unitsClaimed}/${r.unitsNeeded}',
                            style: const TextStyle(fontSize: 12.5),
                          ),
                        ),
                        Text(
                          r.createdAt == null ? '' : DateFormat.MMMd().add_jm().format(r.createdAt!),
                          style: const TextStyle(fontSize: 10.5, color: AppColors.ink400),
                        ),
                      ],
                    ),
                  ),
                ),
        ],
      ),
    );
  }
}

/// Card wrapper with a fixed-height chart area and an optional legend, so all
/// the charts line up consistently.
class _ChartCard extends StatelessWidget {
  final String title;
  final String eyebrow;
  final Widget child;
  final List<({String label, Color color})> legend;

  const _ChartCard({
    required this.title,
    required this.eyebrow,
    required this.child,
    this.legend = const [],
  });

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeading(title: title, eyebrow: eyebrow),
          SizedBox(height: 190, child: child),
          if (legend.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 14,
              runSpacing: 6,
              children: legend
                  .map(
                    (l) => Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 9,
                          height: 9,
                          decoration: BoxDecoration(color: l.color, shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          l.label,
                          style: const TextStyle(fontSize: 11, color: AppColors.ink500),
                        ),
                      ],
                    ),
                  )
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}
