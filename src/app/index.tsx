import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import { LANDMARK_DB, ROUTE_DATA, IDLE_MESSAGES, FINAL_MESSAGES } from './mapData';

// 위도/경도로 거리(미터) 구하는 수학 공식
const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ⭐ 1걸음(약 0.7m)을 위도/경도 각도로 환산하는 상수 (서울 한성대 기준)
const METERS_PER_LAT = 111320; // 위도 1도의 미터 거리
const METERS_PER_LNG = 88200;  // 경도 1도의 미터 거리 (서울 위치 기준)
const STEP_LENGTH = 0.7;       // 상남자의 보폭 0.7미터

// 🎨 [디자인 토큰] 선배가 노트에 쓱쓱 그려준 약도 무드
const C = {
  paper: '#F2EBDD',      // 누런 노트 종이
  paperDeep: '#E7DECB',  // 한 톤 어두운 종이
  ink: '#1F1B16',        // 볼펜 잉크
  inkSoft: '#7A7060',    // 흐린 연필
  redPen: '#C4453B',     // 빨간펜 (중요 표시)
  marker: '#F5C518',     // 형광펜
  stamp: '#2F5D8C',      // 도장 파랑
};

export default function App() {
  const [screen, setScreen] = useState('HOME');
  const [startLocation, setStartLocation] = useState<string | null>(null);
  const [endLocation, setEndLocation] = useState<string | null>(null);
  const [characterSkin, setCharacterSkin] = useState('기본 스킨');

  // ⭐ [추가] 타이머가 최신 스킨 이름을 까먹지 않게 계속 비춰주는 거울
  const skinRef = useRef(characterSkin);
  useEffect(() => {
    skinRef.current = characterSkin;
  }, [characterSkin]);

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
      const magnitude = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);

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
          // ⭐ DB에서 현재 스킨에 맞는 잔소리를 쏙 빼와서 쏜다!
          const idleMsg = IDLE_MESSAGES[skinRef.current] || IDLE_MESSAGES['기본 스킨'];
          triggerSpeech(idleMsg, 4000);
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
      const nextIndex = targetIndex + 1;
      setTargetIndex(nextIndex);

      if (nextIndex < currentRoute.length) {
        // 🏃‍♂️ [아직 가는 중] 다음 징검다리가 남았을 때
        triggerSpeech(targetPoint.msg, 5000);
        const nextTarget = currentRoute[nextIndex];
        if (currentMode === 'GPS' && nextTarget.type === 'PDR') {
          triggerSpeech("실내 진입! 지금부터 발소리로 길 찾는다.", 5000);
        }
        setCurrentMode(nextTarget.type);
      } else {
        // 🏁 [최종 목적지 도착!]
        const finalMsg = FINAL_MESSAGES[endLocation || ''] || "목적지 도착! 고생했다 브라더!";
        triggerSpeech(finalMsg, 8000); // 여운을 위해 말풍선을 8초 동안 길게 띄워줌!
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

    // 유저가 눈으로 봤다고 하면 좌표 오차 0으로 강제 보정!
    setMyLoc({ lat: targetPoint.lat, lng: targetPoint.lng });

    const nextIndex = targetIndex + 1;
    setTargetIndex(nextIndex);

    if (nextIndex < currentRoute.length) {
      // 🏃‍♂️ [아직 가는 중]
      triggerSpeech(targetPoint.msg, 5000);
      setCurrentMode(currentRoute[nextIndex].type);
    } else {
      // 🏁 [최종 목적지 도착!]
      const finalMsg = FINAL_MESSAGES[endLocation || ''] || "목적지 도착! 고생했다 브라더!";
      triggerSpeech(finalMsg, 8000); // 8초 유지
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

  // --- 공통 조각들 ---
  const Ruled = () => (
    <View style={styles.ruledWrap} pointerEvents="none">
      {Array.from({ length: 26 }).map((_, i) => <View key={i} style={styles.ruleLine} />)}
      <View style={styles.marginLine} />
    </View>
  );

  const PickRow = ({ no, label, sub, onPress }: any) => (
    <TouchableOpacity style={styles.pickRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.pickNo}>{no}</Text>
      <View style={styles.pickTextWrap}>
        <Text style={styles.pickLabel}>{label}</Text>
        {!!sub && <Text style={styles.pickSub}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color={C.inkSoft} />
    </TouchableOpacity>
  );

  // --- 메뉴 화면들 ---
  if (screen === 'HOME') {
    return (
      <View style={styles.page}>
        <Ruled />
        <View style={styles.homeInner}>
          <Text style={styles.kicker}>한성대학교 · 신입생 전용</Text>
          <Text style={styles.wordmark}>길잡이</Text>
          <Text style={styles.wordmarkBig}>선배</Text>
          <View style={styles.markerBar} />
          <Text style={styles.homeNote}>
            헤매지 마라. 앞장서서 데려다 줄 테니{'\n'}뒤만 따라 붙어라.
          </Text>

          <View style={styles.stampRow}>
            <Text style={styles.stampLabel}>지금 붙은 선배</Text>
            <View style={styles.stamp}><Text style={styles.stampText}>{characterSkin}</Text></View>
          </View>

          <TouchableOpacity style={styles.pressBtn} onPress={() => setScreen('START_LOC')} activeOpacity={0.85}>
            <Text style={styles.pressBtnText}>따라와, 길 안내 시작</Text>
            <Ionicons name="arrow-forward" size={20} color={C.paper} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => setScreen('SKIN')} activeOpacity={0.7}>
            <Text style={styles.ghostBtnText}>선배 바꾸기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'SKIN') {
    const selectSkin = (skin: string) => { setCharacterSkin(skin); setScreen('HOME'); };
    return (
      <View style={styles.page}>
        <Ruled />
        <View style={styles.sheetInner}>
          <Text style={styles.kicker}>선배 선택</Text>
          <Text style={styles.sheetTitle}>누구랑{'\n'}같이 걸을래?</Text>
          <View style={styles.markerBar} />

          <PickRow no="01" label="헬창" sub="하체 얘기밖에 안 함" onPress={() => selectSkin('기본 스킨')} />
          <PickRow no="02" label="여자 선배" sub="다정한데 은근 재촉함" onPress={() => selectSkin('여자 선배')} />
          <PickRow no="03" label="남자 선배" sub="군기 잡는 타입" onPress={() => selectSkin('남자 선배')} />
          <PickRow no="04" label="상상부기" sub="느릿느릿 학교 마스코트" onPress={() => selectSkin('상상부기')} />

          <TouchableOpacity style={styles.backLink} onPress={() => setScreen('HOME')} activeOpacity={0.6}>
            <Ionicons name="arrow-back" size={16} color={C.redPen} />
            <Text style={styles.backLinkText}>뒤로가기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'START_LOC') {
    const pickStart = (loc: string) => { setStartLocation(loc); setScreen('END_LOC'); };
    return (
      <View style={styles.page}>
        <Ruled />
        <View style={styles.sheetInner}>
          <Text style={styles.kicker}>1단계 / 2단계</Text>
          <Text style={styles.sheetTitle}>지금{'\n'}어디냐?</Text>
          <View style={styles.markerBar} />

          <PickRow no="01" label="한성대입구역" sub="6번 출구 앞에서 대기" onPress={() => pickStart('한성대입구역')} />

          <TouchableOpacity style={styles.backLink} onPress={() => setScreen('HOME')} activeOpacity={0.6}>
            <Ionicons name="close" size={16} color={C.redPen} />
            <Text style={styles.backLinkText}>취소</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'END_LOC') {
    const pickEnd = (loc: string) => { setEndLocation(loc); setScreen('NAVI'); };
    return (
      <View style={styles.page}>
        <Ruled />
        <View style={styles.sheetInner}>
          <Text style={styles.kicker}>2단계 / 2단계</Text>
          <Text style={styles.sheetTitle}>어디까지{'\n'}데려다 줄까?</Text>
          <View style={styles.markerBar} />

          <View style={styles.fromTag}>
            <Text style={styles.fromTagLabel}>출발</Text>
            <Text style={styles.fromTagValue}>{startLocation}</Text>
          </View>

          <PickRow no="01" label="상상관 1층" sub="오르막 한 번 빡세게" onPress={() => pickEnd('상상관 1층')} />

          <TouchableOpacity style={styles.backLink} onPress={() => setScreen('START_LOC')} activeOpacity={0.6}>
            <Ionicons name="arrow-back" size={16} color={C.redPen} />
            <Text style={styles.backLinkText}>이전으로</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const getCharacterImage = () => {
    if (characterSkin === '여자 선배') return isWalking ? require('../../assets/images/woman_walk.gif') : require('../../assets/images/woman_idle.png');
    else if (characterSkin === '남자 선배') return isWalking ? require('../../assets/images/man_walk.gif') : require('../../assets/images/man_idle.png');
    else if (characterSkin === '상상부기') return isWalking ? require('../../assets/images/sangsangbugi_walk.gif') : require('../../assets/images/sangsangbugi_idle.png');
    else return isWalking ? require('../../assets/images/walk.gif') : require('../../assets/images/idle.png');
  };

  const total = currentRoute ? currentRoute.length : 0;
  const done = Math.min(targetIndex, total);
  const arrived = !!currentRoute && targetIndex >= currentRoute.length;

  // --- 내비게이션 뷰 ---
  return (
    <View style={styles.page}>
      <Ruled />

      {/* 상단 바 */}
      <View style={styles.naviTop}>
        <TouchableOpacity style={styles.exitBtn} onPress={goHome} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={16} color={C.ink} />
          <Text style={styles.exitText}>그만</Text>
        </TouchableOpacity>
        <View style={[styles.modeTag, currentMode === 'PDR' && styles.modeTagIndoor]}>
          <View style={[styles.modeDot, currentMode === 'PDR' && styles.modeDotIndoor]} />
          <Text style={styles.modeText}>{currentMode === 'GPS' ? '야외 · GPS 섞는 중' : '실내 · 발소리 추적'}</Text>
        </View>
      </View>

      {/* 경로 헤더 */}
      <View style={styles.routeHead}>
        <Text style={styles.routeFrom}>{startLocation}</Text>
        <Text style={styles.routeArrow}>──▶</Text>
        <Text style={styles.routeTo}>{endLocation}</Text>
      </View>

      {/* 징검다리 진행도 */}
      <View style={styles.progressRow}>
        {currentRoute && currentRoute.map((_, i) => (
          <View key={i} style={styles.progressUnit}>
            <View style={[styles.node, i < done && styles.nodeDone, i === done && styles.nodeNow]} />
            {i < total - 1 && <View style={[styles.link, i < done - 1 && styles.linkDone]} />}
          </View>
        ))}
        <Text style={styles.progressCount}>{done}/{total}</Text>
      </View>

      {/* 다음 목표 카드 */}
      {currentRoute && !arrived && (
        <View style={styles.targetCard}>
          <Text style={styles.targetLabel}>다음 목표</Text>
          <Text style={styles.targetName}>{currentRoute[targetIndex].landmark}</Text>
          <TouchableOpacity style={styles.checkBtn} onPress={manualCheckIn} activeOpacity={0.85}>
            <Ionicons name="eye" size={16} color={C.ink} />
            <Text style={styles.checkBtnText}>눈앞에 보인다</Text>
          </TouchableOpacity>
        </View>
      )}

      {arrived && (
        <View style={styles.doneCard}>
          <Text style={styles.doneLabel}>도착</Text>
          <Text style={styles.doneName}>{endLocation}</Text>
        </View>
      )}

      {/* 캐릭터 무대 */}
      <View style={styles.stage}>
        {showSpeech && (
          <View style={styles.bubble}>
            <Text style={styles.bubbleWho}>{characterSkin === '기본 스킨' ? '헬창' : characterSkin}</Text>
            <Text style={styles.bubbleText}>{speechText}</Text>
            <View style={styles.bubbleTail} />
          </View>
        )}

        <Image source={getCharacterImage()} style={styles.character} resizeMode="contain" />

        <View style={styles.compass}>
          <View style={[styles.compassNeedle, { transform: [{ rotate: `${arrowRotation}deg` }] }]}>
            <Ionicons name="navigate" size={34} color={C.redPen} />
          </View>
        </View>
      </View>

      {/* 하단 계기판 */}
      <View style={styles.meterBar}>
        <View style={styles.meterCell}>
          <Text style={styles.meterLabel}>걸음</Text>
          <Text style={styles.meterValue}>{steps}</Text>
        </View>
        <View style={styles.meterDivider} />
        <View style={styles.meterCell}>
          <Text style={styles.meterLabel}>방위</Text>
          <Text style={styles.meterValue}>{heading}°</Text>
        </View>
        <View style={styles.meterDivider} />
        <View style={[styles.meterCell, { flex: 1.8 }]}>
          <Text style={styles.meterLabel}>좌표</Text>
          <Text style={styles.meterCoord}>
            {myLoc ? `${myLoc.lat.toFixed(5)}, ${myLoc.lng.toFixed(5)}` : '잡는 중'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const MONO = 'Courier';

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.paper, paddingTop: 58 },

  // 노트 괘선 배경
  ruledWrap: { ...StyleSheet.absoluteFill, paddingTop: 96 },
  ruleLine: { height: 30, borderBottomWidth: 1, borderBottomColor: 'rgba(47,93,140,0.10)' },
  marginLine: { position: 'absolute', top: 0, bottom: 0, left: 34, width: 1, backgroundColor: 'rgba(196,69,59,0.22)' },

  // 홈
  homeInner: { flex: 1, paddingHorizontal: 30, paddingTop: 30 },
  kicker: { fontSize: 12, letterSpacing: 2, color: C.inkSoft, fontWeight: '700', marginBottom: 12 },
  wordmark: { fontSize: 44, lineHeight: 48, color: C.ink, fontWeight: '800', letterSpacing: -2 },
  wordmarkBig: { fontSize: 72, lineHeight: 76, color: C.ink, fontWeight: '900', letterSpacing: -5, marginTop: -6 },
  markerBar: { height: 12, width: 96, backgroundColor: C.marker, marginTop: -10, marginBottom: 22 },
  homeNote: { fontSize: 15, lineHeight: 24, color: C.inkSoft, fontWeight: '600' },

  stampRow: { flexDirection: 'row', alignItems: 'center', marginTop: 'auto', marginBottom: 18 },
  stampLabel: { fontSize: 12, color: C.inkSoft, fontWeight: '700', marginRight: 10 },
  stamp: { borderWidth: 2, borderColor: C.stamp, paddingHorizontal: 12, paddingVertical: 5, transform: [{ rotate: '-3deg' }] },
  stampText: { fontSize: 13, color: C.stamp, fontWeight: '800', letterSpacing: 1 },

  pressBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.ink, paddingVertical: 20, paddingHorizontal: 24, marginBottom: 12,
    borderWidth: 2, borderColor: C.ink,
    shadowColor: C.redPen, shadowOffset: { width: 5, height: 5 }, shadowOpacity: 1, shadowRadius: 0, elevation: 0,
  },
  pressBtnText: { fontSize: 18, fontWeight: '800', color: C.paper, letterSpacing: -0.5 },
  ghostBtn: { paddingVertical: 16, alignItems: 'center', borderWidth: 2, borderColor: C.ink, marginBottom: 40 },
  ghostBtnText: { fontSize: 16, fontWeight: '800', color: C.ink },

  // 선택 화면
  sheetInner: { flex: 1, paddingHorizontal: 30, paddingTop: 30 },
  sheetTitle: { fontSize: 38, lineHeight: 44, color: C.ink, fontWeight: '900', letterSpacing: -2 },

  pickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, borderTopWidth: 1, borderTopColor: 'rgba(31,27,22,0.18)' },
  pickNo: { fontFamily: MONO, fontSize: 13, color: C.redPen, fontWeight: '700', width: 36 },
  pickTextWrap: { flex: 1 },
  pickLabel: { fontSize: 21, fontWeight: '800', color: C.ink, letterSpacing: -0.8 },
  pickSub: { fontSize: 13, color: C.inkSoft, fontWeight: '600', marginTop: 3 },

  fromTag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: C.paperDeep, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  fromTagLabel: { fontSize: 11, fontWeight: '800', color: C.inkSoft, letterSpacing: 1, marginRight: 8 },
  fromTagValue: { fontSize: 14, fontWeight: '800', color: C.ink },

  backLink: { flexDirection: 'row', alignItems: 'center', marginTop: 'auto', marginBottom: 44, paddingVertical: 8 },
  backLinkText: { fontSize: 15, fontWeight: '800', color: C.redPen, marginLeft: 6 },

  // 내비 상단
  naviTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  exitBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: C.ink, paddingHorizontal: 10, paddingVertical: 6 },
  exitText: { fontSize: 13, fontWeight: '800', color: C.ink, marginLeft: 4 },
  modeTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.marker, paddingHorizontal: 10, paddingVertical: 7 },
  modeTagIndoor: { backgroundColor: C.paperDeep, borderWidth: 1, borderColor: C.stamp },
  modeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ink, marginRight: 7 },
  modeDotIndoor: { backgroundColor: C.stamp },
  modeText: { fontSize: 12, fontWeight: '800', color: C.ink },

  routeHead: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 22, marginTop: 20 },
  routeFrom: { fontSize: 20, fontWeight: '800', color: C.inkSoft, letterSpacing: -1 },
  routeArrow: { fontSize: 13, color: C.redPen, fontWeight: '800', marginHorizontal: 8 },
  routeTo: { fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: -1.2 },

  progressRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, marginTop: 14 },
  progressUnit: { flexDirection: 'row', alignItems: 'center' },
  node: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: C.inkSoft, backgroundColor: 'transparent' },
  nodeDone: { backgroundColor: C.ink, borderColor: C.ink },
  nodeNow: { borderColor: C.redPen, backgroundColor: C.redPen, width: 13, height: 13, borderRadius: 7 },
  link: { width: 22, height: 2, backgroundColor: 'rgba(31,27,22,0.22)' },
  linkDone: { backgroundColor: C.ink },
  progressCount: { fontFamily: MONO, fontSize: 12, color: C.inkSoft, fontWeight: '700', marginLeft: 12 },

  targetCard: { marginHorizontal: 22, marginTop: 18, backgroundColor: C.paperDeep, borderLeftWidth: 5, borderLeftColor: C.redPen, padding: 16 },
  targetLabel: { fontSize: 11, fontWeight: '800', color: C.inkSoft, letterSpacing: 2, marginBottom: 4 },
  targetName: { fontSize: 22, fontWeight: '900', color: C.ink, letterSpacing: -1, marginBottom: 14 },
  checkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.marker, paddingVertical: 14, borderWidth: 2, borderColor: C.ink },
  checkBtnText: { fontSize: 16, fontWeight: '800', color: C.ink, marginLeft: 8 },

  doneCard: { marginHorizontal: 22, marginTop: 18, borderWidth: 3, borderColor: C.ink, padding: 16, backgroundColor: C.marker },
  doneLabel: { fontSize: 11, fontWeight: '800', color: C.ink, letterSpacing: 4, marginBottom: 2 },
  doneName: { fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: -1 },

  // 캐릭터 무대
  stage: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 10 },
  character: { width: 165, height: 215 },

  bubble: {
    position: 'absolute', top: 6, maxWidth: 250,
    backgroundColor: C.paper, borderWidth: 2, borderColor: C.ink,
    paddingHorizontal: 16, paddingVertical: 12, zIndex: 10,
    shadowColor: C.ink, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0,
  },
  bubbleWho: { fontSize: 10, fontWeight: '800', color: C.redPen, letterSpacing: 2, marginBottom: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: C.ink },
  bubbleTail: {
    position: 'absolute', bottom: -11, left: 28,
    width: 0, height: 0,
    borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 11,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: C.ink,
  },

  compass: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 2, borderColor: C.ink, backgroundColor: C.paperDeep,
    alignItems: 'center', justifyContent: 'center', marginTop: -18, zIndex: 20,
  },
  compassNeedle: { alignItems: 'center', justifyContent: 'center' },

  // 하단 계기판
  meterBar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 2, borderTopColor: C.ink, backgroundColor: C.paperDeep, paddingVertical: 12, paddingHorizontal: 18, paddingBottom: 26 },
  meterCell: { flex: 1 },
  meterDivider: { width: 1, height: 26, backgroundColor: 'rgba(31,27,22,0.2)', marginHorizontal: 12 },
  meterLabel: { fontSize: 10, fontWeight: '800', color: C.inkSoft, letterSpacing: 1.5, marginBottom: 3 },
  meterValue: { fontFamily: MONO, fontSize: 17, fontWeight: '700', color: C.ink },
  meterCoord: { fontFamily: MONO, fontSize: 12, fontWeight: '700', color: C.ink },
});