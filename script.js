/*
Dao động ký ảo (Virtual Oscilloscope) v2.0.1
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
const AC_MAXLAG = 2048;           // Độ trễ tối đa (mẫu); thực tế còn bị giới hạn bởi sampleRate / F_MIN
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

// Giải mã .wav/.mp3 theo tần số lấy mẫu của AudioContext (dạng callback để Safari cũ vẫn chạy)
const decode = (ctx, data) => new Promise((ok, fail) => ctx.decodeAudioData(data, ok, fail));

// Nguồn từ file âm thanh (.wav/.mp3): giải mã theo tần số lấy mẫu của AudioContext, phát lặp,
// có phát/tạm dừng và tua. Vị trí phát = offset + (thời gian đã chạy từ lúc bắt đầu) lấy dư theo độ dài file.
async function makeFileSource(ctx, data) {
  const audio = await decode(ctx, data);
  const out = ctx.createGain();
  const dur = audio.duration;
  let src = null, offset = 0, t0 = 0, playing = false;
  const pos = () => (playing ? (offset + ctx.currentTime - t0) % dur : offset);
  function halt() {
    if (src) {
      offset = pos();
      try { src.stop(); } catch (e) { /* đã dừng */ }
      src.disconnect();
      src = null;
    }
    playing = false;
  }
  function play() {
    if (playing) return;
    src = ctx.createBufferSource();   // AudioBufferSourceNode chỉ start được một lần nên mỗi lần phát/tua tạo nút mới
    src.buffer = audio;
    src.loop = true;
    src.connect(out);
    src.start(0, offset);
    t0 = ctx.currentTime;
    playing = true;
  }
  play();
  return {
    out,
    duration: dur,
    setFreq() {},
    getTime: pos,
    isPlaying: () => playing,
    play,
    pause: halt,
    seek(sec) {
      const was = playing;
      halt();
      offset = Math.max(0, Math.min(dur - 0.001, sec));
      if (was) play();
    },
    stop: halt
  };
}

// i18n.js – Tiếng Việt / English
let lang = 'vi';
const I18N = {
  subtitle: ['Dao động ký ảo · Vật lý 11', 'Virtual oscilloscope · Physics 11'],
  lblLang: ['Ngôn ngữ', 'Language'],
  lblTheme: ['Giao diện', 'Theme'],
  stReady: ['Sẵn sàng', 'Ready'],
  stRun: ['Đang thu (Run)', 'Running'],
  stFreeze: ['Dừng hình (Freeze)', 'Frozen'],
  bRec: ['Thu âm', 'Record'],
  bStop: ['Dừng', 'Stop'],
  bPause: ['Tạm dừng', 'Pause'],
  bResume: ['Tiếp tục', 'Resume'],
  kFreq: ['Tần số cơ bản (f)', 'Fundamental frequency (f)'],
  kPeriod: ['Chu kỳ (T = 1000 / f)', 'Period (T = 1000 / f)'],
  kNote: ['Nốt nhạc gần nhất', 'Nearest note'],
  kCells: ['1 chu kỳ trên lưới', 'One period on the grid'],
  kTrig: ['Trigger sườn lên (u = 0 ↑)', 'Rising-edge trigger (u = 0 ↑)'],
  kMan: ['Đo tay A–B', 'Manual A–B'],
  lblN: ['Số chu kỳ n giữa A và B', 'Cycles n between A and B'],
  uCells: ['ô ngang', 'divisions'],
  subPar: ['Tính song song theo f', 'Computed from f'],
  cellsF: ['T / (ms/ô)', 'T / (ms/div)'],
  cellUnit: ['ô', 'div'],
  msDiv: ['ms/ô', 'ms/div'],
  clIdle: ['Độ rõ sóng: —', 'Clarity: —'],
  clRange: ['Chu kỳ yếu (ngoài vùng 40–2500 Hz)', 'Weak periodicity (outside 40–2500 Hz)'],
  clQuiet: ['Tín hiệu quá nhỏ – tăng âm lượng hoặc độ khuếch đại', 'Signal too quiet – raise the volume or gain'],
  clWeak: ['Chu kỳ yếu – độ rõ NSDF {p}%', 'Weak periodicity – NSDF clarity {p}%'],
  clOk: ['Đã khóa – độ rõ NSDF {p}%', 'Locked – NSDF clarity {p}%'],
  noteSub: ['{c} cent · chuẩn {f} Hz', '{c} cents · reference {f} Hz'],
  trLock: ['Đã khóa (u=0 ↑)', 'Locked (u=0 ↑)'],
  trFree: ['Tự do', 'Free'],
  hLock: ['TRIGGER: KHÓA SƯỜN LÊN ↑', 'TRIGGER: LOCKED ↑'],
  hFrozen: ['TRIGGER: KHÓA (DỪNG HÌNH)', 'TRIGGER: LOCKED (FROZEN)'],
  hWait: ['TRIGGER: CHỜ TÍN HIỆU', 'TRIGGER: WAITING'],
  hIdle: ['TRIGGER: —', 'TRIGGER: —'],
  hGridIdle: ['{ms} ms/ô · lưới 10×8', '{ms} ms/div · 10×8 grid'],
  hGrid: ['{ms} ms/ô · {spd} mẫu/ô · {g}×', '{ms} ms/div · {spd} samples/div · {g}×'],
  hSpec: ['Phổ FFT · Δf = {df} Hz', 'FFT spectrum · Δf = {df} Hz'],
  spdSub: ['{spd} mẫu/ô · {sr} Hz · Δt = {dt} ms', '{spd} samples/div · {sr} Hz · Δt = {dt} ms'],
  spdIdle: ['— mẫu/ô', '— samples/div'],
  manHint: ['Freeze rồi bấm 2 điểm trên đồ thị', 'Freeze, then click two points on the scope'],
  manSub: ['Δt = {dt} ms · T = Δt/{n} = {T} ms', 'Δt = {dt} ms · T = Δt/{n} = {T} ms'],
  iIdle: ['Chọn nguồn (micro, âm mẫu hoặc file) rồi bấm Thu âm.', 'Choose a source (microphone, test sound or file), then press Record.'],
  iRun: ['Nguồn: {src} · Tần số lấy mẫu thực tế: {sr} Hz · {ms} ms/ô ({spd} mẫu/ô)', 'Source: {src} · Actual sample rate: {sr} Hz · {ms} ms/div ({spd} samples/div)'],
  iCur: [' · Bấm vào đồ thị để đặt con trỏ A/B.', ' · Click the scope to place cursors A/B.'],
  eFile: ['Trình duyệt chặn micro khi mở trực tiếp file://. Hãy chạy qua localhost hoặc HTTPS (âm mẫu vẫn dùng được).', 'The browser blocks the microphone on file://. Use localhost or HTTPS (test sounds still work).'],
  eStart: ['Không thể khởi động nguồn âm: {m}', 'Cannot start the audio source: {m}'],
  eNoFile: ['Hãy chọn một file âm thanh (.wav/.mp3) trước.', 'Choose an audio file (.wav/.mp3) first.'],
  eDecode: ['Không đọc được file âm thanh này.', 'Cannot decode this audio file.'],
  eSnap: ['Không thể lưu ảnh (mở qua http://localhost hoặc HTTPS): {m}', 'Cannot save the image (open via http://localhost or HTTPS): {m}'],
  eEgg: ['Không phát được âm thanh (thiếu assets/fumo.wav?).', 'Cannot play the sound (missing assets/fumo.wav?).'],
  eEggGraph: ['Không nạp được assets/fumo.wav để hiện lên đồ thị (hãy mở qua localhost hoặc HTTPS). Đã phát âm thanh thường.', 'Cannot load assets/fumo.wav for the scope (open via localhost or HTTPS). Played as plain audio.'],
  eSecure: ['Trình duyệt chỉ cho dùng micro qua HTTPS hoặc localhost. Hãy mở trang bằng địa chỉ https://… (âm mẫu vẫn dùng được).', 'The browser only allows the microphone over HTTPS or localhost. Open the page via https://… (test sounds still work).'],
  eDenied: ['Quyền micro đang bị chặn. Bấm biểu tượng ổ khóa cạnh thanh địa chỉ để cho phép lại.', 'Microphone permission is blocked. Use the padlock icon next to the address bar to allow it.'],
  eNoMic: ['Không tìm thấy micro trên thiết bị này.', 'No microphone was found on this device.'],
  srcFumo: ['Fumo (bấm hình)', 'Fumo (click the figure)'],
  eggTip: ['Bấm để phát tiếng Fumo lên đồ thị', 'Click to play the Fumo sound on the scope'],
  langTip: ['Tiếng Việt · bấm để chuyển sang English', 'English · click to switch to Tiếng Việt'],
  fVol: ['Âm lượng loa', 'Speaker volume'],
  fSeek: ['Tua file âm thanh', 'Seek in audio file'],
  bPlay: ['▶ Phát', '▶ Play'],
  bPauseAud: ['⏸ Tạm dừng phát', '⏸ Pause playback'],
  fMeasure: ['Cách đo chu kỳ', 'Period measurement'],
  mAuto: ['Tự động (phần mềm)', 'Automatic (software)'],
  mManual: ['Đo tay (con trỏ A/B)', 'Manual (cursors A/B)'],
  clManual: ['Đo tay: bấm Tạm dừng rồi bấm 2 điểm A, B trên đồ thị', 'Manual: press Pause, then click two points A, B on the scope'],
  eNoF: ['Chưa có tần số hợp lệ để ghi.', 'No valid frequency to log yet.'],
  pTest: ['Test · Nguồn âm', 'Test · Sound source'],
  fSource: ['Nguồn', 'Source'],
  srcMic: ['Micro', 'Microphone'],
  srcFile: ['Mở file âm thanh (.wav/.mp3)', 'Open audio file (.wav/.mp3)'],
  gBasic: ['Sóng cơ bản', 'Basic waves'],
  sSine: ['Sine', 'Sine'],
  sSquare: ['Vuông', 'Square'],
  sTri: ['Tam giác', 'Triangle'],
  sSaw: ['Răng cưa', 'Sawtooth'],
  gInst: ['Nhạc cụ', 'Instruments'],
  iFlute: ['Sáo', 'Flute'],
  iClar: ['Clarinet', 'Clarinet'],
  iTrump: ['Trumpet', 'Trumpet'],
  iGuit: ['Guitar', 'Guitar'],
  iPiano: ['Piano', 'Piano'],
  iViolin: ['Violin', 'Violin'],
  iOrgan: ['Organ', 'Organ'],
  gVoice: ['Giọng', 'Voice'],
  sVoice: ['Giọng /a/', 'Voice /a/'],
  fPitch: ['Cao độ', 'Pitch'],
  gFixed: ['Tần số cố định', 'Fixed frequency'],
  gGuitar: ['Dây đàn guitar chuẩn', 'Standard guitar strings'],
  gString: ['Dây', 'String'],
  gNotes: ['Nốt nhạc (quãng 3–5, thêm Đô6)', 'Notes (octaves 3–5, plus C6)'],
  chkSpk: ['Phát ra loa', 'Play through speaker'],
  fFile: ['File âm thanh', 'Audio file'],
  pScale: ['Thang đo', 'Scale'],
  fView: ['Chế độ xem', 'View'],
  vTime: ['Đồ thị u(t)', 'Waveform u(t)'],
  vSpec: ['Phổ FFT', 'FFT spectrum'],
  fScale: ['Thang thời gian (ms/ô)', 'Time base (ms/div)'],
  chkAuto: ['Tự động chỉnh biên độ', 'Auto amplitude'],
  fGain: ['Độ khuếch đại (biên độ)', 'Gain (amplitude)'],
  autoTag: [' (tự động)', ' (auto)'],
  uHint: ['u: li độ, đơn vị tương đối (mẫu chuẩn hóa trong [−1; 1]).', 'u: displacement in relative units (samples normalized to [−1, 1]).'],
  bSnap: ['Lưu ảnh PNG', 'Save PNG'],
  pLog: ['Bảng đo kiểm định · δ = |f_đo − f_chuẩn| / f_chuẩn × 100%', 'Verification log · δ = |f_meas − f_ref| / f_ref × 100%'],
  fRef: ['Tần số chuẩn (Hz)', 'Reference frequency (Hz)'],
  bAdd: ['Ghi lần đo', 'Log measurement'],
  bClear: ['Xóa bảng', 'Clear'],
  bCsv: ['Tải CSV', 'Download CSV'],
  thNo: ['STT', '#'],
  thSrc: ['Nguồn', 'Source'],
  thRef: ['f chuẩn (Hz)', 'f ref (Hz)'],
  thSoft: ['f phần mềm (Hz)', 'f software (Hz)'],
  thDS: ['δ (%)', 'δ (%)'],
  thHand: ['f đo tay (Hz)', 'f manual (Hz)'],
  thDH: ['δ tay (%)', 'δ manual (%)'],
  lgEmpty: ['Chưa có lần đo nào. Nên đo ít nhất 3 lần cho mỗi nguồn chuẩn.', 'No measurements yet. Take at least 3 per reference source.'],
  lgNoRef: ['Nhập tần số chuẩn để tính sai số δ.', 'Enter a reference frequency to compute the error δ.'],
  lgSum: ['f_tb ({n} lần, f chuẩn = {r} Hz) = {f} Hz · δ = {d}% · {ok}', 'f_avg ({n} runs, f ref = {r} Hz) = {f} Hz · δ = {d}% · {ok}'],
  lgOk: ['Đạt (≤ 5%)', 'Pass (≤ 5%)'],
  lgNo: ['Chưa đạt (> 5%)', 'Not yet (> 5%)'],
  snapTxt: ['f = {f} Hz · T = {T} ms · {c} ô/chu kỳ · {ms} ms/ô · {time}', 'f = {f} Hz · T = {T} ms · {c} div/period · {ms} ms/div · {time}'],
  ftLic: [
    'Copyright (C) 2026 Pantherasami<br>Phần mềm tự do, phát hành theo <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener">GNU GPL v3.0</a>, không kèm bảo đảm nào · <a href="https://github.com/Pantherasami/virtual-oscilloscope-5" target="_blank" rel="noopener">Mã nguồn</a> · v2.0.0',
    'Copyright (C) 2026 Pantherasami<br>Free software released under the <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener">GNU GPL v3.0</a>, with no warranty · <a href="https://github.com/Pantherasami/virtual-oscilloscope-5" target="_blank" rel="noopener">Source code</a> · v2.0.0'
  ]
};

function t(key, vars) {
  const pair = I18N[key] || [key, key];
  const text = pair[lang === 'vi' ? 0 : 1];
  return vars ? text.replace(/\{(\w+)\}/g, (_, n) => (n in vars ? vars[n] : '')) : text;
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

function renderIdle(gain, msDiv) {
  const W = canvas.width;
  const H = canvas.height;
  drawGrid(W, H, gain, msDiv);
}

// ===== 3. Vẽ lưới dao động ký 10×8 & đồ thị sóng =====
function drawGrid(W, H, gain, msDiv) {
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
    ctx2d.fillText(String(Number((c * msDiv).toFixed(1))), c === COLS ? x - 6 : x, midY + 6 + 15 * FS);
  }
  ctx2d.textAlign = 'left';
  ctx2d.fillText('0', 8, midY + 6 + 15 * FS);
  ctx2d.textAlign = 'right';
  ctx2d.fillText('t (ms)', W - 6, midY - 8 * FS);
  ctx2d.textAlign = 'left';
  const uq = (0.5 / gain).toPrecision(2);
  ctx2d.fillText('u = +' + uq, 8, H / 4 - 6);
  ctx2d.fillText('u = \u2212' + uq, 8, (3 * H) / 4 + 4 + 15 * FS);
}

let dcBuf = null;
// Bỏ thành phần một chiều (DC) của micro để trigger u = 0 và đường vẽ không bị lệch khỏi trục
function removeDc(x) {
  if (!dcBuf || dcBuf.length !== x.length) dcBuf = new Float32Array(x.length);
  let m = 0;
  for (let i = 0; i < x.length; i++) m += x[i];
  m /= x.length;
  for (let i = 0; i < x.length; i++) dcBuf[i] = x[i] - m;
  return dcBuf;
}

function renderScope({ x, sr, res, msDiv, gain, cursors, nCyc }) {
  x = removeDc(x);
  const W = canvas.width;
  const H = canvas.height;

  // Quy đổi trực tiếp từ sampleRate thực tế sang số mẫu trên mỗi ô ngang
  const samplesPerDiv = (sr * msDiv) / 1000;
  // Chặn biên: không bao giờ đọc vượt quá bộ đệm (vd. sampleRate quá cao + 20 ms/ô)
  const totalSamples = Math.min(samplesPerDiv * COLS, x.length - 3);

  drawGrid(W, H, gain, msDiv);

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
      const label = `1T = ${cells.toFixed(2)} ${t('cellUnit')}`;
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
      const dt = (Math.abs(cursors[1] - cursors[0]) / W) * COLS * msDiv;
      const n = Math.max(1, nCyc || 1);
      const txt = `Δt = ${dt.toFixed(2)} ms · n = ${n} → f = ${dt > 0 ? ((1000 * n) / dt).toFixed(1) : '—'} Hz`;
      ctx2d.fillText(txt, 14, H - 52);
    }
    ctx2d.restore();
  }
  return { samplesPerDiv, locked };
}

// Phổ FFT (mở rộng): biên độ chuẩn hóa theo tần số, đánh dấu f₀ và các họa âm
function renderSpectrum({ spec, sr, res }) {
  const W = canvas.width;
  const H = canvas.height;
  FS = Math.max(1, W / (canvas.clientWidth || W) / 1.2);
  ctx2d.fillStyle = COLOR_BG;
  ctx2d.fillRect(0, 0, W, H);
  const nb = spec.length;
  const df = sr / 2 / nb;
  const f0 = res && res.f ? res.f : 0;
  const fMax = f0 ? Math.min(sr / 2, Math.max(1000, Math.ceil((f0 * 10) / 500) * 500)) : 2500;
  const kMax = Math.min(nb - 1, Math.floor(fMax / df));
  const mag = new Float32Array(kMax + 1);
  let mx = 1e-12;
  for (let k = 0; k <= kMax; k++) {
    mag[k] = Math.pow(10, spec[k] / 20);
    if (mag[k] > mx) mx = mag[k];
  }
  const top = 40 + 30 * FS;
  const bot = H - 38 * FS;
  const plotH = bot - top;
  const step = [50, 100, 200, 250, 500, 1000, 2000].find(s => fMax / s <= 10) || 2000;

  ctx2d.lineWidth = 1;
  ctx2d.strokeStyle = COLOR_GRID;
  ctx2d.beginPath();
  for (let f = 0; f <= fMax; f += step) {
    const x = (f / fMax) * W;
    ctx2d.moveTo(x, top);
    ctx2d.lineTo(x, bot);
  }
  for (let r = 0; r <= 4; r++) {
    const y = bot - (r / 4) * plotH;
    ctx2d.moveTo(0, y);
    ctx2d.lineTo(W, y);
  }
  ctx2d.stroke();

  ctx2d.strokeStyle = COLOR_AXIS;
  ctx2d.lineWidth = 3;
  ctx2d.beginPath();
  ctx2d.moveTo(1.5, top - 10);
  ctx2d.lineTo(1.5, bot);
  ctx2d.lineTo(W, bot);
  ctx2d.stroke();

  ctx2d.fillStyle = COLOR_LABEL;
  ctx2d.font = `${14 * FS}px system-ui, sans-serif`;
  ctx2d.textAlign = 'center';
  for (let f = step; f < fMax; f += step) ctx2d.fillText(String(f), (f / fMax) * W, bot + 16 * FS);
  ctx2d.textAlign = 'right';
  ctx2d.fillText('f (Hz)', W - 6, bot + 32 * FS);
  ctx2d.textAlign = 'left';
  ctx2d.fillText('A', 8, top + 14 * FS);

  ctx2d.beginPath();
  for (let k = 0; k <= kMax; k++) {
    const x = (k / kMax) * W;
    const y = bot - (mag[k] / mx) * plotH;
    if (k === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.strokeStyle = COLOR_WAVE;
  ctx2d.lineWidth = 2;
  ctx2d.lineJoin = 'round';
  ctx2d.stroke();
  ctx2d.lineTo(W, bot);
  ctx2d.lineTo(0, bot);
  ctx2d.globalAlpha = 0.15;
  ctx2d.fillStyle = COLOR_WAVE;
  ctx2d.fill();
  ctx2d.globalAlpha = 1;

  if (f0) {
    ctx2d.save();
    ctx2d.setLineDash([6, 4]);
    ctx2d.strokeStyle = ctx2d.fillStyle = COLOR_TRIG;
    ctx2d.lineWidth = 1.5;
    ctx2d.font = `${15 * FS}px system-ui, sans-serif`;
    ctx2d.textAlign = 'center';
    for (let h = 1; h * f0 <= fMax; h++) {
      const x = ((h * f0) / fMax) * W;
      ctx2d.beginPath();
      ctx2d.moveTo(x, top);
      ctx2d.lineTo(x, bot);
      ctx2d.stroke();
      ctx2d.fillText(h === 1 ? 'f₀' : h + 'f₀', x, top - 4);
    }
    ctx2d.restore();
  }
  return { df };
}

// main.js – trạng thái, nguồn âm, vòng lặp, DOM. Mọi thay đổi đều đi qua refresh().
const FFT_SIZE = 32768;      // ~0.68 s ở 48 kHz, đủ cho 20 ms/ô × 10 ô
const FREQ_EVERY_MS = 90;
const MAX_LOG = 30;
const $ = id => document.getElementById(id);

let audioCtx = null, analyser = null, spkGain = null, synth = null, stream = null;
let rafId = 0, buf = null, specBuf = null, frozen = null, lastRes, lastMan = null, lastFreqTime = 0, cursors = [];
let autoG = 4, starting = false, fileData = null, fileName = '', refTouched = false;
let runKind = '', eggSrc = null, eggTimer = 0, eggVol = null, seeking = false;   // runKind: nguồn đang chạy ('none' = chỉ có tiếng Fumo)
const logRows = [];

const pitch = () => Number($('pitch').value);
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
const NOTE_VI = ['Đô', 'Đô#', 'Rê', 'Rê#', 'Mi', 'Fa', 'Fa#', 'Son', 'Son#', 'La', 'La#', 'Si'];
const NOTE_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteName(m) {
  const o = Math.floor(m / 12) - 1;
  const i = ((m % 12) + 12) % 12;
  return lang === 'vi' ? `${NOTE_VI[i]}${o} (${NOTE_EN[i]}${o})` : `${NOTE_EN[i]}${o}`;
}

function noteInfo(f) {
  const n = 69 + 12 * Math.log2(f / 440);
  const m = Math.round(n);
  return { name: noteName(m), cents: (n - m) * 100, hz: midiHz(m) };
}

const srcLabel = () => runKind === 'none' ? t('srcFumo')
  : $('source').selectedOptions[0].text + ($('source').value === 'file' && fileName ? ` (${fileName})` : '');

// Danh sách cao độ: tần số cố định, dây guitar chuẩn, nốt nhạc theo bảng tần số chuẩn (La4 = 440 Hz)
function buildPitch() {
  const sel = $('pitch');
  const keep = sel.value || '440.00';
  sel.textContent = '';
  const group = (labelKey, items) => {
    const g = document.createElement('optgroup');
    g.dataset.i18nLabel = labelKey;
    g.label = t(labelKey);
    items.forEach(([text, value]) => g.appendChild(new Option(text, value)));
    sel.appendChild(g);
  };
  group('gFixed', [100, 200, 1000].map(f => [`${f} Hz`, String(f)]));
  group('gGuitar', [40, 45, 50, 55, 59, 64].map(m => [`${t('gString')} ${noteName(m)} – ${midiHz(m).toFixed(1)} Hz`, midiHz(m).toFixed(2)]));
  const notes = [];
  for (let m = 48; m <= 84; m++) notes.push([`${noteName(m)} – ${midiHz(m).toFixed(1)} Hz`, midiHz(m).toFixed(2)]);
  group('gNotes', notes);
  sel.value = keep;
  if (sel.value !== keep) sel.value = '440.00';
}

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

function refresh() {
  const running = Boolean(audioCtx);
  const spec = $('view').value === 'spec';
  const md = Number($('scale').value);
  const x = frozen ? frozen.data : buf;
  const sr = running ? (frozen ? frozen.sr : audioCtx.sampleRate) : 0;
  const auto = $('autoGain').checked;
  let g = Number($('gain').value);
  if (running && auto) {
    const tg = autoTarget(x, sr, md);
    if (tg !== null) autoG = frozen ? tg : autoG + (tg - autoG) * 0.25;   // Freeze: giá trị cố định, không trôi
    g = autoG;
  }
  $('gain').disabled = auto;
  $('gainVal').textContent = g.toFixed(1) + '×' + (auto ? t('autoTag') : '');
  const nCyc = Math.max(1, Math.round(Number($('nCyc').value) || 1));
  const manual = $('measure').value === 'manual';

  let info = null;
  if (running && spec) info = renderSpectrum({ spec: frozen ? frozen.spec : specBuf, sr, res: lastRes });
  else if (running) info = renderScope({ x, sr, res: manual ? null : lastRes, msDiv: md, gain: g, cursors: frozen && manual ? cursors : [], nCyc })   // đo tay: ẩn vạch 1T để học sinh tự đo;
  else renderIdle(g, md);

  // Trạng thái đồng bộ ở mọi nơi: pill, nút, HUD, thẻ đo
  const mode = !running ? 'idle' : frozen ? 'freeze' : 'run';
  $('statusDot').className = 'dot ' + (mode === 'idle' ? '' : mode);
  $('statusText').textContent = t({ idle: 'stReady', run: 'stRun', freeze: 'stFreeze' }[mode]);
  $('btn').classList.toggle('on', running);
  $('btnLbl').textContent = t(running ? 'bStop' : 'bRec');
  $('freeze').disabled = !running;
  $('freeze').classList.toggle('freeze-on', Boolean(frozen));
  $('freezeLbl').textContent = t(frozen ? 'bResume' : 'bPause');
  document.querySelector('.scope-wrap').classList.toggle('is-frozen', Boolean(frozen));

  // Đo tay: khoảng cách A–B chia cho số chu kỳ n → T, f (chỉ ở chế độ "Đo tay")
  lastMan = null;
  if (manual && frozen && !spec && cursors.length === 2) {
    const dt = (Math.abs(cursors[1] - cursors[0]) / canvas.width) * COLS * md;
    if (dt > 0) lastMan = { dt, T: dt / nCyc, f: (1000 * nCyc) / dt };
  }
  const fAuto = lastRes && lastRes.f ? lastRes.f : 0;
  const f = manual ? (lastMan ? lastMan.f : 0) : fAuto;   // số hiển thị chính theo cách đo đã chọn
  const T = f ? 1000 / f : 0;
  const spd = running ? (sr * md) / 1000 : 0;
  $('manCard').hidden = !manual;
  if (spec && info) {
    $('hudScale').textContent = t('hSpec', { df: info.df.toFixed(2) });
    $('hudTrig').textContent = fAuto ? `f₀ = ${fAuto.toFixed(1)} Hz` : 'FFT';
  } else {
    $('hudScale').textContent = running ? t('hGrid', { ms: md, spd: spd.toFixed(1), g: g.toFixed(1) }) : t('hGridIdle', { ms: md });
    $('hudTrig').textContent = !info ? t('hIdle') : info.locked ? t(frozen ? 'hFrozen' : 'hLock') : t('hWait');
  }
  $('hudTrig').classList.toggle('frozen', Boolean(frozen));
  $('trig').textContent = info && !spec ? t(info.locked ? 'trLock' : 'trFree') : '—';
  $('samplesPerDiv').textContent = running ? t('spdSub', { spd: spd.toFixed(1), sr, dt: (1000 / sr).toFixed(4) }) : t('spdIdle');

  $('freq').textContent = f ? f.toFixed(1) : '—';
  $('period').textContent = f ? T.toFixed(2) : '—';
  $('cells').textContent = f ? (T / md).toFixed(2) : '—';
  $('cellsFormula').textContent = f ? `${T.toFixed(2)} ms / ${md} ${t('msDiv')}` : t('cellsF');
  const ni = f ? noteInfo(f) : null;
  $('noteName').textContent = ni ? ni.name : '—';
  $('noteSub').textContent = ni ? t('noteSub', { c: (Math.round(ni.cents) > 0 ? '+' : '') + (Math.round(ni.cents) || 0), f: ni.hz.toFixed(2) }) : '—';

  $('manF').textContent = lastMan ? lastMan.f.toFixed(1) : '—';
  $('manSub').textContent = lastMan ? t('manSub', { dt: lastMan.dt.toFixed(2), n: nCyc, T: lastMan.T.toFixed(3) }) : t('manHint');

  // Độ tin cậy của phép đo
  let st = ['idle', t('clIdle')];
  if (running && manual) st = ['idle', t('clManual')];
  else if (running && lastRes !== undefined) {
    const pct = lastRes && lastRes.clarity !== undefined ? Math.round(lastRes.clarity * 100) : 0;
    st = !lastRes ? ['weak', t('clRange')]
      : lastRes.quiet ? ['quiet', t('clQuiet')]
      : lastRes.weak ? ['weak', t('clWeak', { p: pct })]
      : ['ok', t('clOk', { p: pct })];
  }
  $('clarityInfo').textContent = st[1];
  $('clarityInfo').dataset.state = st[0];

  $('info').textContent = running
    ? t('iRun', { src: srcLabel(), sr, ms: md, spd: spd.toFixed(1) }) + (frozen && !spec && manual ? t('iCur') : '')
    : t('iIdle');
  updatePlayer();
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  if (frozen) { updatePlayer(); return; }   // đang Freeze đồ thị nhưng nhạc vẫn chạy: cập nhật thanh tua
  analyser.getFloatTimeDomainData(buf);
  if ($('view').value === 'spec') analyser.getFloatFrequencyData(specBuf);
  if (now - lastFreqTime >= FREQ_EVERY_MS) {
    lastFreqTime = now;
    lastRes = estimateFundamental(buf, audioCtx.sampleRate);
  }
  refresh();
}

// Giải phóng đầy đủ: rAF, nguồn âm, MediaStream, AudioContext
function stop() {
  cancelAnimationFrame(rafId);
  rafId = 0;
  if (synth) { synth.stop(); synth = null; }
  if (stream) { stream.getTracks().forEach(tr => tr.stop()); stream = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  analyser = spkGain = buf = specBuf = null;
  eggSrc = eggVol = null;
  seeking = false;
  clearTimeout(eggTimer);
  runKind = '';
  frozen = null;
  lastRes = undefined;
  cursors = [];
  refresh();
}

// Thông báo lỗi micro dễ hiểu: HTTP thường, bị chặn quyền, không có micro...
function micError(err) {
  if (location.protocol === 'file:') return t('eFile');
  if (window.isSecureContext === false || !navigator.mediaDevices) return t('eSecure');
  const n = err && err.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return t('eDenied');
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return t('eNoMic');
  return t('eStart', { m: err && err.message });
}

// kindArg = 'none' để mở sẵn đồ thị mà chưa có nguồn nào (dùng cho tiếng Fumo)
async function start(kindArg) {
  if (starting) return;
  stop();
  $('msg').textContent = '';
  const kind = kindArg || $('source').value;
  if (kind === 'file' && !fileData) {
    $('msg').textContent = t('eNoFile');
    return;
  }
  starting = true;
  $('btn').disabled = $('source').disabled = true;   // tránh bấm Stop / đổi nguồn khi đang chờ quyền micro
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume().catch(() => {});   // gọi ngay trong cú bấm để iOS/Safari không giữ ở trạng thái suspended
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
    } else if (kind !== 'none') {
      sy = kind === 'file' ? await makeFileSource(ctx, fileData.slice(0)) : makeSynth(ctx, kind, pitch());
      sy.out.connect(an);
      sy.out.connect(spk);
    }
    await ctx.resume();
  } catch (err) {
    if (st) st.getTracks().forEach(tr => tr.stop());
    if (sy) sy.stop();
    ctx.close();
    $('msg').textContent = kind === 'mic' ? micError(err) : kind === 'file' ? t('eDecode') : t('eStart', { m: err.message });
    starting = false;
    $('btn').disabled = $('source').disabled = false;
    refresh();
    return;
  }
  audioCtx = ctx; analyser = an; spkGain = spk; synth = sy; stream = st; runKind = kind;
  buf = new Float32Array(an.fftSize);
  specBuf = new Float32Array(an.frequencyBinCount);
  autoG = 4;
  lastFreqTime = 0;
  starting = false;
  $('btn').disabled = $('source').disabled = false;
  setSpeaker();
  rafId = requestAnimationFrame(loop);
  refresh();
}

// Âm lượng chỉ ảnh hưởng tới LOA; đồ thị lấy tín hiệu trước bộ chỉnh này nên không đổi biên độ
const volFrac = () => Math.min(1, Math.max(0, Number($('volume').value) / 100));
function setSpeaker() {
  if (spkGain) spkGain.gain.value = $('speaker').checked && synth ? volFrac() * 0.5 : 0;   // 50% ≈ mức 0,25 như trước
  if (eggVol) eggVol.gain.value = volFrac() * 1.6;
  $('volVal').textContent = Math.round(volFrac() * 100) + '%';
}

// Thanh phát/tua cho nguồn file (kiểu trình phát nhạc): chỉ hiện khi đang chạy nguồn file
const mmss = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
function updatePlayer() {
  const on = Boolean(audioCtx && synth && synth.duration);
  $('player').hidden = !on;
  if (!on) return;
  const d = synth.duration;
  if (!seeking) $('seek').value = Math.round((synth.getTime() / d) * 1000);
  $('timeLbl').textContent = `${mmss(seeking ? (Number($('seek').value) / 1000) * d : synth.getTime())} / ${mmss(d)}`;
  $('playBtn').textContent = t(synth.isPlaying() ? 'bPauseAud' : 'bPlay');
}

function syncRef() {
  const kind = $('source').value;
  if (!refTouched) $('refHz').value = kind === 'mic' || kind === 'file' ? '' : pitch();
}

function syncSourceUI() {
  const kind = $('source').value;
  $('pitch').disabled = kind === 'mic' || kind === 'file';
  $('speaker').disabled = kind === 'mic';
  $('fileRow').hidden = kind !== 'file';
  syncRef();
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
    const sp = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(sp);
    frozen = { data: d, sr: audioCtx.sampleRate, spec: sp };
    lastRes = estimateFundamental(d, frozen.sr);
  }
  refresh();
}

function setTheme(name) {
  if (!['light', 'dark', 'fumo'].includes(name)) name = 'fumo';
  document.documentElement.dataset.theme = name;
  $('theme').value = name;
  try { localStorage.setItem('theme', name); } catch (e) { /* bỏ qua */ }
  readTheme();
  refresh();
}

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-label]').forEach(el => { el.label = t(el.dataset.i18nLabel); });
  Array.from($('scale').options).forEach(o => { o.text = `${o.value} ${t('msDiv')}`; });
  [['lang', 'langTip'], ['egg', 'eggTip'], ['seek', 'fSeek']].forEach(([id, key]) => {
    $(id).title = t(key);
    $(id).setAttribute('aria-label', t(key));
  });
  buildPitch();
  renderLog();
  refresh();
}

function setLang(l) {
  lang = l === 'en' ? 'en' : 'vi';
  $('lang').dataset.lang = lang;   // CSS chọn ảnh EN/VI theo thuộc tính này
  try { localStorage.setItem('lang', lang); } catch (e) { /* bỏ qua */ }
  applyLang();
}

// ===== Bảng đo kiểm định: f_tb và sai số tỉ đối δ =====
const delta = (f, ref) => (ref ? (Math.abs(f - ref) / ref) * 100 : null);
const fmt = (v, d = 2) => (v === null || v === undefined ? '—' : v.toFixed(d));
const logCells = (r, i) => [i + 1, r.src, fmt(r.ref), fmt(r.f), fmt(delta(r.f, r.ref)), fmt(r.fm), fmt(r.fm ? delta(r.fm, r.ref) : null)];

function addLog() {
  if (!(lastRes && lastRes.f)) { $('msg').textContent = t('eNoF'); return; }
  $('msg').textContent = '';
  logRows.push({ src: srcLabel(), ref: parseFloat($('refHz').value) || null, f: lastRes.f, fm: lastMan ? lastMan.f : null });
  if (logRows.length > MAX_LOG) logRows.shift();
  $('logPanel').open = true;
  renderLog();
}

function renderLog() {
  const body = $('logBody');
  body.textContent = '';
  logRows.forEach((r, i) => {
    const tr = body.insertRow();
    logCells(r, i).forEach(v => { tr.insertCell().textContent = v; });
  });
  const sum = $('logSummary');
  sum.className = 'logsum';
  if (!logRows.length) { sum.textContent = t('lgEmpty'); return; }
  const last = logRows[logRows.length - 1];
  if (!last.ref) { sum.textContent = t('lgNoRef'); return; }
  const grp = logRows.filter(r => r.ref === last.ref);
  const avg = grp.reduce((a, r) => a + r.f, 0) / grp.length;
  const d = delta(avg, last.ref);
  sum.textContent = t('lgSum', { n: grp.length, r: last.ref, f: avg.toFixed(2), d: d.toFixed(2), ok: t(d <= 5 ? 'lgOk' : 'lgNo') });
  sum.classList.add(d <= 5 ? 'ok' : 'fail');
}

function downloadCsv() {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['thNo', 'thSrc', 'thRef', 'thSoft', 'thDS', 'thHand', 'thDH'].map(k => t(k));
  const text = '\ufeff' + [head, ...logRows.map(logCells)].map(r => r.map(q).join(',')).join('\n');
  saveUrl(URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), 'bang-do-kiem-dinh.csv', true);
}

// Gắn <a> vào trang rồi mới click (Firefox cần); chỉ thu hồi URL sau khi trình duyệt đã bắt đầu tải
function saveUrl(url, name, revoke) {
  const a = document.createElement('a');
  a.download = name;
  a.href = url;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(url), 1500);
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
    g.fillText(t('snapTxt', { f: $('freq').textContent, T: $('period').textContent, c: $('cells').textContent, ms: $('scale').value, time: new Date().toLocaleString() }), 16, canvas.height + 44);
    saveUrl(c.toDataURL('image/png'), `dao-dong-ky-${Date.now()}.png`, false);
  } catch (err) {
    $('msg').textContent = t('eSnap', { m: err.message });
  }
}

$('btn').addEventListener('click', () => (audioCtx ? stop() : start()));
$('freeze').addEventListener('click', toggleFreeze);
$('scale').addEventListener('change', refresh);
$('gain').addEventListener('input', refresh);
$('nCyc').addEventListener('input', refresh);
$('view').addEventListener('change', () => { cursors = []; refresh(); });
$('measure').addEventListener('change', () => {
  cursors = [];
  try { localStorage.setItem('measure', $('measure').value); } catch (e) { /* bỏ qua */ }
  refresh();
});
$('source').addEventListener('change', () => {
  syncSourceUI();
  if ($('source').value === 'file') $('speaker').checked = true;   // nghe được file ngay khi chọn nguồn file
  if (audioCtx) start();
});
$('pitch').addEventListener('change', () => { if (synth) synth.setFreq(pitch()); syncRef(); });
$('speaker').addEventListener('change', setSpeaker);
$('volume').addEventListener('input', () => {
  try { localStorage.setItem('volume', $('volume').value); } catch (e) { /* bỏ qua */ }
  setSpeaker();
});
$('playBtn').addEventListener('click', () => {
  if (!synth || !synth.duration) return;
  if (synth.isPlaying()) synth.pause(); else synth.play();
  updatePlayer();
});
$('seek').addEventListener('input', () => { seeking = true; updatePlayer(); });          // đang kéo: chỉ cập nhật số
$('seek').addEventListener('change', () => {                                              // thả tay: mới tua thật
  if (synth && synth.duration) synth.seek((Number($('seek').value) / 1000) * synth.duration);
  seeking = false;
  updatePlayer();
});
$('theme').addEventListener('change', e => setTheme(e.target.value));
$('lang').addEventListener('click', () => setLang(lang === 'vi' ? 'en' : 'vi'));
$('refHz').addEventListener('input', () => { refTouched = $('refHz').value !== ''; });
$('logAdd').addEventListener('click', addLog);
$('logClear').addEventListener('click', () => { logRows.length = 0; renderLog(); });
$('logCsv').addEventListener('click', downloadCsv);
$('snap').addEventListener('click', snapshot);
$('autoGain').addEventListener('change', e => {
  // Tắt tự động: thanh trượt giữ lại giá trị đang dùng để hình không nhảy
  if (!e.target.checked) $('gain').value = Math.min(10, Math.max(0.5, Math.round(autoG * 2) / 2));
  refresh();
});
$('fileIn').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  fileData = await file.arrayBuffer();
  fileName = file.name;
  if (audioCtx && $('source').value === 'file') start();
});
// Easter egg (chỉ hiện ở theme FUMO): bấm hình → tiếng Fumo đi qua AnalyserNode nên HIỆN LÊN ĐỒ THỊ rồi tự Freeze
// (và vẫn nghe được qua loa). Nạp sẵn file; nếu không nạp được (vd. mở file://) thì phát âm thanh thường.
const eggAudio = new Audio('assets/fumo.wav');
const eggReady = fetch('assets/fumo.wav').then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).catch(() => null);

async function playEgg() {
  $('msg').textContent = '';
  const raw = await eggReady;
  if (!raw) {
    eggAudio.currentTime = 0;
    eggAudio.play().then(() => { $('msg').textContent = t('eEggGraph'); }).catch(() => { $('msg').textContent = t('eEgg'); });
    return;
  }
  if (starting) return;
  if (!audioCtx) await start('none');       // chưa chạy: mở đồ thị trống (không xin quyền micro)
  const ctx = audioCtx;
  if (!ctx) return;
  let audio;
  try { audio = await decode(ctx, raw.slice(0)); } catch (err) { $('msg').textContent = t('eEgg'); return; }
  if (audioCtx !== ctx) return;             // người dùng đã bấm Stop trong lúc giải mã
  if (frozen) { frozen = null; cursors = []; lastFreqTime = 0; refresh(); }   // đang Freeze thì thả ra để nghe/thấy lần phát mới
  if (eggSrc) { try { eggSrc.stop(); } catch (err) { /* đã dừng */ } }
  const src = ctx.createBufferSource();
  const out = ctx.createGain();
  const vol = ctx.createGain();             // âm lượng loa; đồ thị lấy tín hiệu trước nút này
  vol.gain.value = volFrac() * 1.6;
  src.buffer = audio;
  src.connect(out);
  out.connect(analyser);                    // lên đồ thị
  out.connect(vol);
  vol.connect(ctx.destination);             // ra loa (không phụ thuộc ô "Phát ra loa")
  eggVol = vol;
  src.onended = () => { src.disconnect(); out.disconnect(); vol.disconnect(); if (eggSrc === src) eggSrc = null; if (eggVol === vol) eggVol = null; };
  src.start();
  eggSrc = src;
  // Tự động Freeze đúng lúc tiếng to nhất để đồ thị đứng yên và hiện rõ dạng sóng
  clearTimeout(eggTimer);
  eggTimer = setTimeout(() => {
    if (audioCtx === ctx && !frozen) toggleFreeze();   // không dựa vào eggSrc: sóng có thể đã phát xong
  }, loudestMs(audio) + 40);
}

// Thời điểm (ms) kết thúc cửa sổ 50 ms có năng lượng lớn nhất của một AudioBuffer
function loudestMs(audio) {
  const d = audio.getChannelData(0);
  const win = Math.max(1, Math.round(audio.sampleRate * 0.05));
  let best = -1, at = 0;
  for (let i = 0; i + win <= d.length; i += win) {
    let e = 0;
    for (let j = i; j < i + win; j++) e += d[j] * d[j];
    if (e > best) { best = e; at = i + win; }
  }
  return (at / audio.sampleRate) * 1000;
}
$('egg').addEventListener('click', playEgg);
canvas.addEventListener('click', e => {
  if (!frozen || $('view').value === 'spec' || $('measure').value !== 'manual') return;
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) * canvas.width) / r.width;
  cursors = cursors.length >= 2 ? [x] : [...cursors, x];
  refresh();
});
window.addEventListener('resize', refresh);
window.addEventListener('pagehide', stop);

let savedTheme = 'fumo', savedLang = 'vi', savedMeasure = 'auto', savedVol = '50';
try {
  savedTheme = localStorage.getItem('theme') || savedTheme;
  savedLang = localStorage.getItem('lang') || savedLang;
  savedMeasure = localStorage.getItem('measure') || savedMeasure;
  savedVol = localStorage.getItem('volume') || savedVol;
} catch (e) { /* bỏ qua */ }
$('measure').value = savedMeasure === 'manual' ? 'manual' : 'auto';
$('volume').value = /^\d{1,3}$/.test(savedVol) ? Math.min(100, Number(savedVol)) : 50;
setSpeaker();
setTheme(savedTheme);
setLang(savedLang);   // dựng danh sách cao độ trước…
syncSourceUI();       // …rồi mới đồng bộ ô tần số chuẩn (tránh đọc danh sách rỗng)
