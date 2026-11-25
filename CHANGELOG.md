# Changelog

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
