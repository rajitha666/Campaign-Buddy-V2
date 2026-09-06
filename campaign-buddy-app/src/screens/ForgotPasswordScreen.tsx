import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/types';
import * as authApi from '@/api/auth';
import { Button } from '@/components/Button';
import { colors, fontFamily, fontSize, spacing } from '@/theme';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen() {
  const navigation = useNavigation<Nav>();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!username) return;
    setLoading(true);
    try {
      // Backend returns the same generic message whether or not the account
      // exists (spec §3 — no user enumeration), so there is no error path to
      // surface here.
      await authApi.forgotPassword(username);
    } catch {
      // ignored — still show the generic confirmation
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.hero}>
        <Text style={styles.brand}>Reset password</Text>
        <Text style={styles.tagline}>
          Enter your username and we'll send reset instructions to the contact on file.
        </Text>
      </View>

      <View style={styles.sheet}>
        {sent ? (
          <>
            <View style={styles.okBadge}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                <Path d="M5 13l4 4L19 7" stroke="white" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <Text style={styles.okText}>
              If an account exists for <Text style={{ fontWeight: '700' }}>{username}</Text>, reset
              instructions have been sent. Check with your supervisor if you don't receive anything.
            </Text>
            <Button label="Back to sign in" onPress={() => navigation.goBack()} style={{ marginTop: spacing.xl }} />
          </>
        ) : (
          <>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Username"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <Button label="Send reset link" onPress={handleSubmit} loading={loading} />
            <Text style={styles.back} onPress={() => navigation.goBack()}>
              Back to sign in
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.ink },
  hero: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xxxl },
  brand: { fontFamily: fontFamily.display, fontSize: 24, color: colors.white },
  tagline: { color: '#9FB2AA', fontSize: fontSize.md, marginTop: spacing.sm, lineHeight: 21 },
  sheet: {
    marginTop: spacing.xxl,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
  },
  field: { marginBottom: spacing.xl },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.sm },
  input: {
    borderBottomWidth: 1.5,
    borderBottomColor: colors.line,
    paddingBottom: spacing.sm + 3,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
  },
  back: { textAlign: 'center', fontSize: 13.5, color: colors.info, fontWeight: '600', marginTop: spacing.xl },
  okBadge: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.lg,
  },
  okText: { fontSize: fontSize.md, color: colors.textPrimary, lineHeight: 22, textAlign: 'center' },
});
