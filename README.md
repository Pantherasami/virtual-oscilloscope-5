# Virtual Oscilloscope / Dao động ký ảo — v2.0.0

**Language / Ngôn ngữ:** [English](#english) · [Tiếng Việt](#tiếng-việt)

![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0-blue.svg)

Demo: https://kusanagiasami.pages.dev/oscilloscope · Source: https://github.com/Pantherasami/virtual-oscilloscope-5

---

## English

A browser-based virtual oscilloscope for **Grade 11 Physics (Oscillations & Waves)** — Group 5 project. Plain HTML5, CSS and JavaScript; no libraries, no installation, free of charge.

### Features

- **Sources:** microphone, audio file (`.wav` / `.mp3`) or built-in test sounds (sine, square, triangle, sawtooth, flute, clarinet, trumpet, guitar, piano, violin, organ, voice /a/) at any note from C3 to C6, the six standard guitar strings, or 100 / 200 / 1000 Hz. Echo cancellation, noise suppression and auto gain are off for the microphone, and it is never routed to the speakers.
- **Waveform u(t)** on a 10 × 8 grid, time axis in **ms**, displacement in relative units, calibrated from the real `sampleRate` (`samples per div = sampleRate × ms/div / 1000`). Time base 1, 2, 5, 10, 20 ms/div; manual or automatic amplitude.
- **Rising-edge trigger** at u = 0 (hysteresis + sub-sample interpolation) so the wave stays still. **Pause / Resume** freezes the frame.
- **Period measurement, your choice:**
  - *Automatic* — fundamental frequency by normalized autocorrelation (NSDF) with parabolic interpolation; f, T = 1000/f, divisions per period, nearest note and cents, and a dashed 1T guide.
  - *Manual* — Pause, click two points A and B, enter the number of cycles n between them: T = Δt/n, f = n/Δt. The 1T guide is hidden so students measure on their own.
- **FFT spectrum** view with f₀ and harmonics. **Save PNG** of the graph.
- **Verification table:** reference f, software f, manual f, relative error δ = |f − f_ref| / f_ref × 100 %, average f_avg and a pass/fail verdict (≤ 5 %); up to 30 rows, CSV export.
- **File player:** play / pause and a seek bar (like a music site) for `.wav` / `.mp3` sources; the file loops.
- **Speaker volume** slider. It only affects what you hear; the graph is not changed.
- **Vietnamese / English** interface (icon button, top right) and **Light / Dark / FUMO** themes. In FUMO, click the Fumo figure: its sound is drawn on the scope and the scope freezes at the loudest moment.

### Run locally

Browsers allow the microphone only on `localhost` or `https` (on a phone, open the `https://` address). In PowerShell, inside the project folder:

```powershell
python -m http.server 8000
```

Then open http://localhost:8000. Test sounds and audio files also work from `file://`; the Fumo sound is then played without appearing on the graph.

### Quick guide

1. Choose a **Source** (microphone, file or test sound) and press **Record**. Allow the microphone if asked.
2. Pick a **Time base** so that 2–4 periods fit on screen. Keep **Auto amplitude** on, or set the gain by hand.
3. Read f, T and the note, or press **Pause** and measure by hand (choose *Manual* under "Period measurement").
4. To check accuracy: set the reference frequency, press **Log measurement** at least 3 times per source, read f_avg and δ, then **Download CSV**.
5. For a file: use the play button and the seek bar under the source list.

### Reading the screen

| Item | Meaning |
|---|---|
| f (Hz) / T (ms) | Fundamental frequency and period T = 1000 / f |
| One period on the grid | `T / (ms/div)`, to compare with your own count |
| Trigger | "Locked" = rising edge at u = 0 found; "Free" = none found, the wave may drift |
| Δt = 1/fs, samples/div | The real sample rate of your device — always check it |

### How it works

Latest 4096 samples → subtract the mean → NSDF for each lag τ → first peak ≥ 0.88 × the highest one (avoids harmonics) → parabolic interpolation → `f = sampleRate / τ`. If the highest peak is below 0.52 the signal counts as non-periodic and "—" is shown. Range: about 40–2500 Hz.

### Known limitations

- Quiet or non-periodic sounds (noise, several notes at once) give no frequency.
- Range about 40–2500 Hz. Quality depends on the microphone; OS-level noise suppression can distort the wave.
- Verified by simulation (error ≤ 0.6 % at 200–1000 Hz) and by scripted UI tests; please also test with real sources on your own devices.

### Project structure

```
LICENSE      GNU GPL v3.0
index.html   user interface
style.css    styling (including the EN/VI icon masks)
script.js    DSP, sample sounds, i18n, drawing, state and DOM
assets/      record.png, pause.png, fumo-small.png, fumo.wav
CHANGELOG.md bugs found and fixed in each version
```

### Versions

| Version | Content |
|---|---|
| v1.0.0 | Microphone, u(t) graph, frequency by zero-crossing count |
| v1.1.0 | NSDF + parabolic interpolation, ms/div, trigger, Freeze, 1T guide |
| v2.0.0 | Files and test sounds, manual/automatic measurement, verification table, FFT, notes, PNG, EN/VI, themes, volume, seekable player |

### License

This project is free software released under the **GNU General Public License v3.0**. You may use, study, share and modify it under the terms of that license; any distributed modified version must also be released under GPL-3.0 with its source code, and must keep the copyright and license notices. The software comes with **no warranty**. See the [`LICENSE`](LICENSE) file or <https://www.gnu.org/licenses/gpl-3.0.html>.

Copyright (C) 2026 Pantherasami.

---

## Tiếng Việt

Dao động ký ảo chạy trên trình duyệt cho môn **Vật lí 11 (Dao động & Sóng)** — Dự án nhóm 5. Viết bằng HTML5, CSS và JavaScript thuần, không cần thư viện, không cần cài đặt, miễn phí.

### Tính năng

- **Nguồn âm:** micro, file âm thanh (`.wav` / `.mp3`) hoặc âm mẫu có sẵn (sine, vuông, tam giác, răng cưa, sáo, clarinet, trumpet, guitar, piano, violin, organ, giọng /a/) ở mọi nốt từ Đô3 đến Đô6, sáu dây guitar chuẩn, hoặc 100 / 200 / 1000 Hz. Micro được tắt khử vọng, khử nhiễu, tự chỉnh âm lượng và không bao giờ nối ra loa.
- **Đồ thị u(t)** lưới 10 × 8, trục thời gian ghi **ms**, li độ theo đơn vị tương đối, quy đổi từ `sampleRate` thực tế (`mẫu/ô = sampleRate × ms/ô / 1000`). Thang 1, 2, 5, 10, 20 ms/ô; biên độ tự động hoặc chỉnh tay.
- **Trigger sườn lên** tại u = 0 (có hysteresis, nội suy dưới mẫu) để sóng đứng yên. **Tạm dừng / Tiếp tục** giữ khung hình.
- **Đo chu kì, tùy chọn:**
  - *Tự động* — tần số cơ bản bằng tự tương quan chuẩn hóa (NSDF) và nội suy parabol; hiển thị f, T = 1000/f, số ô một chu kì, nốt nhạc gần nhất kèm cent, vạch gióng 1T.
  - *Đo tay* — Tạm dừng, bấm hai điểm A và B, nhập số chu kì n giữa hai điểm: T = Δt/n, f = n/Δt. Vạch 1T được ẩn để học sinh tự đo.
- Chế độ xem **Phổ FFT** (đánh dấu f₀ và họa âm). **Lưu ảnh PNG** đồ thị.
- **Bảng đo kiểm định:** f chuẩn, f phần mềm, f đo tay, sai số tỉ đối δ = |f − f_chuẩn| / f_chuẩn × 100 %, f_tb và kết luận Đạt / Chưa đạt (≤ 5 %); tối đa 30 dòng, tải CSV.
- **Trình phát file:** nút phát / tạm dừng và thanh tua (như web nghe nhạc) cho nguồn `.wav` / `.mp3`; file phát lặp.
- Thanh **âm lượng loa**: chỉ đổi âm thanh nghe được, không đổi đồ thị.
- Giao diện **Tiếng Việt / English** (nút ảnh ở góc trên phải) và ba giao diện **Light / Dark / FUMO**. Ở FUMO, bấm hình Fumo: tiếng hiện lên đồ thị và đồ thị tự dừng đúng lúc tiếng to nhất.

### Chạy thử trên máy

Trình duyệt chỉ cho dùng micro trên `localhost` hoặc `https` (trên điện thoại hãy mở địa chỉ `https://`). Trong PowerShell, tại thư mục dự án:

```powershell
python -m http.server 8000
```

Rồi mở http://localhost:8000. Âm mẫu và file âm thanh dùng được cả khi mở từ `file://`; khi đó tiếng Fumo chỉ phát ra loa, không hiện lên đồ thị.

### Hướng dẫn sử dụng nhanh

1. Chọn **Nguồn** (micro, file hoặc âm mẫu) rồi bấm **Thu âm**. Cho phép micro nếu trình duyệt hỏi.
2. Chọn **Thang thời gian** để màn hình có khoảng 2–4 chu kì. Để **Tự động chỉnh biên độ** bật, hoặc chỉnh độ khuếch đại bằng tay.
3. Đọc f, T và nốt nhạc, hoặc bấm **Tạm dừng** rồi đo tay (chọn *Đo tay* ở mục "Cách đo chu kỳ").
4. Kiểm tra độ chính xác: nhập tần số chuẩn, bấm **Ghi lần đo** ít nhất 3 lần cho mỗi nguồn, đọc f_tb và δ, rồi **Tải CSV**.
5. Với file: dùng nút phát và thanh tua dưới ô chọn nguồn.

### Đọc số liệu trên màn hình

| Mục | Ý nghĩa |
|---|---|
| f (Hz) / T (ms) | Tần số cơ bản và chu kì T = 1000 / f |
| 1 chu kỳ trên lưới | `T / (ms/ô)`, để đối chiếu với số ô bạn tự đếm |
| Trigger | "Đã khóa" = đã tìm được sườn lên tại u = 0; "Tự do" = chưa tìm được, sóng có thể trôi |
| Δt = 1/fs, mẫu/ô | Tần số lấy mẫu thực tế của thiết bị — luôn kiểm tra |

### Nguyên lí thuật toán

4096 mẫu mới nhất → trừ giá trị trung bình → NSDF theo độ trễ τ → chọn đỉnh đầu tiên ≥ 0,88 × đỉnh cao nhất (tránh bắt nhầm họa âm) → nội suy parabol → `f = sampleRate / τ`. Nếu đỉnh cao nhất dưới 0,52 thì coi là không tuần hoàn và hiện "—". Phạm vi đo: khoảng 40–2500 Hz.

### Hạn chế đã biết

- Âm quá nhỏ hoặc không tuần hoàn (tiếng ồn, nhiều nốt cùng lúc) không cho ra tần số.
- Phạm vi khoảng 40–2500 Hz. Chất lượng phụ thuộc micro; khử nhiễu ở cấp hệ điều hành có thể làm méo sóng.
- Đã kiểm tra bằng mô phỏng (sai số ≤ 0,6 % ở 200–1000 Hz) và bằng kiểm thử giao diện tự động; hãy thử thêm với nguồn thật trên thiết bị của bạn.

### Cấu trúc dự án

```
LICENSE      GNU GPL v3.0
index.html   giao diện
style.css    kiểu dáng (gồm mặt nạ ảnh EN/VI)
script.js    DSP, âm mẫu, đa ngôn ngữ, vẽ đồ thị, trạng thái và DOM
assets/      record.png, pause.png, fumo-small.png, fumo.wav
CHANGELOG.md lỗi đã tìm và sửa ở từng phiên bản
```

### Phiên bản

| Phiên bản | Nội dung |
|---|---|
| v1.0.0 | Thu âm, đồ thị u(t), tần số bằng đếm điểm cắt trục hoành |
| v1.1.0 | NSDF + nội suy parabol, thang ms/ô, trigger, Freeze, vạch 1T |
| v2.0.0 | File và âm mẫu, đo tay/tự động, bảng đo kiểm định, FFT, nốt nhạc, PNG, EN/VI, giao diện, âm lượng, trình phát có thanh tua |

### Giấy phép

Dự án là phần mềm tự do, phát hành theo **GNU General Public License v3.0**. Bạn được dùng, nghiên cứu, chia sẻ và sửa đổi theo các điều khoản của giấy phép này; bản sửa đổi khi phát hành lại cũng phải theo GPL-3.0, kèm mã nguồn và giữ nguyên thông báo bản quyền và giấy phép. Phần mềm **không kèm bảo đảm nào**. Xem file [`LICENSE`](LICENSE) hoặc <https://www.gnu.org/licenses/gpl-3.0.html>.

Bản quyền (C) 2026 Pantherasami.
