// الحساسية — 3 أوضاع كبيرة (فكرة 2)
// نائم / جالس بجانبي (افتراضي) / حسّاس جدًا. تُطبَّق فورًا على النواة
// (GuardRuntime.setSensitivity) دون إعادة تشغيل.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SENSITIVITY_LEVELS } from '../../core/motion';
import type { SensitivityLevel } from '../../core/motion';

interface Props {
  selected: SensitivityLevel['id'];
  onSelect: (id: SensitivityLevel['id']) => void;
}

export function SensitivityScreen({ selected, onSelect }: Props): React.JSX.Element {
  const levels = Object.values(SENSITIVITY_LEVELS);

  return (
    <View style={styles.box}>
      <Text style={styles.heading}>متى يصرخ الهاتف؟</Text>
      {levels.map((level) => (
        <TouchableOpacity
          key={level.id}
          style={[styles.card, selected === level.id && styles.selected]}
          onPress={() => onSelect(level.id)}
        >
          <Text style={styles.label}>{level.labelAr}</Text>
          <Text style={styles.hint}>{level.hintAr}</Text>
          <Text style={styles.numbers}>
            العتبة {level.accelThresholdG}g — تأكيد {level.confirmMs}ms
          </Text>
        </TouchableOpacity>
      ))}
      <Text style={styles.note}>
        العتبات تقديرات غير مقيسة بعد — تُعايَر على جهازك: ضع الهاتف على الطاولة 10 ثوانٍ لقياس «ضجيج» المكان.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%' },
  heading: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center', marginBottom: 12 },
  card: { backgroundColor: '#1C2E22', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: '#7ED491' },
  label: { fontSize: 20, fontWeight: 'bold', color: '#F5EFE0' },
  hint: { fontSize: 15, color: '#C9BFA3', marginTop: 4 },
  numbers: { fontSize: 13, color: '#8A9A8E', marginTop: 6 },
  note: { fontSize: 13, color: '#8A9A8E', textAlign: 'center', marginTop: 8 },
});
