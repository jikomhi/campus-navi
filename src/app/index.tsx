import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import { Ionicons } from '@expo/vector-icons';

// 앱의 핵심 데이터 구조:
// - '출발지_도착지'를 키로 하여 경로별 좌표를 저장한다.
// - 각 포인트는 x/y 좌표, 안내 문구, landmark 정보를 함께 가진다.
// - landmark는 사용자가 "지금 보이는 건가?"를 확인할 수 있는 기준점 역할을 한다.
const ROUTE_DATA: Record<string, any[]> = {
  '한성대 정문_상상관 1층': [
    { x: 0, y: 0, msg: "출발! 앞으로 직진해 브라더!", landmark: "정문 출입구" },                 
    { x: 0, y: 50, msg: "여기서 오른쪽 코너로 돌아!", landmark: "오르막길 꺾이는 코너" },                 
    { x: 50, y: 50, msg: "오케이, 이제 앞쪽 계단 조심해서 타!", landmark: "상상관 앞 거북이 동상" },      
    { x: 50, y: 100, msg: "도착했다 브라더! 고생했어.", landmark: "상상관 1층 회전교차로" }                
  ]
};

export default function App() {
  // 화면 상태: HOME, SKIN, START_LOC, END_LOC, NAVI 등으로 흐름 전환
  const [screen, setScreen] = useState('HOME');
  const [startLocation, setStartLocation] = useState<string | null>(null);
  const [endLocation, setEndLocation] = useState<string | null>(null);
  const [characterSkin, setCharacterSkin] = useState('기본 스킨');

  // 네비게이션 상태값:
  // - steps: 걸음 수
  // - heading: 현재 방위각
  // - isWalking: 걸음 중 여부
  const [steps, setSteps] = useState(0);
  const [heading, setHeading] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  
  const [showSpeech, setShowSpeech] = useState(false);
  const [speechText, setSpeechText] = useState("브라더, 길 잃었어?");

  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [targetIndex, setTargetIndex] = useState(1);
  const [targetAngle, setTargetAngle] = useState(0);

  const isStepping = useRef(false);
  const idleTimer = useRef<any>(null);
  const currentHeading = useRef(0); 

  // 현재 선택된 경로를 찾는다.
  // 예: '한성대 정문_상상관 1층' 키를 기준으로 한 경로 배열을 불러온다.
  const currentRoute = startLocation && endLocation ? ROUTE_DATA[`${startLocation}_${endLocation}`] : null;

  // 네비 화면 진입 시 최초 위치와 첫 안내 메시지를 초기화한다.
  useEffect(() => {
    if (screen === 'NAVI' && currentRoute) {
      setPosX(currentRoute[0].x);
      setPosY(currentRoute[0].y);
      setTargetIndex(1);
      triggerSpeech(currentRoute[0].msg, 4000); 
    }
  }, [screen]);

  const triggerSpeech = (msg: string, duration: number) => {
    setSpeechText(msg);
    setShowSpeech(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setShowSpeech(false);
    }, duration);
  };

  // PDR(Indoor Pedestrian Dead Reckoning) 기반으로 걸음 감지 로직을 실행한다.
  // - 가속도계로 걸음 판정
  // - 자석계로 방향(heading) 계산
  // - 현재 방향을 기준으로 좌표를 이동시킨다.
  useEffect(() => {
    if (screen !== 'NAVI' || !currentRoute) return; 

    Accelerometer.setUpdateInterval(100);
    Magnetometer.setUpdateInterval(100);

    const accSub = Accelerometer.addListener((data: any) => {
      const { x, y, z } = data;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      
      // 가속도 임계치를 넘겼을 때 '한 걸음'으로 판단하고 좌표를 이동시킨다.
      if (magnitude > 1.5) {
        if (!isStepping.current) {
          setSteps((prev) => prev + 1);
          isStepping.current = true;

          const stepLength = 5; 
          const rad = currentHeading.current * (Math.PI / 180);
          
          setPosX((prevX) => prevX + stepLength * Math.sin(rad));
          setPosY((prevY) => prevY + stepLength * Math.cos(rad));
        }
        
        setIsWalking(true);
        setShowSpeech(false);
        
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => {
          setIsWalking(false); 
          triggerSpeech("브라더, 안 따라오고 뭐해?", 4000);
        }, 5000);

      } else if (magnitude < 1.2) {
        // 움직임이 멈춘 구간에서는 다음 보폭을 위해 stepping 플래그를 초기화한다.
        isStepping.current = false;
      }
    });

    const magSub = Magnetometer.addListener((data: any) => {
      let { x, y } = data;
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      const finalAngle = Math.round(angle);
      setHeading(finalAngle);
      currentHeading.current = finalAngle;
    });

    return () => {
      accSub.remove();
      magSub.remove();
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [screen, currentRoute]);

  // 경로 체크포인트 도달 여부를 실시간으로 확인한다.
  // 현재 위치와 다음 waypoint 간 거리 계산 후, 일정 거리 이내면 해당 안내 문구를 출력하고 다음 목표로 이동한다.
  useEffect(() => {
    if (!currentRoute || targetIndex >= currentRoute.length) return;

    const targetPoint = currentRoute[targetIndex];
    const dist = Math.sqrt(Math.pow(targetPoint.x - posX, 2) + Math.pow(targetPoint.y - posY, 2));

    if (dist < 10) {
      triggerSpeech(targetPoint.msg, 5000); 
      setTargetIndex((prev) => prev + 1);   
    } else {
      const dx = targetPoint.x - posX;
      const dy = targetPoint.y - posY;
      let mathAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      let compassAngle = (90 - mathAngle + 360) % 360;
      setTargetAngle(Math.round(compassAngle));
    }
  }, [posX, posY, targetIndex, currentRoute]);

  // 화살표 회전값은 목표 방향과 현재 방향 차이로 계산하여, 사용자가 어디를 향해야 하는지 표시한다.
  const arrowRotation = targetAngle - heading;

  // 사용자가 직접 특정 landmark를 보고 있다고 판단하면, 현재 좌표를 해당 지점으로 강제 보정한다.
  // 실내 위치 오차를 보정하는 '수동 체크인' 기능으로 동작한다.
  const manualCheckIn = () => {
    if (!currentRoute || targetIndex >= currentRoute.length) return;
    
    const targetPoint = currentRoute[targetIndex];
    
    setPosX(targetPoint.x);
    setPosY(targetPoint.y);
    
    triggerSpeech(targetPoint.msg, 5000);
    setTargetIndex((prev) => prev + 1);
  };

  const goHome = () => {
    setScreen('HOME');
    setStartLocation(null);
    setEndLocation(null);
    setSteps(0);
    setPosX(0);
    setPosY(0);
    setIsWalking(false);
    setShowSpeech(false);
  };

  // 메뉴 흐름:
  // 1) HOME: 메인 진입 화면
  // 2) SKIN: 캐릭터 스킨 선택
  // 3) START_LOC: 출발지 선택
  // 4) END_LOC: 도착지 선택
  // 5) NAVI: 실제 길안내 화면
  if (screen === 'HOME') {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="map" size={80} color="#0fbcf9" style={{ marginBottom: 20 }} />
        <Text style={styles.startTitle}>한성대 PDR 내비</Text>
        <Text style={styles.currentSkinText}>현재 스킨: {characterSkin}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setScreen('START_LOC')}><Text style={styles.btnText}>🚀 길 안내 시작</Text></TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setScreen('SKIN')}><Text style={styles.btnText}>👕 캐릭터 스킨 변경</Text></TouchableOpacity>
      </View>
    );
  }

  if (screen === 'SKIN') {
    const selectSkin = (skin: string) => { setCharacterSkin(skin); setScreen('HOME'); };
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.startTitle}>길안내를 도와줄 캐릭터를 골라주세요!</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => selectSkin('기본 스킨')}><Text style={styles.btnText}>헬창</Text></TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => selectSkin('여자 선배')}><Text style={styles.btnText}>여자 선배</Text></TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => selectSkin('남자 선배')}><Text style={styles.btnText}>남자 선배</Text></TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => selectSkin('상상부기')}><Text style={styles.btnText}>상상부기</Text></TouchableOpacity>
        <TouchableOpacity style={styles.homeBtn} onPress={() => setScreen('HOME')}><Text style={styles.btnText}>뒤로가기</Text></TouchableOpacity>
      </View>
    );
  }

  if (screen === 'START_LOC') {
    const pickStart = (loc: string) => { setStartLocation(loc); setScreen('END_LOC'); };
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.startTitle}>어디서 출발할까?</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => pickStart('한성대 정문')}><Text style={styles.btnText}>📍 한성대 정문</Text></TouchableOpacity>
        <TouchableOpacity style={styles.homeBtn} onPress={() => setScreen('HOME')}><Text style={styles.btnText}>취소</Text></TouchableOpacity>
      </View>
    );
  }

  if (screen === 'END_LOC') {
    const pickEnd = (loc: string) => { setEndLocation(loc); setScreen('NAVI'); };
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.startTitle}>어디로 갈까?</Text>
        <Text style={styles.startSub}>출발: {startLocation}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => pickEnd('상상관 1층')}><Text style={styles.btnText}>🏁 상상관 1층</Text></TouchableOpacity>
        <TouchableOpacity style={styles.homeBtn} onPress={() => setScreen('START_LOC')}><Text style={styles.btnText}>이전으로</Text></TouchableOpacity>
      </View>
    );
  }

  // 스킨 이름과 걷기 상태에 따라 이미지를 딱딱 골라주는 자판기 함수!
  const getCharacterImage = () => {
    if (characterSkin === '여자 선배') {
      return isWalking 
        ? require('../../assets/images/woman_walk.gif') 
        : require('../../assets/images/woman_idle.png');
    } else if (characterSkin === '남자 선배') {
      return isWalking 
        ? require('../../assets/images/man_walk.gif') 
        : require('../../assets/images/man_idle.png');
    } else if (characterSkin === '상상부기') {
      return isWalking 
        ? require('../../assets/images/sangsangbugi_walk.gif') 
        : require('../../assets/images/sangsangbugi_idle.png');
    } else {
      // 기본 스킨
      return isWalking 
        ? require('../../assets/images/walk.gif') 
        : require('../../assets/images/idle.png');
    }
  };


  // 실제 네비게이션 화면:
  // - 현재 경로와 목표 waypoint를 기반으로 방향 화살표 및 안내 메시지를 표시한다.
  // - 사용자 위치/방향/목표 도달 여부를 시각화해 길안내 컨셉을 구현한다.
  return (
    <View style={styles.naviContainer}>
      <TouchableOpacity style={styles.topRightBtn} onPress={goHome}>
        <Ionicons name="home" size={28} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.title}>🧭 PDR 내비게이션 🧭</Text>
      
      <View style={styles.infoBox}>
        <Text style={styles.routeText}>{startLocation} ➡️ {endLocation}</Text> 
        <Text style={styles.coordText}>내 좌표: X {Math.round(posX)} / Y {Math.round(posY)}</Text>
      </View>

      {/*  오차 리셋 (수동 체크인) 버튼 */}
      {currentRoute && targetIndex < currentRoute.length && (
        <TouchableOpacity style={styles.checkInBtn} onPress={manualCheckIn}>
          <Text style={styles.checkInText}>
            👀 저기 앞 "{currentRoute[targetIndex].landmark}" 보임? (터치)
          </Text>
        </TouchableOpacity>
      )}

      {currentRoute && targetIndex >= currentRoute.length && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>🎉 목적지 도착 완료!</Text>
        </View>
      )}

      <View style={styles.characterContainer}>
        <View style={[styles.arrowContainer, { transform: [{ rotate: `${arrowRotation}deg` }] }]}>
          <Ionicons name="navigate" size={60} color="#0fbcf9" />
        </View>
        
        {showSpeech && (
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>{speechText}</Text>
          </View>
        )}
        
        <Image 
          // ⭐ 기존 하드코딩된 경로 대신, 방금 만든 함수를 냅다 꽂아버림!
          source={getCharacterImage()} 
          style={styles.character} 
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

// --- 스타일 정의 ---
const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e272e' },
  startTitle: { fontSize: 25, fontWeight: 'bold', color: '#ffdd59', marginBottom: 15 },
  startSub: { fontSize: 18, color: '#d2dae2', marginBottom: 30 },
  currentSkinText: { fontSize: 16, color: '#0be881', fontWeight: 'bold', marginBottom: 40 },
  primaryBtn: { backgroundColor: '#485460', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30, marginBottom: 15, width: '80%', alignItems: 'center' },
  secondaryBtn: { backgroundColor: '#3c40c6', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30, marginBottom: 15, width: '80%', alignItems: 'center' },
  homeBtn: { backgroundColor: '#ff4757', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 20, marginTop: 20 },
  btnText: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  
  naviContainer: { flex: 1, alignItems: 'center', backgroundColor: '#1e272e', paddingTop: 60, position: 'relative' },
  topRightBtn: { position: 'absolute', top: 50, right: 20, backgroundColor: '#ff4757', padding: 10, borderRadius: 20, zIndex: 100 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#ffdd59', marginBottom: 15, marginTop: 20 },
  infoBox: { backgroundColor: '#485460', padding: 15, borderRadius: 10, marginBottom: 15, alignItems: 'center', width: '90%' },
  routeText: { fontSize: 16, color: '#0be881', fontWeight: 'bold', marginBottom: 5 },
  coordText: { fontSize: 14, color: '#d2dae2', fontWeight: 'bold' },
  
  // ⭐ 수동 체크인 버튼 디자인
  checkInBtn: { backgroundColor: '#e1b12c', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 10, marginBottom: 15, width: '90%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },
  checkInText: { fontSize: 16, fontWeight: 'bold', color: '#2f3640' },
  
  successBox: { backgroundColor: '#4cd137', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 10, marginBottom: 15, width: '90%', alignItems: 'center' },
  successText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  
  characterContainer: { height: 350, justifyContent: 'flex-end', alignItems: 'center', position: 'relative' },
 arrowContainer: { 
    position: 'absolute', 
    bottom: -80, // 발밑으로 배치 
    zIndex: 20, 
    shadowColor: "#0fbcf9", 
    shadowOffset: { width: 0, height: 0 }, 
    shadowOpacity: 0.8, 
    shadowRadius: 10, 
    elevation: 10 
  },
  
  // 캐릭터 크기
  character: { width: 150, height: 200 },
  
  // ⭐ 말풍선은 캐릭터 머리 위쪽으로 시원하게 더 끌어올림!
  speechBubble: { 
    position: 'absolute', 
    top: 10, // 겹치지 않게 더 위로 올림
    backgroundColor: '#f5f6fa', 
    paddingHorizontal: 20, 
    paddingVertical: 10, 
    borderRadius: 20, 
    borderBottomRightRadius: 0, 
    zIndex: 10, 
    maxWidth: 220 
  },
  speechText: { fontSize: 14, fontWeight: 'bold', color: '#2f3640', textAlign: 'center' }
});