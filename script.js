(() => {
  // ---------- Lấy các phần tử giao diện (theo id) ----------
  const canvas = document.getElementById('scope');
  const ctx = canvas.getContext('2d');
  const btn = document.getElementById('btn');
  const freqEl = document.getElementById('freq');
  const infoEl = document.getElementById('info');
  const msgEl = document.getElementById('msg');
  const gainEl = document.getElementById('gain');
  const gainVal = document.getElementById('gainVal');

  // ---------- Cấu hình ----------
  const W = canvas.width, H = canvas.height;
  const COLS = 10, ROWS = 8;     // số ô lưới ngang, dọc
  const MIN_RMS = 0.01;          // dưới ngưỡng này coi là im lặng
  const COLOR_TRACE = '#7cf2c4';
  const COLOR_GRID = '#26323a';
  const COLOR_AXIS = '#3d4d58';

  // ---------- Trạng thái ----------
  let audioCtx = null, analyser = null, stream = null, buffer = null;
  let rafId = null, running = false, lastFreqUpdate = 0;

  gainEl.addEventListener('input', () => {
    gainVal.textContent = Number(gainEl.value).toFixed(1);
  });

  // ---------- Vẽ lưới ----------
  function drawGrid() {
    ctx.fillStyle = '#0b0f12';
    ctx.fillRect(0, 0, W, H);

    ctx.lineWidth = 1;
    ctx.strokeStyle = COLOR_GRID;
    ctx.beginPath();
    for (let i = 0; i <= COLS; i++) {
      const x = Math.round(i * W / COLS) + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    for (let j = 0; j <= ROWS; j++) {
      const y = Math.round(j * H / ROWS) + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();

    // trục hoành (u = 0) đậm hơn
    ctx.strokeStyle = COLOR_AXIS;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
    ctx.stroke();
  }

  // ---------- Vẽ sóng u(t) ----------
  function drawWave(data, gain) {
    drawGrid();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR_TRACE;
    ctx.shadowColor = COLOR_TRACE;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    const n = data.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * W;
      let y = H / 2 - data[i] * gain * (H / 2);
      y = Math.max(0, Math.min(H, y));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ---------- Zero-crossing ----------
  // Đếm các lần tín hiệu đi từ âm sang dương (cắt trục hoành theo chiều dương).
  // Khoảng giữa lần cắt đầu và lần cắt cuối chứa (count - 1) chu kì.
  function estimateFrequency(data, sampleRate) {
    let first = -1, last = -1, count = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i - 1] < 0 && data[i] >= 0) {
        // nội suy tuyến tính để biết vị trí cắt chính xác hơn (đơn vị: mẫu)
        const pos = (i - 1) + (0 - data[i - 1]) / (data[i] - data[i - 1]);
        if (first < 0) first = pos;
        last = pos;
        count++;
      }
    }
    if (count < 2) return null;
    const periods = count - 1;
    const seconds = (last - first) / sampleRate;
    return periods / seconds;
  }

  function rms(data) {
    let s = 0;
    for (let i = 0; i < data.length; i++) s += data[i] * data[i];
    return Math.sqrt(s / data.length);
  }

  // ---------- Vòng lặp vẽ ----------
  function loop(now) {
    if (!running) return;
    analyser.getFloatTimeDomainData(buffer);
    drawWave(buffer, Number(gainEl.value));

    if (now - lastFreqUpdate > 250) {       // cập nhật số mỗi 0,25 s cho dễ đọc
      lastFreqUpdate = now;
      if (rms(buffer) < MIN_RMS) {
        freqEl.textContent = '—';
      } else {
        const f = estimateFrequency(buffer, audioCtx.sampleRate);
        freqEl.textContent = f ? f.toFixed(1) : '—';
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  // ---------- Micro ----------
  async function start() {
    msgEl.textContent = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      msgEl.textContent = 'Trình duyệt không hỗ trợ micro. Hãy mở trang qua http://localhost hoặc https.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,   // tắt xử lí để giữ nguyên dạng sóng
          noiseSuppression: false,
          autoGainControl: false
        }
      });
    } catch (err) {
      msgEl.textContent = err.name === 'NotAllowedError'
        ? 'Bạn chưa cho phép dùng micro. Bấm vào biểu tượng ổ khóa trên thanh địa chỉ để cấp quyền.'
        : 'Không mở được micro: ' + err.message;
      return;
    }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);          // không nối ra loa để tránh hú
    buffer = new Float32Array(analyser.fftSize);

    infoEl.textContent = 'Tần số lấy mẫu ' + audioCtx.sampleRate + ' Hz, ' + analyser.fftSize + ' mẫu/khung';
    running = true;
    btn.textContent = 'Tắt micro';
    btn.classList.add('on');
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (audioCtx) audioCtx.close();
    stream = audioCtx = analyser = null;
    btn.textContent = 'Bật micro';
    btn.classList.remove('on');
    freqEl.textContent = '—';
    infoEl.textContent = 'Chưa thu âm';
    drawGrid();
  }

  btn.addEventListener('click', () => (running ? stop() : start()));
  drawGrid();
})();
