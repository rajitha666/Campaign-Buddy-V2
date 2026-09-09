import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/context/AuthContext';
import { openPromoterGuide } from '@/lib/trainingGuide';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, fontFamily, fontSize, spacing } from '@/theme';

export function ProfileScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();

  async function handleLogout() {
    try {
      await logout();
      // No manual nav needed — RootNavigator swaps back to AuthStack once
      // AuthContext's `user` becomes null.
    } catch {
      Alert.alert('Something went wrong logging out. Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.topnav}>
        <Pressable style={styles.backRow} onPress={() => navigation.goBack()}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M15 5l-7 7 7 7" stroke="#F4F6F3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <View>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subtitle}>Account & settings</Text>
          </View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Avatar initials={user?.avatarInitials ?? '—'} size={76} />
          <Text style={styles.name}>{user?.fullName}</Text>
          <Text style={styles.role}>Field Promoter</Text>
        </View>

        <Card style={{ marginTop: spacing.xl, paddingVertical: 4, paddingHorizontal: spacing.lg }}>
          <InfoRow k="Employee ID" v={user?.employeeId ?? '—'} />
          <InfoRow k="Phone" v={user?.phone ?? '—'} />
          <InfoRow k="Reports to" v={user?.reportsToName ?? '—'} last />
        </Card>

        <Pressable style={styles.guideRow} onPress={openPromoterGuide}>
          <View style={styles.guideIcon}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M4 5.5A1.5 1.5 0 015.5 4H18a1 1 0 011 1v13a1 1 0 01-1 1H5.5A1.5 1.5 0 014 17.5v-12z"
                stroke={colors.ink}
                strokeWidth={1.8}
                strokeLinejoin="round"
              />
              <Path d="M8 8.5h7M8 12h7" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.guideTitle}>Field guide</Text>
            <Text style={styles.guideSub}>How to run a shift, step by step</Text>
          </View>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M9 6l6 6-6 6" stroke="#647169" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>

        <Button label="Log out" variant="alert" onPress={handleLogout} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoK}>{k}</Text>
      <Text style={styles.infoV}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.surface },
  topnav: { backgroundColor: colors.ink, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white },
  subtitle: { color: '#9FB2AA', fontSize: 12.5, marginTop: 2 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', paddingTop: spacing.lg },
  name: { fontFamily: fontFamily.display, fontSize: fontSize.lg, marginTop: spacing.md, color: colors.textPrimary },
  role: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md + 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  infoK: { fontSize: fontSize.base, color: colors.textMuted },
  infoV: { fontSize: fontSize.base, fontWeight: '600', color: colors.textPrimary },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  guideIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.textPrimary },
  guideSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
});
