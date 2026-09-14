import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';
import { getApiErrorMessage } from '@/api/client';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export function LoginScreen() {
  const { login } = useAuth();
  const navigation = useNavigation<Nav>();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!identifier || !password) return;
    setLoading(true);
    setError('');
    try {
      await login(identifier.trim(), password);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
              <Path
                d="M4 17L9 12L13 16L20 8"
                stroke="white"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M14 8H20V14"
                stroke="white"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
          <Text style={styles.brand}>Campaign Buddy</Text>
          <Text style={styles.tagline}>
            Sign in to check in, log sales{'\n'}and keep your campaign on track.
          </Text>
        </View>

        <View style={styles.sheet}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Mobile number</Text>
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={(t) => { setIdentifier(t); setError(''); }}
              autoCapitalize="none"
              autoCorrect={false}
              // Not phone-pad: staff onboarded before the switch still sign in
              // with their old username (backend accepts either). See issue #3.
              keyboardType="default"
              placeholder="07X XXX XXXX"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={(t) => { setPassword(t); setError(''); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                textContentType={showPassword ? 'none' : 'password'}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
              />
              <Pressable
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                accessibilityRole="button"
                onPress={() => setShowPassword((s) => !s)}
                style={styles.eyeButton}
                hitSlop={8}
              >
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M2 12C4.5 7 8 5 12 5s7.5 2 10 7c-2.5 5-6 7-10 7s-7.5-2-10-7z"
                    stroke={colors.textMuted}
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                  />
                  <Circle cx={12} cy={12} r={3} stroke={colors.textMuted} strokeWidth={1.8} />
                  {!showPassword ? (
                    <Path
                      d="M4 20L20 4"
                      stroke={colors.textMuted}
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    />
                  ) : null}
                </Svg>
              </Pressable>
            </View>
          </View>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <Button label="Sign in" onPress={handleSubmit} loading={loading} />
          <Text style={styles.forgot} onPress={() => navigation.navigate('ForgotPassword')}>
            Forgot password?
          </Text>
          <Text style={styles.foot}>Dyro Technologies</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.ink },
  hero: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xxxl },
  badge: {
    width: 62,
    height: 62,
    borderRadius: radius.xl,
    backgroundColor: colors.mango,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontFamily: fontFamily.display, fontSize: 26, color: colors.white, marginTop: spacing.xl },
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
  passwordInput: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.line,
    paddingBottom: spacing.sm + 3,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  eyeButton: {
    paddingLeft: spacing.md,
    paddingBottom: spacing.sm + 3,
  },
  errorBox: {
    backgroundColor: colors.alertTint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  errorText: { color: colors.alert, fontSize: fontSize.sm, fontWeight: '600' },
  forgot: {
    textAlign: 'center',
    fontSize: 13.5,
    color: colors.info,
    fontWeight: '600',
    marginTop: spacing.xl,
  },
  foot: { textAlign: 'center', fontSize: 11.5, color: colors.textMuted, marginTop: spacing.md },
});
