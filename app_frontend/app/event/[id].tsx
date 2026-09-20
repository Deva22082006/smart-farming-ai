import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { format } from 'date-fns';
import {
  CheckCircle2,
  AlertTriangle,
  Server,
  Droplet,
  Clock,
  Layers,
  Activity,
  ArrowRight,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { SignedImage } from '@/components/ui/SignedImage';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  Colors,
  Spacing,
  Radius,
  FontSize,
  FontWeight,
  Shadows,
  actuationBadge,
  severityBadge,
  reviewStatusColor,
  FarmerLabels,
} from '@/constants/theme';
import type { InferenceEvent, Device, ReviewQueueItem } from '@/lib/types';

function DetailRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number | null | undefined;
  color?: string;
}) {
  if (value === null || value === undefined) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, color ? { color } : undefined]}>
        {String(value)}
      </Text>
    </View>
  );
}

function ConfidenceBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const barColor = pct >= 80 ? Colors.healthy : pct >= 50 ? Colors.pending : Colors.error;

  return (
    <View style={styles.confBar}>
      <View style={styles.confHeader}>
        <Text style={styles.confLabel}>{label}</Text>
        <Text style={styles.confValue}>{pct}%</Text>
      </View>
      <View style={styles.confTrack}>
        <View
          style={[
            styles.confFill,
            {
              width: `${pct}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;

  const {
    data: event,
    loading,
    error,
    refetch,
  } = useSupabaseQuery<InferenceEvent>(
    () =>
      supabase
        .from('inference_events')
        .select('*')
        .eq('id', id)
        .single(),
    [id],
  );

  // Fetch device name
  const { data: device } = useSupabaseQuery<Device>(
    () =>
      event?.device_id
        ? supabase.from('devices').select('*').eq('id', event.device_id).single()
        : Promise.resolve({ data: null, error: null }),
    [event?.device_id],
  );

  // Check for associated review_queue row
  const { data: reviewItem } = useSupabaseQuery<ReviewQueueItem[]>(
    () =>
      event
        ? supabase
            .from('review_queue')
            .select('*')
            .eq('inference_event_id', event.id)
            .limit(1)
        : Promise.resolve({ data: null, error: null }),
    [event?.id],
  );

  if (loading) return <LoadingState message="Loading plant check…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!event) return <ErrorState message="Plant check record not found" />;

  const review = reviewItem && reviewItem.length > 0 ? reviewItem[0] : null;
  const actBadge = actuationBadge[event.actuation_status] || {
    bg: Colors.skippedBg,
    text: Colors.skipped,
  };
  const sevBadge = severityBadge[event.severity_score] || {
    bg: '#F1F5F9',
    text: Colors.textSecondary,
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Plant Check Detail',
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: Colors.textPrimary,
        }}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.container,
          isWide && styles.containerWide,
        ]}
      >
        <View style={[styles.mainLayout, isWide && styles.mainLayoutWide]}>
          {/* Left Column: Image & Navigation */}
          <View style={[styles.column, isWide && styles.columnLeft]}>
            <View style={styles.imageCard}>
              <SignedImage imagePath={event.image_path} height={isWide ? 340 : 260} resizeMode="contain" />
              <View style={styles.imageOverlayStatus}>
                <View style={[styles.statusPill, { backgroundColor: actBadge.bg }]}>
                  <Text style={[styles.statusPillText, { color: actBadge.text }]}>
                    {FarmerLabels[event.actuation_status] || event.actuation_status.replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
            </View>

            {review && (
              <Pressable
                style={({ pressed }) => [
                  styles.reviewLinkCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => router.push(`/review/${review.id}`)}
              >
                <View style={styles.reviewLinkLeft}>
                  <Text style={styles.reviewLinkLabel}>Needs Farmer Review</Text>
                  <StatusBadge
                    label={review.status === 'pending' ? 'Waiting' : review.status}
                    color={reviewStatusColor[review.status] || Colors.textMuted}
                    small
                  />
                </View>
                <ArrowRight size={16} color={Colors.primary} />
              </Pressable>
            )}
          </View>

          {/* Right Column: Telemetry & Model Classification Details */}
          <View style={[styles.column, isWide && styles.columnRight]}>
            {/* Classification Section */}
            <View style={styles.cardSection}>
              <View style={styles.sectionTitleRow}>
                <Layers size={16} color={Colors.textSecondary} strokeWidth={2} />
                <Text style={styles.sectionTitle}>Detection Result</Text>
              </View>

              <View style={styles.classRow}>
                <View style={styles.classBlock}>
                  <Text style={styles.classLabel}>Disease Found</Text>
                  <Text style={styles.classValue}>{event.disease_class}</Text>
                </View>
                <View style={styles.classBlock}>
                  <Text style={styles.classLabel}>Severity Level</Text>
                  <View style={[styles.microBadge, { backgroundColor: sevBadge.bg }]}>
                    <Text style={[styles.microBadgeText, { color: sevBadge.text }]}>
                      {event.severity_label} ({event.severity_score}/4)
                    </Text>
                  </View>
                </View>
              </View>

              <ConfidenceBar
                label="Detection Certainty"
                value={event.disease_confidence}
              />
              <ConfidenceBar
                label="Severity Certainty"
                value={event.severity_confidence}
              />
            </View>

            {/* Actuation Details */}
            <View style={styles.cardSection}>
              <View style={styles.sectionTitleRow}>
                <Droplet size={16} color={Colors.textSecondary} strokeWidth={2} />
                <Text style={styles.sectionTitle}>Treatment Status</Text>
              </View>

              <DetailRow
                label="Treatment Action"
                value={FarmerLabels[event.actuation_status] || event.actuation_status.replace(/_/g, ' ')}
                color={actBadge.text}
              />
              <DetailRow
                label="Automatic Treatment"
                value={event.auto_actuate ? 'Yes (Triggered automatically)' : 'No (Requires review or skipped)'}
              />
              <DetailRow
                label="Spray Duration"
                value={
                  event.dosing_duration_seconds != null
                    ? `${event.dosing_duration_seconds} seconds`
                    : 'None'
                }
              />

              {event.error_message && (
                <View style={styles.errorBox}>
                  <View style={styles.errorHeader}>
                    <AlertTriangle size={15} color={Colors.error} strokeWidth={2} />
                    <Text style={styles.errorTitle}>Treatment Error</Text>
                  </View>
                  <Text style={styles.errorText}>{event.error_message}</Text>
                </View>
              )}
            </View>

            {/* Node Telemetry */}
            <View style={styles.cardSection}>
              <View style={styles.sectionTitleRow}>
                <Server size={16} color={Colors.textSecondary} strokeWidth={2} />
                <Text style={styles.sectionTitle}>Device Information</Text>
              </View>

              <DetailRow
                label="Field Device"
                value={device?.device_name ?? (event.device_id || 'Field Camera')}
              />
              <DetailRow
                label="Field Location"
                value={device?.location ?? 'Not specified'}
              />
              <DetailRow
                label="Detection Model"
                value={device?.onnx_model_version ?? 'coffee_leaf_model_v1'}
              />
              <DetailRow
                label="Checked At"
                value={format(new Date(event.captured_at), 'MMM d, yyyy · HH:mm:ss')}
              />
            </View>
          </View>
        </View>

        <View style={{ height: Spacing['4xl'] + 32 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  container: {
    padding: Spacing.lg,
  },
  containerWide: {
    paddingHorizontal: Spacing['3xl'],
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },

  mainLayout: {
    flexDirection: 'column',
    gap: Spacing.xl,
  },
  mainLayoutWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  column: {
    flex: 1,
    width: '100%',
  },
  columnLeft: {
    flex: 5,
  },
  columnRight: {
    flex: 6,
    gap: Spacing.lg,
  },

  // Image Card
  imageCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    position: 'relative',
    ...Shadows.sm,
  },
  imageOverlayStatus: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: Radius.full,
    padding: 3,
    ...Shadows.sm,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    textTransform: 'capitalize',
  },

  // Review Link Card
  reviewLinkCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    minHeight: 48,
    marginTop: Spacing.md,
    ...Shadows.sm,
  },
  cardPressed: {
    backgroundColor: '#F8FAFC',
  },
  reviewLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reviewLinkLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },

  // Card Section
  cardSection: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },

  classRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  classBlock: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  classLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  classValue: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  microBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  microBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },

  confBar: {
    marginTop: Spacing.sm,
  },
  confHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  confLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  confValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  confTrack: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  confFill: {
    height: '100%',
    borderRadius: 3,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },

  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  errorTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.error,
  },
  errorText: {
    fontSize: FontSize.xs,
    color: Colors.textPrimary,
    lineHeight: 16,
  },
});
