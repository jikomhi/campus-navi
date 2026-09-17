import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Accelerometer } from 'expo-sensors';

export default function App() {
  const [data, setData] = useState({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    Accelerometer.setUpdateInterval(100);

    // 바로 이 부분! : any 를 붙여서 타입스크립트 태클을 막아버렸다.
    const subscription = Accelerometer.addListener((accelerometerData: any) => {
      setData(accelerometerData);
    });

    return () => subscription.remove();
  }, []);

  const magnitude = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2).toFixed(2);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>브라더 PDR 센서 테스트</Text>
      <Text style={styles.text}>X축 (좌우): {data.x.toFixed(2)}</Text>
      <Text style={styles.text}>Y축 (위아래): {data.y.toFixed(2)}</Text>
      <Text style={styles.text}>Z축 (앞뒤): {data.z.toFixed(2)}</Text>
      
      <Text style={styles.highlight}>합산 진동 크기: {magnitude}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#222' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 30 },
  text: { fontSize: 18, color: '#ccc', marginVertical: 8 },
  highlight: { fontSize: 22, fontWeight: 'bold', color: '#ff4757', marginTop: 30 },
});