// ============================================================
// 📐 [타입 정의] any 추방. 데이터 늘어날 때 오타를 컴파일 타임에 잡는다.
// ============================================================

export type PointType = 'GPS' | 'PDR';

export interface Landmark {
  id: string;
  type: PointType;
  lat: number;
  lng: number;
  /** 화면에 보여줄 이름 ("상상관 1층 엘리베이터") */
  name: string;
  /** 출발/도착 선택지로 노출할지 */
  selectable?: boolean;
  /** 선택 화면에 뜨는 한 줄 설명 */
  sub?: string;
  /** 선택 화면에 뜨는 짧은 별칭 (없으면 name 사용) */
  shortName?: string;
  entrances?: string[]; // 👈 [추가] 건물이 여러 문을 가질 때, 진짜 문들의 id를 묶어두는 배열!
}

export interface RoutePoint extends Landmark {
  /** 이 지점에 도착했을 때 선배가 날리는 대사 */
  msg: string;
}

// ============================================================
// 🧱 1. [랜드마크 DB] 캠퍼스 주요 지점. 여기 한 곳에만 좌표를 둔다.
// ============================================================

export const LANDMARK_DB: Record<string, Landmark> = {
  '삼선공원': {
    id: '삼선공원', type: 'GPS', lat: 37.58293108598695, lng: 127.0087798194253,
    name: '삼선공원', shortName: '삼선공원',
    selectable: true, sub: '공원에서 조용히 쉬고 싶을 때',
  },
   '삼선공원_계단': {
    id: '삼선공원_계단', type: 'GPS', lat: 37.582976115786536, lng: 127.00904304963186,
    name: '삼선공원 계단',
  },
  '정문': {
    id: '정문', type: 'GPS', lat: 37.58245111099579, lng: 127.01110631535154,
    name: '한성대 정문', shortName: '정문',
    selectable: true, sub: '학교 등하교 할 때',
  },
  '미래관_엘리베이터': {
    id: '미래관_엘리베이터', type: 'GPS', lat: 37.58249392062783, lng: 127.01097329492245,
    name: '미래관 엘리베이터',
  },
  '학식당': {
    id: '학식당', type: 'PDR', lat: 37.582257428341414, lng: 127.01077230548532,
    name: '학식당', shortName: '학식당',
    selectable: true, sub: '학식 먹으러 갈 때',
  },
  '진리관': {
    id: '진리관', type: 'GPS', lat: 37.582989589412925, lng: 127.00956667081702,
    name: '진리관', shortName: '진리관',
    selectable: true, sub: '학문을 탐구하는 공간',
    entrances: ['진리관_창립의탑쪽문', '진리관_탐구관쪽문']
  },
  '진리관_창립의탑쪽문': {
    id: '진리관_창립의탑쪽문', type: 'GPS', lat: 37.58295580124155, lng: 127.00957798799216, name: '진리관 창립의탑쪽 출입구'
  },
  '진리관_탐구관쪽문': {
    id: '진리관_탐구관쪽문', type: 'GPS', lat: 37.583111223752546, lng: 127.00956385600125, name: '진리관 탐구관쪽 출입구'
  },
  '탐구관': {
    id: '탐구관', type: 'GPS', lat: 37.583424350610365, lng: 127.00916481072547,
    name: '탐구관', shortName: '탐구관',
    selectable: true, sub: '학문을 탐구하는 공간',
  },
  '상상관_엘베': {
    id: '상상관_엘베', type: 'PDR', lat: 37.58, lng: 127.10,
    name: '상상관 1층 엘리베이터',
  },
  '상상관뒤_큰계단': {
    id: '상상관뒤_큰계단', type: 'GPS', lat: 37.5, lng: 127.0,
    name: '상상관 뒤 큰 계단',
  },
  '그라찌에': {
    id: '그라찌에', type: 'PDR', lat: 37.582780019430956, lng: 127.0106082194383,
    name: '그라찌에', shortName: '그라찌에',
    selectable: true, sub: '맛있는 음식을 즐기러',
  },
  '인성관':{
    id: '인성관', type: 'GPS', lat: 37.582, lng: 127.010,
    name: '인성관', shortName: '인성관',
    selectable: true, sub: '동아리 방 갈 때',
  },
  '공학관A':{
    id: '공학관A', type: 'GPS', lat: 37.5822, lng: 127.0210,
    name: '공학관A', shortName: '공학관A',
    selectable: true, sub: '공학관 수업 갈 때',
    entrances: ['공학관A_안쪽문', '공학관A_바깥쪽문']
  },
  '공학관A_안쪽문': {
    id: '공학관A_안쪽문', type: 'GPS', lat: 37.581926374695804, lng: 127.01007599519792, name: '공학관A 안쪽 출입구'
  },
  '공학관A_바깥쪽문': {
    id: '공학관A_바깥쪽문', type: 'GPS', lat: 37.58189938244358, lng: 127.00962596834273, name: '공학관A 바깥쪽 출입구'
  },
  '공학관B':{
    id: '공학관B', type: 'GPS', lat: 37.581662870698956, lng: 127.00963725919462,
    name: '공학관B', shortName: '공학관B',
    selectable: true, sub: '공학관 수업 갈 때',
  },
  '상상관':{
    id: '상상관', type: 'GPS', lat: 37.58, lng: 127.10,
    name: '상상관', shortName: '상상관',
    selectable: true, sub: '상상관 수업 갈 때',
    entrances: ['상상관_정문쪽문', '상상관_우촌관쪽문']
  },
  '상상관_정문쪽문': {
    id: '상상관_정문쪽문', type: 'GPS', lat: 37.58249623356263, lng: 127.01030250058317, 
    name: '상상관 정문쪽 출입구'
  },
  '상상관_우촌관쪽문': {
    id: '상상관_우촌관쪽문', type: 'GPS', lat: 37.582888170891316, lng: 127.01024311677926, 
    name: '상상관 우촌관쪽 출입구'
  },
  '지선관':{
    id: '지선관', type: 'GPS', lat: 37.58214939559588, lng: 127.0097788391175,
    name: '지선관', shortName: '지선관',
    selectable: true, sub: '실기 수업 가거나 공대 교학팀 찾아갈 때',
  },
  '창의열람실':{
    id: '창의열람실', type: 'GPS', lat: 37.582, lng: 127.010,
    name: '창의열람실', shortName: '창열',
    selectable: true, sub: '공부할 때',
  },
  '상상빌리지':{
    id: '상상빌리지', type: 'GPS', lat: 37.58157050415994, lng: 127.00981555759026,
    name: '상상빌리지', shortName: '상상빌리지',
    selectable: true, sub: '기숙사 갈 때',
  },
  '상상파크':{
    id: '상상파크', type: 'GPS', lat: 37.58226426992387, lng: 127.00980715762798,
    name: '상상파크', shortName: '상상파크',
    selectable: true, sub: '공부하거나 쉬러 갈 때',
  },
  '셔틀타는곳':{
    id: '셔틀타는곳', type: 'GPS', lat: 37.58256145791129, lng: 127.01136672484228,
    name: '셔틀 타는 곳', shortName: '셔틀타는곳',
    selectable: true, sub: '셔틀 타러 갈 때',
  },
  '우촌관':{
    id: '우촌관', type: 'GPS', lat: 37.582, lng: 127.010,
    name: '우촌관', shortName: '우촌관',
    selectable: true, sub: '학생회실 갈 때',
  },
  '풋살장':{
    id: '풋살장', type: 'GPS', lat: 37.58235215645742, lng: 127.00931751828796,
    name: '풋살장',
  },
  '연구관':{
    id: '연구관', type: 'GPS', lat: 37.58240618272725, lng: 127.00973075668875,
    name: '연구관', shortName: '연구관',
    selectable: true, sub: '연구관 갈 때',
  },
 
};

// ============================================================
// 🗺️ 2. [간선] 붙어있는 구간만 등록한다. 경로 조합은 알고리즘이 한다.
//    (N개 지점 × N개 지점을 손으로 적을 필요 없음)
// ============================================================

type Edge = [string, string];

export const EDGES: Edge[] = [
  ['삼선공원', '삼선공원_계단'],
  ['정문', '셔틀타는곳'],
  ['정문', '미래관_엘리베이터'],
  ['미래관_엘리베이터', '그라찌에'],
  ['미래관_엘리베이터', '상상관_정문쪽문'],
  ['상상관_정문쪽문', '연구관'],
  ['상상관_정문쪽문', '상상관_우촌관쪽문'],
  ['상상관_우촌관쪽문', '진리관_창립의탑쪽문'],
  ['진리관_창립의탑쪽문', '진리관_탐구관쪽문'],
  ['진리관_탐구관쪽문', '탐구관'],
  ['탐구관', '삼선공원_계단'],
  ['풋살장', '삼선공원_계단'],
  ['풋살장', '연구관'],
  ['풋살장', '공학관A_바깥쪽문'],
  ['공학관A_바깥쪽문', '공학관B'],
  ['공학관B', '상상빌리지'],
];

// ============================================================
// 📏 거리 계산 (하버사인)
// ============================================================

export const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ============================================================
// 🧭 3. [경로 탐색] 다익스트라. 간선 가중치는 실제 거리(m).
// ============================================================

const buildAdjacency = () => {
  const adj: Record<string, { to: string; w: number }[]> = {};
  const add = (a: string, b: string) => {
    const A = LANDMARK_DB[a], B = LANDMARK_DB[b];
    if (!A || !B) {
      if (__DEV__) console.warn(`[mapData] 없는 랜드마크로 간선을 만들려 함: ${a} - ${b}`);
      return;
    }
    const w = getDistanceInMeters(A.lat, A.lng, B.lat, B.lng);
    (adj[a] = adj[a] || []).push({ to: b, w });
  };
  EDGES.forEach(([a, b]) => { add(a, b); add(b, a); }); // 양방향 자동 생성
  return adj;
};

const ADJ = buildAdjacency();

/** 최단 경로의 랜드마크 id 배열을 돌려준다. 못 찾으면 null. */
export const findPath = (startId: string, endId: string): string[] | null => {
  if (!LANDMARK_DB[startId] || !LANDMARK_DB[endId]) return null;
  if (startId === endId) return [startId];

  // 💥 유저가 고른 목적지에 여러 출입구가 있으면 그 배열을, 없으면 그냥 자기 자신을 타겟으로 잡음
  const targetLandmark = LANDMARK_DB[endId];
  const endTargets = targetLandmark.entrances || [endId];

  const dist: Record<string, number> = { [startId]: 0 };
  const prev: Record<string, string> = {};
  const visited = new Set<string>();
  const queue = [startId];
  
  let reachedEnd: string | null = null; // 진짜로 어느 문에 도착했는지 기억할 변수

  while (queue.length) {
    queue.sort((a, b) => (dist[a] ?? Infinity) - (dist[b] ?? Infinity));
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    
    // 💥 탐색하다가 타겟 출입구 중 하나라도 밟았다? 그럼 여기가 제일 가까운 문이다! 탐색 종료!
    if (endTargets.includes(cur)) {
      reachedEnd = cur;
      break;
    }

    for (const { to, w } of ADJ[cur] || []) {
      const nd = dist[cur] + w;
      if (nd < (dist[to] ?? Infinity)) {
        dist[to] = nd;
        prev[to] = cur;
        if (!visited.has(to)) queue.push(to);
      }
    }
  }

  // 탐색 실패했거나 길을 못 찾았으면 null
  if (!reachedEnd) return null;
  
  // 역추적 (도착한 진짜 문부터 거꾸로 길을 엮음)
  const path: string[] = [];
  for (let n: string | undefined = reachedEnd; n; n = prev[n]) path.unshift(n);
  return path;
};

// ============================================================
// 💬 4. [대사 DB]
// ============================================================

/** 특정 구간(from>to)에만 붙는 전용 대사. 없으면 자동 생성 대사가 나간다. */
export const LEG_MESSAGES: Record<string, string> = {
  '삼선공원_계단>삼선공원': "계단이 열려있는 시간 확인하고 내려가면 돼. 내려가자!",
  '정문>미래관_엘리베이터': "정문 통과! 오르막길로 빡세게 올라가자!",
  '미래관_엘리베이터>진리관': "우측 진리관 쪽으로 꺾어!",
  '미래관_엘리베이터>학식당': "왼쪽 미래관으로 들어가면 바로 학식당이야.",
  '진리관>그라찌에': "진리관 도착! 이제 실내다. 그라찌에 쪽으로.",
  '진리관>미래관_삼거리': "진리관 밖으로 나왔다! 삼거리 쪽으로.",
  '미래관_삼거리>정문': "삼거리 통과, 내리막 조심해라!",
  '정문>삼선공원': "정문 도착! 공원으로 가자.",
};

/** 구간 대사 조회. 전용 대사가 없으면 랜드마크 이름으로 만들어 쓴다. */
export const getLegMessage = (fromId: string, toId: string): string =>
  LEG_MESSAGES[`${fromId}>${toId}`] || `${LANDMARK_DB[toId]?.name ?? '다음 지점'} 쪽으로 가면 돼!`;

/** 5초 동안 안 걸으면 발사되는 잔소리 */
export const IDLE_MESSAGES: Record<string, string> = {
  '헬창': "브라더! 하체 안 할 거야? 세트 쉬는 시간 끝났다 뛰어와!",
  '여자 선배': "후배님~ 얼른 안 오고 거기서 뭐해?",
  '남자 선배': "야, 엎드려뻗치기 전에 빨리 안 뛰어오냐?",
  '상상부기': "거북이보다 느리면 어떡하냐구!",
  '기본 스킨': "길 잃었어? 빨리 따라와",
};

/** 목표에서 점점 멀어질 때 날리는 대사 */
export const OFF_ROUTE_MESSAGES: Record<string, string> = {
  '헬창': "크하하 반대로 가다니 재밌구만!",
  '여자 선배': "후배님? 그쪽 아닌데... 뒤돌아봐요!",
  '남자 선배': "그쪽으로 가면 반대 방향이야 돌아와!",
  '기본 스킨': "그쪽 아니야! 반대쪽이라구!",
};

/** 실내 진입 안내 */
export const INDOOR_ENTER_MESSAGE = "실내 진입! 지금부터 발소리로 길을 찾을게.";
export const OUTDOOR_ENTER_MESSAGE = "밖으로 나왔어! GPS 다시 잡을게.";

/** 최종 도착지별 엔딩 대사 (랜드마크 id 기준) */
export const FINAL_MESSAGES: Record<string, string> = {
  '상상관': "상상관 도착! 중심에 있는 크고 웅장한 건물이야 13층까지 올라가면 풍경이 끝내주지",
  '진리관': "진리관 도착! 여기에는 인예대 학생회실이 있어",
  '그라찌에': "그라찌에 도착! 여기 에그타르트가 진짜 맛있어!",
  '미래관_식당': "크~ 드디어 식당! 오늘 학식 메뉴는 제육이려나?",
  '삼선공원': "삼선공원 도착! 혼자 힐링하기 좋은 곳이야.",
  '공학관A': "공학관A 도착! 어쩐지 여기만 오면 우울해져...",
  '공학관B': "공학관B 도착! 어라, 왜 눈물이...?",
  '인성관': "인성관 도착! 동아리 방으로 가볼까?",
  '지선관': "지선관 도착! 미대 실기실이 모여있는 건물인데 신기하게 공대 교학팀이 여기있어.",
  '창의열람실': "창의열람실 도착! 우리 학교에서 가장 좋은 건물이야! 상도 받았다나~?",
};

// ============================================================
// 🏗️ 5. [경로 조립] id 경로 → 대사까지 붙은 RoutePoint 배열
// ============================================================

export const buildRoute = (startId: string, endId: string): RoutePoint[] | null => {
  const path = findPath(startId, endId);
  if (!path || path.length < 2) return null;

  return path.map((id, i) => {
    const lm = LANDMARK_DB[id];
    // 첫 지점은 "다음으로 가라" 안내, 나머지는 "여기 도착했다" 안내
    const msg = i === 0
      ? getLegMessage(id, path[1])
      : i === path.length - 1
        ? (FINAL_MESSAGES[id] || "목적지 도착! 고생했어~")
        : getLegMessage(id, path[i + 1]);
    return { ...lm, msg };
  });
};

/** 출발/도착 선택 화면에 뿌릴 목록 */
export const SELECTABLE_PLACES = Object.values(LANDMARK_DB).filter(p => p.selectable);

/** 남은 총 거리(m) 계산 */
export const getRemainingDistance = (
  route: RoutePoint[],
  targetIndex: number,
  myLat: number,
  myLng: number,
): number => {
  if (targetIndex >= route.length) return 0;
  let total = getDistanceInMeters(myLat, myLng, route[targetIndex].lat, route[targetIndex].lng);
  for (let i = targetIndex; i < route.length - 1; i++) {
    total += getDistanceInMeters(route[i].lat, route[i].lng, route[i + 1].lat, route[i + 1].lng);
  }
  return total;
};