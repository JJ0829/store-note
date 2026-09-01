/**
 * 배수 계산.
 *
 * 프렙 화면과 레시피 화면이 같은 계산을 쓴다. 두 군데서 숫자가 다르게
 * 나오면 주방에서는 바로 신뢰를 잃으므로 한 곳에 둔다.
 */

export const SCALES = [0.5, 1, 1.5, 2, 3];

/** 배수를 곱한 값. 소수점이 지저분해지지 않게 다듬는다. */
export function scaled(amount: number, scale: number): string {
  const v = amount * scale;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
