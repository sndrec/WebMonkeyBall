export class DeterministicRng {
  constructor(seed = 0) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  nextU32() {
    let x = this.state >>> 0;
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    this.state = x >>> 0;
    return this.state;
  }

  nextFloat() {
    return (this.nextU32() >>> 8) * (1 / 0x01000000);
  }

  nextS16() {
    return (this.nextU32() >>> 17) & 0x7fff;
  }
}
