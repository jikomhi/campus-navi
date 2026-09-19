import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import { Ionicons } from '@expo/vector-icons';

export default function App() {
  // ⭐ 화면 라우팅 State (HOME, SKIN, START_LOC, END_LOC, NAVI)
  const [screen, setScreen] = useState('HOME');
  
  // ⭐ 각종 설정 State
  const [startLocation, setStartLocation] = useState<string | null>(null);
  const [endLocation, setEndLocation] = useState<string | null>(null);
  const [characterSkin, setCharacterSkin] = useState('기본 스킨'); // 기본, 해멍이, 왕남이 등

  const [steps, setSteps] = useState(0);
  const [heading, setHeading] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  const [showSpeech, setShowSpeech] = useState(false);

  const isStepping = useRef(false);
  const idleTimer = useRef<any>(null);

  const TARGET_ANGLE = 90; 
  const arrowRotation = TARGET_ANGLE - heading;

  // ⭐ 내비게이션 화면일 때만 센서 작동
  useEffect(() => {
    if (screen !== 'NAVI') return; 

    Accelerometer.setUpdateInterval(100);
    Magnetometer.setUpdateInterval(100);

    const accSub = Accelerometer.addListener((data: any) => {
      const { x, y, z } = data;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      
      if (magnitude > 1.5) {
        if (!isStepping.current) {
          setSteps((prev) => prev + 1);
          isStepping.current = true;
        }
        setIsWalking(true);
        setShowSpeech(false);
        if (idleTimer.current) clearTimeout(idleTimer.current);
        
        idleTimer.current = setTimeout(() => {
          setIsWalking(false); 
          setShowSpeech(true); 
        }, 5000);
      } else if (magnitude < 1.2) {
        isStepping.current = false;
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
  }, [screen]);

  // ⭐ 모든 상태를 초기화하고 홈으로 돌아가는 탈출 버튼 로직
  const goHome = () => {
    setScreen('HOME');
    setStartLocation(null);
    setEndLocation(null);
    setSteps(0);
    setIsWalking(false);
    setShowSpeech(false);
  };

  // ---------------------------------------------------------
  // 1. 홈 화면 (메인 메뉴)
  // ---------------------------------------------------------
  if (screen === 'HOME') {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="map" size={80} color="#0fbcf9" style={{ marginBottom: 20 }} />
        <Text style={styles.startTitle}>한성대 PDR 내비</Text>
        <Text style={styles.currentSkinText}>현재 스킨: {characterSkin}</Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => setScreen('START_LOC')}>
          <Text style={styles.btnText}>🚀 길 안내 시작</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setScreen('SKIN')}>
          <Text style={styles.btnText}>👕 캐릭터 스킨 변경</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------------------------------------------------
  // 2. 캐릭터 스킨 변경 화면
  // ---------------------------------------------------------
  if (screen === 'SKIN') {
    const selectSkin = (skinName: string) => {
      setCharacterSkin(skinName);
      setScreen('HOME'); // 고르면 바로 홈으로 튕겨줌
    };

    return (
      <View style={styles.centerContainer}>
        <Text style={styles.startTitle}>스킨을 골라라 브라더</Text>
        
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => selectSkin('기본 스킨')}>
          <Text style={styles.btnText}>🚶‍♂️ 기본 스킨</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => selectSkin('해멍이')}>
          <Text style={styles.btnText}>🐶 해멍이</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => selectSkin('왕남이')}>
          <Text style={styles.btnText}>👑 왕남이</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.homeBtn} onPress={() => setScreen('HOME')}>
          <Text style={styles.btnText}>뒤로가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------------------------------------------------
  // 3. 출발지 선택 화면
  // ---------------------------------------------------------
  if (screen === 'START_LOC') {
    const pickStart = (loc: string) => {
      setStartLocation(loc);
      setScreen('END_LOC'); // 출발지 고르면 목적지 화면으로 토스
    };

    return (
      <View style={styles.centerContainer}>
        <Text style={styles.startTitle}>어디서 출발할까?</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => pickStart('한성대 정문')}>
          <Text style={styles.btnText}>📍 한성대 정문</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => pickStart('상상관 1층')}>
          <Text style={styles.btnText}>📍 상상관 1층</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.homeBtn} onPress={() => setScreen('HOME')}>
          <Text style={styles.btnText}>취소</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------------------------------------------------
  // 4. 목적지 선택 화면
  // ---------------------------------------------------------
  if (screen === 'END_LOC') {
    const pickEnd = (loc: string) => {
      setEndLocation(loc);
      setScreen('NAVI'); // 목적지 고르면 드디어 내비게이션 뷰로 진입!
    };

    return (
      <View style={styles.centerContainer}>
        <Text style={styles.startTitle}>어디로 갈까?</Text>
        <Text style={styles.startSub}>출발: {startLocation}</Text>
        
        <TouchableOpacity style={styles.primaryBtn} onPress={() => pickEnd('창의관 학생회실')}>
          <Text style={styles.btnText}>🏁 창의관 학생회실</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => pickEnd('미래관 식당')}>
          <Text style={styles.btnText}>🏁 미래관 식당</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.homeBtn} onPress={() => setScreen('START_LOC')}>
          <Text style={styles.btnText}>이전으로</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------------------------------------------------
  // 5. 찐 내비게이션 화면
  // ---------------------------------------------------------
  return (
    <View style={styles.naviContainer}>
      {/* 우측 상단 홈으로 가기 버튼 */}
      <TouchableOpacity style={styles.topRightBtn} onPress={goHome}>
        <Ionicons name="home" size={28} color="#fff" />
      </TouchableOpacity>

      <Text style={styles.title}>🧭 PDR 내비게이션 🧭</Text>
      
      <View style={styles.infoBox}>
        <Text style={styles.routeText}>출발: {startLocation} ➡️ 도착: {endLocation}</Text> 
        <Text style={styles.infoText}>걸음: {steps}보 | 내 각도: {heading}°</Text>
      </View>

      <View style={styles.characterContainer}>
        <View style={[styles.arrowContainer, { transform: [{ rotate: `${arrowRotation}deg` }] }]}>
          <Ionicons name="navigate" size={60} color="#0fbcf9" />
        </View>

        {showSpeech && (
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>"브라더, 안 따라오고 뭐해?"</Text>
          </View>
        )}
        
        <Image 
          // 나중에 스킨별로 이미지 파일을 다르게 불러오는 로직을 짤 수 있다!
          // 지금은 뼈대니까 기존 이미지 그대로 출력함.
          source={
            isWalking 
              ? require('../../assets/images/walk.gif') 
              : require('../../assets/images/idle.png')
          } 
          style={styles.character} 
          resizeMode="contain"
        />
      </View>
      
      <Text style={styles.tip}>현재 캐릭터 스킨: {characterSkin}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // 공통 & 메뉴 화면 디자인
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e272e' },
  startTitle: { fontSize: 32, fontWeight: 'bold', color: '#ffdd59', marginBottom: 15 },
  startSub: { fontSize: 18, color: '#d2dae2', marginBottom: 30 },
  currentSkinText: { fontSize: 16, color: '#0be881', fontWeight: 'bold', marginBottom: 40 },
  
  primaryBtn: { backgroundColor: '#485460', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30, marginBottom: 15, width: '80%', alignItems: 'center' },
  secondaryBtn: { backgroundColor: '#3c40c6', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30, marginBottom: 15, width: '80%', alignItems: 'center' },
  homeBtn: { backgroundColor: '#ff4757', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 20, marginTop: 20 },
  btnText: { fontSize: 20, fontWeight: 'bold', color: '#fff' },

  // 내비게이션 화면 디자인
  naviContainer: { flex: 1, alignItems: 'center', backgroundColor: '#1e272e', paddingTop: 60, position: 'relative' },
  topRightBtn: { position: 'absolute', top: 50, right: 20, backgroundColor: '#ff4757', padding: 10, borderRadius: 20, zIndex: 100 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#ffdd59', marginBottom: 15, marginTop: 20 },
  infoBox: { backgroundColor: '#485460', padding: 15, borderRadius: 10, marginBottom: 20, alignItems: 'center', width: '90%' },
  routeText: { fontSize: 16, color: '#0be881', fontWeight: 'bold', marginBottom: 10 },
  infoText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  
  characterContainer: { height: 350, justifyContent: 'flex-end', alignItems: 'center', position: 'relative' },
  arrowContainer: { position: 'absolute', top: -20, zIndex: 20, shadowColor: "#0fbcf9", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 10, elevation: 10 },
  character: { width: 150, height: 200 },
  speechBubble: { position: 'absolute', top: 50, backgroundColor: '#f5f6fa', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: 0, zIndex: 10 },
  speechText: { fontSize: 16, fontWeight: 'bold', color: '#2f3640' },
  tip: { color: '#0be881', marginTop: 40, fontSize: 16, fontWeight: 'bold' }
});