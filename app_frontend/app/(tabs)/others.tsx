import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Cpu,
  Wifi,
  WifiOff,
  Sliders,
  Activity,
  Server,
  Info,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Colors,
  Spacing,
  Radius,
  FontSize,
  FontWeight,
  Shadows,
  hardwareEventColor,
  FarmerLabels,
} from '@/constants/theme';
import type { Device, DosingConfig, HardwareLog } from '@/lib/types';

function deviceIsStale(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return true;
  return Date.now() - new Date(lastSeenAt).getTime() > 30 * 60 * 1000;
}

function humanStatus(s: string): string {
  return s.replace(/_/g, ' ');
}

export default function OthersScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const {
    data: devices,
    loading: devicesLoading,
    error: devicesError,
    refetch: refetchDevices,
  } = useSupabaseQuery<Device[]>(
    () => supabase.from('devices').select('*').order('device_name'),
    [],
  );

  const {
    data: dosingConfig,
    loading: dosingLoading,
    error: dosingError,
    refetch: refetchDosing,
  } = useSupabaseQuery<DosingConfig[]>(
    () => supabase.from('dosing_config').select('*').order('severity_score'),
    [],
  );

  const {
    data: hardwareLogs,
    loading: logsLoading,
    error: logsError,
    refetch: refetchLogs,
  } = useSupabaseQuery<HardwareLog[]>(
    () =>
      supabase
        .from('hardware_logs')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(15),
    [],
  );

  const deviceMap = useMemo(() => {
    const map = new Map<string, string>();
    devices?.forEach((d) => map.set(d.id, d.device_name));
    return map;
  }, [devices]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchDevices(), refetchDosing(), refetchLogs()]);
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Others</Text>
          <Text style={styles.subtitle}>Devices, treatment settings & system</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          isWide && styles.scrollContentWide,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* SECTION 1: Field Devices */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Cpu size={18} color={Colors.textSecondary} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Field Devices</Text>
          </View>
          <Text style={styles.sectionBadge}>{devices?.length ?? 0} total</Text>
        </View>

        {devicesLoading && !devices ? (
          <LoadingState message="Loading devices…" />
        ) : devicesError ? (
          <ErrorState message={devicesError} onRetry={refetchDevices} />
        ) : !devices || devices.length === 0 ? (
          <EmptyState
            icon={<Server size={24} color={Colors.textMuted} strokeWidth={1.5} />}
            title="No devices found"
            subtitle="Connected field camera devices will appear here."
          />
        ) : (
          <View style={styles.deviceList}>
            {devices.map((d) => {
              const isOffline = deviceIsStale(d.last_seen_at);
              return (
                <View key={d.id} style={styles.card}>
                  <View style={styles.deviceCardHeader}>
                    <View style={styles.deviceNameRow}>
                      {isOffline ? (
                        <WifiOff size={16} color={Colors.error} strokeWidth={2} />
                      ) : (
                        <Wifi size={16} color={Colors.healthy} strokeWidth={2} />
                      )}
                      <Text style={styles.deviceName}>{d.device_name}</Text>
                    </View>
                    <StatusBadge
                      label={isOffline ? 'Offline' : 'Online'}
                      color={isOffline ? Colors.error : Colors.healthy}
                      small
                    />
                  </View>

                  {d.location && (
                    <Text style={styles.deviceLocation}>{d.location}</Text>
                  )}

                  <View style={styles.specChipsRow}>
                    {d.onnx_model_version && (
                      <View style={styles.chip}>
                        <Text style={styles.chipLabel}>Model:</Text>
                        <Text style={styles.chipValue}>{d.onnx_model_version}</Text>
                      </View>
                    )}
                    {d.firmware_version && (
                      <View style={styles.chip}>
                        <Text style={styles.chipLabel}>Firmware:</Text>
                        <Text style={styles.chipValue}>v{d.firmware_version}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.cardDivider} />

                  <View style={styles.deviceFooter}>
                    <Text style={styles.footerLabel}>Last active</Text>
                    <Text style={styles.footerValue}>
                      {d.last_seen_at
                        ? formatDistanceToNow(new Date(d.last_seen_at), {
                            addSuffix: true,
                          })
                        : 'Never'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* SECTION 2: Treatment Settings (Dosing Config) */}
        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <View style={styles.sectionTitleRow}>
            <Sliders size={18} color={Colors.textSecondary} strokeWidth={2} />
            <Text style={styles.sectionTitle}>Treatment Settings</Text>
          </View>
        </View>

        {dosingLoading && !dosingConfig ? (
          <LoadingState message="Loading settings…" />
        ) : dosingError ? (
          <ErrorState message={dosingError} onRetry={refetchDosing} />
        ) : !dosingConfig || dosingConfig.length === 0 ? (
          <EmptyState
            icon={<Sliders size={24} color={Colors.textMuted} strokeWidth={1.5} />}
            title="No treatment rules"
            subtitle="Automated spray rules will appear here."
          />
        ) : (
          <View style={styles.card}>
            <View style={styles.dosingTableHeader}>
              <Text style={[styles.th, { width: 50 }]}>Level</Text>
              <Text style={[styles.th, { flex: 1 }]}>Severity</Text>
              <Text style={[styles.th, { width: 90, textAlign: 'right' }]}>
                Spray Time
              </Text>
            </View>
            {dosingConfig.map((dc, idx) => (
              <View
                key={dc.severity_score}
                style={[
                  styles.dosingTableRow,
                  idx < dosingConfig.length - 1 && styles.rowBorder,
                ]}
              >
                <View style={styles.scoreCircle}>
                  <Text style={styles.scoreText}>{dc.severity_score}</Text>
                </View>
                <Text style={styles.dosingLabel}>{dc.severity_label}</Text>
                <Text style={styles.dosingSeconds}>
                  {dc.pump_duration_seconds}s
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* SECTION 3: System Activity & Hardware Logs */}
        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <View style={styles.sectionTitleRow}>
            <Activity size={18} color={Colors.textSecondary} strokeWidth={2} />
            <Text style={styles.sectionTitle}>System Activity</Text>
          </View>
        </View>

        {logsLoading && !hardwareLogs ? (
          <LoadingState message="Loading activity…" />
        ) : logsError ? (
          <ErrorState message={logsError} onRetry={refetchLogs} />
        ) : !hardwareLogs || hardwareLogs.length === 0 ? (
          <EmptyState
            icon={<Activity size={24} color={Colors.textMuted} strokeWidth={1.5} />}
            title="No activity recorded"
            subtitle="Hardware and device activity will appear here."
          />
        ) : (
          <View style={styles.card}>
            {hardwareLogs.map((log, index) => {
              const devName = log.device_id ? deviceMap.get(log.device_id) : null;
              const statusColor =
                hardwareEventColor[log.event_type] || Colors.textSecondary;
              const eventLabel =
                FarmerLabels[log.event_type] || humanStatus(log.event_type);

              return (
                <View
                  key={log.id}
                  style={[
                    styles.logItem,
                    index < hardwareLogs.length - 1 && styles.rowBorder,
                  ]}
                >
                  <View style={styles.logLeft}>
                    <View
                      style={[styles.statusDot, { backgroundColor: statusColor }]}
                    />
                    <View style={styles.logTextContainer}>
                      <View style={styles.logHeadingRow}>
                        <Text style={[styles.logEventType, { color: statusColor }]}>
                          {eventLabel}
                        </Text>
                        {devName && (
                          <Text style={styles.deviceTag}>{devName}</Text>
                        )}
                      </View>
                      {log.message && (
                        <Text style={styles.logMessage} numberOfLines={2}>
                          {log.message}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Text style={styles.logTime}>
                    {format(new Date(log.occurred_at), 'MMM d, HH:mm')}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* SECTION 4: System Information */}
        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <View style={styles.sectionTitleRow}>
            <Info size={18} color={Colors.textSecondary} strokeWidth={2} />
            <Text style={styles.sectionTitle}>System Information</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Application</Text>
            <Text style={styles.infoValue}>TerraTrace Coffee Monitor</Text>
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Backend Service</Text>
            <Text style={styles.infoValue}>Supabase Cloud Database</Text>
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Operational Mode</Text>
            <Text style={[styles.infoValue, { color: Colors.healthy }]}>
              Field Active
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing['3xl'],
  },
  scrollContentWide: {
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBadge: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    fontWeight: FontWeight.medium,
  },
  deviceList: {
    gap: Spacing.sm,
  },
  deviceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deviceName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  deviceLocation: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  specChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    gap: 4,
  },
  chipLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  chipValue: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  deviceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  footerValue: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  dosingTableHeader: {
    flexDirection: 'row',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  th: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  dosingTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  scoreCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  dosingLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
    paddingLeft: Spacing.md,
  },
  dosingSeconds: {
    width: 90,
    textAlign: 'right',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  logItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  logLeft: {
    flexDirection: 'row',
    flex: 1,
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  logTextContainer: {
    flex: 1,
  },
  logHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  logEventType: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  deviceTag: {
    fontSize: 11,
    color: Colors.textSecondary,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  logMessage: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  logTime: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  infoLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
});
