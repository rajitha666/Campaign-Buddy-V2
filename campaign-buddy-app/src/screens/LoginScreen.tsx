import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';
import { getApiErrorMessage } from '@/api/client';

export function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!username || !password) return;
    setLoading(true);
    try {
      await login(username, password);
      // No manual navigation needed — RootNavigator swaps to MainTabs
      // automatically once AuthContext's `user` is set.
    } catch (err) {
      Alert.alert('Sign in failed', getApiErrorMessage(err));
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
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <Button label="Sign in" onPress={handleSubmit} loading={loading} />
          <Text style={styles.forgot} onPress={() => {/* TODO: navigate to a forgot-password screen calling authApi.forgotPassword */}}>
            Forgot password?
          </Text>
          <Text style={styles.foot}>Dyuro Technologies</Text>
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
  forgot: {
    textAlign: 'center',
    fontSize: 13.5,
    color: colors.info,
    fontWeight: '600',
    marginTop: spacing.xl,
  },
  foot: { textAlign: 'center', fontSize: 11.5, color: colors.textMuted, marginTop: spacing.md },
});
