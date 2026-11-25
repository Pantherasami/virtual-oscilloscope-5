# Changelog

## v2.0.0 — bản chính thức / official release

Gộp toàn bộ v2.0.0-beta.1 → beta.4 (xem các mục bên dưới) và thêm:

### Thêm / Added
- **Thanh âm lượng loa** (0–100%, lưu trong trình duyệt). Chỉ đổi âm thanh nghe được, đồ thị lấy tín hiệu trước bộ chỉnh nên không đổi; áp dụng cho âm mẫu, file và tiếng Fumo.
- **Trình phát cho nguồn file `.wav/.mp3`** kiểu web nghe nhạc: nút **Phát / Tạm dừng phát**, **thanh tua** kéo được, hiển thị thời gian `m:ss / m:ss`, file vẫn phát lặp. Kéo thanh chỉ cập nhật số, thả tay mới tua thật; tua khi đang tạm dừng thì giữ nguyên trạng thái dừng; vẫn cập nhật khi đồ thị đang Freeze. Chọn nguồn file tự bật "Phát ra loa" để nghe được.
- Viết lại `README.md` cho đúng v2 (trước đó phần hướng dẫn còn mô tả v1.1.0).

### Đã kiểm tra / Verified
- 67 kiểm tra luồng bằng giả lập (gồm âm lượng 0/50/100%, đồ thị lấy tín hiệu trước nút âm lượng, tua tới 30 s / 15 s, tạm dừng–tiếp tục giữ vị trí, thời gian không chạy khi tạm dừng, thanh tua vẫn chạy khi Freeze). Tần số: 1020 phép thử mô phỏng, sai số lớn nhất ở 200–1000 Hz là 0,58%.
- **Chưa thử trên trình duyệt và thiết bị thật** — nên chạy thử Chrome/Edge, Firefox và một điện thoại (HTTPS) trước khi nộp.

## v2.0.0-beta.4

### Thêm / Added
- **Tùy chọn "Cách đo chu kỳ": Tự động / Đo tay** (ô trong bảng Thang đo, lưu trong trình duyệt).
  - *Tự động*: f, T, số ô và nốt nhạc lấy từ phần mềm (NSDF), có vạch gióng 1T; thẻ "Đo tay" được ẩn.
  - *Đo tay*: Tạm dừng rồi bấm 2 điểm A, B; T = Δt/n, f = n/Δt hiện ở các thẻ chính và thẻ "Đo tay"; ẩn vạch 1T để học sinh tự đo. Bảng đo kiểm định vẫn ghi f phần mềm, và ghi thêm f đo tay khi ở chế độ này.
- **Bấm hình Fumo tự động Freeze** đúng lúc tiếng to nhất (cửa sổ 50 ms có năng lượng lớn nhất), để đồ thị đứng yên và hiện rõ dạng sóng; bấm lại để phát và dừng hình lần nữa, bấm Tiếp tục để thả ra.

### Đã kiểm tra / Verified
- 48 kiểm tra luồng bằng giả lập (gồm Fumo tự Freeze, phát lại, chuyển chế độ đo, tính f/T từ con trỏ: 100 px ↔ 5 ms → 200 Hz, n = 2 → 400 Hz). Chưa thử trên trình duyệt và thiết bị thật.

## v2.0.0-beta.3

### Thêm / Added
- **Nút ngôn ngữ EN/VI dạng ảnh** thay ô chọn: bấm để đổi, lưu trong trình duyệt. Ảnh PNG được dùng làm mặt nạ (mask) nên **đổi màu theo màu chữ của theme** (FUMO đỏ thẫm, Light đen, Dark xanh lá); phần trong suốt = ngôn ngữ đang chọn. Ảnh nhúng dạng data URI (≈ 4 KB mỗi ảnh) nên chạy được cả khi mở `file://`; có `title`/`aria-label` và viền focus khi dùng bàn phím.
- **Bấm hình Fumo → tiếng hiện lên đồ thị.** Tiếng đi qua `AnalyserNode` (trước đó phát bằng thẻ `Audio` nên đồ thị không thấy gì) và vẫn ra loa. Chưa chạy: tự mở đồ thị trống, không xin quyền micro; đang chạy nguồn khác: trộn thêm; đang Freeze: thả ra để thấy tiếng mới; bấm Stop lúc đang giải mã thì không mở lại. Không nạp được file (vd. `file://`): phát âm thanh thường và báo rõ.
- Thông báo lỗi micro dễ hiểu (bị chặn quyền, không có micro, trang không phải HTTPS).

### Lỗi đã tìm và sửa / Bugs found and fixed
1. **Tiếng Fumo không lên đồ thị** vì không đi qua bộ phân tích (xem trên).
2. **Mở bằng `http://` địa chỉ mạng LAN (điện thoại trong lớp) báo lỗi khó hiểu**: `navigator.mediaDevices` không tồn tại nên sinh `TypeError` rồi hiện thông báo thô. Nay báo cần HTTPS/localhost và gợi ý dùng âm mẫu.
3. **Ô "Tần số chuẩn" bị điền `0` sau khi tải lại trang** khi trình duyệt khôi phục lựa chọn nguồn (vd. Sine): `syncSourceUI()` chạy trước khi dựng danh sách cao độ nên đọc giá trị rỗng. Nay dựng danh sách trước; tái hiện bằng giả lập: bản cũ `"0"`, bản mới `"440"`.
4. **Chữ lỗi `#b00020` khó đọc ở theme Dark** (độ tương phản 2,4–2,7 : 1, dưới ngưỡng 4,5 : 1). Nay dùng biến `--err` (Dark: `#ff7a86`, 7,1 : 1).
5. **Tải CSV/PNG có thể không chạy trên Firefox/Safari**: thẻ `<a>` không gắn vào trang và URL bị thu hồi ngay sau `click()`. Nay gắn vào trang, thu hồi sau 1,5 s. *(Sửa theo hành vi đã biết của trình duyệt, chưa thử trên Firefox/Safari thật.)*
6. **iOS/Safari**: `AudioContext.resume()` nay gọi ngay trong cú bấm thay vì chỉ sau khi chờ quyền micro. *(Biện pháp phòng ngừa, chưa thử trên iPhone thật.)*
7. Chú thích `AC_MAXLAG` ghi sai "~23,4 Hz" (giới hạn thật là 40 Hz theo `F_MIN`).

### Đã kiểm tra / Verified
- 1020 phép thử dò tần số (17 tần số 82–2000 Hz × 44,1/48/96/16 kHz × sine, vuông, răng cưa, họa âm 2, họa âm 3 × 3 mức nhiễu, có DC): ở 200–1000 Hz sai số lớn nhất 0,58% (yêu cầu ≤ 5%). 9 ca lệch còn lại đều là 1500 Hz ở 16 kHz, do chính tín hiệu thử bị răng cưa (họa âm vượt tần số Nyquist), không phải lỗi mã.
- 35 kiểm tra luồng bằng giả lập (jsdom + Web Audio giả): đổi ngôn ngữ/theme, Fumo khi chưa chạy / đang Freeze / đang chạy Sine / bấm Stop giữa chừng, lỗi micro, ghi bảng đo, tải CSV và PNG, không có ngoại lệ.
- **Chưa thử trên trình duyệt và thiết bị thật** (kể cả hiển thị nút EN/VI bằng CSS mask; mặt nạ đã được xem thử bằng ảnh dựng lại).

## v2.0.0-beta.2

### Thêm để đáp ứng yêu cầu dự án / Added
- **Giao diện Tiếng Việt / English** (nút chuyển ngôn ngữ, lưu trong trình duyệt).
- **Nguồn từ file âm thanh** `.wav/.mp3`, phát lặp, giải mã theo tần số lấy mẫu thực tế.
- **Trục hoành tính bằng ms** (kèm tiêu đề `t (ms)`), nhãn trục tung `u = ±…` và ghi chú "đơn vị tương đối".
- **Đo tay A–B với số chu kỳ n**: T = Δt/n, f = n/Δt, đọc ngay trên đồ thị và ở thẻ "Đo tay A–B".
- **Bảng đo kiểm định**: f chuẩn (tự điền khi dùng âm mẫu), f phần mềm, f đo tay, δ, f_tb và kết luận Đạt/Chưa đạt (≤ 5%), tối đa 30 dòng, xuất CSV.
- **Chế độ xem Phổ FFT** (đánh dấu f₀ và các họa âm; giữ nguyên khi Freeze).
- **Nhận diện nốt nhạc** gần nhất, kèm độ lệch cent.
- Danh sách cao độ theo bảng tần số chuẩn: 12 nốt quãng 3–5 (tên Đô, Rê, Mi, Fa, Son, La, Si và C–B), Đô6, 6 dây guitar chuẩn, 100/200/1000 Hz.
- Hiển thị Δt = 1/fs và số mẫu/ô để kiểm tra tần số lấy mẫu thực tế.

### Lỗi đã tìm và sửa / Bugs found and fixed
1. **Trigger không khóa và sóng bị vẽ lệch trục khi tín hiệu có thành phần một chiều (DC) lớn hơn biên độ.** Tái hiện: sine 440 Hz biên độ 0,05 cộng DC 0,1 → tần số vẫn đo đúng nhưng trigger luôn "Tự do". Micro thật (nhất là micro điện thoại/USB) thường có DC. Nay bỏ DC trước khi tìm trigger và vẽ.
2. **Thẻ nốt nhạc có thể hiện "-0 cent".** Phát hiện khi chạy thử luồng đầy đủ; nay làm tròn và không hiện dấu âm cho 0.
3. **README ghi độ khuếch đại 0,5×–10×** trong khi chế độ tự động có thể lên tới 50×. Đã cập nhật.

### Đã kiểm tra / Verified
- 576 phép thử dò tần số (mọi âm sắc × nốt × 44,1 và 48 kHz): sai số < 0,5%.
- 90 phép thử với nhiễu, DC, họa âm và biên độ nhỏ ở 200–1000 Hz: sai số lớn nhất 0,29% (yêu cầu ≤ 5%).
- Chạy thử toàn bộ luồng bằng môi trường giả lập: Record, Phổ FFT, Freeze, con trỏ A/B, bảng đo, CSV, đổi ngôn ngữ, mở file, micro và giải phóng tài nguyên, không có ngoại lệ.
- Chưa thử trên trình duyệt và thiết bị thật.

## v2.0.0-beta.1

### Thêm / Added
- Bố cục mới: đồ thị ưu tiên bên trái, bảng Test và Thang đo bên phải (xếp dọc trên điện thoại).
- Viên thuốc phiên bản đổi màu nền và màu chữ theo theme.
- Hình Fumo chỉ hiện ở theme FUMO, đặt cạnh nút Record/Pause; bấm vào sẽ phát `assets/fumo.wav` (easter egg).
- Ô chọn **Tự động chỉnh biên độ**: đỉnh sóng chiếm ~80% nửa chiều cao; khi Freeze giá trị được giữ cố định; thanh trượt chỉ dùng khi tắt tự động.
- Âm mẫu mới: sóng vuông, tam giác, răng cưa, clarinet, trumpet, piano, violin, organ; nốt Do–Si từ Do3 đến Do6 (tên solfège kèm tên C–B).

### Lỗi đã tìm và sửa / Bugs found and fixed
1. **Số ô trên trục hoành bị trục gạch ngang qua (màn hình hẹp).** Độ lệch của nhãn là hằng số 20 px trong khi cỡ chữ được phóng theo màn hình; trên điện thoại chữ lớn hơn nên đè lên trục. Nay độ lệch tính theo cỡ chữ (nhãn `0`, `1…10` và nhãn biên độ dưới).
2. **Lỗi khi đổi thang, kéo thanh trượt, đổi theme hoặc xoay màn hình trong lúc trình duyệt đang hỏi quyền micro.** Trạng thái "đang chạy" được gán trước khi có dữ liệu, nên vòng vẽ đọc bộ đệm rỗng và báo lỗi. Bấm Stop lúc đó còn đóng AudioContext giữa chừng và hiện thông báo lỗi khó hiểu. Nay nguồn được dựng bằng biến cục bộ, chỉ gán vào trạng thái chung khi đã sẵn sàng; nút Record và ô Nguồn bị khóa trong lúc khởi động; nếu thất bại thì luồng micro, oscillator và AudioContext đều được giải phóng.
3. **Danh sách cao độ có hai mục trùng 440 Hz** (một "440 Hz", một "A4"). Gộp thành một mục La4 (A4) – 440 Hz.

### Đã kiểm tra / Verified
- 576 phép thử dò tần số (mọi âm sắc × các nốt Do3–Do6 và 100/200 Hz × 44,1 và 48 kHz): đều sai số dưới 0,5%.
- Chưa thử trên trình duyệt và thiết bị thật.
