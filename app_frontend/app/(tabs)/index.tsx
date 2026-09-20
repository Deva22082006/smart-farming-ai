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
import {
  Sprout,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ChevronRight,
  ArrowRight,
  ShieldAlert,
  Sliders,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useAuth } from '@/contexts/AuthContext';
import { SignedImage } from '@/components/ui/SignedImage';
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
  actuationBadge,
  FarmerLabels,
} from '@/constants/theme';
import type {
  InferenceEvent,
  ReviewQueueItemWithEvent,
} from '@/lib/types';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  // 1. Fetch recent plant checks
  const {
    data: events,
    loading: eventsLoading,
    error: eventsError,
    refetch: refetchEvents,
  } = useSupabaseQuery<InferenceEvent[]>(
    () =>
      supabase
        .from('inference_events')
        .select('*')
        .order('captured_at', { ascending: false })
        .limit(10),
    [],
  );

  // 2. Fetch pending review items
  const {
    data: reviewItems,
    loading: reviewLoading,
    error: reviewError,
    refetch: refetchReview,
  } = useSupabaseQuery<ReviewQueueItemWithEvent[]>(
    () =>
      supabase
        .from('review_queue')
        .select(
          '*, inference_events(disease_class, disease_confidence, severity_label, severity_score, severity_confidence, captured_at, device_id)',
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
    [],
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchEvents(), refetchReview()]);
    setRefreshing(false);
  };

  // Derive farm health status
  const pendingCount = reviewItems?.length ?? 0;
  const highSeverityEvents = useMemo(() => {
    return (events ?? []).filter((e) => e.severity_score >= 3);
  }, [events]);

  const treatedCount = useMemo(() => {
    return (events ?? []).filter((e) => e.actuation_status === 'sprayed').length;
  }, [events]);

  const totalChecks = events?.length ?? 0;

  // Farm condition determination
  const farmCondition = useMemo(() => {
    if (highSeverityEvents.length > 0) {
      return {
        level: 'attention',
        title: 'Attention Needed',
        message: `${highSeverityEvents.length} check${
          highSeverityEvents.length > 1 ? 's' : ''
        } detected high disease severity.`,
        bg: '#FEF2F2',
        border: '#FECACA',
        iconBg: '#FEE2E2',
        textColor: '#991B1B',
        icon: <ShieldAlert size={24} color="#DC2626" strokeWidth={2} />,
      };
    }
    if (pendingCount > 0) {
      return {
        level: 'warning',
        title: 'Review Recommended',
        message: `You have ${pendingCount} plant check${
          pendingCount > 1 ? 's' : ''
        } waiting for your confirmation.`,
        bg: '#FFFBEB',
        border: '#FDE68A',
        iconBg: '#FEF3C7',
        textColor: '#92400E',
        icon: <AlertTriangle size={24} color="#D97706" strokeWidth={2} />,
      };
    }
    return {
      level: 'good',
      title: 'Plants Looking Healthy',
      message: 'Recent camera checks show no critical issues on your farm.',
      bg: '#F0FDF4',
      border: '#BBF7D0',
      iconBg: '#DCFCE7',
      textColor: '#166534',
      icon: <CheckCircle2 size={24} color="#16A34A" strokeWidth={2} />,
    };
  }, [highSeverityEvents, pendingCount]);

  const userEmail = session?.user?.email ?? '';
  const initial = userEmail ? userEmail[0].toUpperCase() : 'F';

  const isLoading = (eventsLoading || reviewLoading) && !refreshing;
  const hasError = eventsError || reviewError;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Header Bar */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Sprout size={22} color={Colors.primary} strokeWidth={2.2} />
          </View>
          <View>
            <Text style={styles.brandTitle}>TerraTrace</Text>
            <Text style={styles.brandSubtitle}>Coffee Health Monitor</Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.profileButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => router.push('/others')}
        >
          <Sliders size={18} color={Colors.primary} strokeWidth={2} />
        </Pressable>
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
        {isLoading ? (
          <LoadingState message="Loading farm status…" />
        ) : hasError ? (
          <ErrorState
            message={eventsError || reviewError || 'Failed to load data'}
            onRetry={onRefresh}
          />
        ) : (
          <>
            {/* FARM HEALTH SUMMARY CARD */}
            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: farmCondition.bg,
                  borderColor: farmCondition.border,
                },
              ]}
            >
              <View style={styles.summaryTopRow}>
                <View
                  style={[
                    styles.summaryIconContainer,
                    { backgroundColor: farmCondition.iconBg },
                  ]}
                >
                  {farmCondition.icon}
                </View>
                <View style={styles.summaryTextContainer}>
                  <Text
                    style={[
                      styles.summaryTitle,
                      { color: farmCondition.textColor },
                    ]}
                  >
                    {farmCondition.title}
                  </Text>
                  <Text style={styles.summaryDesc}>
                    {farmCondition.message}
                  </Text>
                </View>
              </View>

              {/* Quick Metrics Bar */}
              <View style={styles.metricsBar}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>{totalChecks}</Text>
                  <Text style={styles.metricLabel}>Recent Checks</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text
                    style={[
                      styles.metricValue,
                      pendingCount > 0 && { color: Colors.pending },
                    ]}
                  >
                    {pendingCount}
                  </Text>
                  <Text style={styles.metricLabel}>Need Review</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>{treatedCount}</Text>
                  <Text style={styles.metricLabel}>Treatments</Text>
                </View>
              </View>
            </View>

            {/* NEEDS YOUR REVIEW BANNER (if any pending) */}
            {pendingCount > 0 && (
              <View style={styles.reviewBannerSection}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleWithBadge}>
                    <ClipboardCheck size={18} color={Colors.pending} strokeWidth={2} />
                    <Text style={styles.sectionTitle}>Needs Your Review</Text>
                    <View style={styles.pendingPill}>
                      <Text style={styles.pendingPillText}>{pendingCount}</Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => router.push('/review')}
                    style={({ pressed }) => [pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.seeAllText}>Review all →</Text>
                  </Pressable>
                </View>

                {reviewItems?.slice(0, 2).map((item) => {
                  const ev = item.inference_events;
                  const disease = ev?.disease_class ?? 'Plant Issue';
                  const sev = ev?.severity_score != null
                    ? severityBadge[ev.severity_score]
                    : { bg: '#F1F5F9', text: Colors.textSecondary };

                  return (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.reviewCard,
                        pressed && styles.cardPressed,
                      ]}
                      onPress={() => router.push(`/review/${item.id}`)}
                    >
                      <View style={styles.reviewCardThumb}>
                        <SignedImage
                          imagePath={item.image_path}
                          height={52}
                          resizeMode="cover"
                          style={styles.reviewThumb}
                        />
                      </View>

                      <View style={styles.reviewCardContent}>
                        <View style={styles.reviewCardTitleRow}>
                          <Text style={styles.reviewCardDisease}>{disease}</Text>
                          {ev?.severity_label && (
                            <View
                              style={[
                                styles.badge,
                                { backgroundColor: sev.bg },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.badgeText,
                                  { color: sev.text },
                                ]}
                              >
                                {ev.severity_label}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.reviewPromptText}>
                          Tap to verify detection & treatment
                        </Text>
                      </View>

                      <ChevronRight size={18} color={Colors.textMuted} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* RECENT PLANT CHECKS */}
            <View style={styles.checksSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Recent Plant Checks</Text>
                <Pressable
                  onPress={() => router.push('/checks')}
                  style={({ pressed }) => [pressed && styles.buttonPressed]}
                >
                  <Text style={styles.seeAllText}>See all →</Text>
                </Pressable>
              </View>

              {!events || events.length === 0 ? (
                <EmptyState
                  icon={<Sprout size={24} color={Colors.textMuted} strokeWidth={1.5} />}
                  title="No plant checks yet"
                  subtitle="When field devices scan plants, checks will appear here."
                />
              ) : (
                <View style={styles.checksList}>
                  {events.slice(0, 6).map((ev) => {
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
                          styles.checkRow,
                          pressed && styles.cardPressed,
                        ]}
                        onPress={() => router.push(`/event/${ev.id}`)}
                      >
                        <View style={styles.checkThumb}>
                          <SignedImage
                            imagePath={ev.image_path}
                            height={48}
                            resizeMode="cover"
                            style={styles.checkThumbImg}
                          />
                        </View>

                        <View style={styles.checkInfo}>
                          <View style={styles.checkHeading}>
                            <Text style={styles.checkDisease}>
                              {ev.disease_class}
                            </Text>
                            <View
                              style={[
                                styles.badge,
                                { backgroundColor: sev.bg },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.badgeText,
                                  { color: sev.text },
                                ]}
                              >
                                {ev.severity_label}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.checkSub}>
                            <View
                              style={[
                                styles.statusDot,
                                { backgroundColor: act.text },
                              ]}
                            />
                            <Text style={styles.checkStatus} numberOfLines={1}>
                              {statusText}
                            </Text>
                            <Text style={styles.checkDotSep}>•</Text>
                            <Text style={styles.checkTime}>{timeAgo}</Text>
                          </View>
                        </View>

                        <ChevronRight size={16} color={Colors.textMuted} />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* QUICK ACTIONS FOOTER */}
            <View style={styles.quickNavSection}>
              <Pressable
                style={({ pressed }) => [
                  styles.quickNavCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => router.push('/checks')}
              >
                <View style={styles.quickNavLeft}>
                  <Text style={styles.quickNavTitle}>Plant Check History</Text>
                  <Text style={styles.quickNavSubtitle}>
                    View all past disease scans & treatments
                  </Text>
                </View>
                <ArrowRight size={18} color={Colors.primary} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.quickNavCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => router.push('/others')}
              >
                <View style={styles.quickNavLeft}>
                  <Text style={styles.quickNavTitle}>Field Devices & Settings</Text>
                  <Text style={styles.quickNavSubtitle}>
                    Manage connected cameras & spray rules
                  </Text>
                </View>
                <ArrowRight size={18} color={Colors.primary} />
              </Pressable>
            </View>
          </>
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
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Colors.healthyBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileInitial: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing['3xl'],
    gap: Spacing.lg,
  },
  scrollContentWide: {
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  summaryCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    ...Shadows.sm,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  summaryIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTextContainer: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  summaryDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 3,
    lineHeight: 18,
  },
  metricsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricValue: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: FontWeight.medium,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  reviewBannerSection: {
    gap: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
  },
  sectionTitleWithBadge: {
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
  pendingPill: {
    backgroundColor: Colors.pendingBg,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  pendingPillText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.pending,
  },
  seeAllText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  cardPressed: {
    backgroundColor: '#F8FAFC',
    transform: [{ scale: 0.99 }],
  },
  reviewCardThumb: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    marginRight: Spacing.md,
  },
  reviewThumb: {
    width: 52,
    height: 52,
  },
  reviewCardContent: {
    flex: 1,
    gap: 2,
  },
  reviewCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: Spacing.xs,
  },
  reviewCardDisease: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  reviewPromptText: {
    fontSize: 11,
    color: Colors.pending,
    fontWeight: FontWeight.medium,
  },
  checksSection: {
    gap: Spacing.sm,
  },
  checksList: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  checkThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    marginRight: Spacing.md,
  },
  checkThumbImg: {
    width: 48,
    height: 48,
  },
  checkInfo: {
    flex: 1,
    gap: 2,
  },
  checkHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: Spacing.xs,
  },
  checkDisease: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  checkSub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  checkStatus: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  checkDotSep: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  checkTime: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
  },
  quickNavSection: {
    gap: Spacing.sm,
  },
  quickNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  quickNavLeft: {
    flex: 1,
  },
  quickNavTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  quickNavSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
