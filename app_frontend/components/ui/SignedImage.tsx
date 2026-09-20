import React from 'react';
import {
  View,
  Image,
  Text,
  ActivityIndicator,
  StyleSheet,
  ImageStyle,
  ViewStyle,
} from 'react-native';
import { Leaf, ImageOff } from 'lucide-react-native';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { Colors, Spacing, Radius, FontSize } from '@/constants/theme';

interface SignedImageProps {
  imagePath: string | null;
  style?: ViewStyle;
  height?: number;
  resizeMode?: 'cover' | 'contain';
}

/**
 * Renders a leaf image from the private "leaf-images" bucket via signed URL.
 * Shows a professional placeholder if imagePath is null, a spinner while loading, or
 * a clean error state if the signed URL fetch fails. Never constructs public URLs.
 */
export function SignedImage({
  imagePath,
  style,
  height = 200,
  resizeMode = 'cover',
}: SignedImageProps) {
  const { url, loading, error } = useSignedUrl(imagePath);

  if (!imagePath) {
    return (
      <View style={[styles.placeholder, { height }, style]}>
        <Leaf size={28} color={Colors.textMuted} strokeWidth={1.5} />
        <Text style={styles.placeholderText}>No image available</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.placeholder, { height }, style]}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (error || !url) {
    return (
      <View style={[styles.placeholder, { height }, style]}>
        <ImageOff size={28} color={Colors.textMuted} strokeWidth={1.5} />
        <Text style={styles.placeholderText}>Image unavailable</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={[styles.image, { height }, style as ImageStyle]}
      resizeMode={resizeMode}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    borderRadius: Radius.md,
    backgroundColor: '#F1F5F9',
  },
  placeholder: {
    width: '100%',
    borderRadius: Radius.md,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    gap: Spacing.xs,
  },
  placeholderText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
  },
});
