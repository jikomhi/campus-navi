import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

// ⭐ [퓨전 맵 데이터] X, Y 모눈종이 폐기! 무조건 진짜 위도/경도로 통일한다.
// 실내(PDR) 포인트도 정문 위도/경도에서 조금 더해진 실제 좌표를 쓴다.
const ROUTE_DATA: Record<string, any[]> = {
  '한성대입구역_상상관 1층': [
    { type: 'GPS', lat: 37.58284, lng: 127.01058, msg: "정문 통과! 오르막길로!", landmark: "한성대 정문" },
    { type: 'GPS', lat: 37.58310, lng: 127.01100, msg: "상상관 도착! 이제 실내다.", landmark: "상상관 입구" },
    // 상상관 안쪽 엘리베이터 (위도/경도로 아주 미세하게 이동한 찐 좌표)
    { type: 'PDR', lat: 37.58320, lng: 127.01110, msg: "엘베 타고 3층으로 가라", landmark: "엘리베이터" },
  ]
};

// 위도/경도로 거리(미터) 구하는 수학 공식
const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; 
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; 
};

// ⭐ 1걸음(약 0.7m)을 위도/경도 각도로 환산하는 상수 (서울 한성대 기준)
const METERS_PER_LAT = 111320; // 위도 1도의 미터 거리
const METERS_PER_LNG = 88200;  // 경도 1도의 미터 거리 (서울 위치 기준)
const STEP_LENGTH = 0.7;       // 상남자의 보폭 0.7미터

export default function App() {
  const [screen, setScreen] = useState('HOME');
  const [startLocation, setStartLocation] = useState<string | null>(null);
  const [endLocation, setEndLocation] = useState<string | null>(null);
  const [characterSkin, setCharacterSkin] = useState('기본 스킨');

  const [steps, setSteps] = useState(0);
  const [heading, setHeading] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  
  const [showSpeech, setShowSpeech] = useState(false);
  const [speechText, setSpeechText] = useState("브라더, 길 잃었어?");

  const [targetIndex, setTargetIndex] = useState(1);
  const [targetAngle, setTargetAngle] = useState(0);

  // ⭐ [퓨전 엔진 심장부] posX, posY 폐기! '내 진짜 융합 좌표' 딱 하나만 쓴다.
  const [myLoc, setMyLoc] = useState<{ lat: number, lng: number } | null>(null);
  
  const [currentMode, setCurrentMode] = useState<'GPS' | 'PDR'>('GPS');
  
  // 실시간 값들을 타이머/콜백 안에서도 안전하게 쓰기 위한 useRef
  const currentModeRef = useRef<'GPS' | 'PDR'>('GPS');
  const isStepping = useRef(false);
  const idleTimer = useRef<any>(null);
  const currentHeading = useRef(0); 
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  const currentRoute = startLocation && endLocation ? ROUTE_DATA[`${startLocation}_${endLocation}`] : null;

  // 모드 변경 시 ref도 같이 업데이트
  useEffect(() => {
    currentModeRef.current = currentMode;
  }, [currentMode]);

  // ⭐ 1. 백그라운드 GPS + 상보 필터(센서 퓨전) 스위치
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 1 },
        (loc) => { 
          const gpsLat = loc.coords.latitude;
          const gpsLng = loc.coords.longitude;
          
          setMyLoc((prev) => {
            if (!prev) return { lat: gpsLat, lng: gpsLng }; // 처음엔 GPS 무조건 수용
            
            // 💥 [핵심] 센서 퓨전 로직 💥
            if (currentModeRef.current === 'GPS') {
              // 야외: 내 걸음(PDR) 80% + GPS 신호 20% 스무스하게 섞기!
              const FUSION_RATE = 0.2; 
              return {
                lat: prev.lat * (1 - FUSION_RATE) + gpsLat * FUSION_RATE,
                lng: prev.lng * (1 - FUSION_RATE) + gpsLng * FUSION_RATE
              };
            } else {
              // 실내: GPS 신호 개무시! (오직 브라더 발소리에만 의존)
              return prev;
            }
          });
        }
      );
    })();
    return () => { if (locationSub.current) locationSub.current.remove(); };
  }, []);

  // 네비 초기화
  useEffect(() => {
    if (screen === 'NAVI' && currentRoute) {
      setTargetIndex(1);
      setCurrentMode(currentRoute[0].type); 
      // 시작 좌표는 첫번째 징검다리로 강제 세팅
      setMyLoc({ lat: currentRoute[0].lat, lng: currentRoute[0].lng });
      triggerSpeech(currentRoute[0].msg, 4000); 
    }
  }, [screen]);

  const triggerSpeech = (msg: string, duration: number) => {
    setSpeechText(msg);
    setShowSpeech(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => { setShowSpeech(false); }, duration);
  };

  // ⭐ 2. PDR(가속도계) -> 1걸음을 위도/경도로 변환해서 밀고 나감!
  useEffect(() => {
    if (screen !== 'NAVI' || !currentRoute) return; 

    Accelerometer.setUpdateInterval(100);
    Magnetometer.setUpdateInterval(100);

    const accSub = Accelerometer.addListener((data: any) => {
      const magnitude = Math.sqrt(data.x**2 + data.y**2 + data.z**2);
      
      if (magnitude > 1.5) {
        if (!isStepping.current) {
          setSteps((prev) => prev + 1);
          isStepping.current = true;

          // 💥 [핵심] 걸음을 위도/경도로 바꾸는 삼각함수 마법
          setMyLoc((prev) => {
            if (!prev) return prev;
            const rad = currentHeading.current * (Math.PI / 180);
            
            // 북쪽(0도)일때 lat 증가, 동쪽(90도)일때 lng 증가
            const deltaLat = (STEP_LENGTH * Math.cos(rad)) / METERS_PER_LAT;
            const deltaLng = (STEP_LENGTH * Math.sin(rad)) / METERS_PER_LNG;
            
            return {
              lat: prev.lat + deltaLat,
              lng: prev.lng + deltaLng
            };
          });
        }
        
        setIsWalking(true);
        setShowSpeech(false);
        
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => {
          setIsWalking(false); 
          triggerSpeech("브라더, 안 따라오고 뭐해?", 4000);
        }, 5000);
      } else if (magnitude < 1.2) {
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

    return () => { accSub.remove(); magSub.remove(); };
  }, [screen, currentRoute]);

  // ⭐ 3. 통일된 목표 도착 판별 (전부 미터(m) 단위로 계산)
  useEffect(() => {
    if (!currentRoute || targetIndex >= currentRoute.length || !myLoc) return;

    const targetPoint = currentRoute[targetIndex];
    
    // 야외(GPS)든 실내(PDR)든 내 위도/경도와 목적지 위도/경도 사이의 진짜 거리(m)를 잰다!
    const dist = getDistanceInMeters(myLoc.lat, myLoc.lng, targetPoint.lat, targetPoint.lng);

    // 10미터 이내로 들어오면 도착 인정!
    if (dist < 10) {
      triggerSpeech(targetPoint.msg, 5000); 
      const nextIndex = targetIndex + 1;
      setTargetIndex(nextIndex);   
      
      if (nextIndex < currentRoute.length) {
        const nextTarget = currentRoute[nextIndex];
        if (currentMode === 'GPS' && nextTarget.type === 'PDR') {
          triggerSpeech("실내 진입! 지금부터 발소리로 길 찾는다.", 5000);
        }
        setCurrentMode(nextTarget.type);
      }
    } else {
      // 화살표 방향 실시간 갱신 (목적지 위도/경도 기반 방위각 계산)
      const dy = targetPoint.lat - myLoc.lat;
      const dx = targetPoint.lng - myLoc.lng;
      let mathAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      let compassAngle = (90 - mathAngle + 360) % 360;
      setTargetAngle(Math.round(compassAngle));
    }
  }, [myLoc, targetIndex, currentMode, currentRoute]);

  const arrowRotation = targetAngle - heading;

  // ⭐ 4. 수동 체크인 (내 위치를 목표 위도/경도로 확 잡아끌기!)
  const manualCheckIn = () => {
    if (!currentRoute || targetIndex >= currentRoute.length) return;
    const targetPoint = currentRoute[targetIndex];
    
    // 야외든 실내든 유저가 눈으로 봤다고 하면 좌표 오차 0으로 강제 보정!
    setMyLoc({ lat: targetPoint.lat, lng: targetPoint.lng });
    
    triggerSpeech(targetPoint.msg, 5000);
    const nextIndex = targetIndex + 1;
    setTargetIndex(nextIndex);
    if (nextIndex < currentRoute.length) {
      setCurrentMode(currentRoute[nextIndex].type);
    }
  };

  const goHome = () => {
    setScreen('HOME');
    setStartLocation(null);
    setEndLocation(null);
    setSteps(0);
    setMyLoc(null);
    setIsWalking(false);
    setShowSpeech(false);
  };

  // --- 메뉴 화면들 (UI 완벽 보존) ---
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
        <TouchableOpacity style={styles.primaryBtn} onPress={() => pickStart('한성대입구역')}><Text style={styles.btnText}>📍 한성대입구역</Text></TouchableOpacity>
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

  const getCharacterImage = () => {
    if (characterSkin === '여자 선배') return isWalking ? require('../../assets/images/woman_walk.gif') : require('../../assets/images/woman_idle.png');
    else if (characterSkin === '남자 선배') return isWalking ? require('../../assets/images/man_walk.gif') : require('../../assets/images/man_idle.png');
    else if (characterSkin === '상상부기') return isWalking ? require('../../assets/images/sangsangbugi_walk.gif') : require('../../assets/images/sangsangbugi_idle.png');
    else return isWalking ? require('../../assets/images/walk.gif') : require('../../assets/images/idle.png');
  };

  // --- 내비게이션 뷰 ---
  return (
    <View style={styles.naviContainer}>
      <TouchableOpacity style={styles.topRightBtn} onPress={goHome}>
        <Ionicons name="home" size={28} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.title}>🧭 PDR 내비게이션 🧭</Text>
      
      <View style={styles.infoBox}>
        <Text style={styles.routeText}>{currentMode === 'GPS' ? '☀️ 야외 (GPS + PDR 퓨전 중)' : '🏢 실내 (PDR 100% 작동 중)'}</Text> 
        <Text style={styles.coordText}>내 좌표: {myLoc ? `${myLoc.lat.toFixed(5)}, ${myLoc.lng.toFixed(5)}` : '잡는 중...'}</Text>
      </View>

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
        
        <Image source={getCharacterImage()} style={styles.character} resizeMode="contain" />
      </View>
    </View>
  );
}

// --- 브라더가 깎아둔 스타일 완벽 보존 ---
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
  
  checkInBtn: { backgroundColor: '#e1b12c', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 10, marginBottom: 15, width: '90%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },
  checkInText: { fontSize: 16, fontWeight: 'bold', color: '#2f3640' },
  
  successBox: { backgroundColor: '#4cd137', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 10, marginBottom: 15, width: '90%', alignItems: 'center' },
  successText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  
  characterContainer: { height: 350, justifyContent: 'flex-end', alignItems: 'center', position: 'relative' },
  arrowContainer: { 
    position: 'absolute', 
    bottom: -80, 
    zIndex: 20, 
    shadowColor: "#0fbcf9", 
    shadowOffset: { width: 0, height: 0 }, 
    shadowOpacity: 0.8, 
    shadowRadius: 10, 
    elevation: 10 
  },
  
  character: { width: 150, height: 200 },
  
  speechBubble: { 
    position: 'absolute', 
    top: 10, 
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