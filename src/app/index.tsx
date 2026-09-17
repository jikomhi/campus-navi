import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Accelerometer, Magnetometer } from 'expo-sensors';

export default function App() {
  const [steps, setSteps] = useState(0);
  const [heading, setHeading] = useState(0);
  
  // 2D 맵 상의 내 캐릭터(점) X, Y 좌표 State
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);

  const isStepping = useRef(false);
  // 걸음 감지할 때 최신 각도를 바로 빼오기 위한 Ref (React closure 문제 방지)
  const currentHeading = useRef(0);

  useEffect(() => {
    Accelerometer.setUpdateInterval(100);
    Magnetometer.setUpdateInterval(100);

    const accSub = Accelerometer.addListener((data: any) => {
      const { x, y, z } = data;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      
      if (magnitude > 1.5) {
        if (!isStepping.current) {
          setSteps((prev) => prev + 1);
          isStepping.current = true;

          // ⭐ 대망의 위치 이동 로직 (한 걸음당 15픽셀씩 이동)
          const stepLength = 15; 
          // 수학 계산을 위해 각도(Degree)를 라디안(Radian)으로 변환
          const rad = currentHeading.current * (Math.PI / 180);
          
          setPosX((prevX) => prevX + stepLength * Math.sin(rad));
          setPosY((prevY) => prevY - stepLength * Math.cos(rad));
        }
      } else if (magnitude < 1.2) {
        isStepping.current = false;
      }
    });

    const magSub = Magnetometer.addListener((data: any) => {
      let { x, y } = data;
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      
      const finalAngle = Math.round(angle);
      currentHeading.current = finalAngle; // 로직용
      setHeading(finalAngle);              // 화면 출력용
    });

    return () => {
      accSub.remove();
      magSub.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🗺️ 한성대 PDR 내비게이션 🗺️</Text>
      
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>걸음: {steps}보 | 각도: {heading}°</Text>
      </View>

      {/* 여기가 바로 2D 미니맵 도화지다 */}
      <View style={styles.mapArea}>
        {/* 이 빨간 점이 바로 브라더 본인 (나중엔 귀여운 캐릭터로 바꿀 거다) */}
        <View 
          style={[
            styles.character, 
            { transform: [{ translateX: posX }, { translateY: posY }] }
          ]} 
        />
      </View>
      
      <Text style={styles.tip}>폰을 눕힌 채로 바라보며 걸어보자!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e272e' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#ffdd59', marginBottom: 20 },
  infoBox: { backgroundColor: '#485460', padding: 15, borderRadius: 10, marginBottom: 20 },
  infoText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  mapArea: { 
    width: 300, 
    height: 400, 
    backgroundColor: '#d2dae2', 
    borderRadius: 10, 
    justifyContent: 'center', 
    alignItems: 'center',
    overflow: 'hidden', // 맵 밖으로 나가면 안 보이게 가림
    borderWidth: 3,
    borderColor: '#808e9b'
  },
  character: { 
    width: 20, 
    height: 20, 
    backgroundColor: '#ff4757', 
    borderRadius: 10, // 동그랗게 만들기
    position: 'absolute' 
  },
  tip: { color: '#0be881', marginTop: 20, fontSize: 16, fontWeight: 'bold' }
});