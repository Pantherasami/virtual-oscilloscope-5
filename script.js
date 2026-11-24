/*
Dao động ký ảo (Virtual Oscilloscope) v2.0.0-beta.1
Copyright (C) 2026 Pantherasami

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

'use strict';
// dsp.js – NSDF + nội suy parabol + trigger sườn lên (không đụng DOM)
const MIN_RMS = 0.008;            // Ngưỡng im lặng
const AC_WINDOW = 4096;           // Cửa sổ tự tương quan (mẫu)
const AC_MAXLAG = 2048;           // Độ trễ tối đa (~23.4 Hz ở 48 kHz)
const F_MIN = 40;                 // Tần số đo tối thiểu (Hz)
const F_MAX = 2500;               // Tần số đo tối đa (Hz)
const CLARITY_MIN = 0.52;         // Ngưỡng độ rõ tuần hoàn tối thiểu
const PEAK_RATIO = 0.88;          // Ưu tiên đỉnh cơ bản đầu tiên >= 88% đỉnh cao nhất (tránh nhảy bậc quãng tám)

// ===== 1. Trigger sườn lên tại ngưỡng cắt u = 0 đi lên =====
function findRisingZeroCrossing(x, span, rms) {
  // Dùng trễ (hysteresis) chống nhiễu quanh trục u = 0
  const hyst = Math.max(0.004, 0.15 * rms);
  let armed = false;
  let bestPos = -1;
  const maxStart = x.length - Math.ceil(span) - 2;
  if (maxStart < 2) return -1;

  for (let i = 1; i < maxStart; i++) {
    if (x[i] < -hyst) {
      armed = true;
    } else if (armed && x[i - 1] < 0 && x[i] >= 0) {
      // Nội suy tuyến tính dưới mẫu để sóng đứng yên tuyệt đối tại x = 0
      const denom = x[i] - x[i - 1];
      bestPos = denom !== 0 ? (i - 1 + (-x[i - 1]) / denom) : i;
      armed = false;
    }
  }
  return bestPos;
}

function computeRms(x, start, len) {
  const a = Math.max(0, Math.floor(start));
  const b = Math.min(x.length, a + Math.ceil(len));
  let sum = 0;
  for (let i = a; i < b; i++) {
    sum += x[i] * x[i];
  }
  return Math.sqrt(sum / Math.max(1, b - a));
}

// ===== 2. Thuật toán Autocorrelation chuẩn hóa (NSDF) + Nội suy parabol =====
function estimateFundamental(x, sr) {
  const N = Math.min(AC_WINDOW, x.length);
  const off = x.length - N;
  const maxLag = Math.min(AC_MAXLAG, Math.floor(sr / F_MIN), N >> 1);
  const minLag = Math.max(2, Math.floor(sr / F_MAX));

  if (computeRms(x, off, N) < MIN_RMS) return { quiet: true };

  // Khử thành phần một chiều (DC offset) để tránh lệch NSDF
  let mean = 0;
  for (let i = 0; i < N; i++) mean += x[off + i];
  mean /= N;

  const sig = new Float64Array(N);
  const sq = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) {
    const v = x[off + i] - mean;
    sig[i] = v;
    sq[i + 1] = sq[i] + v * v;
  }

  // Tính hàm tự tương quan chuẩn hóa McLeod (NSDF)
  const nsdf = new Float64Array(maxLag + 1);
  for (let tau = 0; tau <= maxLag; tau++) {
    let acf = 0;
    const limit = N - tau;
    for (let j = 0; j < limit; j++) {
      acf += sig[j] * sig[j + tau];
    }
    const norm = sq[limit] + (sq[N] - sq[tau]);
    nsdf[tau] = norm > 0 ? (2 * acf) / norm : 0;
  }

  // Tìm cực đại cục bộ trong từng vùng dương sau lần cắt 0 đầu tiên
  const peaks = [];
  let t = 1;
  while (t < maxLag && nsdf[t] > 0) t++; // Bỏ qua thùy chính tại tau = 0

  while (t < maxLag) {
    while (t < maxLag && nsdf[t] <= 0) t++;
    let bestTau = -1;
    while (t < maxLag && nsdf[t] > 0) {
      if (bestTau < 0 || nsdf[t] > nsdf[bestTau]) {
        bestTau = t;
      }
      t++;
    }
    if (bestTau >= minLag && bestTau > 0 && bestTau < maxLag) {
      peaks.push(bestTau);
    }
  }

  if (peaks.length === 0) return { weak: true, clarity: 0 };

  let maxPeakVal = 0;
  for (const p of peaks) {
    if (nsdf[p] > maxPeakVal) maxPeakVal = nsdf[p];
  }
  if (maxPeakVal < CLARITY_MIN) return { weak: true, clarity: maxPeakVal };

  // Chọn đỉnh đầu tiên đạt >= PEAK_RATIO * maxPeakVal để bắt đúng tần số cơ bản f0
  // thay vì bắt nhầm họa âm bậc cao (2f0, 3f0...) của tiếng đàn, sáo, giọng nói.
  const tau = peaks.find(p => nsdf[p] >= PEAK_RATIO * maxPeakVal);
  if (tau === undefined || tau <= 0 || tau >= maxLag) return null;

  // Nội suy parabol qua 3 điểm (tau - 1, tau, tau + 1) để đạt độ chính xác dưới mẫu
  const y1 = nsdf[tau - 1];
  const y2 = nsdf[tau];
  const y3 = nsdf[tau + 1];
  const denom = y1 - 2 * y2 + y3;
  let delta = denom !== 0 ? (0.5 * (y1 - y3)) / denom : 0;
  if (delta < -0.5) delta = -0.5;
  if (delta > 0.5) delta = 0.5;

  const refinedTau = tau + delta;
  const f = sr / refinedTau;
  if (f < F_MIN || f > F_MAX) return null;

  return { f, clarity: y2 };
}

// samples.js – âm mẫu tổng hợp (sóng cơ bản, nhạc cụ, giọng /a/) để thử lặp lại được
const SAMPLE_WAVES = {   // biên độ các họa âm 1, 2, 3, ... (âm sắc giữ ổn định để đo lặp lại được)
  flute:    [0, 1, 0.25, 0.1, 0.04],
  clarinet: [0, 1, 0, 0.55, 0, 0.3, 0, 0.15, 0, 0.08],
  trumpet:  [0, 1, 0.9, 0.75, 0.6, 0.45, 0.3, 0.2, 0.12, 0.08],
  guitar:   [0, 1, 0.7, 0.5, 0.35, 0.22, 0.12, 0.06],
  piano:    [0, 1, 0.6, 0.38, 0.25, 0.15, 0.09, 0.06, 0.04, 0.02],
  violin:   [0, 1, 0.5, 0.35, 0.3, 0.22, 0.18, 0.12, 0.1, 0.08],
  organ:    [0, 1, 0.8, 0.6, 0.3, 0.4, 0.15, 0.2]
};
const NATIVE_WAVES = { sine: 'sine', square: 'square', triangle: 'triangle', sawtooth: 'sawtooth' };

function makeSynth(ctx, kind, freq) {
  const osc = ctx.createOscillator();
  const out = ctx.createGain();
  out.gain.value = 0.5;
  if (kind === 'voice') {
    osc.type = 'sawtooth';
    out.gain.value = 2;
    [[700, 8], [1100, 10]].forEach(([fc, q]) => {   // hai formant của nguyên âm /a/
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fc;
      bp.Q.value = q;
      osc.connect(bp);
      bp.connect(out);
    });
  } else {
    const amps = SAMPLE_WAVES[kind];
    if (amps) {
      osc.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(amps.length), Float32Array.from(amps)));
    } else {
      osc.type = NATIVE_WAVES[kind] || 'sine';
    }
    osc.connect(out);
  }
  osc.frequency.value = freq;
  osc.start();
  return {
    out,
    setFreq: f => { osc.frequency.value = f; },
    stop() { try { osc.stop(); } catch (e) { /* đã dừng */ } osc.disconnect(); }
  };
}

// scope.js – vẽ lưới 10×8, sóng, 1T, con trỏ (chỉ canvas, không đụng DOM khác)
const COLS = 10;
const ROWS = 8;
const canvas = document.getElementById('scope');
const ctx2d = canvas.getContext('2d');
let COLOR_BG, COLOR_GRID, COLOR_SUBGRID, COLOR_AXIS, COLOR_WAVE, COLOR_TRIG, COLOR_PERIOD_GUIDE, COLOR_LABEL;
let FS = 1;

// Màu canvas lấy từ biến CSS của giao diện đang chọn (Light / Dark / FUMO)
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  COLOR_BG = v('--cvbg'); COLOR_GRID = v('--cvgrid'); COLOR_SUBGRID = v('--cvsub'); COLOR_AXIS = v('--cvaxis');
  COLOR_WAVE = v('--cvwave'); COLOR_TRIG = v('--cvtrig'); COLOR_PERIOD_GUIDE = v('--cvguide'); COLOR_LABEL = v('--cvlabel');
}

function renderIdle(gain) {
  const W = canvas.width;
  const H = canvas.height;
  drawGrid(W, H, gain);
}

// ===== 3. Vẽ lưới dao động ký 10×8 & đồ thị sóng =====
function drawGrid(W, H, gain) {
  FS = Math.max(1, W / (canvas.clientWidth || W) / 1.2);   // chữ không bị nhỏ trên màn hình hẹp
  ctx2d.fillStyle = COLOR_BG;
  ctx2d.fillRect(0, 0, W, H);

  // Lưới chính 10 cột × 8 hàng
  ctx2d.lineWidth = 1;
  ctx2d.strokeStyle = COLOR_GRID;
  ctx2d.beginPath();
  for (let c = 0; c <= COLS; c++) {
    const x = Math.round((c * W) / COLS) + 0.5;
    ctx2d.moveTo(x, 0);
    ctx2d.lineTo(x, H);
  }
  for (let r = 0; r <= ROWS; r++) {
    const y = Math.round((r * H) / ROWS) + 0.5;
    ctx2d.moveTo(0, y);
    ctx2d.lineTo(W, y);
  }
  ctx2d.stroke();

  // Trục (kiểu dao động ký): trục tung ở mép trái = gốc Trigger, trục hoành ở u = 0
  const midY = Math.round(H / 2) + 0.5;
  const axisX = 1.5;
  ctx2d.strokeStyle = COLOR_AXIS;
  ctx2d.lineWidth = 3;
  ctx2d.beginPath();
  ctx2d.moveTo(0, midY);
  ctx2d.lineTo(W, midY);
  ctx2d.moveTo(axisX, 0);
  ctx2d.lineTo(axisX, H);
  ctx2d.stroke();

  // Vạch chia nhỏ (0.2 ô) dọc hai trục
  ctx2d.strokeStyle = COLOR_SUBGRID;
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  for (let i = 1; i <= COLS * 5; i++) {
    const x = Math.round((i * W) / (COLS * 5)) + 0.5;
    ctx2d.moveTo(x, midY - 4);
    ctx2d.lineTo(x, midY + 4);
  }
  for (let j = 0; j <= ROWS * 5; j++) {
    const y = Math.round((j * H) / (ROWS * 5)) + 0.5;
    ctx2d.moveTo(axisX - 4, y);
    ctx2d.lineTo(axisX + 4, y);
  }
  ctx2d.stroke();

  // Nhãn số ô (1..10) dưới trục hoành; nhãn biên độ u tại 1/4 và 3/4 chiều cao
  ctx2d.fillStyle = COLOR_LABEL;
  ctx2d.font = `${15 * FS}px system-ui, sans-serif`;
  for (let c = 1; c <= COLS; c++) {
    const x = (c * W) / COLS;
    ctx2d.textAlign = c === COLS ? 'right' : 'center';
    ctx2d.fillText(String(c), c === COLS ? x - 6 : x, midY + 6 + 15 * FS);
  }
  ctx2d.textAlign = 'left';
  ctx2d.fillText('0', 8, midY + 6 + 15 * FS);
  const uq = (0.5 / gain).toPrecision(2);
  ctx2d.fillText('+' + uq, 8, H / 4 - 6);
  ctx2d.fillText('\u2212' + uq, 8, (3 * H) / 4 + 4 + 15 * FS);
}

function renderScope({ x, sr, res, msDiv, gain, cursors }) {
  const W = canvas.width;
  const H = canvas.height;

  // Quy đổi trực tiếp từ sampleRate thực tế sang số mẫu trên mỗi ô ngang
  const samplesPerDiv = (sr * msDiv) / 1000;
  // Chặn biên: không bao giờ đọc vượt quá bộ đệm (vd. sampleRate quá cao + 20 ms/ô)
  const totalSamples = Math.min(samplesPerDiv * COLS, x.length - 3);

  drawGrid(W, H, gain);

  const rmsNow = computeRms(x, x.length - totalSamples, totalSamples);
  const trigPos = findRisingZeroCrossing(x, totalSamples, rmsNow);
  const startIdx = trigPos >= 0 ? trigPos : Math.max(0, x.length - totalSamples - 2);
  const locked = trigPos >= 0;

  // Đánh dấu điểm bắt đầu Trigger tại cạnh trái (x = 0, u = 0)
  if (locked) {
    ctx2d.fillStyle = COLOR_TRIG;
    ctx2d.beginPath();
    ctx2d.arc(5, H / 2, 4.5, 0, Math.PI * 2);
    ctx2d.fill();
  }

  // Nếu có chu kỳ T hợp lệ, vẽ vạch gióng 1 chu kỳ T tính từ gốc Trigger để học sinh đối chiếu số ô
  if (locked && res && res.f > 0) {
    const T_ms = 1000 / res.f;
    const cells = T_ms / msDiv;
    const xT = (cells / COLS) * W;
    if (xT > 8 && xT < W) {
      ctx2d.save();
      ctx2d.strokeStyle = COLOR_PERIOD_GUIDE;
      ctx2d.setLineDash([6, 4]);
      ctx2d.lineWidth = 1.5;
      ctx2d.beginPath();
      ctx2d.moveTo(xT, 44);
      ctx2d.lineTo(xT, H - 16);
      ctx2d.stroke();

      // Nhãn đặt sát đáy để không đè lên HUD ở góc trên
      const label = `1T = ${cells.toFixed(2)} ô`;
      ctx2d.fillStyle = COLOR_TRIG;
      ctx2d.font = `${16 * FS}px system-ui, sans-serif`;
      const tw = ctx2d.measureText(label).width;
      const tx = xT + 8 + tw > W ? xT - 8 - tw : xT + 8;
      ctx2d.fillText(label, tx, H - 24);
      ctx2d.restore();
    }
  }

  // Vẽ đường biểu diễn dao động âm thanh (nội suy tuyến tính mượt)
  ctx2d.strokeStyle = COLOR_WAVE;
  ctx2d.lineWidth = 2.2;
  ctx2d.lineJoin = 'round';
  ctx2d.beginPath();

  const maxIdx = x.length - 2;
  for (let px = 0; px < W; px++) {
    const pos = startIdx + (px / (W - 1)) * totalSamples;
    const i = Math.max(0, Math.min(maxIdx, Math.floor(pos)));
    const frac = Math.max(0, Math.min(1, pos - i));
    const sampleVal = x[i] + (x[i + 1] - x[i]) * frac;
    const y = H / 2 - sampleVal * gain * (H / 2);
    if (px === 0) ctx2d.moveTo(px, y);
    else ctx2d.lineTo(px, y);
  }
  ctx2d.stroke();

  // Con trỏ A/B khi Freeze: đọc Δ theo ô, ms và tần số tương ứng
  if (cursors && cursors.length) {
    ctx2d.save();
    ctx2d.setLineDash([3, 4]);
    ctx2d.strokeStyle = ctx2d.fillStyle = COLOR_LABEL;
    ctx2d.lineWidth = 1.5;
    ctx2d.font = `${16 * FS}px system-ui, sans-serif`;
    cursors.forEach((cx, i) => {
      ctx2d.beginPath();
      ctx2d.moveTo(cx, 40);
      ctx2d.lineTo(cx, H - 40);
      ctx2d.stroke();
      ctx2d.fillText(i ? 'B' : 'A', cx + 4, 60);
    });
    if (cursors.length === 2) {
      const dc = (Math.abs(cursors[1] - cursors[0]) / W) * COLS;
      const dt = dc * msDiv;
      const t = `Δ = ${dc.toFixed(2)} ô = ${dt.toFixed(2)} ms → ${dt > 0 ? (1000 / dt).toFixed(1) : '—'} Hz`;
      ctx2d.fillText(t, Math.min(cursors[0], cursors[1]) + 8, H - 52);
    }
    ctx2d.restore();
  }
  return { samplesPerDiv, locked };
}

// main.js – trạng thái, nguồn âm, vòng lặp, DOM. Mọi thay đổi đều đi qua refresh().
const FFT_SIZE = 32768;      // ~0.68 s ở 48 kHz, đủ cho 20 ms/ô × 10 ô
const FREQ_EVERY_MS = 90;
const $ = id => document.getElementById(id);

let audioCtx = null, analyser = null, spkGain = null, synth = null, stream = null;
let rafId = 0, buf = null, frozen = null, lastRes, lastFreqTime = 0, cursors = [];
let autoG = 4, starting = false;

// Độ khuếch đại tự động: đỉnh sóng (đã bỏ DC) trong phần đang hiển thị chiếm ~80% nửa chiều cao
function autoTarget(x, sr, md) {
  const n = Math.min(x.length, Math.round((sr * md * COLS) / 1000) + 2);
  let mean = 0;
  for (let i = x.length - n; i < x.length; i++) mean += x[i];
  mean /= n;
  let pk = 0;
  for (let i = x.length - n; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i] - mean));
  return pk < 0.002 ? null : Math.min(50, Math.max(0.5, 0.8 / pk));
}

const pitch = () => Number($('pitch').value);

function refresh() {
  const running = Boolean(audioCtx);
  const md = Number($('scale').value);
  const x = frozen ? frozen.data : buf;
  const sr = running ? (frozen ? frozen.sr : audioCtx.sampleRate) : 0;
  const auto = $('autoGain').checked;
  let g = Number($('gain').value);
  if (running && auto) {
    const t = autoTarget(x, sr, md);
    if (t !== null) autoG = frozen ? t : autoG + (t - autoG) * 0.25;   // Freeze: giá trị cố định, không trôi
    g = autoG;
  }
  $('gain').disabled = auto;
  $('gainVal').textContent = g.toFixed(1) + '×' + (auto ? ' (tự động)' : '');

  let info = null;
  if (running) info = renderScope({ x, sr, res: lastRes, msDiv: md, gain: g, cursors: frozen ? cursors : [] });
  else renderIdle(g);

  // Trạng thái đồng bộ ở mọi nơi: pill, nút, HUD, thẻ đo
  const mode = !running ? 'idle' : frozen ? 'freeze' : 'run';
  $('statusDot').className = 'dot ' + (mode === 'idle' ? '' : mode);
  $('statusText').textContent = { idle: 'Sẵn sàng', run: 'Đang thu (Run)', freeze: 'Dừng hình (Freeze)' }[mode];
  $('btn').classList.toggle('on', running);
  $('btnLbl').textContent = running ? 'Stop' : 'Record';
  $('freeze').disabled = !running;
  $('freeze').classList.toggle('freeze-on', Boolean(frozen));
  $('freezeLbl').textContent = frozen ? 'Resume' : 'Pause';
  document.querySelector('.scope-wrap').classList.toggle('is-frozen', Boolean(frozen));

  const spd = info ? info.samplesPerDiv : 0;
  $('hudScale').textContent = info ? `${md} ms/ô · ${spd.toFixed(1)} mẫu/ô · ${g.toFixed(1)}×` : `${md} ms/ô · 10×8 lưới`;
  $('hudTrig').textContent = !info ? 'TRIGGER: —'
    : info.locked ? (frozen ? 'TRIGGER: KHÓA (DỪNG HÌNH)' : 'TRIGGER: KHÓA SƯỜN LÊN ↑') : 'TRIGGER: CHỜ TÍN HIỆU';
  $('hudTrig').classList.toggle('frozen', Boolean(frozen));
  $('trig').textContent = info ? (info.locked ? 'Đã khóa (u=0 ↑)' : 'Tự do') : '—';
  $('samplesPerDiv').textContent = info ? `${spd.toFixed(1)} mẫu/ô · ${sr} Hz` : '— mẫu/ô';

  const ok = Boolean(lastRes && lastRes.f);
  const T = ok ? 1000 / lastRes.f : 0;
  $('freq').textContent = ok ? lastRes.f.toFixed(1) : '—';
  $('period').textContent = ok ? T.toFixed(2) : '—';
  $('cells').textContent = ok ? (T / md).toFixed(2) : '—';
  $('cellsFormula').textContent = ok ? `${T.toFixed(2)} ms / ${md} ms/ô` : 'T / (ms/ô)';

  // Độ tin cậy của phép đo
  let st = ['idle', 'Độ rõ sóng: —'];
  if (running && lastRes !== undefined) {
    const pct = lastRes && lastRes.clarity !== undefined ? Math.round(lastRes.clarity * 100) : 0;
    st = !lastRes ? ['weak', 'Chu kỳ yếu (ngoài vùng 40–2500 Hz)']
      : lastRes.quiet ? ['quiet', 'Tín hiệu quá nhỏ – tăng âm lượng hoặc độ khuếch đại']
      : lastRes.weak ? ['weak', `Chu kỳ yếu – độ rõ NSDF ${pct}%`]
      : ['ok', `Đã khóa – độ rõ NSDF ${pct}%`];
  }
  $('clarityInfo').textContent = st[1];
  $('clarityInfo').dataset.state = st[0];

  $('info').textContent = running
    ? `Nguồn: ${$('source').selectedOptions[0].text} · Tần số lấy mẫu thực tế: ${sr} Hz · ${md} ms/ô (${spd.toFixed(1)} mẫu/ô)` +
      (frozen ? ' · Bấm vào đồ thị để đặt con trỏ A/B.' : '')
    : 'Chọn nguồn (micro hoặc âm mẫu) rồi bấm Record.';
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  if (frozen) return;
  analyser.getFloatTimeDomainData(buf);
  if (now - lastFreqTime >= FREQ_EVERY_MS) {
    lastFreqTime = now;
    lastRes = estimateFundamental(buf, audioCtx.sampleRate);
  }
  refresh();
}

// Giải phóng đầy đủ: rAF, oscillator, MediaStream, AudioContext
function stop() {
  cancelAnimationFrame(rafId);
  rafId = 0;
  if (synth) { synth.stop(); synth = null; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  analyser = spkGain = buf = null;
  frozen = null;
  lastRes = undefined;
  cursors = [];
  refresh();
}

async function start() {
  if (starting) return;
  stop();
  starting = true;
  $('btn').disabled = $('source').disabled = true;   // tránh bấm Stop / đổi nguồn khi đang chờ quyền micro
  $('msg').textContent = '';
  const kind = $('source').value;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let st = null, sy = null, an = null, spk = null;
  try {
    an = ctx.createAnalyser();
    an.fftSize = FFT_SIZE;
    an.smoothingTimeConstant = 0;
    spk = ctx.createGain();
    spk.connect(ctx.destination);
    if (kind === 'mic') {
      st = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      ctx.createMediaStreamSource(st).connect(an);
    } else {
      sy = makeSynth(ctx, kind, pitch());
      sy.out.connect(an);
      sy.out.connect(spk);
    }
    await ctx.resume();
  } catch (err) {
    if (st) st.getTracks().forEach(t => t.stop());
    if (sy) sy.stop();
    ctx.close();
    $('msg').textContent = location.protocol === 'file:' && kind === 'mic'
      ? 'Trình duyệt chặn micro khi mở trực tiếp file://. Hãy chạy qua localhost hoặc HTTPS (âm mẫu vẫn dùng được).'
      : 'Không thể khởi động nguồn âm: ' + err.message;
    starting = false;
    $('btn').disabled = $('source').disabled = false;
    refresh();
    return;
  }
  audioCtx = ctx; analyser = an; spkGain = spk; synth = sy; stream = st;
  buf = new Float32Array(an.fftSize);
  autoG = 4;
  lastFreqTime = 0;
  starting = false;
  $('btn').disabled = $('source').disabled = false;
  setSpeaker();
  rafId = requestAnimationFrame(loop);
  refresh();
}

function setSpeaker() {
  if (spkGain) spkGain.gain.value = $('speaker').checked && synth ? 0.25 : 0;
}

function syncSourceUI() {
  const mic = $('source').value === 'mic';
  $('pitch').disabled = mic;
  $('speaker').disabled = mic;
}

function toggleFreeze() {
  if (!audioCtx) return;
  if (frozen) {
    frozen = null;
    cursors = [];
    lastFreqTime = 0;
  } else {
    const d = new Float32Array(buf.length);
    analyser.getFloatTimeDomainData(d);
    frozen = { data: d, sr: audioCtx.sampleRate };
    lastRes = estimateFundamental(d, frozen.sr);
  }
  refresh();
}

function setTheme(t) {
  if (!['light', 'dark', 'fumo'].includes(t)) t = 'fumo';
  document.documentElement.dataset.theme = t;
  $('theme').value = t;
  try { localStorage.setItem('theme', t); } catch (e) { /* bỏ qua */ }
  readTheme();
  refresh();
}

function snapshot() {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height + 70;
  const g = c.getContext('2d');
  try {
    g.drawImage(canvas, 0, 0);
    g.fillStyle = COLOR_BG;
    g.fillRect(0, canvas.height, c.width, 70);
    g.fillStyle = COLOR_LABEL;
    g.font = '600 22px system-ui, sans-serif';
    g.fillText(`f = ${$('freq').textContent} Hz · T = ${$('period').textContent} ms · ${$('cells').textContent} ô/chu kỳ · ${$('scale').value} ms/ô · ${new Date().toLocaleString()}`, 16, canvas.height + 44);
    const a = document.createElement('a');
    a.download = `dao-dong-ky-${Date.now()}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  } catch (err) {
    $('msg').textContent = 'Không thể lưu ảnh (mở qua http://localhost hoặc HTTPS): ' + err.message;
  }
}

$('btn').addEventListener('click', () => (audioCtx ? stop() : start()));
$('freeze').addEventListener('click', toggleFreeze);
$('scale').addEventListener('change', refresh);
$('gain').addEventListener('input', refresh);
$('source').addEventListener('change', () => { syncSourceUI(); if (audioCtx) start(); });
$('pitch').addEventListener('change', () => { if (synth) synth.setFreq(pitch()); });
$('speaker').addEventListener('change', setSpeaker);
$('theme').addEventListener('change', e => setTheme(e.target.value));
$('snap').addEventListener('click', snapshot);
$('autoGain').addEventListener('change', e => {
  // Tắt tự động: thanh trượt giữ lại giá trị đang dùng để hình không nhảy
  if (!e.target.checked) $('gain').value = Math.min(10, Math.max(0.5, Math.round(autoG * 2) / 2));
  refresh();
});
const eggAudio = new Audio('assets/fumo.wav');   // easter egg: chỉ hiện ở theme FUMO
$('egg').addEventListener('click', () => {
  eggAudio.currentTime = 0;
  eggAudio.play().catch(() => { $('msg').textContent = 'Không phát được âm thanh (thiếu assets/fumo.wav?).'; });
});
canvas.addEventListener('click', e => {
  if (!frozen) return;
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) * canvas.width) / r.width;
  cursors = cursors.length >= 2 ? [x] : [...cursors, x];
  refresh();
});
window.addEventListener('resize', refresh);
window.addEventListener('pagehide', stop);

let savedTheme = 'fumo';
try { savedTheme = localStorage.getItem('theme') || savedTheme; } catch (e) { /* bỏ qua */ }
syncSourceUI();
setTheme(savedTheme);
