// ============================================================================
// Design tokens — Professional AgTech & Industrial IoT Light Theme
// ============================================================================

export const Colors = {
  // Core background & surfaces
  bg: '#F8FAFC',
  bgCard: '#FFFFFF',
  bgCardSolid: '#FFFFFF',
  bgElevated: '#FFFFFF',
  bgInput: '#F1F5F9',
  bgSubtle: '#F8FAFC',

  // Borders & dividers
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  borderFocused: '#16A34A',

  // Typography
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Agriculture / Primary brand accents
  primary: '#16A34A',
  primaryDim: 'rgba(22, 163, 74, 0.10)',
  primaryGlow: 'rgba(22, 163, 74, 0.20)',

  // Status colors
  healthy: '#16A34A',
  healthyBg: '#DCFCE7',
  sprayed: '#2563EB',
  sprayedBg: '#DBEAFE',
  pending: '#D97706',
  pendingBg: '#FEF3C7',
  error: '#DC2626',
  errorBg: '#FEE2E2',
  skipped: '#64748B',
  skippedBg: '#F1F5F9',
  dismissed: '#64748B',
  dismissedBg: '#F1F5F9',

  // Severity scale (0 - 4)
  severity0: '#16A34A', // Healthy
  severity1: '#059669', // Very Low
  severity2: '#D97706', // Low
  severity3: '#EA580C', // High
  severity4: '#DC2626', // Very High

  // Hardware event colors
  startup: '#16A34A',
  shutdown: '#64748B',
  pumpFault: '#DC2626',
  cameraFault: '#DC2626',
  connectivityLost: '#D97706',
  connectivityRestored: '#16A34A',
  manualOverride: '#2563EB',

  // Misc
  overlay: 'rgba(15, 23, 42, 0.45)',
  white: '#FFFFFF',
};

export const Shadows = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
};

export const Radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const FontSize = {
  xs: 12, // Secondary metadata: 11–13 px
  sm: 13, // Small body: 13 px
  md: 15, // Standard body: 14–15 px
  lg: 17, // Card title: 15–17 px
  xl: 19, // Section title: 17–20 px
  '2xl': 24, // Screen title: 22–26 px
  '3xl': 28, // Numbers / KPIs: 22–30 px
  '4xl': 34,
};

export const Touch = {
  min: 48,
  minSm: 44,
};

export const FontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

/** Map actuation_status to text & badge color */
export const actuationColor: Record<string, string> = {
  sprayed: Colors.sprayed,
  skipped_low_confidence: Colors.skipped,
  skipped_healthy: Colors.healthy,
  pending_review: Colors.pending,
  error: Colors.error,
};

export const actuationBadge: Record<string, { bg: string; text: string }> = {
  sprayed: { bg: Colors.sprayedBg, text: Colors.sprayed },
  skipped_low_confidence: { bg: Colors.skippedBg, text: Colors.skipped },
  skipped_healthy: { bg: Colors.healthyBg, text: Colors.healthy },
  pending_review: { bg: Colors.pendingBg, text: Colors.pending },
  error: { bg: Colors.errorBg, text: Colors.error },
};

/** Map review status to colors */
export const reviewStatusColor: Record<string, string> = {
  pending: Colors.pending,
  reviewed: Colors.healthy,
  dismissed: Colors.dismissed,
};

export const reviewStatusBadge: Record<string, { bg: string; text: string }> = {
  pending: { bg: Colors.pendingBg, text: Colors.pending },
  reviewed: { bg: Colors.healthyBg, text: Colors.healthy },
  dismissed: { bg: Colors.dismissedBg, text: Colors.dismissed },
};

/** Map hardware event type to colors */
export const hardwareEventColor: Record<string, string> = {
  startup: Colors.startup,
  shutdown: Colors.shutdown,
  pump_fault: Colors.pumpFault,
  camera_fault: Colors.cameraFault,
  connectivity_lost: Colors.connectivityLost,
  connectivity_restored: Colors.connectivityRestored,
  manual_override: Colors.manualOverride,
};

/** Severity score → color */
export const severityColor: Record<number, string> = {
  0: Colors.severity0,
  1: Colors.severity1,
  2: Colors.severity2,
  3: Colors.severity3,
  4: Colors.severity4,
};

export const severityBadge: Record<number, { bg: string; text: string }> = {
  0: { bg: Colors.healthyBg, text: Colors.severity0 },
  1: { bg: '#D1FAE5', text: Colors.severity1 },
  2: { bg: Colors.pendingBg, text: Colors.severity2 },
  3: { bg: '#FFEDD5', text: Colors.severity3 },
  4: { bg: Colors.errorBg, text: Colors.severity4 },
};

/** Farmer-friendly labels — maps technical terms to human language */
export const FarmerLabels: Record<string, string> = {
  // Actuation status
  sprayed: 'Treatment applied',
  skipped_low_confidence: 'Uncertain — skipped',
  skipped_healthy: 'Healthy — no action',
  pending_review: 'Waiting for review',
  error: 'Error occurred',

  // Hardware events
  startup: 'Device started',
  shutdown: 'Device stopped',
  pump_fault: 'Spray system issue',
  camera_fault: 'Camera issue',
  connectivity_lost: 'Connection lost',
  connectivity_restored: 'Connection restored',
  manual_override: 'Manual control used',
};

