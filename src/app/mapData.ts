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
}

export interface RoutePoint extends Landmark {
  /** 이 지점에 도착했을 때 선배가 날리는 대사 */
  msg: string;
}

// ============================================================
// 🧱 1. [랜드마크 DB] 캠퍼스 주요 지점. 여기 한 곳에만 좌표를 둔다.
// ============================================================

export const LANDMARK_DB: Record<string, Landmark> = {
  '한성대입구역': {
    id: '한성대입구역', type: 'GPS', lat: 37.58230, lng: 127.00650,
    name: '한성대입구역 6번 출구', shortName: '한성대입구역',
    selectable: true, sub: '6번 출구 앞에서 대기',
  },
  '정문': {
    id: '정문', type: 'GPS', lat: 37.58284, lng: 127.01058,
    name: '한성대 정문',
  },
  '미래관_삼거리': {
    id: '미래관_삼거리', type: 'GPS', lat: 37.58300, lng: 127.01080,
    name: '미래관 앞 삼거리',
  },
  '미래관_식당': {
    id: '미래관_식당', type: 'PDR', lat: 37.58305, lng: 127.01070,
    name: '미래관 식당', shortName: '미래관 식당',
    selectable: true, sub: '학식 먹으러 갈 때',
  },
  '상상관_입구': {
    id: '상상관_입구', type: 'GPS', lat: 37.58310, lng: 127.01100,
    name: '상상관 1층 출입구', shortName: '상상관 1층',
    selectable: true, sub: '오르막 한 번 빡세게',
  },
  '상상관_엘베': {
    id: '상상관_엘베', type: 'PDR', lat: 37.58320, lng: 127.01110,
    name: '상상관 1층 엘리베이터',
  },
  '상상관_3층과방': {
    id: '상상관_3층과방', type: 'PDR', lat: 37.58325, lng: 127.01115,
    name: '상상관 3층 과방', shortName: '상상관 3층',
    selectable: true, sub: '과방에서 선배들 대기 중',
  },
};

// ============================================================
// 🗺️ 2. [간선] 붙어있는 구간만 등록한다. 경로 조합은 알고리즘이 한다.
//    (N개 지점 × N개 지점을 손으로 적을 필요 없음)
// ============================================================

type Edge = [string, string];

export const EDGES: Edge[] = [
  ['한성대입구역', '정문'],
  ['정문', '미래관_삼거리'],
  ['미래관_삼거리', '미래관_식당'],
  ['미래관_삼거리', '상상관_입구'],
  ['상상관_입구', '상상관_엘베'],
  ['상상관_엘베', '상상관_3층과방'],
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

  const dist: Record<string, number> = { [startId]: 0 };
  const prev: Record<string, string> = {};
  const visited = new Set<string>();
  const queue = [startId];

  while (queue.length) {
    // 노드 수가 적어서 선형 탐색으로 충분하다
    queue.sort((a, b) => (dist[a] ?? Infinity) - (dist[b] ?? Infinity));
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    if (cur === endId) break;

    for (const { to, w } of ADJ[cur] || []) {
      const nd = dist[cur] + w;
      if (nd < (dist[to] ?? Infinity)) {
        dist[to] = nd;
        prev[to] = cur;
        if (!visited.has(to)) queue.push(to);
      }
    }
  }

  if (dist[endId] === undefined) return null;
  const path: string[] = [];
  for (let n: string | undefined = endId; n; n = prev[n]) path.unshift(n);
  return path;
};

// ============================================================
// 💬 4. [대사 DB]
// ============================================================

/** 특정 구간(from>to)에만 붙는 전용 대사. 없으면 자동 생성 대사가 나간다. */
export const LEG_MESSAGES: Record<string, string> = {
  '한성대입구역>정문': "지하철에서 나왔으면 바로 직진이다. 정문까지 쭉 와라.",
  '정문>미래관_삼거리': "정문 통과! 오르막길로 빡세게 올라가자!",
  '미래관_삼거리>상상관_입구': "우측 상상관 쪽으로 꺾어!",
  '미래관_삼거리>미래관_식당': "왼쪽 미래관으로 들어가면 바로 식당이다.",
  '상상관_입구>상상관_엘베': "상상관 도착! 이제 실내다. 엘베 쪽으로.",
  '상상관_엘베>상상관_3층과방': "엘베 타고 3층으로 가라 브라더",
  '상상관_입구>미래관_삼거리': "상상관 밖으로 나왔다! 삼거리 쪽으로.",
  '미래관_삼거리>정문': "삼거리 통과, 내리막 조심해라!",
  '정문>한성대입구역': "정문 도착! 지하철 타러 가자.",
};

/** 구간 대사 조회. 전용 대사가 없으면 랜드마크 이름으로 만들어 쓴다. */
export const getLegMessage = (fromId: string, toId: string): string =>
  LEG_MESSAGES[`${fromId}>${toId}`] || `${LANDMARK_DB[toId]?.name ?? '다음 지점'} 쪽으로 가면 된다.`;

/** 5초 동안 안 걸으면 발사되는 잔소리 */
export const IDLE_MESSAGES: Record<string, string> = {
  '헬창': "브라더! 하체 안 할 거야? 세트 쉬는 시간 끝났다 뛰어와!",
  '여자 선배': "후배님~ 얼른 안 오고 거기서 뭐해?",
  '남자 선배': "야, 엎드려뻗치기 전에 빨리 안 뛰어오냐?",
  '상상부기': "부기부기! 거북이보다 느리면 어떡하냐북!",
  '기본 스킨': "브라더, 안 따라오고 뭐해?",
};

/** 목표에서 점점 멀어질 때 날리는 대사 */
export const OFF_ROUTE_MESSAGES: Record<string, string> = {
  '헬창': "브라더 반대로 가고 있다! 방향 틀어, 그쪽 아니야!",
  '여자 선배': "후배님? 그쪽 아닌데... 뒤돌아봐요!",
  '남자 선배': "야! 어디 가냐? 반대 방향이다, 돌아와!",
  '상상부기': "부기부기! 그쪽 아니라북! 반대쪽이라북!",
  '기본 스킨': "어? 반대 방향인데? 다시 돌아와라.",
};

/** 실내 진입 안내 */
export const INDOOR_ENTER_MESSAGE = "실내 진입! 지금부터 발소리로 길 찾는다.";
export const OUTDOOR_ENTER_MESSAGE = "밖으로 나왔다! GPS 다시 잡는다.";

/** 최종 도착지별 엔딩 대사 (랜드마크 id 기준) */
export const FINAL_MESSAGES: Record<string, string> = {
  '상상관_입구': "상상관 도착! 여긴 내가 젤 좋아하는 공간이야. 커피 한잔 어때?",
  '상상관_3층과방': "3층 도착 완료! 여기서 보는 캠퍼스 뷰가 꽤 괜찮지.",
  '미래관_식당': "크~ 드디어 식당! 오늘 학식 메뉴는 제육이려나?",
  '한성대입구역': "하교 완료! 오늘도 고생 많았다 브라더. 푹 쉬어라!",
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
        ? (FINAL_MESSAGES[id] || "목적지 도착! 고생했다 브라더!")
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