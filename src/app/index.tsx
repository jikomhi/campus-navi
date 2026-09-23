import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, Platform, Linking, ActivityIndicator, ScrollView } from 'react-native';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Asset } from 'expo-asset';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LANDMARK_DB, SELECTABLE_PLACES, buildRoute, getDistanceInMeters,
  getRemainingDistance, IDLE_MESSAGES, OFF_ROUTE_MESSAGES,
  INDOOR_ENTER_MESSAGE, OUTDOOR_ENTER_MESSAGE, FINAL_MESSAGES,
  RoutePoint, PointType,
} from './mapData';

// ============================================================
// ⚙️ 튜닝 상수 (현장에서 만질 값들)
// ============================================================
const METERS_PER_LAT = 111320;
const METERS_PER_LNG = 88200;

const DEFAULT_STEP_LENGTH = 0.7;
const STEP_LENGTH_MIN = 0.45;
const STEP_LENGTH_MAX = 0.95;

const HEADING_ALPHA = 0.15;      // 방위 저역통과 계수 (낮을수록 부드럽고 느림)
const ARRIVE_RADIUS = 10;        // 도착 인정 반경(m)
const OFF_ROUTE_STREAK = 3;      // 몇 번 연속 멀어지면 경고
const OFF_ROUTE_MARGIN = 2;      // 이만큼(m) 이상 멀어져야 '멀어짐'으로 침
const OFF_ROUTE_COOLDOWN = 15000;
const GPS_STALE_MS = 10000;      // 이 시간 넘게 못 잡으면 경고
const IDLE_MS = 5000;

const STORE_SETTINGS = '@hansung_navi/settings';
const STORE_SESSION = '@hansung_navi/session';

// ============================================================
// 🎨 디자인 토큰 — 선배가 노트에 쓱쓱 그려준 약도
// ============================================================
const C = {
  paper: '#F2EBDD',
  paperDeep: '#E7DECB',
  ink: '#1F1B16',
  inkSoft: '#7A7060',
  redPen: '#C4453B',
  marker: '#F5C518',
  stamp: '#2F5D8C',
};
const MONO = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

// ============================================================
// 🖼️ 캐릭터 에셋 (프리로드 대상)
// ============================================================
const SKINS: Record<string, { label: string; sub: string; idle: any; walk: any }> = {
  '헬창': {
    label: '헬창', sub: '뇌까지 근육인가 싶음',
    idle: require('../../assets/images/idle.png'), walk: require('../../assets/images/walk.gif'),
  },
  '여자 선배': {
    label: '여자 선배', sub: '다정한데 은근 재촉함',
    idle: require('../../assets/images/woman_idle.png'), walk: require('../../assets/images/woman_walk.gif'),
  },
  '남자 선배': {
    label: '남자 선배', sub: '자상하고 친절함',
    idle: require('../../assets/images/man_idle.png'), walk: require('../../assets/images/man_walk.gif'),
  },
  '기본 스킨': {
    label: '상상부기', sub: '느릿느릿 학교 마스코트',
    idle: require('../../assets/images/sangsangbugi_idle.png'), walk: require('../../assets/images/sangsangbugi_walk.gif'),
  },
};
const ALL_ASSETS = Object.values(SKINS).flatMap(s => [s.idle, s.walk]);

// ============================================================
// 🧮 유틸
// ============================================================

/** 각도 wrap-around(359°→1°)를 제대로 처리하는 저역통과 필터 */
const smoothAngle = (prev: number, next: number, alpha: number) => {
  const diff = ((next - prev + 540) % 360) - 180;
  return (prev + alpha * diff + 360) % 360;
};

/** GPS 정확도(m)에 따라 융합 비율을 가변으로 */
const fusionRateFor = (accuracy?: number | null) => {
  if (accuracy == null) return 0.15;
  if (accuracy <= 5) return 0.45;   // 신호 아주 좋음 → GPS 크게 신뢰
  if (accuracy <= 10) return 0.30;
  if (accuracy <= 20) return 0.15;
  if (accuracy <= 40) return 0.07;
  return 0.02;                       // 신호 나쁨 → 거의 무시
};

/** 키(cm)로 보폭 추정 */
const stepFromHeight = (cm: number) => Math.min(STEP_LENGTH_MAX, Math.max(STEP_LENGTH_MIN, cm * 0.00415));

const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`);
const fmtEta = (m: number) => `약 ${Math.max(1, Math.round(m / 1.2 / 60))}분`; // 보행 1.2m/s 가정

export default function App() {
  // --- 화면/선택 ---
  const [screen, setScreen] = useState<'BOOT' | 'HOME' | 'SKIN' | 'SETUP' | 'START_LOC' | 'END_LOC' | 'NAVI' | 'DENIED'>('BOOT');
  const [startId, setStartId] = useState<string | null>(null);
  const [endId, setEndId] = useState<string | null>(null);
  const [characterSkin, setCharacterSkin] = useState('기본 스킨');

  // --- 설정 ---
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [stepLength, setStepLength] = useState(DEFAULT_STEP_LENGTH);
  const [voiceOn, setVoiceOn] = useState(true);

  // --- 센서/상태 ---
  const [steps, setSteps] = useState(0);
  const [heading, setHeading] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [currentMode, setCurrentMode] = useState<PointType>('GPS');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsStale, setGpsStale] = useState(false);
  const [pdrAvailable, setPdrAvailable] = useState(true);
  const [compassAvailable, setCompassAvailable] = useState(true);

  // --- 안내 ---
  const [route, setRoute] = useState<RoutePoint[] | null>(null);
  const [targetIndex, setTargetIndex] = useState(1);
  const [targetAngle, setTargetAngle] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [legDistance, setLegDistance] = useState(0);
  const [showSpeech, setShowSpeech] = useState(false);
  const [speechText, setSpeechText] = useState('브라더, 길 잃었어?');
  const [savedSession, setSavedSession] = useState<any>(null);

  // --- refs ---
  const skinRef = useRef(characterSkin);
  const stepLengthRef = useRef(stepLength);
  const voiceRef = useRef(voiceOn);
  const currentModeRef = useRef<PointType>('GPS');
  const isStepping = useRef(false);
  const idleTimer = useRef<any>(null);
  const currentHeading = useRef(0);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const lastGpsAt = useRef<number>(0);
  const lastDist = useRef<number>(Infinity);
  const offRouteStreak = useRef(0);
  const lastOffRouteAt = useRef(0);
  const calib = useRef<{ from: { lat: number; lng: number } | null; steps: number }>({ from: null, steps: 0 });

  useEffect(() => { skinRef.current = characterSkin; }, [characterSkin]);
  useEffect(() => { stepLengthRef.current = stepLength; }, [stepLength]);
  useEffect(() => { voiceRef.current = voiceOn; }, [voiceOn]);
  useEffect(() => { currentModeRef.current = currentMode; }, [currentMode]);

  // ============================================================
  // 🗣️ 대사 출력 (+ TTS + 햅틱)
  // ============================================================
  const triggerSpeech = useCallback((msg: string, duration: number, haptic?: 'light' | 'success' | 'warn') => {
    setSpeechText(msg);
    setShowSpeech(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setShowSpeech(false), duration);

    if (voiceRef.current) {
      Speech.stop();
      Speech.speak(msg, { language: 'ko-KR', rate: 1.0, pitch: 1.05 });
    }
    if (haptic === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else if (haptic === 'warn') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    else if (haptic === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  // ============================================================
  // 🚀 부팅: 에셋 프리로드 + 설정/세션 복구 + 센서 가용성 체크
  // ============================================================
  useEffect(() => {
    (async () => {
      try { await Asset.loadAsync(ALL_ASSETS); } catch { /* 이미지 없어도 앱은 뜬다 */ }

      try {
        const raw = await AsyncStorage.getItem(STORE_SETTINGS);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.characterSkin && SKINS[s.characterSkin]) setCharacterSkin(s.characterSkin);
          if (typeof s.heightCm === 'number') { setHeightCm(s.heightCm); setStepLength(stepFromHeight(s.heightCm)); }
          if (typeof s.stepLength === 'number') setStepLength(s.stepLength);
          if (typeof s.voiceOn === 'boolean') setVoiceOn(s.voiceOn);
        }
        const sess = await AsyncStorage.getItem(STORE_SESSION);
        if (sess) setSavedSession(JSON.parse(sess));
      } catch { /* 저장소 깨져도 무시하고 진행 */ }

      const [accOk, magOk] = await Promise.all([
        Accelerometer.isAvailableAsync().catch(() => false),
        Magnetometer.isAvailableAsync().catch(() => false),
      ]);
      setPdrAvailable(!!accOk);
      setCompassAvailable(!!magOk);

      setScreen('HOME');
    })();
  }, []);

  // 설정 자동 저장
  useEffect(() => {
    if (screen === 'BOOT') return;
    AsyncStorage.setItem(STORE_SETTINGS, JSON.stringify({ characterSkin, heightCm, stepLength, voiceOn })).catch(() => {});
  }, [characterSkin, heightCm, stepLength, voiceOn, screen]);

  // 진행 상태 자동 저장 (앱이 죽어도 이어서 가게)
  useEffect(() => {
    if (screen !== 'NAVI' || !startId || !endId) return;
    AsyncStorage.setItem(STORE_SESSION, JSON.stringify({ startId, endId, targetIndex, myLoc, steps, at: Date.now() })).catch(() => {});
  }, [screen, startId, endId, targetIndex, myLoc, steps]);

  // ============================================================
  // 📡 1. GPS + 적응형 센서 퓨전
  // ============================================================
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { if (!cancelled) setScreen('DENIED'); return; }

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 1 },
        (loc) => {
          const gpsLat = loc.coords.latitude;
          const gpsLng = loc.coords.longitude;
          const acc = loc.coords.accuracy ?? null;
          lastGpsAt.current = Date.now();
          setGpsAccuracy(acc);
          setGpsStale(false);

          setMyLoc((prev) => {
            if (!prev) return { lat: gpsLat, lng: gpsLng };
            if (currentModeRef.current === 'GPS') {
              const rate = fusionRateFor(acc); // 💥 신호 품질에 따라 가변
              return {
                lat: prev.lat * (1 - rate) + gpsLat * rate,
                lng: prev.lng * (1 - rate) + gpsLng * rate,
              };
            }
            return prev; // 실내에서는 GPS 무시
          });
        }
      );
    })();
    return () => { cancelled = true; locationSub.current?.remove(); Speech.stop(); };
  }, []);

  // GPS 끊김 감지
  useEffect(() => {
    if (screen !== 'NAVI') return;
    const t = setInterval(() => {
      if (currentModeRef.current !== 'GPS') { setGpsStale(false); return; }
      setGpsStale(Date.now() - lastGpsAt.current > GPS_STALE_MS);
    }, 3000);
    return () => clearInterval(t);
  }, [screen]);

  // ============================================================
  // 🧭 2. 네비 시작 / 복구
  // ============================================================
  const beginNavi = (sId: string, eId: string, resume?: any) => {
    const r = buildRoute(sId, eId);
    if (!r) { triggerSpeech('그 길은 내가 아직 몰라. 다른 데로 가자.', 4000, 'warn'); return; }
    setRoute(r);
    setStartId(sId); setEndId(eId);

    const idx = resume?.targetIndex ?? 1;
    setTargetIndex(idx);
    setSteps(resume?.steps ?? 0);
    setCurrentMode(r[Math.max(0, Math.min(idx - 1, r.length - 1))].type);
    setMyLoc(resume?.myLoc ?? { lat: r[0].lat, lng: r[0].lng });
    lastDist.current = Infinity;
    offRouteStreak.current = 0;
    calib.current = { from: null, steps: 0 };
    setScreen('NAVI');
    triggerSpeech(resume ? '다시 왔구나. 이어서 가자.' : r[0].msg, 4500, 'light');
  };

  // ============================================================
  // 👣 3. PDR — 보정된 보폭으로 걸음을 좌표로 변환
  // ============================================================
  useEffect(() => {
    if (screen !== 'NAVI' || !route) return;
    const subs: any[] = [];

    if (pdrAvailable) {
      Accelerometer.setUpdateInterval(100);
      subs.push(Accelerometer.addListener((data: any) => {
        const magnitude = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);

        if (magnitude > 1.5) {
          if (!isStepping.current) {
            setSteps((prev) => prev + 1);
            calib.current.steps += 1;
            isStepping.current = true;

            setMyLoc((prev) => {
              if (!prev) return prev;
              const rad = currentHeading.current * (Math.PI / 180);
              const L = stepLengthRef.current;
              return {
                lat: prev.lat + (L * Math.cos(rad)) / METERS_PER_LAT,
                lng: prev.lng + (L * Math.sin(rad)) / METERS_PER_LNG,
              };
            });
          }

          setIsWalking(true);
          setShowSpeech(false);
          if (idleTimer.current) clearTimeout(idleTimer.current);
          idleTimer.current = setTimeout(() => {
            setIsWalking(false);
            triggerSpeech(IDLE_MESSAGES[skinRef.current] || IDLE_MESSAGES['기본 스킨'], 4000);
          }, IDLE_MS);
        } else if (magnitude < 1.2) {
          isStepping.current = false;
        }
      }));
    }

    if (compassAvailable) {
      Magnetometer.setUpdateInterval(100);
      subs.push(Magnetometer.addListener((data: any) => {
        const { x, y } = data;
        let angle = Math.atan2(y, x) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        // 💥 저역통과 필터: 실내 철골에서 값이 튀어도 화살표가 안 떤다
        const smoothed = smoothAngle(currentHeading.current, angle, HEADING_ALPHA);
        currentHeading.current = smoothed;
        setHeading(Math.round(smoothed));
      }));
    }

    return () => subs.forEach(s => s.remove());
  }, [screen, route, pdrAvailable, compassAvailable, triggerSpeech]);

  // ============================================================
  // 📏 4. 보폭 자동 캘리브레이션 (야외 GPS 구간에서만)
  // ============================================================
  useEffect(() => {
    if (screen !== 'NAVI' || currentMode !== 'GPS' || !myLoc) return;
    if (gpsAccuracy != null && gpsAccuracy > 15) return; // 신호 나쁘면 보정 안 함

    const c = calib.current;
    if (!c.from) { c.from = { ...myLoc }; c.steps = 0; return; }
    if (c.steps < 25) return; // 25걸음 모이면 한 번 계산

    const moved = getDistanceInMeters(c.from.lat, c.from.lng, myLoc.lat, myLoc.lng);
    const measured = moved / c.steps;
    if (measured >= STEP_LENGTH_MIN && measured <= STEP_LENGTH_MAX) {
      setStepLength(prev => prev * 0.7 + measured * 0.3); // 급변 방지
    }
    c.from = { ...myLoc }; c.steps = 0;
  }, [myLoc, currentMode, screen, gpsAccuracy]);

  /** 다음 징검다리로 넘어가는 공통 처리 */
  const advanceTo = useCallback((nextIndex: number, reached: RoutePoint, manual: boolean) => {
    if (!route) return;
    if (manual) setMyLoc({ lat: reached.lat, lng: reached.lng }); // 오차 0으로 강제 보정
    setTargetIndex(nextIndex);
    lastDist.current = Infinity;
    offRouteStreak.current = 0;
    calib.current = { from: null, steps: 0 };

    if (nextIndex < route.length) {
      const next = route[nextIndex];
      if (currentModeRef.current === 'GPS' && next.type === 'PDR') {
        triggerSpeech(INDOOR_ENTER_MESSAGE, 5000, 'light');
      } else if (currentModeRef.current === 'PDR' && next.type === 'GPS') {
        triggerSpeech(OUTDOOR_ENTER_MESSAGE, 5000, 'light');
        setMyLoc({ lat: reached.lat, lng: reached.lng }); // 실외 복귀 시 PDR 드리프트 리셋
      } else {
        triggerSpeech(reached.msg, 5000, 'light');
      }
      setCurrentMode(next.type);
    } else {
      const finalMsg = FINAL_MESSAGES[reached.id] || '목적지 도착! 고생했어!';
      triggerSpeech(finalMsg, 8000, 'success');
      AsyncStorage.removeItem(STORE_SESSION).catch(() => {});
      setSavedSession(null);
    }
  }, [route, triggerSpeech]);

  // ============================================================
  // 🎯 5. 도착 판별 + 방위 + 남은 거리 + 이탈 감지
  // ============================================================
  useEffect(() => {
    if (screen !== 'NAVI' || !route || targetIndex >= route.length || !myLoc) return;

    const target = route[targetIndex];
    const dist = getDistanceInMeters(myLoc.lat, myLoc.lng, target.lat, target.lng);
    setLegDistance(dist);
    setRemaining(getRemainingDistance(route, targetIndex, myLoc.lat, myLoc.lng));

    if (dist < ARRIVE_RADIUS) {
      advanceTo(targetIndex + 1, target, false);
      return;
    }

    // 방위각 갱신
    const dy = target.lat - myLoc.lat;
    const dx = target.lng - myLoc.lng;
    const mathAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    setTargetAngle(Math.round((90 - mathAngle + 360) % 360));

    // 💥 이탈 감지: 목표에서 계속 멀어지면 경고
    if (dist > lastDist.current + OFF_ROUTE_MARGIN) {
      offRouteStreak.current += 1;
      if (offRouteStreak.current >= OFF_ROUTE_STREAK && Date.now() - lastOffRouteAt.current > OFF_ROUTE_COOLDOWN) {
        lastOffRouteAt.current = Date.now();
        offRouteStreak.current = 0;
        triggerSpeech(OFF_ROUTE_MESSAGES[skinRef.current] || OFF_ROUTE_MESSAGES['기본 스킨'], 5000, 'warn');
      }
    } else if (dist < lastDist.current) {
      offRouteStreak.current = 0;
    }
    lastDist.current = dist;
  }, [myLoc, targetIndex, route, screen, advanceTo, triggerSpeech]);

  const manualCheckIn = () => {
    if (!route || targetIndex >= route.length) return;
    advanceTo(targetIndex + 1, route[targetIndex], true);
  };

  const goHome = () => {
    Speech.stop();
    setScreen('HOME');
    setStartId(null); setEndId(null); setRoute(null);
    setSteps(0); setMyLoc(null); setIsWalking(false); setShowSpeech(false);
    AsyncStorage.removeItem(STORE_SESSION).catch(() => {});
    setSavedSession(null);
  };

  const arrowRotation = targetAngle - heading;

  // ============================================================
  // 🧩 공통 조각
  // ============================================================
  const Ruled = () => (
    <View style={styles.ruledWrap} pointerEvents="none">
      {Array.from({ length: 26 }).map((_, i) => <View key={i} style={styles.ruleLine} />)}
      <View style={styles.marginLine} />
    </View>
  );

  const PickRow = ({ no, label, sub, onPress, disabled }: any) => (
    <TouchableOpacity style={[styles.pickRow, disabled && { opacity: 0.35 }]} onPress={onPress} disabled={disabled} activeOpacity={0.7}>
      <Text style={styles.pickNo}>{no}</Text>
      <View style={styles.pickTextWrap}>
        <Text style={styles.pickLabel}>{label}</Text>
        {!!sub && <Text style={styles.pickSub}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color={C.inkSoft} />
    </TouchableOpacity>
  );

  // ============================================================
  // 화면들
  // ============================================================
  if (screen === 'BOOT') {
    return (
      <View style={[styles.page, styles.center]}>
        <ActivityIndicator color={C.ink} />
        <Text style={styles.bootText}>선배 부르는 중</Text>
      </View>
    );
  }

  if (screen === 'DENIED') {
    return (
      <View style={styles.page}>
        <Ruled />
        <View style={styles.sheetInner}>
          <Text style={styles.kicker}>위치 권한 필요</Text>
          <Text style={styles.sheetTitle}>네 위치를 모르면{'\n'}데려다 줄 수가 없어</Text>
          <View style={styles.markerBar} />
          <Text style={styles.homeNote}>
            설정에서 위치 권한을 켜고 다시 들어와.{'\n'}
            권한 없이는 화살표가 아무 데도 못 가리켜.
          </Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.pressBtn} onPress={() => Linking.openSettings()} activeOpacity={0.85}>
            <Text style={styles.pressBtnText}>설정 열기</Text>
            <Ionicons name="arrow-forward" size={20} color={C.paper} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.backLink, { marginTop: 0 }]} onPress={() => setScreen('HOME')} activeOpacity={0.6}>
            <Ionicons name="arrow-back" size={16} color={C.redPen} />
            <Text style={styles.backLinkText}>그냥 둘러보기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'HOME') {
    return (
      <View style={styles.page}>
        <Ruled />
        <View style={styles.homeInner}>
          <Text style={styles.kicker}>한성대학교 · 신입생 전용</Text>
          <Text style={styles.wordmark}>길잡이</Text>
          <Text style={styles.wordmarkBig}>선배</Text>
          <View style={styles.markerBar} />
          <Text style={styles.homeNote}>처음이라 어렵지?{'\n'}헤메지마 선배가 안내해줄게.</Text>

          {!pdrAvailable && (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>이 기기는 걸음 센서가 없어. GPS로만 안내하고, 실내에선 직접 체크인해줘.</Text>
            </View>
          )}

          {!!savedSession && LANDMARK_DB[savedSession.startId] && LANDMARK_DB[savedSession.endId] && (
            <TouchableOpacity
              style={styles.resumeCard}
              activeOpacity={0.85}
              onPress={() => beginNavi(savedSession.startId, savedSession.endId, savedSession)}
            >
              <Text style={styles.resumeLabel}>가다 말았잖아</Text>
              <Text style={styles.resumeRoute}>
                {LANDMARK_DB[savedSession.startId].shortName} → {LANDMARK_DB[savedSession.endId].shortName}
              </Text>
              <Text style={styles.resumeGo}>이어서 가기</Text>
            </TouchableOpacity>
          )}

          <View style={styles.stampRow}>
            <Text style={styles.stampLabel}>지금 붙은 선배</Text>
            <View style={styles.stamp}><Text style={styles.stampText}>{SKINS[characterSkin]?.label}</Text></View>
            <TouchableOpacity style={styles.voiceToggle} onPress={() => { setVoiceOn(v => !v); Speech.stop(); }} activeOpacity={0.7}>
              <Ionicons name={voiceOn ? 'volume-high' : 'volume-mute'} size={16} color={voiceOn ? C.ink : C.inkSoft} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.pressBtn} onPress={() => setScreen(heightCm ? 'START_LOC' : 'SETUP')} activeOpacity={0.85}>
            <Text style={styles.pressBtnText}>따라와, 길 안내 시작</Text>
            <Ionicons name="arrow-forward" size={20} color={C.paper} />
          </TouchableOpacity>
          <View style={styles.homeSubRow}>
            <TouchableOpacity style={[styles.ghostBtn, { flex: 1, marginRight: 8 }]} onPress={() => setScreen('SKIN')} activeOpacity={0.7}>
              <Text style={styles.ghostBtnText}>선배 바꾸기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.ghostBtn, { flex: 1 }]} onPress={() => setScreen('SETUP')} activeOpacity={0.7}>
              <Text style={styles.ghostBtnText}>보폭 설정</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (screen === 'SKIN') {
    return (
      <View style={styles.page}>
        <Ruled />
        <View style={styles.sheetInner}>
          <Text style={styles.kicker}>선배 선택</Text>
          <Text style={styles.sheetTitle}>누구랑{'\n'}같이 걸을래?</Text>
          <View style={styles.markerBar} />
          {Object.entries(SKINS).map(([key, s], i) => (
            <PickRow
              key={key}
              no={String(i + 1).padStart(2, '0')}
              label={s.label}
              sub={s.sub}
              onPress={() => { setCharacterSkin(key); setScreen('HOME'); }}
            />
          ))}
          <TouchableOpacity style={styles.backLink} onPress={() => setScreen('HOME')} activeOpacity={0.6}>
            <Ionicons name="arrow-back" size={16} color={C.redPen} />
            <Text style={styles.backLinkText}>뒤로가기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'SETUP') {
    const HEIGHTS = [155, 160, 165, 170, 175, 180, 185, 190];
    return (
      <View style={styles.page}>
        <Ruled />
        <View style={styles.sheetInner}>
          <Text style={styles.kicker}>보폭 맞추기</Text>
          <Text style={styles.sheetTitle}>키가{'\n'}몇이야?</Text>
          <View style={styles.markerBar} />
          <Text style={styles.homeNote}>보폭을 알아야 실내에서 네 위치를 제대로 셀 수 있어.{'\n'}대충 골라도 걸으면서 알아서 보정해줄게.</Text>

          <View style={styles.chipWrap}>
            {HEIGHTS.map(h => (
              <TouchableOpacity
                key={h}
                style={[styles.chip, heightCm === h && styles.chipOn]}
                onPress={() => { setHeightCm(h); setStepLength(stepFromHeight(h)); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, heightCm === h && styles.chipTextOn]}>{h}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.stepReadout}>
            <Text style={styles.stepReadoutLabel}>현재 보폭</Text>
            <Text style={styles.stepReadoutValue}>{stepLength.toFixed(2)}m</Text>
          </View>

          <TouchableOpacity style={styles.pressBtn} onPress={() => setScreen('START_LOC')} activeOpacity={0.85}>
            <Text style={styles.pressBtnText}>{heightCm ? '이걸로 간다' : '건너뛰기'}</Text>
            <Ionicons name="arrow-forward" size={20} color={C.paper} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.backLink, { marginTop: 0 }]} onPress={() => setScreen('HOME')} activeOpacity={0.6}>
            <Ionicons name="arrow-back" size={16} color={C.redPen} />
            <Text style={styles.backLinkText}>홈으로</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'START_LOC') {
    return (
      <View style={styles.page}>
        <Ruled />
        <View style={styles.sheetInner}>
          <Text style={styles.kicker}>1단계 / 2단계</Text>
          <Text style={styles.sheetTitle}>지금{'\n'}어디냐?</Text>
          <View style={styles.markerBar} />
          
          {/* ⭐ 스크롤바 장착! flex: 1을 줘서 남는 공간을 쫙 빨아들임 */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {SELECTABLE_PLACES.map((p, i) => (
              <PickRow
                key={p.id}
                no={String(i + 1).padStart(2, '0')}
                label={p.shortName || p.name}
                sub={p.sub}
                onPress={() => { setStartId(p.id); setScreen('END_LOC'); }}
              />
            ))}
          </ScrollView>

          {/* 취소 버튼은 스크롤 밖에 둬서 바닥에 고정! */}
          <TouchableOpacity style={[styles.backLink, { marginTop: 16 }]} onPress={() => setScreen('HOME')} activeOpacity={0.6}>
            <Ionicons name="close" size={16} color={C.redPen} />
            <Text style={styles.backLinkText}>취소</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'END_LOC') {
    return (
      <View style={styles.page}>
        <Ruled />
        <View style={styles.sheetInner}>
          <Text style={styles.kicker}>2단계 / 2단계</Text>
          <Text style={styles.sheetTitle}>어디까지{'\n'}데려다 줄까?</Text>
          <View style={styles.markerBar} />
          <View style={styles.fromTag}>
            <Text style={styles.fromTagLabel}>출발</Text>
            <Text style={styles.fromTagValue}>{LANDMARK_DB[startId || '']?.shortName}</Text>
          </View>
          
          {/* ⭐ 여기도 스크롤바 장착 */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {SELECTABLE_PLACES.map((p, i) => (
              <PickRow
                key={p.id}
                no={String(i + 1).padStart(2, '0')}
                label={p.shortName || p.name}
                sub={p.id === startId ? '여긴 지금 네가 서 있는 데다' : p.sub}
                disabled={p.id === startId}
                onPress={() => beginNavi(startId!, p.id)}
              />
            ))}
          </ScrollView>

          <TouchableOpacity style={[styles.backLink, { marginTop: 16 }]} onPress={() => setScreen('START_LOC')} activeOpacity={0.6}>
            <Ionicons name="arrow-back" size={16} color={C.redPen} />
            <Text style={styles.backLinkText}>이전으로</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============================================================
  // 내비게이션 뷰
  // ============================================================
  const skin = SKINS[characterSkin] || SKINS['기본 스킨'];
  const charImage = isWalking ? skin.walk : skin.idle;
  const total = route ? route.length : 0;
  const done = Math.min(targetIndex, total);
  const arrived = !!route && targetIndex >= route.length;

  return (
    <View style={styles.page}>
      <Ruled />

      <View style={styles.naviTop}>
        <TouchableOpacity style={styles.exitBtn} onPress={goHome} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={16} color={C.ink} />
          <Text style={styles.exitText}>그만</Text>
        </TouchableOpacity>
        <View style={styles.topRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => { setVoiceOn(v => !v); Speech.stop(); }} activeOpacity={0.7}>
            <Ionicons name={voiceOn ? 'volume-high' : 'volume-mute'} size={16} color={C.ink} />
          </TouchableOpacity>
          <View style={[styles.modeTag, currentMode === 'PDR' && styles.modeTagIndoor]}>
            <View style={[styles.modeDot, currentMode === 'PDR' && styles.modeDotIndoor]} />
            <Text style={styles.modeText}>
              {currentMode === 'GPS'
                ? `야외 · GPS ${gpsAccuracy ? `±${Math.round(gpsAccuracy)}m` : '수신중'}`
                : '실내 · 발소리 추적'}
            </Text>
          </View>
        </View>
      </View>

      {gpsStale && (
        <View style={styles.staleBar}>
          <Text style={styles.staleText}>GPS 신호가 안 잡히고있어. 하늘 보이는 데로 나오거나 직접 체크인해줘.</Text>
        </View>
      )}

      <View style={styles.routeHead}>
        <Text style={styles.routeFrom}>{LANDMARK_DB[startId || '']?.shortName}</Text>
        <Text style={styles.routeArrow}>──▶</Text>
        <Text style={styles.routeTo}>{LANDMARK_DB[endId || '']?.shortName}</Text>
      </View>

      <View style={styles.progressRow}>
        {route && route.map((_, i) => (
          <View key={i} style={styles.progressUnit}>
            <View style={[styles.node, i < done && styles.nodeDone, i === done && styles.nodeNow]} />
            {i < total - 1 && <View style={[styles.link, i < done - 1 && styles.linkDone]} />}
          </View>
        ))}
        <Text style={styles.progressCount}>{done}/{total}</Text>
      </View>

      {route && !arrived && (
        <View style={styles.targetCard}>
          <View style={styles.targetTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.targetLabel}>다음 목표</Text>
              <Text style={styles.targetName}>{route[targetIndex].name}</Text>
            </View>
            <View style={styles.distBlock}>
              <Text style={styles.distValue}>{fmtDistance(legDistance)}</Text>
              <Text style={styles.distSub}>남음</Text>
            </View>
          </View>
          <Text style={styles.totalLine}>전체 {fmtDistance(remaining)} · {fmtEta(remaining)}</Text>
          <TouchableOpacity style={styles.checkBtn} onPress={manualCheckIn} activeOpacity={0.85}>
            <Ionicons name="eye" size={16} color={C.ink} />
            <Text style={styles.checkBtnText}>눈앞에 보인다</Text>
          </TouchableOpacity>
        </View>
      )}

      {arrived && (
        <View style={styles.doneCard}>
          <Text style={styles.doneLabel}>도착</Text>
          <Text style={styles.doneName}>{LANDMARK_DB[endId || '']?.shortName}</Text>
          <Text style={styles.doneSub}>{steps}걸음 걸었다</Text>
        </View>
      )}

      <View style={styles.stage}>
        {showSpeech && (
          <View style={styles.bubble}>
            <Text style={styles.bubbleWho}>{skin.label}</Text>
            <Text style={styles.bubbleText}>{speechText}</Text>
            <View style={styles.bubbleTail} />
          </View>
        )}

        <Image source={charImage} style={styles.character} resizeMode="contain" />

        <View style={styles.compass}>
          {compassAvailable ? (
            <View style={[styles.compassNeedle, { transform: [{ rotate: `${arrowRotation}deg` }] }]}>
              <Ionicons name="navigate" size={34} color={C.redPen} />
            </View>
          ) : (
            <Ionicons name="help" size={28} color={C.inkSoft} />
          )}
        </View>
      </View>

      <View style={styles.meterBar}>
        <View style={styles.meterCell}>
          <Text style={styles.meterLabel}>걸음</Text>
          <Text style={styles.meterValue}>{steps}</Text>
        </View>
        <View style={styles.meterDivider} />
        <View style={styles.meterCell}>
          <Text style={styles.meterLabel}>보폭</Text>
          <Text style={styles.meterValue}>{stepLength.toFixed(2)}</Text>
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.paper, paddingTop: 58 },
  center: { alignItems: 'center', justifyContent: 'center' },
  bootText: { marginTop: 14, fontSize: 13, fontWeight: '700', color: C.inkSoft, letterSpacing: 2 },

  ruledWrap: { ...StyleSheet.absoluteFill, paddingTop: 96 },
  ruleLine: { height: 30, borderBottomWidth: 1, borderBottomColor: 'rgba(47,93,140,0.10)' },
  marginLine: { position: 'absolute', top: 0, bottom: 0, left: 34, width: 1, backgroundColor: 'rgba(196,69,59,0.22)' },

  homeInner: { flex: 1, paddingHorizontal: 30, paddingTop: 24 },
  kicker: { fontSize: 12, letterSpacing: 2, color: C.inkSoft, fontWeight: '700', marginBottom: 12 },
  wordmark: { fontSize: 42, lineHeight: 46, color: C.ink, fontWeight: '800', letterSpacing: -2 },
  wordmarkBig: { fontSize: 66, lineHeight: 70, color: C.ink, fontWeight: '900', letterSpacing: -5, marginTop: -6 },
  markerBar: { height: 12, width: 96, backgroundColor: C.marker, marginTop: -10, marginBottom: 20 },
  homeNote: { fontSize: 15, lineHeight: 24, color: C.inkSoft, fontWeight: '600' },

  warnBox: { marginTop: 16, borderLeftWidth: 4, borderLeftColor: C.redPen, backgroundColor: C.paperDeep, padding: 12 },
  warnText: { fontSize: 13, lineHeight: 19, color: C.ink, fontWeight: '700' },

  resumeCard: { marginTop: 18, borderWidth: 2, borderColor: C.ink, backgroundColor: C.marker, padding: 14 },
  resumeLabel: { fontSize: 11, fontWeight: '800', color: C.ink, letterSpacing: 2 },
  resumeRoute: { fontSize: 18, fontWeight: '900', color: C.ink, letterSpacing: -0.8, marginTop: 4 },
  resumeGo: { fontSize: 13, fontWeight: '800', color: C.redPen, marginTop: 6 },

  stampRow: { flexDirection: 'row', alignItems: 'center', marginTop: 'auto', marginBottom: 16 },
  stampLabel: { fontSize: 12, color: C.inkSoft, fontWeight: '700', marginRight: 10 },
  stamp: { borderWidth: 2, borderColor: C.stamp, paddingHorizontal: 12, paddingVertical: 5, transform: [{ rotate: '-3deg' }] },
  stampText: { fontSize: 13, color: C.stamp, fontWeight: '800', letterSpacing: 1 },
  voiceToggle: { marginLeft: 'auto', borderWidth: 2, borderColor: C.ink, padding: 8 },

  pressBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.ink, paddingVertical: 20, paddingHorizontal: 24, marginBottom: 12,
    borderWidth: 2, borderColor: C.ink,
    shadowColor: C.redPen, shadowOffset: { width: 5, height: 5 }, shadowOpacity: 1, shadowRadius: 0,
  },
  pressBtnText: { fontSize: 18, fontWeight: '800', color: C.paper, letterSpacing: -0.5 },
  homeSubRow: { flexDirection: 'row', marginBottom: 40 },
  ghostBtn: { paddingVertical: 15, alignItems: 'center', borderWidth: 2, borderColor: C.ink },
  ghostBtnText: { fontSize: 15, fontWeight: '800', color: C.ink },

  sheetInner: { flex: 1, paddingHorizontal: 30, paddingTop: 24 },
  sheetTitle: { fontSize: 36, lineHeight: 42, color: C.ink, fontWeight: '900', letterSpacing: -2 },

  pickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderTopWidth: 1, borderTopColor: 'rgba(31,27,22,0.18)' },
  pickNo: { fontFamily: MONO, fontSize: 13, color: C.redPen, fontWeight: '700', width: 36 },
  pickTextWrap: { flex: 1 },
  pickLabel: { fontSize: 20, fontWeight: '800', color: C.ink, letterSpacing: -0.8 },
  pickSub: { fontSize: 13, color: C.inkSoft, fontWeight: '600', marginTop: 3 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20 },
  chip: { borderWidth: 2, borderColor: C.ink, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, marginBottom: 8 },
  chipOn: { backgroundColor: C.ink },
  chipText: { fontFamily: MONO, fontSize: 15, fontWeight: '800', color: C.ink },
  chipTextOn: { color: C.paper },
  stepReadout: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8, marginBottom: 'auto' },
  stepReadoutLabel: { fontSize: 12, fontWeight: '800', color: C.inkSoft, letterSpacing: 1.5, marginRight: 10 },
  stepReadoutValue: { fontFamily: MONO, fontSize: 22, fontWeight: '800', color: C.ink },

  fromTag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: C.paperDeep, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  fromTagLabel: { fontSize: 11, fontWeight: '800', color: C.inkSoft, letterSpacing: 1, marginRight: 8 },
  fromTagValue: { fontSize: 14, fontWeight: '800', color: C.ink },

  backLink: { flexDirection: 'row', alignItems: 'center', marginTop: 'auto', marginBottom: 40, paddingVertical: 8 },
  backLinkText: { fontSize: 15, fontWeight: '800', color: C.redPen, marginLeft: 6 },

  naviTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  topRight: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { borderWidth: 2, borderColor: C.ink, padding: 6, marginRight: 8 },
  exitBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: C.ink, paddingHorizontal: 10, paddingVertical: 6 },
  exitText: { fontSize: 13, fontWeight: '800', color: C.ink, marginLeft: 4 },
  modeTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.marker, paddingHorizontal: 10, paddingVertical: 7 },
  modeTagIndoor: { backgroundColor: C.paperDeep, borderWidth: 1, borderColor: C.stamp },
  modeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ink, marginRight: 7 },
  modeDotIndoor: { backgroundColor: C.stamp },
  modeText: { fontSize: 11, fontWeight: '800', color: C.ink },

  staleBar: { marginHorizontal: 22, marginTop: 10, backgroundColor: C.redPen, paddingHorizontal: 12, paddingVertical: 8 },
  staleText: { fontSize: 12, fontWeight: '800', color: C.paper, lineHeight: 17 },

  routeHead: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 22, marginTop: 18 },
  routeFrom: { fontSize: 18, fontWeight: '800', color: C.inkSoft, letterSpacing: -1 },
  routeArrow: { fontSize: 13, color: C.redPen, fontWeight: '800', marginHorizontal: 8 },
  routeTo: { fontSize: 25, fontWeight: '900', color: C.ink, letterSpacing: -1.2 },

  progressRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, marginTop: 12 },
  progressUnit: { flexDirection: 'row', alignItems: 'center' },
  node: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: C.inkSoft },
  nodeDone: { backgroundColor: C.ink, borderColor: C.ink },
  nodeNow: { borderColor: C.redPen, backgroundColor: C.redPen, width: 13, height: 13, borderRadius: 7 },
  link: { width: 18, height: 2, backgroundColor: 'rgba(31,27,22,0.22)' },
  linkDone: { backgroundColor: C.ink },
  progressCount: { fontFamily: MONO, fontSize: 12, color: C.inkSoft, fontWeight: '700', marginLeft: 12 },

  targetCard: { marginHorizontal: 22, marginTop: 16, backgroundColor: C.paperDeep, borderLeftWidth: 5, borderLeftColor: C.redPen, padding: 16 },
  targetTop: { flexDirection: 'row', alignItems: 'flex-start' },
  targetLabel: { fontSize: 11, fontWeight: '800', color: C.inkSoft, letterSpacing: 2, marginBottom: 4 },
  targetName: { fontSize: 21, fontWeight: '900', color: C.ink, letterSpacing: -1 },
  distBlock: { alignItems: 'flex-end', paddingLeft: 12 },
  distValue: { fontFamily: MONO, fontSize: 26, fontWeight: '800', color: C.ink },
  distSub: { fontSize: 10, fontWeight: '800', color: C.inkSoft, letterSpacing: 1 },
  totalLine: { fontSize: 12, fontWeight: '700', color: C.inkSoft, marginTop: 8, marginBottom: 12 },
  checkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.marker, paddingVertical: 14, borderWidth: 2, borderColor: C.ink },
  checkBtnText: { fontSize: 16, fontWeight: '800', color: C.ink, marginLeft: 8 },

  doneCard: { marginHorizontal: 22, marginTop: 16, borderWidth: 3, borderColor: C.ink, padding: 16, backgroundColor: C.marker },
  doneLabel: { fontSize: 11, fontWeight: '800', color: C.ink, letterSpacing: 4, marginBottom: 2 },
  doneName: { fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: -1 },
  doneSub: { fontFamily: MONO, fontSize: 12, fontWeight: '700', color: C.ink, marginTop: 4 },

  stage: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 10 },
  character: { width: 160, height: 205 },
  bubble: {
    position: 'absolute', top: 6, maxWidth: 250,
    backgroundColor: C.paper, borderWidth: 2, borderColor: C.ink,
    paddingHorizontal: 16, paddingVertical: 12, zIndex: 10,
    shadowColor: C.ink, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0,
  },
  bubbleWho: { fontSize: 10, fontWeight: '800', color: C.redPen, letterSpacing: 2, marginBottom: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: C.ink },
  bubbleTail: {
    position: 'absolute', bottom: -11, left: 28, width: 0, height: 0,
    borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 11,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: C.ink,
  },
  compass: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: C.ink,
    backgroundColor: C.paperDeep, alignItems: 'center', justifyContent: 'center', marginTop: -18, zIndex: 20,
  },
  compassNeedle: { alignItems: 'center', justifyContent: 'center' },

  meterBar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 2, borderTopColor: C.ink, backgroundColor: C.paperDeep, paddingVertical: 12, paddingHorizontal: 16, paddingBottom: 26 },
  meterCell: { flex: 1 },
  meterDivider: { width: 1, height: 26, backgroundColor: 'rgba(31,27,22,0.2)', marginHorizontal: 10 },
  meterLabel: { fontSize: 10, fontWeight: '800', color: C.inkSoft, letterSpacing: 1.5, marginBottom: 3 },
  meterValue: { fontFamily: MONO, fontSize: 16, fontWeight: '700', color: C.ink },
  meterCoord: { fontFamily: MONO, fontSize: 11, fontWeight: '700', color: C.ink },
});