/*
Dao động ký ảo (Virtual Oscilloscope) v1.1.0
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

// ===== Cấu hình hệ thống (v1.1.0) =====
const COLS = 10;                  // 10 ô ngang
const ROWS = 8;                   // 8 ô dọc
const FFT_SIZE = 32768;           // ~0.68 s ở 48 kHz -> đủ chứa 20 ms/ô * 10 ô = 200 ms
const MIN_RMS = 0.008;            // Ngưỡng im lặng
const AC_WINDOW = 4096;           // Cửa sổ tự tương quan (mẫu)
const AC_MAXLAG = 2048;           // Độ trễ tối đa (~23.4 Hz ở 48 kHz)
const F_MIN = 40;                 // Tần số đo tối thiểu (Hz)
const F_MAX = 2500;               // Tần số đo tối đa (Hz)
const CLARITY_MIN = 0.52;         // Ngưỡng độ rõ tuần hoàn tối thiểu
const PEAK_RATIO = 0.88;          // Ưu tiên đỉnh cơ bản đầu tiên >= 88% đỉnh cao nhất (tránh nhảy bậc quãng tám)
const FREQ_EVERY_MS = 90;         // Chu kỳ cập nhật tần số/chu kỳ (ms)

const COLOR_BG = '#03070b';
const COLOR_GRID = '#162432';
const COLOR_SUBGRID = '#223548';
const COLOR_AXIS = '#446280';
const COLOR_WAVE = '#39ff88';
const COLOR_TRIG = '#ffb84d';
const COLOR_PERIOD_GUIDE = 'rgba(255, 184, 77, 0.55)';

// ===== Phần tử giao diện =====
const $ = id => document.getElementById(id);
const canvas = $('scope');
const ctx2d = canvas.getContext('2d');
const btn = $('btn');
const freezeBtn = $('freeze');
const scaleSel = $('scale');
const gainEl = $('gain');
const gainVal = $('gainVal');
const msg = $('msg');
const info = $('info');
const scopeWrap = document.querySelector('.scope-wrap');

const freqEl = $('freq');
const periodEl = $('period');
const cellsEl = $('cells');
const trigEl = $('trig');
const clarityInfo = $('clarityInfo');
const cellsFormula = $('cellsFormula');
const samplesPerDivEl = $('samplesPerDiv');

const hudScale = $('hudScale');
const hudTrig = $('hudTrig');
const statusDot = $('statusDot');
const statusText = $('statusText');

// ===== Trạng thái hoạt động =====
let audioCtx = null;
let analyser = null;
let stream = null;
let rafId = 0;
let buf = null;
let frozen = null;                // { data: Float32Array, sr: number }
let lastFreqTime = 0;
let lastRes = null;

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

  if (computeRms(x, off, N) < MIN_RMS) return null;

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

  if (peaks.length === 0) return null;

  let maxPeakVal = 0;
  for (const p of peaks) {
    if (nsdf[p] > maxPeakVal) maxPeakVal = nsdf[p];
  }
  if (maxPeakVal < CLARITY_MIN) return null;

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

// ===== 3. Vẽ lưới dao động ký 10×8 & đồ thị sóng =====
function drawGrid(W, H) {
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

  // Trục tọa độ trung tâm (u = 0) & vạch chia phụ 0.2 ô trên trục
  const midY = Math.round(H / 2) + 0.5;
  const midX = Math.round(W / 2) + 0.5;

  ctx2d.strokeStyle = COLOR_AXIS;
  ctx2d.lineWidth = 1.5;
  ctx2d.beginPath();
  ctx2d.moveTo(0, midY);
  ctx2d.lineTo(W, midY);
  ctx2d.moveTo(midX, 0);
  ctx2d.lineTo(midX, H);
  ctx2d.stroke();

  // Vạch chia nhỏ (sub-ticks) dọc trục hoành và trục tung giúp đọc số ô chính xác
  ctx2d.strokeStyle = COLOR_SUBGRID;
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  const subX = COLS * 5;
  for (let i = 0; i <= subX; i++) {
    const x = Math.round((i * W) / subX) + 0.5;
    ctx2d.moveTo(x, midY - 4);
    ctx2d.lineTo(x, midY + 4);
  }
  const subY = ROWS * 5;
  for (let j = 0; j <= subY; j++) {
    const y = Math.round((j * H) / subY) + 0.5;
    ctx2d.moveTo(midX - 4, y);
    ctx2d.lineTo(midX + 4, y);
  }
  ctx2d.stroke();
}

function renderScope(x, sr, res) {
  const W = canvas.width;
  const H = canvas.height;
  const msDiv = Number(scaleSel.value);
  const gain = Number(gainEl.value);

  // Quy đổi trực tiếp từ sampleRate thực tế sang số mẫu trên mỗi ô ngang
  const samplesPerDiv = (sr * msDiv) / 1000;
  // Chặn biên: không bao giờ đọc vượt quá bộ đệm (vd. sampleRate quá cao + 20 ms/ô)
  const totalSamples = Math.min(samplesPerDiv * COLS, x.length - 3);

  drawGrid(W, H);

  const rmsNow = computeRms(x, x.length - totalSamples, totalSamples);
  const trigPos = findRisingZeroCrossing(x, totalSamples, rmsNow);
  const startIdx = trigPos >= 0 ? trigPos : Math.max(0, x.length - totalSamples - 2);
  const locked = trigPos >= 0;

  trigEl.textContent = locked ? 'Đã khóa (u=0 ↑)' : 'Tự do';
  samplesPerDivEl.textContent = `${samplesPerDiv.toFixed(1)} mẫu/ô`;
  hudScale.textContent = `${msDiv} ms/ô · ${samplesPerDiv.toFixed(1)} mẫu/ô · ${gain.toFixed(1)}×`;
  hudTrig.textContent = locked
    ? (frozen ? 'TRIGGER: KHÓA (DỪNG HÌNH)' : 'TRIGGER: KHÓA SƯỜN LÊN ↑')
    : 'TRIGGER: CHỜ TÍN HIỆU';
  hudTrig.classList.toggle('frozen', Boolean(frozen));

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
      ctx2d.font = '600 16px system-ui, sans-serif';
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

  info.textContent =
    `Tần số lấy mẫu thực tế: ${sr} Hz (${(sr / 1000).toFixed(1)} kHz) · ` +
    `Thang đo: ${msDiv} ms/ô (${samplesPerDiv.toFixed(1)} mẫu/ô) · ` +
    `Toàn màn hình 10 ô = ${msDiv * COLS} ms`;
}

// ===== 4. Hiển thị song song Tần số f (Hz) & Chu kỳ T = 1000/f (ms) =====
function updateReadout(res, msDiv) {
  if (!res) {
    freqEl.textContent = '—';
    periodEl.textContent = '—';
    cellsEl.textContent = '—';
    clarityInfo.textContent = 'Độ rõ sóng: —';
    cellsFormula.textContent = 'T / (ms/ô)';
    return;
  }

  const T = 1000 / res.f;
  const cells = T / msDiv;

  freqEl.textContent = res.f.toFixed(1);
  periodEl.textContent = T.toFixed(2);
  cellsEl.textContent = cells.toFixed(2);
  clarityInfo.textContent = `Độ rõ NSDF: ${(res.clarity * 100).toFixed(0)}%`;
  cellsFormula.textContent = `${T.toFixed(2)} ms / ${msDiv} ms/ô`;
}

function updateStatus(mode) {
  statusDot.className = 'dot';
  if (mode === 'run') {
    statusDot.classList.add('run');
    statusText.textContent = 'Đang thu (Run)';
  } else if (mode === 'freeze') {
    statusDot.classList.add('freeze');
    statusText.textContent = 'Dừng hình (Freeze)';
  } else {
    statusText.textContent = 'Sẵn sàng';
  }
}

// ===== 5. Vòng lặp thời gian thực & Điều khiển Freeze / Run =====
function loop(now) {
  rafId = requestAnimationFrame(loop);
  analyser.getFloatTimeDomainData(buf);
  const sr = audioCtx.sampleRate;

  if (now - lastFreqTime >= FREQ_EVERY_MS) {
    lastFreqTime = now;
    lastRes = estimateFundamental(buf, sr);
    updateReadout(lastRes, Number(scaleSel.value));
  }

  renderScope(buf, sr, lastRes);
}

async function startMic() {
  msg.textContent = '';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
  } catch (err) {
    msg.textContent = location.protocol === 'file:'
      ? 'Trình duyệt chặn micro khi mở trực tiếp file://. Hãy chạy qua localhost hoặc HTTPS.'
      : 'Không thể truy cập micro: ' + err.message;
    return;
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;

  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(analyser);

  buf = new Float32Array(analyser.fftSize);
  frozen = null;
  lastRes = null;

  btn.textContent = 'Tắt micro';
  btn.classList.add('on');
  freezeBtn.disabled = false;
  setFreezeState(false);
}

function stopMic() {
  cancelAnimationFrame(rafId);
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  analyser = null;
  frozen = null;
  lastRes = null;

  btn.textContent = 'Bật micro';
  btn.classList.remove('on');
  freezeBtn.disabled = true;
  freezeBtn.textContent = 'Dừng hình (Freeze)';
  freezeBtn.classList.remove('freeze-on');
  scopeWrap.classList.remove('is-frozen');

  updateStatus('idle');
  updateReadout(null, Number(scaleSel.value));
  trigEl.textContent = '—';
  samplesPerDivEl.textContent = '— mẫu/ô';
  hudTrig.textContent = 'TRIGGER: —';
  hudTrig.classList.remove('frozen');
  drawGrid(canvas.width, canvas.height);
  info.textContent = 'Đã tắt micro. Bấm "Bật micro" để tiếp tục.';
}

function setFreezeState(isFrozen) {
  if (isFrozen) {
    if (!audioCtx || !buf) return;
    cancelAnimationFrame(rafId);
    // Chụp lại toàn bộ bộ đệm thời gian thực tại thời điểm nhấn Dừng hình
    const snapshot = new Float32Array(buf.length);
    analyser.getFloatTimeDomainData(snapshot);
    frozen = { data: snapshot, sr: audioCtx.sampleRate };

    freezeBtn.textContent = 'Chạy tiếp (Run)';
    freezeBtn.classList.add('freeze-on');
    scopeWrap.classList.add('is-frozen');
    updateStatus('freeze');

    lastRes = estimateFundamental(frozen.data, frozen.sr);
    updateReadout(lastRes, Number(scaleSel.value));
    renderScope(frozen.data, frozen.sr, lastRes);
  } else {
    frozen = null;
    freezeBtn.textContent = 'Dừng hình (Freeze)';
    freezeBtn.classList.remove('freeze-on');
    scopeWrap.classList.remove('is-frozen');
    if (audioCtx) {
      updateStatus('run');
      lastFreqTime = 0;
      rafId = requestAnimationFrame(loop);
    }
  }
}

function onSettingsChange() {
  const gain = Number(gainEl.value);
  gainVal.textContent = `${gain.toFixed(1)}×`;

  if (frozen) {
    updateReadout(lastRes, Number(scaleSel.value));
    renderScope(frozen.data, frozen.sr, lastRes);
  } else if (!audioCtx) {
    const msDiv = Number(scaleSel.value);
    hudScale.textContent = `${msDiv} ms/ô · 10×8 lưới`;
  }
}

btn.addEventListener('click', () => (audioCtx ? stopMic() : startMic()));
freezeBtn.addEventListener('click', () => setFreezeState(!frozen));
scaleSel.addEventListener('change', onSettingsChange);
gainEl.addEventListener('input', onSettingsChange);

// Khởi tạo màn hình lưới ban đầu
drawGrid(canvas.width, canvas.height);
