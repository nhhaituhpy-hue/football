# Cẩm Nang Vận Hành & Khắc Phục Sự Cố Ngày Thi Đấu — World Cup 2026

Tài liệu này cung cấp các hướng dẫn chi tiết dành cho quản trị viên hệ thống để giám sát, vận hành, và xử lý các sự cố phát sinh trong thời gian diễn ra các trận đấu.

---

## 1. Hướng Dẫn Giám Sát Đồng Bộ Dữ Liệu (Sync Logs)

Hệ thống lưu giữ toàn bộ log đồng bộ tại bảng `wc2026_api_sync_log` trên Supabase.

### 1.1. Cách truy cập Logs qua Supabase Dashboard
1. Truy cập vào [Supabase Dashboard](https://supabase.com/dashboard).
2. Lựa chọn project `qblkjphwwnrexlhfqoyo`.
3. Di chuyển đến **Table Editor** ở thanh điều hướng bên trái và chọn bảng `wc2026_api_sync_log`.
4. Sắp xếp cột `started_at` giảm dần (`DESC`) để xem các lượt chạy mới nhất.

### 1.2. Giải nghĩa các trường thông tin log
- **`source`**: Tên công việc chạy đồng bộ.
  - `schedule-sync`: Đồng bộ lịch thi đấu và thông tin đội tuyển từ `wc2026api.com`.
  - `prediction-sync`: Quét (scrape) và đồng bộ bài viết nhận định từ `thethao247.vn`.
  - `event-sync-match-[id]`: Quét và đồng bộ diễn biến trận đấu (bàn thắng, thẻ phạt chi tiết).
  - `live-refresh`: Cập nhật livescore realtime (DO Alarm chạy mỗi 15 giây).
  - `live-refresh-error`: Ghi nhận lỗi kết nối hoặc phân tích dữ liệu adapter livescore.
- **`status`**: Trạng thái chạy (`running`, `success`, `error`).
- **`message`**: Chi tiết kết quả chạy hoặc thông báo lỗi cụ thể kèm Correlation ID (UUID) để tra cứu log hệ thống Cloudflare.
- **`rows_read` / `rows_written`**: Số bản ghi dữ liệu đã đọc từ nguồn ngoài và ghi nhận vào Database.

---

## 2. Các Quy Trình Khắc Phục Sự Cố (Runbook)

### 2.1. Lỗi DO Alarm không tự chạy (Livescore không tự cập nhật)
Thông thường, khi có trận đấu diễn ra hoặc sắp bắt đầu (trong vòng 15 phút), Cron trigger sẽ gọi `/start-alarm` để đánh thức Durable Object (DO). Nếu livescore trên trang chủ đứng yên:

#### Các bước kích hoạt thủ công:
1. Đăng nhập vào trang quản trị: `https://lichworldcup.pages.dev/admin` (hoặc domain dev/preview tương ứng).
2. Sử dụng tài khoản quản trị viên đã được cấp quyền.
3. Trên Dashboard, nhấp vào nút **"Kích hoạt Live Loop"** hoặc gửi yêu cầu HTTP `POST` trực tiếp đến Worker API:
   ```bash
   curl -X POST https://lichworldcup-live.nhhai-tuhpy.workers.dev/start-alarm \
     -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
   ```
4. Xác minh trong bảng `wc2026_api_sync_log` xuất hiện log `source = live-refresh` với `status = success`.

---

### 2.2. Lỗi API Lịch Thi Đấu (`wc2026api.com`) Gặp Sự Cố
Nếu API của nhà cung cấp lịch thi đấu bị lỗi (Rate limit, hết hạn gói cước, hoặc chết key):
- Log `schedule-sync` sẽ chuyển sang trạng thái `error` với mã lỗi `HTTP 401 Unauthorized` hoặc `HTTP 429 Too Many Requests`.

#### Biện pháp khắc phục:
1. **Kiểm tra/Thay thế API Key**:
   - Truy cập trang quản trị Cloudflare Workers Dashboard.
   - Chọn Worker `lichworldcup-live` -> tab **Settings** -> **Variables**.
   - Cập nhật Secret `WC2026_API_KEY` với khóa mới được cung cấp từ đối tác.
   - Triển khai lại hoặc lưu thay đổi để Worker nhận key mới.
2. **Cập nhật thủ công qua Admin Dashboard**:
   - Nếu API hoàn toàn không khả dụng, quản trị viên có thể vào trang `/admin`, chọn trận đấu cần điều chỉnh để cập nhật trực tiếp tỷ số, số phút, và trạng thái trận đấu.
   - Cơ chế RLS mới cho phép tài khoản Admin ghi thẳng vào Database thông qua Worker API an toàn mà không cần phụ thuộc vào cổng đồng bộ tự động.

---

### 2.3. Lỗi Quét Diễn Biến Trận Đấu (`thethao247.vn` thay đổi giao diện)
Nếu trang `thethao247.vn` thay đổi cấu trúc HTML, scraper diễn biến trận đấu sẽ không tìm thấy hoặc phân tích sai các sự kiện bàn thắng, thẻ phạt.
- Log `event-sync-match-[id]` sẽ báo `status = success` nhưng `rows_written = 0` hoặc báo `error` phân tích cú pháp DOM.

#### Biện pháp khắc phục:
1. **Cập nhật thủ công trong DB**:
   - Quản trị viên có thể bổ sung diễn biến chính trực tiếp qua bảng `wc2026_match_events` trên Supabase Dashboard để đảm bảo hiển thị đúng cho người dùng.
2. **Sửa code Scraper**:
   - Cập nhật lại selectors Cheerio trong file [thethao247.ts](file:///c:/Test/Football/scripts/worker/providers/thethao247.ts).
   - Triển khai lại Worker bằng lệnh:
     ```bash
     npm run worker:deploy
     ```

---

## 3. Quản Lý Highlights Trận Đấu Thủ Công

Bên cạnh scraper tự động quét link highlight bằng Puppeteer trên GitHub Actions, Admin có thể cập nhật/ghi đè link video Highlights trực tiếp từ trang Admin để tối ưu trải nghiệm người dùng.

### Hướng dẫn cập nhật Highlights:
1. Truy cập trang `/admin` và đăng nhập.
2. Tìm trận đấu mong muốn trong danh sách trận đấu.
3. Nhấp vào nút **"Cập nhật Highlights"** (hoặc biểu tượng chỉnh sửa).
4. Nhập đường dẫn URL video YouTube hoặc nguồn phát chính thức vào trường `Highlight URL`.
5. Bấm **"Lưu"**. Worker API sẽ xác thực JWT token và ghi nhận trực tiếp vào trường `highlight_url` của bảng `wc2026_matches`.
6. Tải lại trang chi tiết trận đấu (`/analysis/[id]`) trên frontend để kiểm tra video đã hiển thị chính xác.

---

## 4. Danh Sách Kiểm Tra Nhanh Ngày Thi Đấu (Match Day Checklist)

- [ ] **Trước trận đấu 30 phút**: Kiểm tra bảng `wc2026_api_sync_log`, xác nhận `prediction-sync` đã quét thành công bài nhận định cho các trận đấu hôm nay.
- [ ] **Trước trận đấu 15 phút**: Truy cập trang chủ `lichworldcup.pages.dev`, kiểm tra trạng thái trận đấu chuyển sang "Sắp diễn ra". Xác nhận DO Alarm đã được kích hoạt.
- [ ] **Trong trận đấu**: Kiểm tra WebSocket kết nối ổn định (không báo lỗi đỏ trên console trình duyệt). Tỷ số và số phút thi đấu cập nhật mượt mà sau mỗi 15-30 giây.
- [ ] **Sau trận đấu 10 phút**: Xác nhận trạng thái trận đấu chuyển sang "Kết thúc" (`finished`). Kiểm tra log `event-sync-match-[id]` xem đã đồng bộ đủ danh sách bàn thắng, thẻ phạt.
- [ ] **Sau trận đấu 30 phút**: Kiểm tra video Highlights đã được cập nhật tự động (hoặc bổ sung thủ công nếu scraper tự động không quét được link chất lượng).
