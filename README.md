# Virtual Oscilloscope / Dao động ký ảo — v1.1.0

**Language / Ngôn ngữ:** [English](#english) · [Tiếng Việt](#tiếng-việt)

![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0-blue.svg)

Demo: https://kusanagiasami.pages.dev/oscilloscope · Source: https://github.com/Pantherasami/virtual-oscilloscope-5

---

## English

A browser-based virtual oscilloscope for **Grade 11 Physics (Oscillations & Waves)** — Group 5 project.
Built with plain HTML5, CSS and JavaScript. No libraries or installation needed.

### Features (v1.1.0)

- **Microphone input** via the Web Audio API (`getUserMedia` + `AnalyserNode`). Echo cancellation, noise suppression and auto gain are turned off so the signal stays as raw as possible. The microphone is never routed to the speakers.
- **Displacement–time graph u(t)** on an HTML5 Canvas with a 10 × 8 grid and fine tick marks on both axes.
- **Calibrated time base (ms/div)**: 1, 2, 5, 10 and 20 ms/div, converted from the real `sampleRate` (44.1 kHz or 48 kHz):
  `samples per div = sampleRate × ms/div / 1000`.
- **Rising-edge trigger** at u = 0, with hysteresis against noise and sub-sample interpolation, so the waveform stays still on screen.
- **Freeze / Run**: keeps a copy of the buffer. While frozen you can still change the time base and gain; the graph and the cell count update on the frozen frame.
- **Fundamental frequency f (Hz)** using normalized autocorrelation (NSDF) with parabolic interpolation. It is much more stable for guitar, flute and voice than zero-crossing counting.
- **Period T = 1000 / f (ms)** and the **number of horizontal divisions per period** `T / (ms/div)`, shown next to f.
- **1T guide line** (dashed, labelled `1T = … ô`) drawn on the graph when the trigger is locked.
- Status indicators for **Run / Freeze**, trigger state (locked / free), samples per division and the real `sampleRate`.

### Run locally

Browsers only allow microphone access on `localhost` or `https`, so do not open `index.html` directly with `file://`.

In PowerShell, inside the project folder:

```powershell
python -m http.server 8000
```

Then open http://localhost:8000 and allow microphone access.

### User guide

**What you need:** a computer or phone with a microphone, and a recent browser (Chrome, Edge, Firefox, Safari). Open the page through `https` or `localhost`.

**Step by step**
1. Open the page and click **Bật micro** (Start microphone). Allow microphone access when the browser asks.
2. Make a steady sound close to the microphone: a flute, a guitar string, a tone-generator app on a phone, or a sustained "aaa".
3. The green waveform appears. If the trigger is locked, the wave stays still and a dashed `1T` line appears.
4. Choose **Thang thời gian (ms/ô)** so that 2–4 periods fit on screen.
5. Adjust **Độ khuếch đại (biên độ)** until the wave fills about half of the screen height.
6. Click **Dừng hình (Freeze)** to hold the frame. Count the horizontal divisions of one period.
7. Compare with the readout cards: f (Hz), T = 1000 / f (ms) and the number of divisions per period.
8. Click **Chạy tiếp (Run)** to resume, or **Tắt micro** to stop.

**Controls**

| Control | What it does |
|---|---|
| Bật micro / Tắt micro | Starts or stops microphone capture |
| Dừng hình (Freeze) / Chạy tiếp (Run) | Holds or resumes the display; the screen border turns orange while frozen |
| Thang thời gian (ms/ô) | Time per horizontal division: 1, 2, 5, 10 or 20 ms/div (whole screen = 10 divisions) |
| Độ khuếch đại (biên độ) | Vertical gain 0.5× to 10×; it changes only how tall the wave is drawn |

**Reading the screen**

| Item | Meaning |
|---|---|
| f (Hz) | Fundamental frequency, with the NSDF clarity below it |
| T = 1000 / f (ms) | Period calculated from f |
| Divisions per period | `T / (ms/div)`, to compare with your own count on the grid |
| Trigger | "Đã khóa" = locked on a rising edge at u = 0; "Tự do" = no trigger found, the wave may drift |
| Dashed `1T` line | One period measured from the left edge of the screen |

**Worked examples**
- A 100 Hz tone has T = 10 ms. At 5 ms/div one period is 2 divisions, and the screen shows 5 periods.
- A 440 Hz tone has T ≈ 2.27 ms. At 1 ms/div one period is about 2.27 divisions.
- Your own count: if one period spans `n` divisions at `t` ms/div, then `T = n × t` and `f = 1000 / T`.

**Troubleshooting**

| Problem | What to try |
|---|---|
| Browser says the microphone is blocked | Open the page via `localhost` or `https`, then allow the microphone in the address-bar permissions |
| f shows "—" | Sound is too quiet or not periodic: move closer, play one steady note, reduce background noise |
| Wave drifts, trigger shows "Tự do" | Raise the gain a little, or make the sound louder and steadier |
| f jumps by an octave | Play a cleaner, steadier note and lower the background noise |
| Wave looks distorted | Turn off noise suppression or "enhancements" in the operating system's microphone settings |

### How the algorithms work

**Fundamental frequency**
1. Take the latest 4096 samples and subtract their mean (DC offset removal).
2. Compute the normalized square-difference function (NSDF) for each lag τ.
3. Take one peak from each positive region of the NSDF. Pick the **first peak that reaches at least 0.88 × the highest peak**, which avoids locking onto a higher harmonic.
4. Refine the lag with a 3-point parabolic interpolation, then `f = sampleRate / τ`.
5. If the highest peak is below 0.52, the signal is treated as non-periodic and "—" is shown.

Current measuring range: about 40 Hz to 2500 Hz.

**Trigger.** The buffer is scanned for the most recent upward zero crossing. A crossing only counts after the signal has gone below a negative threshold (hysteresis); its position is then found by linear interpolation between samples.

### Known limitations

- Very quiet or non-periodic sounds (noise, several notes at once) give no frequency reading.
- Measuring range is about 40–2500 Hz.
- Quality depends on the microphone and on device audio settings. OS-level noise suppression can distort the waveform.
- No custom UI design, two-channel mode or amplitude in physical units yet (planned for later versions).

### Project structure

```
LICENSE      GNU GPL v3.0
index.html   user interface
style.css    styling
script.js    audio capture, trigger, autocorrelation, drawing
README.md    this file
```

### Versions

| Version | Content |
|---|---|
| v1.0.0 | Microphone input, u(t) graph, frequency by zero-crossing count |
| v1.1.0 | NSDF + parabolic interpolation, ms/div time base, rising-edge trigger, Freeze/Run, T and division readout, 1T guide line |
| v2.0.0 | Planned: major architecture and interface changes |

### License

This project is free software released under the **GNU General Public License v3.0**. You may use, study, share and modify it under the terms of that license; any distributed modified version must also be released under GPL-3.0 with its source code, and must keep the copyright and license notices. The software comes with **no warranty**. See the [`LICENSE`](LICENSE) file or <https://www.gnu.org/licenses/gpl-3.0.html>.

Copyright (C) 2026 Pantherasami.

---

## Tiếng Việt

Dao động ký ảo chạy trên trình duyệt cho môn **Vật lí 11 (Dao động & Sóng)** — Dự án nhóm 5.
Viết bằng HTML5, CSS và JavaScript thuần, không cần thư viện hay cài đặt gì thêm.

### Tính năng (v1.1.0)

- **Thu âm** bằng Web Audio API (`getUserMedia` + `AnalyserNode`), tắt khử vọng, khử nhiễu và tự chỉnh âm lượng để tín hiệu thô nhất có thể. Micro không được nối ra loa.
- **Đồ thị li độ – thời gian u(t)** trên Canvas, lưới 10 × 8 ô, có vạch chia nhỏ trên hai trục.
- **Thang thời gian chuẩn (ms/ô)**: 1, 2, 5, 10, 20 ms/ô, quy đổi từ `sampleRate` thực tế (44,1 kHz hoặc 48 kHz):
  `mẫu/ô = sampleRate × ms/ô / 1000`.
- **Trigger sườn lên** tại u = 0 (có hysteresis chống nhiễu, nội suy dưới mẫu) để sóng đứng yên trên màn hình.
- **Dừng hình (Freeze / Run)**: giữ lại một bản sao bộ đệm. Khi đang dừng vẫn đổi được thang ms/ô và độ khuếch đại, đồ thị và số ô cập nhật theo.
- **Tần số cơ bản f (Hz)** bằng tự tương quan chuẩn hóa (NSDF) và nội suy parabol, ổn định hơn nhiều so với đếm điểm cắt trục hoành khi đo tiếng đàn, sáo, giọng nói.
- **Chu kì T = 1000 / f (ms)** và **số ô ngang của một chu kì** `T / (ms/ô)`, hiển thị song song với f.
- **Vạch gióng 1T** (nét đứt, kèm nhãn `1T = … ô`) vẽ trên đồ thị khi trigger đã khóa.
- Thanh trạng thái **Run / Freeze**, trạng thái trigger (`Đã khóa` / `Tự do`), số mẫu/ô và `sampleRate` thực tế.

### Chạy thử trên máy

Trình duyệt chỉ cho phép dùng micro trên `localhost` hoặc `https`, nên không mở trực tiếp file `index.html` bằng `file://`.

Trong PowerShell, tại thư mục dự án:

```powershell
python -m http.server 8000
```

Rồi mở http://localhost:8000 và cho phép trình duyệt dùng micro.

### Hướng dẫn sử dụng (HDSD)

**Cần chuẩn bị:** máy tính hoặc điện thoại có micro, trình duyệt mới (Chrome, Edge, Firefox, Safari). Mở trang qua `https` hoặc `localhost`.

**Các bước**
1. Mở trang, bấm **Bật micro** và cho phép trình duyệt dùng micro.
2. Tạo âm thanh đều gần micro: sáo, dây đàn, ứng dụng phát tần số trên điện thoại, hoặc ngân dài "aaa".
3. Sóng màu xanh xuất hiện. Khi trigger đã khóa, sóng đứng yên và có vạch nét đứt `1T`.
4. Chọn **Thang thời gian (ms/ô)** sao cho màn hình có khoảng 2–4 chu kì.
5. Chỉnh **Độ khuếch đại (biên độ)** để sóng cao khoảng nửa màn hình.
6. Bấm **Dừng hình (Freeze)** để giữ khung hình, rồi đếm số ô ngang của một chu kì.
7. So sánh với các ô kết quả: f (Hz), T = 1000 / f (ms) và số ô ngang của một chu kì.
8. Bấm **Chạy tiếp (Run)** để tiếp tục, hoặc **Tắt micro** để dừng.

**Các nút điều khiển**

| Điều khiển | Tác dụng |
|---|---|
| Bật micro / Tắt micro | Bắt đầu hoặc dừng thu âm |
| Dừng hình (Freeze) / Chạy tiếp (Run) | Giữ hoặc tiếp tục hình; viền màn hình chuyển màu cam khi đang dừng |
| Thang thời gian (ms/ô) | Thời gian ứng với mỗi ô ngang: 1, 2, 5, 10 hoặc 20 ms/ô (cả màn hình = 10 ô) |
| Độ khuếch đại (biên độ) | Khuếch đại theo chiều dọc từ 0,5× đến 10×, chỉ đổi độ cao của sóng khi vẽ |

**Đọc số liệu trên màn hình**

| Mục | Ý nghĩa |
|---|---|
| f (Hz) | Tần số cơ bản, kèm độ rõ NSDF bên dưới |
| T = 1000 / f (ms) | Chu kì tính từ f |
| Số ô ngang của một chu kì | `T / (ms/ô)`, để đối chiếu với số ô bạn tự đếm trên lưới |
| Trigger | "Đã khóa" = đã khóa sườn lên tại u = 0; "Tự do" = chưa tìm được trigger, sóng có thể trôi |
| Vạch nét đứt `1T` | Độ dài một chu kì tính từ mép trái màn hình |

**Ví dụ minh họa**
- Âm 100 Hz có T = 10 ms. Ở 5 ms/ô, một chu kì chiếm 2 ô và cả màn hình có 5 chu kì.
- Âm 440 Hz có T ≈ 2,27 ms. Ở 1 ms/ô, một chu kì chiếm khoảng 2,27 ô.
- Tự đo: nếu một chu kì chiếm `n` ô ở thang `t` ms/ô thì `T = n × t` và `f = 1000 / T`.

**Xử lí sự cố**

| Sự cố | Cách xử lí |
|---|---|
| Trình duyệt báo micro bị chặn | Mở trang qua `localhost` hoặc `https`, rồi cho phép micro ở biểu tượng quyền cạnh thanh địa chỉ |
| f hiện "—" | Âm quá nhỏ hoặc không tuần hoàn: lại gần micro, giữ một nốt đều, giảm tiếng ồn nền |
| Sóng trôi, trigger "Tự do" | Tăng độ khuếch đại một chút, hoặc tạo âm to và đều hơn |
| f nhảy lên gấp đôi hoặc giảm một nửa | Dùng nốt sạch và đều hơn, giảm tiếng ồn nền |
| Sóng bị méo | Tắt khử nhiễu hoặc "cải thiện âm thanh" trong cài đặt micro của hệ điều hành |

### Nguyên lí thuật toán

**Tìm tần số cơ bản**
1. Lấy 4096 mẫu mới nhất và trừ đi giá trị trung bình (khử thành phần một chiều).
2. Tính hàm tự tương quan chuẩn hóa (NSDF) theo độ trễ τ.
3. Mỗi vùng dương của NSDF lấy một đỉnh. Chọn **đỉnh đầu tiên đạt ít nhất 0,88 × đỉnh cao nhất** để tránh bắt nhầm họa âm bậc cao.
4. Nội suy parabol qua 3 điểm lân cận để có độ trễ dưới mẫu rồi tính `f = sampleRate / τ`.
5. Nếu đỉnh cao nhất dưới 0,52 thì coi tín hiệu không tuần hoàn và hiện "—".

Phạm vi đo hiện tại: khoảng 40 Hz đến 2500 Hz.

**Trigger.** Quét bộ đệm tìm lần cắt trục hoành đi lên gần nhất. Điểm cắt chỉ được chấp nhận sau khi tín hiệu đã xuống dưới ngưỡng âm (hysteresis), rồi nội suy tuyến tính để xác định vị trí dưới mẫu.

### Hạn chế đã biết

- Âm quá nhỏ hoặc không tuần hoàn (tiếng ồn, nhiều nốt cùng lúc) sẽ không cho ra tần số.
- Đo trong khoảng khoảng 40–2500 Hz.
- Chất lượng phụ thuộc micro và cài đặt âm thanh của thiết bị. Khử nhiễu ở cấp hệ điều hành có thể làm méo sóng.
- Chưa có giao diện thiết kế riêng, chưa có chế độ hai kênh hay đo biên độ theo đơn vị vật lí (dành cho các phiên bản sau).

### Cấu trúc dự án

```
LICENSE      GNU GPL v3.0
index.html   giao diện
style.css    kiểu dáng
script.js    thu âm, trigger, tự tương quan, vẽ đồ thị
README.md    tài liệu này
```

### Phiên bản

| Phiên bản | Nội dung |
|---|---|
| v1.0.0 | Thu âm, đồ thị u(t), tần số bằng đếm điểm cắt trục hoành |
| v1.1.0 | NSDF + nội suy parabol, thang ms/ô, trigger sườn lên, Freeze/Run, hiển thị T và số ô, vạch gióng 1T |
| v2.0.0 | Dự kiến: thay đổi kiến trúc và giao diện lớn |

### Giấy phép

Dự án là phần mềm tự do, phát hành theo **GNU General Public License v3.0**. Bạn được dùng, nghiên cứu, chia sẻ và sửa đổi theo các điều khoản của giấy phép này; bản sửa đổi khi phát hành lại cũng phải theo GPL-3.0, kèm mã nguồn và giữ nguyên thông báo bản quyền và giấy phép. Phần mềm **không kèm bảo đảm nào**. Xem file [`LICENSE`](LICENSE) hoặc <https://www.gnu.org/licenses/gpl-3.0.html>.

Bản quyền (C) 2026 Pantherasami.

---

## v2.0.0-alpha.2

- **VI:** Giao diện "Virtual Oscilloscope" với 3 chế độ **Light / Dark / FUMO** (nền `#c4dadb`); đồ thị ưu tiên lưới 10×8; âm mẫu (sine 100/200/440 Hz, nốt C4–C5, sáo, guitar, giọng /a/) có thể phát ra loa; hiển thị độ tin cậy phép đo (quá nhỏ / chu kỳ yếu / đã khóa); khi Freeze bấm vào đồ thị để đặt con trỏ A/B đo Δ; nút **Lưu ảnh PNG**.
- **EN:** "Virtual Oscilloscope" UI with **Light / Dark / FUMO** themes, built-in test tones and instrument samples (optionally routed to the speaker), measurement-reliability cues, A/B cursors while frozen, and PNG snapshot.

| File | Vai trò / Role |
|---|---|
| `index.html` | Giao diện / page layout |
| `style.css` | Giao diện Light / Dark / FUMO / themes and layout |
| `script.js` | Một tệp, chia khối theo thứ tự: DSP (NSDF, parabol, trigger) → âm mẫu → vẽ canvas → trạng thái và DOM / one file, sections in order: DSP → samples → canvas → state and DOM |
| `assets/` | `record.png`, `pause.png`, `fumo-small.png` |

Dùng script thường (không ES module) nên mở được từ `file://`; micro vẫn cần `localhost` hoặc HTTPS. / Plain script (no ES modules); the microphone still needs `localhost` or HTTPS.

