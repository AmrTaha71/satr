// ماذا يعمل على هاتفك؟ — الشرح الصادق (فكرتا 86 و100)
// تُبنى البطاقات من مصفوفة القدرات في النواة — فلا تظهر ميزة مستحيلة
// على المنصة الخطأ. على iOS: لا قفل واتساب، والبديل خزنة + Screen Time.
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { EXPLAINER_INTRO_AR, explainerCardsFor } from '../../core/explainer';
import type { PlatformId } from '../../core/motion';

const STATUS_AR = { works: '✓ يعمل', partial: '◐ يعمل جزئيًا', impossible: '✗ لا يعمل على هذا الهاتف' } as const;

export function ExplainerScreen(): React.JSX.Element {
  const platform: PlatformId = Platform.OS === 'ios' ? 'ios' : 'android';
  const cards = explainerCardsFor(platform);

  return (
    <View style={styles.box}>
      <Text style={styles.intro}>{EXPLAINER_INTRO_AR}</Text>
      <Text style={styles.platform}>
        {platform === 'android' ? 'هاتفك Android — النسخة الكاملة ممكنة عليه.' : 'هاتفك iPhone — نسخة iOS هي إنذار حركة + توعية، وليست قفل تطبيقات.'}
      </Text>
      {cards.map((c) => (
        <View key={c.id} style={styles.card}>
          <Text style={styles.title}>{c.titleAr}</Text>
          <Text style={styles.status}>{STATUS_AR[c.status]}</Text>
          <Text style={styles.note}>{c.noteAr}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%' },
  intro: { fontSize: 17, color: '#FFFFFF', textAlign: 'center', marginBottom: 8 },
  platform: { fontSize: 15, color: '#7ED491', textAlign: 'center', marginBottom: 16 },
  card: { backgroundColor: '#1C2E22', borderRadius: 12, padding: 14, marginBottom: 10 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#F5EFE0' },
  status: { fontSize: 15, color: '#FFFFFF', marginTop: 4 },
  note: { fontSize: 14, color: '#C9BFA3', marginTop: 4 },
});
