import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ClipboardCheck,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { SignedImage } from '@/components/ui/SignedImage';
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
  severityBadge,
} from '@/constants/theme';
import type { ReviewStatus, ReviewQueueItemWithEvent } from '@/lib/types';

const STATUS_FILTERS: { key: ReviewStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Waiting' },
  { key: 'reviewed', label: 'Completed' },
  { key: 'dismissed', label: 'Dismissed' },
];

function statusColor(status: ReviewStatus): string {
  switch (status) {
    case 'pending':
      return Colors.pending;
    case 'reviewed':
      return Colors.healthy;
    case 'dismissed':
      return Colors.textSecondary;
  }
}

function farmerReviewStatus(s: ReviewStatus): string {
  switch (s) {
    case 'pending':
      return 'Waiting for review';
    case 'reviewed':
      return 'Completed';
    case 'dismissed':
      return 'Dismissed';
  }
}

export default function ReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [filter, setFilter] = useState<ReviewStatus | 'all'>('all');

  const {
    data: items,
    loading,
    error,
    refetch,
  } = useSupabaseQuery<ReviewQueueItemWithEvent[]>(
    () =>
      supabase
        .from('review_queue')
        .select(
          '*, inference_events(disease_class, disease_confidence, severity_label, severity_score, severity_confidence, captured_at, device_id)',
        )
        .order('created_at', { ascending: false }),
    [],
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const filterCounts = useMemo(() => {
    const counts = { all: items?.length ?? 0, pending: 0, reviewed: 0, dismissed: 0 };
    items?.forEach((item) => {
      if (item.status === 'pending') counts.pending++;
      else if (item.status === 'reviewed') counts.reviewed++;
      else if (item.status === 'dismissed') counts.dismissed++;
    });
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    let list = [...items];
    if (filter !== 'all') {
      list = list.filter((i) => i.status === filter);
    }
    list.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return 0;
    });
    return list;
  }, [items, filter]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Needs Your Review</Text>
          <Text style={styles.subtitle}>
            {filterCounts.pending > 0
              ? `${filterCounts.pending} check${filterCounts.pending > 1 ? 's' : ''} waiting for your confirmation`
              : 'All caught up — no checks waiting'}
          </Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterBar}>
        {STATUS_FILTERS.map(({ key, label }) => {
          const active = filter === key;
          const count = filterCounts[key];
          return (
            <Pressable
              key={key}
              style={[styles.filterTab, active && styles.filterTabActive]}
              onPress={() => setFilter(key)}
            >
              <Text
                style={[
                  styles.filterTabLabel,
                  active && styles.filterTabLabelActive,
                ]}
              >
                {label}
              </Text>
              <View
                style={[
                  styles.filterCountBadge,
                  active && styles.filterCountBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterCountText,
                    active && styles.filterCountTextActive,
                  ]}
                >
                  {count}
                </Text>
              </View>
            </Pressable>
          );
        })}
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
          <LoadingState message="Loading review items…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={
              <CheckCircle2
                size={32}
                color={Colors.healthy}
                strokeWidth={1.5}
              />
            }
            title={
              filter === 'pending'
                ? 'All caught up!'
                : 'No items in this filter'
            }
            subtitle={
              filter === 'pending'
                ? 'There are no plant checks waiting for your confirmation.'
                : 'Items will appear here once submitted or updated.'
            }
          />
        ) : (
          <View style={styles.cardList}>
            {filtered.map((item) => {
              const ev = item.inference_events;
              const sevBadge = ev ? severityBadge[ev.severity_score] : null;
              const isPending = item.status === 'pending';

              let timeAgo = '';
              try {
                timeAgo = formatDistanceToNow(new Date(item.created_at), {
                  addSuffix: true,
                });
              } catch {
                timeAgo = format(new Date(item.created_at), 'MMM d, HH:mm');
              }

              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.card,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => router.push(`/review/${item.id}`)}
                >
                  {/* Leaf Image */}
                  <View style={styles.imageBox}>
                    <SignedImage
                      imagePath={item.image_path}
                      height={140}
                      resizeMode="cover"
                    />
                  </View>

                  <View style={styles.cardContent}>
                    {/* Top status row */}
                    <View style={styles.cardStatusRow}>
                      <StatusBadge
                        label={farmerReviewStatus(item.status)}
                        color={statusColor(item.status)}
                        small
                      />
                      <Text style={styles.timeText}>{timeAgo}</Text>
                    </View>

                    {/* Disease and severity */}
                    <View style={styles.diseaseRow}>
                      <Text style={styles.diseaseName}>
                        {ev ? ev.disease_class : 'Plant Check'}
                      </Text>
                      {sevBadge && ev && (
                        <View
                          style={[
                            styles.severityBadge,
                            { backgroundColor: sevBadge.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.severityText,
                              { color: sevBadge.text },
                            ]}
                          >
                            {ev.severity_label}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* If reviewed notes exist */}
                    {item.reviewer_notes ? (
                      <Text style={styles.notesText} numberOfLines={2}>
                        Notes: "{item.reviewer_notes}"
                      </Text>
                    ) : null}

                    {/* Action row */}
                    <View style={styles.actionRow}>
                      <Text
                        style={[
                          styles.actionText,
                          isPending && styles.actionTextPending,
                        ]}
                      >
                        {isPending ? 'Tap to review & confirm' : 'View details'}
                      </Text>
                      <ChevronRight
                        size={16}
                        color={isPending ? Colors.primary : Colors.textMuted}
                      />
                    </View>
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
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.xs,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#F1F5F9',
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: Colors.primaryDim,
  },
  filterTabLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  filterTabLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  filterCountBadge: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  filterCountBadgeActive: {
    backgroundColor: Colors.primary,
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  filterCountTextActive: {
    color: '#FFFFFF',
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
  cardList: {
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  cardPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.995 }],
  },
  imageBox: {
    width: '100%',
    height: 140,
    backgroundColor: '#F1F5F9',
  },
  cardContent: {
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  cardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  diseaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  diseaseName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  severityText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
  },
  notesText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  actionTextPending: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
});
