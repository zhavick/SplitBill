/** Mengubah "15m", "7d", "30s", "2h" atau angka detik menjadi detik. */
export function parseDurationSeconds(input: string): number {
  const m = /^(\d+)\s*([smhd]?)$/.exec(input.trim());
  if (!m) throw new Error(`Durasi tidak valid: "${input}"`);
  const n = Number(m[1]);
  const unit = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2] as '' | 's' | 'm' | 'h' | 'd'];
  return n * unit;
}
