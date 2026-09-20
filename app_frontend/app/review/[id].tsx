import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { format } from 'date-fns';
import {
  Check,
  X,
  AlertCircle,
  ClipboardCheck,
  Brain,
  FileText,
  User,
  Clock,
  Sparkles,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useAuth } from '@/contexts/AuthContext';
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
  severityColor,
  reviewStatusColor,
  reviewStatusBadge,
} from '@/constants/theme';
import {
  DISEASE_CLASSES,
  SEVERITY_LABELS,
  type DiseaseClass,
  type ReviewQueueItemWithEvent,
} from '@/lib/types';

export default function ReviewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 880;

  const {
    data: item,
    loading,
    error,
    refetch,
  } = useSupabaseQuery<ReviewQueueItemWithEvent>(
    () =>
      supabase
        .from('review_queue')
        .select(
          '*, inference_events(disease_class, disease_confidence, severity_label, severity_score, severity_confidence, captured_at, device_id)',
        )
        .eq('id', id)
        .single(),
    [id],
  );

  // Form state
  const [selectedDisease, setSelectedDisease] = useState<DiseaseClass | null>(
    null,
  );
  const [selectedSeverity, setSelectedSeverity] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auto-fill reviewer from session
  const defaultReviewer =
    session?.user?.email || session?.user?.id || '';

  const handleSubmitReview = useCallback(async () => {
    if (selectedDisease === null || selectedSeverity === null) {
      const msg =
        'Both corrected disease class and severity score are required to submit a review.';
      if (Platform.OS === 'web') {
        setSubmitError(msg);
      } else {
        Alert.alert('Missing Fields', msg);
      }
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const { error: updateError } = await supabase
      .from('review_queue')
      .update({
        status: 'reviewed' as const,
        corrected_disease_class: selectedDisease,
        corrected_severity_score: selectedSeverity,
        reviewer_notes: notes || null,
        reviewed_by: reviewerName || defaultReviewer || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    setSubmitting(false);

    if (updateError) {
      setSubmitError(updateError.message);
    } else {
      router.back();
    }
  }, [selectedDisease, selectedSeverity, notes, reviewerName, id, defaultReviewer, router]);

  const handleDismiss = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);

    const { error: updateError } = await supabase
      .from('review_queue')
      .update({ status: 'dismissed' as const })
      .eq('id', id);

    setSubmitting(false);

    if (updateError) {
      setSubmitError(updateError.message);
    } else {
      router.back();
    }
  }, [id, router]);

  if (loading) return <LoadingState message="Loading review detail…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!item) return <ErrorState message="Review queue item not found" />;

  const ev = item.inference_events;
  const isAlreadyReviewed = item.status !== 'pending';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Review Detection',
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
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.mainLayout, isWide && styles.mainLayoutWide]}>
          {/* LEFT COLUMN: Image & Original Prediction */}
          <View style={[styles.column, isWide && styles.columnLeft]}>
            <View style={styles.card}>
              <SignedImage imagePath={item.image_path} height={isWide ? 340 : 260} resizeMode="contain" />
              <View style={styles.cardHeaderStrip}>
                <StatusBadge
                  label={item.status === 'pending' ? 'Waiting for review' : item.status}
                  color={reviewStatusColor[item.status] || Colors.textMuted}
                />
                <Text style={styles.metaTime}>
                  Checked {format(new Date(item.created_at), 'MMM d, yyyy · HH:mm')}
                </Text>
              </View>
            </View>

            {/* Original Prediction Card */}
            {ev && (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Brain size={16} color={Colors.textSecondary} strokeWidth={2} />
                  <Text style={styles.cardTitle}>System's Detection</Text>
                </View>

                <View style={styles.predGrid}>
                  <View style={styles.predBlock}>
                    <Text style={styles.predLabel}>Disease Found</Text>
                    <Text style={styles.predValue}>{ev.disease_class}</Text>
                    <View style={styles.confBadge}>
                      <Text style={styles.confBadgeText}>
                        {Math.round(ev.disease_confidence * 100)}% certainty
                      </Text>
                    </View>
                  </View>

                  <View style={styles.predBlock}>
                    <Text style={styles.predLabel}>Severity Level</Text>
                    <Text
                      style={[
                        styles.predValue,
                        { color: severityColor[ev.severity_score] || Colors.textPrimary },
                      ]}
                    >
                      {ev.severity_label} ({ev.severity_score}/4)
                    </Text>
                    <View style={styles.confBadge}>
                      <Text style={styles.confBadgeText}>
                        {Math.round(ev.severity_confidence * 100)}% certainty
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Already-Reviewed Result Card */}
            {isAlreadyReviewed && (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <ClipboardCheck size={16} color={Colors.primary} strokeWidth={2} />
                  <Text style={styles.cardTitle}>Your Review</Text>
                </View>

                {item.corrected_disease_class && (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Confirmed Disease</Text>
                    <Text style={[styles.resultValue, { color: Colors.primary }]}>
                      {item.corrected_disease_class}
                    </Text>
                  </View>
                )}

                {item.corrected_severity_score != null && (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Confirmed Severity</Text>
                    <Text
                      style={[
                        styles.resultValue,
                        { color: severityColor[item.corrected_severity_score] },
                      ]}
                    >
                      {SEVERITY_LABELS[item.corrected_severity_score]} ({item.corrected_severity_score}/4)
                    </Text>
                  </View>
                )}

                {item.reviewer_notes && (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Notes</Text>
                    <Text style={styles.resultValue}>{item.reviewer_notes}</Text>
                  </View>
                )}

                {item.reviewed_by && (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Reviewed By</Text>
                    <Text style={styles.resultValue}>{item.reviewed_by}</Text>
                  </View>
                )}

                {item.reviewed_at && (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Reviewed At</Text>
                    <Text style={styles.resultValue}>
                      {format(new Date(item.reviewed_at), 'MMM d, yyyy · HH:mm')}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* RIGHT COLUMN: Correction Studio (Active for Pending items) */}
          <View style={[styles.column, isWide && styles.columnRight]}>
            {!isAlreadyReviewed ? (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Sparkles size={16} color={Colors.primary} strokeWidth={2} />
                  <Text style={styles.cardTitle}>Your Assessment</Text>
                </View>

                {submitError && (
                  <View style={styles.errorBox}>
                    <AlertCircle size={15} color={Colors.error} strokeWidth={2} />
                    <Text style={styles.errorText}>{submitError}</Text>
                  </View>
                )}

                {/* Disease Class Picker */}
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>What did you see? *</Text>
                  <View style={styles.pickerGrid}>
                    {DISEASE_CLASSES.map((dc) => {
                      const active = selectedDisease === dc;
                      return (
                        <Pressable
                          key={dc}
                          style={[
                            styles.pickerChip,
                            active && styles.pickerChipActive,
                          ]}
                          onPress={() => setSelectedDisease(dc)}
                        >
                          <Text
                            style={[
                              styles.pickerChipText,
                              active && styles.pickerChipTextActive,
                            ]}
                          >
                            {dc}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Severity Score Picker */}
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>How severe is it? *</Text>
                  <View style={styles.pickerGrid}>
                    {[0, 1, 2, 3, 4].map((score) => {
                      const active = selectedSeverity === score;
                      const sColor = severityColor[score];
                      return (
                        <Pressable
                          key={score}
                          style={[
                            styles.severityChip,
                            active && {
                              borderColor: sColor,
                              backgroundColor: `${sColor}18`,
                            },
                          ]}
                          onPress={() => setSelectedSeverity(score)}
                        >
                          <View
                            style={[
                              styles.severityDot,
                              { backgroundColor: sColor },
                            ]}
                          />
                          <Text
                            style={[
                              styles.severityChipText,
                              active && { color: sColor, fontWeight: '700' },
                            ]}
                          >
                            {score} · {SEVERITY_LABELS[score]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Reviewer Name */}
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Your Name</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder={defaultReviewer || 'Farmer Name'}
                    placeholderTextColor={Colors.textMuted}
                    value={reviewerName}
                    onChangeText={setReviewerName}
                    autoCapitalize="none"
                  />
                </View>

                {/* Notes */}
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput
                    style={[styles.textInput, styles.textInputMultiline]}
                    placeholder="Any observations about this plant…"
                    placeholderTextColor={Colors.textMuted}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                {/* Actions */}
                <View style={styles.actionButtonsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.submitButton,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={handleSubmitReview}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Check size={16} color="#FFFFFF" strokeWidth={2.2} />
                        <Text style={styles.submitButtonText}>Confirm Review</Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.dismissButton,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={handleDismiss}
                    disabled={submitting}
                  >
                    <X size={15} color={Colors.textSecondary} strokeWidth={2} />
                    <Text style={styles.dismissButtonText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Check size={16} color={Colors.healthy} strokeWidth={2} />
                  <Text style={styles.cardTitle}>Item Completed</Text>
                </View>
                <Text style={styles.alreadyCompletedText}>
                  This detection was marked as{' '}
                  <Text style={{ fontWeight: 'bold', color: reviewStatusColor[item.status] }}>
                    {item.status}
                  </Text>
                  . Your assessment has been saved.
                </Text>
              </View>
            )}
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
    gap: Spacing.lg,
  },
  columnRight: {
    flex: 6,
  },

  // Cards
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  cardHeaderStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  metaTime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },

  // Prediction Blocks
  predGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  predBlock: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  predLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  predValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  confBadge: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  confBadgeText: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },

  // Result Row
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  resultLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  resultValue: {
    fontSize: FontSize.xs,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
    maxWidth: '60%',
    textAlign: 'right',
  },

  // Form
  formGroup: {
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pickerChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickerChipActive: {
    backgroundColor: Colors.healthyBg,
    borderColor: Colors.primary,
  },
  pickerChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  pickerChipTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },

  severityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  severityChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },

  textInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    minHeight: 44,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textInputMultiline: {
    minHeight: 70,
    paddingTop: 8,
  },

  // Action Buttons
  actionButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    minHeight: 48,
    borderRadius: Radius.md,
    ...Shadows.sm,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  dismissButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    minHeight: 48,
    borderRadius: Radius.md,
  },
  dismissButtonText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  buttonPressed: {
    opacity: 0.85,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.xs,
    color: Colors.error,
    flex: 1,
  },

  alreadyCompletedText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
