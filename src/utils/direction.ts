// 선배가 바라볼 4방향. 목표 방향(내 기준 상대각)을 크게 끊어서 센서 흔들림을 먹어버린다.
export type Dir = 'front' | 'right' | 'back' | 'left';

export const DIR_ANGLE: Record<Dir, number> = { front: 0, right: 90, back: 180, left: 270 };
export const DIR_LABEL: Record<Dir, string> = { front: '직진', right: '오른쪽', back: '뒤로', left: '왼쪽' };

const HYSTERESIS = 15; // 경계(45°)를 이만큼 넘어야 방향을 바꾼다 → 경계에서 깜빡임 방지

/** -180~180으로 정규화한 두 각의 차 */
const angleDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

/** 상대각(목표방위 - 내방위)으로 다음 방향 결정. prev를 유지하려는 성질이 있음. */
export const nextDir = (prev: Dir, relAngle: number): Dir => {
  if (Math.abs(angleDiff(relAngle, DIR_ANGLE[prev])) <= 45 + HYSTERESIS) return prev;
  let best: Dir = prev;
  let bestDiff = Infinity;
  for (const d of Object.keys(DIR_ANGLE) as Dir[]) {
    const diff = Math.abs(angleDiff(relAngle, DIR_ANGLE[d]));
    if (diff < bestDiff) { best = d; bestDiff = diff; }
  }
  return best;
};
