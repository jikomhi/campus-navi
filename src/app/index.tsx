import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import { Accelerometer, Magnetometer } from 'expo-sensors';

export default function App() {
  const [steps, setSteps] = useState(0);
  const [heading, setHeading] = useState(0);
  
  const [isWalking, setIsWalking] = useState(false);
  const [showSpeech, setShowSpeech] = useState(false);

  const isStepping = useRef(false);
  const idleTimer = useRef<any>(null); // ⭐ 5초 통합 시한폭탄 타이머

  useEffect(() => {
    Accelerometer.setUpdateInterval(100);
    Magnetometer.setUpdateInterval(100);

    const accSub = Accelerometer.addListener((data: any) => {
      const { x, y, z } = data;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      
      // 💥 브라더가 걷고 있을 때 (진동 감지)
      if (magnitude > 1.5) {
        if (!isStepping.current) {
          setSteps((prev) => prev + 1);
          isStepping.current = true;
        }
        
        // 걷는 모션 유지, 말풍선은 끄기
        setIsWalking(true);
        setShowSpeech(false);
        
        // 브라더가 계속 걷고 있으니 기존 5초 타이머는 계속 리셋
        if (idleTimer.current) clearTimeout(idleTimer.current);
        
        // ⭐ 마지막으로 걸은 순간부터 5초 카운트다운 시작!
        idleTimer.current = setTimeout(() => {
          setIsWalking(false); // 5초 뒤에야 비로소 서 있는 짤(뒤돌아보는 모션)로 변경!
          setShowSpeech(true); // 동시에 말풍선 빡!
        }, 5000);
        
      } 
      // 발을 뗐을 때 (진동 잔잔해짐)
      else if (magnitude < 1.2) {
        isStepping.current = false;
        // 여기서는 이미지 상태를 안 건드린다! 즉, 브라더가 멈춰도 캐릭터는 계속 걷는 척함.
      }
    });

    const magSub = Magnetometer.addListener((data: any) => {
      let { x, y } = data;
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      setHeading(Math.round(angle));
    });

    return () => {
      accSub.remove();
      magSub.remove();
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🧭 한성대 PDR 내비게이션 🧭</Text>
      
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>걸음: {steps}보 | 방위각: {heading}°</Text>
      </View>

      <View style={styles.characterContainer}>
        {showSpeech && (
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>"브라더, 안 따라오고 뭐해?"</Text>
          </View>
        )}
        
        <Image 
          source={
            isWalking 
              ? require('../../assets/images/walk.gif') 
              : require('../../assets/images/idle.png')
          } 
          style={styles.character} 
          resizeMode="contain"
        />
      </View>
      
      <Text style={styles.tip}>성큼성큼 걷다가 확 멈춰봐라!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', backgroundColor: '#1e272e', paddingTop: 80 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#ffdd59', marginBottom: 20 },
  infoBox: { backgroundColor: '#485460', padding: 15, borderRadius: 10, marginBottom: 40 },
  infoText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  characterContainer: { height: 300, justifyContent: 'flex-end', alignItems: 'center', position: 'relative' },
  character: { width: 150, height: 200 },
  speechBubble: { position: 'absolute', top: 0, backgroundColor: '#f5f6fa', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: 0, zIndex: 10 },
  speechText: { fontSize: 16, fontWeight: 'bold', color: '#2f3640' },
  tip: { color: '#0be881', marginTop: 50, fontSize: 16, fontWeight: 'bold' }
});