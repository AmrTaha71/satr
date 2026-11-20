// لوحة أرقام كبيرة لإدخال رمز الإيقاف (4 أرقام) — مخطط §4 شاشة 2
// الرمز لا يُعرض نصًا أبدًا؛ 4 دوائر فقط.
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  onSubmit: (code: string) => void;
}

export function StopCodePad({ onSubmit }: Props): React.JSX.Element {
  const [digits, setDigits] = useState<string>('');

  const press = (d: string) => {
    if (digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) {
      onSubmit(next);
      setDigits('');
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i < digits.length && styles.dotFilled]} />
        ))}
      </View>
      <View style={styles.grid}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
          <TouchableOpacity
            key={i}
            style={styles.key}
            onPress={() => {
              if (k === '⌫') setDigits((d) => d.slice(0, -1));
              else if (k !== '') press(k);
            }}
          >
            <Text style={styles.keyText}>{k}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', marginTop: 12 },
  dots: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#FFFFFF' },
  dotFilled: { backgroundColor: '#FFFFFF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 240, justifyContent: 'center' },
  key: { width: 72, height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C2E22', borderRadius: 10, margin: 4 },
  keyText: { fontSize: 24, color: '#FFFFFF' },
});
