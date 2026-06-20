# Lịch World Cup 2026

Ứng dụng tĩnh Next.js chạy trên Cloudflare Pages, sử dụng cơ sở dữ liệu Supabase và proxy cập nhật trực tiếp Cloudflare Worker với Durable Object.

---

## 🛠️ Luồng dữ liệu (Data Pipeline Architecture)

Hệ thống đã loại bỏ hoàn toàn các nguồn dữ liệu từ `bongdalu` và `SofaScore`. Luồng dữ liệu hiện tại được thiết kế tối ưu, chia làm 3 nhánh:

### 1. Tỉ số và Thời gian trực tiếp (Live Score & Clock)
- **Nguồn cấp dữ liệu**: REST API `/events` từ [Odds-API.io](https://odds-api.io/).
- **Tần suất cập nhật**: **60 giây/lần** (1 phút/lần).
- **Tính toán Request Budget**:
  - Dữ liệu trực tiếp được gọi qua **Durable Object Alarm** của Cloudflare.
  - Endpoint `/events` trả về danh sách toàn bộ các sự kiện đang diễn ra trong cùng một request. Vì vậy, **kể cả khi có 2 hoặc nhiều trận đấu diễn ra cùng lúc, hệ thống chỉ tiêu tốn đúng 1 request/phút**.
  - Tần suất này tương đương tối đa **60 requests/giờ** khi có trận live, nằm hoàn toàn dưới hạn ngạch miễn phí **100 requests/giờ** của Odds-API.io.
  - Vòng lặp alarm của Durable Object chỉ được đánh thức khi có trận đấu đang hoặc sắp diễn ra (15 phút trước giờ lăn bóng) và tự động đi ngủ đông (hibernate) khi kết thúc trận đấu để tiêu thụ **0 request**.

### 2. Diễn biến trận đấu chi tiết (Goalscorers & Cards)
- **Nguồn cấp dữ liệu**: Web Scraper (Cheerio) từ `thethao247.vn`.
- **Tần suất cào**: Chạy duy nhất **1 lần ngay sau khi trận đấu kết thúc** (khi trạng thái trận đấu chuyển từ `live` sang `finished` trên database) để lấy danh sách cầu thủ ghi bàn, thẻ phạt, VAR... cập nhật vào bảng `wc2026_match_events`. Không thực hiện cào quét HTML liên tục trong suốt trận đấu để giảm thiểu tải và phòng ngừa rủi ro chặn IP/rate limit.

### 3. Nhận định trận đấu (Match Analysis & Predictions)
- **Nguồn cấp dữ liệu**: Web Scraper từ `thethao247.vn`.
- **Tần suất cào**: Chạy định kỳ **lúc 8:00 sáng hàng ngày** (giờ Việt Nam, tương đương `0 1 * * *` UTC). Script sẽ tìm kiếm các bài viết nhận định mới nhất của các trận đấu diễn ra trong ngày để cập nhật vào bảng `wc2026_matches` (trường `analysis_content`).

---

## 💾 Cấu trúc Cơ sở dữ liệu (Supabase)

**Project ID**: `qblkjphwwnrexlhfqoyo`

Tất cả các thay đổi về schema hoặc dữ liệu của database phải được thực hiện thông qua Supabase MCP (`execute_sql`).

Danh sách các bảng chính:
- `wc2026_teams`: Danh sách 48 đội tuyển tham dự World Cup 2026.
- `wc2026_matches`: Lịch thi đấu 104 trận đấu, trạng thái, tỉ số, số phút thi đấu và nội dung nhận định chi tiết.
- `wc2026_match_odds`: Lưu trữ tỷ lệ kèo Châu Á (Asian Handicap/Spread) và kèo Tài Xỉu (Over/Under/Totals) từ các nhà cái (Bet365).
- `wc2026_match_live_snapshots`: Bản ghi snapshot trạng thái live của trận đấu dự phòng.
- `wc2026_match_events`: Lưu trữ các sự kiện diễn biến trận đấu chi tiết (bàn thắng, thẻ phạt).
- `wc2026_api_sync_log`: Nhật ký ghi nhận các lần chạy đồng bộ của các tác vụ nền.

---

## ⚙️ Cron Triggers trong Cloudflare Worker

Lịch trình tác vụ được khai báo trong [wrangler.worker.toml](./wrangler.worker.toml):

1. **`0 1 * * *` (8:00 AM Giờ Việt Nam)**:
   Đồng bộ bài viết nhận định trận đấu (`syncPredictionsToday`) từ `thethao247.vn`.
2. **`0 */6 * * *` (Mỗi 6 giờ)**:
   Đồng bộ và cập nhật lịch thi đấu World Cup 2026 chính thức (`syncWc2026Schedule`) từ WC2026 API.
3. **`*/5 * * * *` (Mỗi 5 phút)**:
   - Đồng bộ kèo trực tiếp từ HTTP API (`syncOddsFromHttp`).
   - Gọi endpoint `/start-alarm` của Durable Object để kiểm tra lịch thi đấu. Nếu có trận đấu sắp hoặc đang diễn ra, Durable Object sẽ tự kích hoạt alarm chu kỳ 1 phút để cập nhật tỉ số trực tiếp.

---

## 🚀 Triển khai và Phát triển

### Phát triển ứng dụng Web (Next.js)
```bash
# Cài đặt thư viện và chạy local
npm run dev
```
Mở `http://localhost:3000`.

### Deploy Frontend lên Production (Cloudflare Pages)
Dự án được cấu hình xuất ra static HTML tại thư mục `out/`. Sử dụng flag `--branch main` để deploy trực tiếp lên production:
```bash
npm run deploy
```
*(Lệnh này sẽ tự động build, sửa lỗi static paths và deploy thẳng vào production của Pages)*

### Phát triển và Deploy Cloudflare Worker
```bash
# Chạy worker ở local
npm run worker:dev

# Deploy Worker lên Cloudflare
npm run worker:deploy
```
