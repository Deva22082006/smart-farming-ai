import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNow } from 'date-fns';
import { Leaf, ChevronRight } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { SignedImage } from '@/components/ui/SignedImage';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  TimeRangeSelector,
  TimeRange,
  timeRangeToDate,
} from '@/components/ui/TimeRangeSelector';
import {
  Colors,
  Spacing,
  Radius,
  FontSize,
  FontWeight,
  Shadows,
  severityBadge,
  actuationBadge,
  FarmerLabels,
} from '@/constants/theme';
import type { InferenceEvent } from '@/lib/types';

export default function ChecksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const rangeDate = useMemo(() => timeRangeToDate(timeRange), [timeRange]);

  const {
    data: events,
    loading,
    error,
    refetch,
  } = useSupabaseQuery<InferenceEvent[]>(
    () =>
      supabase
        .from('inference_events')
        .select('*')
        .gte('captured_at', rangeDate.toISOString())
        .order('captured_at', { ascending: false })
        .limit(50),
    [timeRange],
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Plant Checks</Text>
          <Text style={styles.subtitle}>Health checks & disease history</Text>
        </View>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
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
        {loading && !refreshing ? (
          <LoadingState message="Loading plant checks…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : !events || events.length === 0 ? (
          <EmptyState
            icon={<Leaf size={32} color={Colors.textMuted} strokeWidth={1.5} />}
            title="No plant checks found"
            subtitle="Your field devices haven't recorded any plant checks for this period."
          />
        ) : (
          <View style={styles.listContainer}>
            <View style={styles.listSummary}>
              <Text style={styles.summaryText}>
                {events.length} {events.length === 1 ? 'check' : 'checks'} recorded
              </Text>
            </View>

            {events.map((ev) => {
              const sev = severityBadge[ev.severity_score] || {
                bg: '#F1F5F9',
                text: Colors.textSecondary,
              };
              const act = actuationBadge[ev.actuation_status] || {
                bg: Colors.skippedBg,
                text: Colors.skipped,
              };
              const statusText =
                FarmerLabels[ev.actuation_status] ||
                ev.actuation_status.replace(/_/g, ' ');

              let timeAgo = '';
              try {
                timeAgo = formatDistanceToNow(new Date(ev.captured_at), {
                  addSuffix: true,
                });
              } catch {
                timeAgo = ev.captured_at;
              }

              return (
                <Pressable
                  key={ev.id}
                  style={({ pressed }) => [
                    styles.card,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => router.push(`/event/${ev.id}`)}
                >
                  <View style={styles.thumbContainer}>
                    <SignedImage
                      imagePath={ev.image_path}
                      height={60}
                      resizeMode="cover"
                      style={styles.thumbImage}
                    />
                  </View>

                  <View style={styles.cardBody}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.diseaseName}>{ev.disease_class}</Text>
                      <View style={[styles.badge, { backgroundColor: sev.bg }]}>
                        <Text style={[styles.badgeText, { color: sev.text }]}>
                          {ev.severity_label}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardMetaRow}>
                      <View style={[styles.statusDot, { backgroundColor: act.text }]} />
                      <Text style={styles.statusText} numberOfLines={1}>
                        {statusText}
                      </Text>
                    </View>

                    <Text style={styles.timeText}>{timeAgo}</Text>
                  </View>

                  <View style={styles.cardArrow}>
                    <ChevronRight size={18} color={Colors.textMuted} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexWrap: 'wrap',
    gap: Spacing.sm,
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
  listContainer: {
    gap: Spacing.sm,
  },
  listSummary: {
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  summaryText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  cardPressed: {
    backgroundColor: '#F8FAFC',
    transform: [{ scale: 0.99 }],
  },
  thumbContainer: {
    width: 60,
    height: 60,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    marginRight: Spacing.md,
  },
  thumbImage: {
    width: 60,
    height: 60,
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: Spacing.xs,
  },
  diseaseName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    flex: 1,
  },
  timeText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  cardArrow: {
    paddingLeft: Spacing.sm,
  },
});
