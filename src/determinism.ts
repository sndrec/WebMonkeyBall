export type QuantizedStick = { x: number; y: number };

export function quantizeStickAxis(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value));
  const quantized = Math.round(clamped * 127);
  if (quantized < -127) {
    return -127;
  }
  if (quantized > 127) {
    return 127;
  }
  return quantized;
}

export function dequantizeStickAxis(value: number): number {
  return value / 127;
}

export function quantizeStick(stick: { x: number; y: number }): QuantizedStick {
  return {
    x: quantizeStickAxis(stick.x),
    y: quantizeStickAxis(stick.y),
  };
}

export function dequantizeStick(stick: QuantizedStick): { x: number; y: number } {
  return {
    x: dequantizeStickAxis(stick.x),
    y: dequantizeStickAxis(stick.y),
  };
}
