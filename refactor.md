# Kế hoạch refactor hệ thống Lịch World Cup 2026

## 1. Thông tin tài liệu

- Dự án: `lichworldcup`
- Repository: `nhhaituhpy-hue/football`
- Supabase project ID: `qblkjphwwnrexlhfqoyo`
- Frontend production: `https://lichworldcup.pages.dev`
- Ngày lập kế hoạch: 20/06/2026
- Trạng thái: Đề xuất, chưa triển khai

Tài liệu này tổng hợp kết quả audit kiến trúc, các rủi ro đã xác minh và kế hoạch refactor theo từng phase. Mục tiêu là giữ hệ thống hoạt động liên tục, tránh refactor lớn không kiểm soát và cho phép kiểm tra/rollback sau mỗi bước.

## 2. Phạm vi và nguyên tắc

### 2.1. Phạm vi

Kế hoạch bao gồm:

- Supabase Database, Auth và RLS.
- Cloudflare Worker, Durable Object, WebSocket và Cron Triggers.
- GitHub Actions deploy và highlight scraper.
- Next.js static export trên Cloudflare Pages.
- Luồng dữ liệu frontend cho trang chủ, bảng xếp hạng, bracket, analysis và admin.
- Quản lý secret, schema, CI và khả năng rollback.

### 2.2. Nguyên tắc triển khai

- Supabase là nguồn dữ liệu chuẩn duy nhất cho dữ liệu cần lưu bền vững.
- Durable Object chỉ giữ trạng thái realtime, WebSocket và dữ liệu tạm thời.
- Không chia thành nhiều Worker deployment nếu chưa có lý do vận hành rõ ràng.
- Tách Worker thành module nhưng vẫn build/deploy thành một Worker trước.
- Mọi thay đổi database/schema phải thực hiện qua Supabase MCP trên project `qblkjphwwnrexlhfqoyo`.
- Không drop/recreate bảng production trong quá trình refactor.
- Mỗi phase phải có kiểm thử, tiêu chí nghiệm thu và phương án rollback riêng.
- Mọi deploy Cloudflare Pages phải deploy production với `--branch main`.

## 3. Kiến trúc hiện tại

```text
wc2026api / Bongdalu / thethao247 / FIFA
                    |
                    v
        Cloudflare Worker + Cron
          |         |          |
          |         |          +--> GitHub Actions + Puppeteer
          |         |
          |         +--> Durable Object + WebSocket
          |
          +--> Supabase Database
                    |
                    v
        Next.js static export on Pages
```

### 3.1. Vai trò thực tế

| Thành phần | Vai trò hiện tại |
|---|---|
| Supabase | Teams, lịch đấu, tỷ số persisted, events, predictions, highlights và sync logs |
| Durable Object | Live cache, thời điểm chuyển hiệp, alarm 15 giây và WebSocket fan-out |
| Worker Cron | Khởi động live alarm, sync schedule và scrape predictions |
| GitHub Actions | Deploy Pages và scrape highlight bằng Puppeteer |
| Cloudflare Pages | Phục vụ static HTML/CSS/JavaScript của Next.js |

## 4. Kết quả audit đã xác minh

### 4.1. Secret trong `wrangler.worker.toml`

`wrangler.worker.toml`:

- Không nằm trong `.gitignore`.
- Đang được Git theo dõi.
- Có trong `origin/main`.
- Đã xuất hiện trong nhiều commit.
- Chứa `WC2026_API_KEY` dưới dạng plain text.

Kết luận: key hiện tại phải được xem là đã lộ. Nhà cung cấp không cấp lại key, vì vậy dự án chấp nhận rủi ro và tiếp tục sử dụng key hiện tại. Thêm file vào `.gitignore` không giải quyết được vì key vẫn tồn tại trong Git history.

Không ignore toàn bộ `wrangler.worker.toml`. File cấu hình cần tiếp tục được commit. Key hiện tại vẫn nên được chuyển sang Wrangler Secrets để không tiếp tục xuất hiện trong source code, commit mới, diff hoặc log cấu hình. Việc này chỉ giảm phát tán thêm, không làm key cũ biến mất khỏi Git history.

### 4.2. PIN admin

PIN `0301` hiện nằm nguyên văn trong source code và JavaScript production. Cơ chế `sessionStorage` chỉ khóa giao diện, không phải xác thực thực sự. Người dùng có thể:

- Đọc PIN từ JavaScript bundle.
- Tự đặt `sessionStorage.add_hl_auth`.
- Gọi thẳng các mutation endpoint của Worker.

### 4.3. Node.js trong GitHub Actions

| Workflow | Node hiện tại |
|---|---:|
| `deploy.yml` | 20 |
| `sync_highlights.yml` | 24 |

Supabase kết thúc hỗ trợ Node.js 20 vào ngày 30/06/2026 và yêu cầu Node.js 22 trở lên cho các phiên bản thư viện tương lai.

Node của GitHub Actions không nằm trong đường truyền runtime giữa website và Supabase. Nếu workflow build lỗi, bản Pages production đang deploy vẫn hoạt động và frontend vẫn gọi Supabase trực tiếp. Đây không phải tình huống database tự ngắt vào ngày 30/06/2026, nhưng CI cần được nâng cấp trước thời hạn để tiếp tục được hỗ trợ.

### 4.4. `highlight_url`

`highlight_url` đang được lưu trong:

```text
public.wc2026_matches.highlight_url
```

Truy vấn production xác nhận:

- Cột tồn tại.
- Có 32 trận đang có URL highlight tại thời điểm audit.

Vấn đề là `supabase_schema.sql` trong repo không có cột này. Database production và schema source-controlled đang bị drift.

### 4.5. Worker hiện tại

`scripts/cloudflare_worker.js` dài hơn 2.200 dòng và đang chứa đồng thời:

- HTTP routing.
- Durable Object.
- WebSocket handling.
- Alarm loop.
- Live scraping.
- Tính phút và phase trận đấu.
- Ghi dữ liệu Supabase.
- Schedule sync.
- Prediction scraping.
- Event scraping.
- Trigger GitHub Actions.

Đây là vấn đề về tổ chức code và security boundary. Không nhất thiết phải tách thành nhiều Worker deployment.

### 4.6. Frontend

- Build Next.js 16.2.9 thành công.
- Static export tạo 111 trang, gồm đủ 104 route `/analysis/[matchId]`.
- Trang chủ, standings và bracket fetch dữ liệu ở client và nhận live update qua WebSocket.
- Trang analysis lấy match/prediction tại build-time nên dữ liệu có thể cũ cho tới lần deploy tiếp theo.
- `fetchMatches()` đã gọi `fetchTeams()`, nhưng một số page lại gọi thêm `fetchTeams()` song song, gây query trùng.
- Khi WebSocket có message, frontend có thể query lại toàn bộ teams/matches thay vì chỉ merge live overlay.
- ESLint hiện có 10 lỗi và 19 cảnh báo; pipeline deploy chưa dùng lint làm quality gate.

## 5. Kiến trúc mục tiêu

```text
                           +----------------------+
                           | GitHub Actions       |
                           | Puppeteer highlights |
                           +----------+-----------+
                                      |
                                      v
+----------------+          +---------+----------+
| External APIs  |--------->| Cloudflare Worker  |
+----------------+          | modular monolith   |
                            +----+-----------+----+
                                 |           |
                    realtime     |           | persistent writes
                                 v           v
                         +-------+--+   +----+------+
                         | Durable  |   | Supabase  |
                         | Object   |   | canonical |
                         +----+-----+   +----+------+
                              |              |
                              +------+-------+
                                     v
                         +-----------+-----------+
                         | Next.js static Pages  |
                         | runtime client fetch  |
                         +-----------------------+
```

### 5.1. Phân định trách nhiệm

#### Supabase

Lưu bền vững:

- Teams.
- Schedule.
- Tỷ số và trạng thái chính thức/persisted.
- Events.
- Predictions.
- Highlights.
- Job/sync logs.
- Supabase Auth users và quyền admin.

#### Durable Object

Chỉ giữ:

- WebSocket connections.
- Live cache.
- Phase transition timestamps.
- Alarm trong thời gian có trận active/upcoming.

DO không phải nguồn dữ liệu chuẩn thứ hai.

#### Cloudflare Worker

- Public read endpoints.
- Protected admin mutation endpoints.
- Provider adapters.
- Cron orchestration.
- DO binding.
- Supabase repository dùng service-role ở server-side.

#### GitHub Actions

- Deploy frontend.
- Chạy Puppeteer highlight scraper.
- Không chạy job realtime.

#### Next.js Pages

- Static shell và HTML ban đầu.
- Client-side revalidation cho dữ liệu thay đổi sau build.
- Không chứa secret hoặc logic xác thực admin bằng PIN.

## 6. Quyết định về Cloudflare Free tier

Không tách thành nhiều Worker deployment trong giai đoạn đầu. Tách code thành module nhưng vẫn deploy một Worker.

Giới hạn Free cần theo dõi:

- 100 Worker scripts/account.
- 100.000 Worker requests/ngày.
- 10 ms CPU cho HTTP/Cron invocation.
- 5 Cron Triggers/account; repo hiện cấu hình 3 trigger.
- Worker bundle tối đa 3 MB.
- 100 Durable Object classes/account.
- Durable Object Free request quota 100.000/ngày.

Nhiều Worker không tạo thêm quota. Ngược lại, nó có thể tăng số invocation, cấu hình secret, service bindings và độ phức tạp deploy/logging.

Chỉ cân nhắc tách deployment khi có ít nhất một điều kiện:

- Bundle gần/vượt 3 MB.
- Batch job thường xuyên vượt CPU.
- Cần deploy realtime độc lập với scraper.
- Cần security boundary riêng giữa public API và batch processing.
- Một nhóm job có tần suất lỗi cao và ảnh hưởng Worker chính.

## 7. Kế hoạch triển khai tổng thể

### Phase 0 — Baseline và backup

Ước lượng: 0,5 ngày.

#### Tasks

- [ ] Ghi lại commit production hiện tại.
- [ ] Ghi lại Cloudflare Pages deployment ID hiện tại.
- [ ] Export danh sách Worker secrets hiện có mà không ghi giá trị secret vào repo/log.
- [ ] Dùng Supabase MCP kiểm tra schema production và RLS hiện tại.
- [ ] Chụp baseline các endpoint `/live`, `/matches`, `/standings`.
- [ ] Chạy `npm ci`, `npm run lint`, `npm run build` và lưu kết quả baseline.
- [ ] Xác nhận build tạo đủ 104 route analysis.

#### Kết quả mong đợi

- Có điểm rollback rõ ràng cho Pages, Worker và source code.
- Có inventory schema/secret/endpoint trước khi sửa.

### Phase 1 — Xử lý secret và bảo mật admin

Ước lượng: 1–2 ngày.

#### 1.1. Di chuyển API key hiện tại sang Wrangler Secret

- [ ] Chấp nhận rằng key đã lộ và provider không cấp lại key.
- [ ] Lưu chính key hiện tại bằng Wrangler Secret:

```powershell
npx wrangler secret put WC2026_API_KEY --config wrangler.worker.toml
```

- [ ] Xóa key khỏi `[vars]` trong `wrangler.worker.toml`.
- [ ] Deploy Worker.
- [ ] Test schedule/live provider bằng key hiện tại sau khi chuyển sang secret.
- [ ] Không đặt việc rotate/revoke key làm blocker cho refactor.
- [ ] Không rewrite Git history vì thao tác này không thay đổi được key và có thể gây gián đoạn lịch sử repository.
- [ ] Theo dõi lỗi `401`, `403`, rate limit hoặc quota từ provider để phát hiện key bị lạm dụng hoặc bị vô hiệu hóa.
- [ ] Chuẩn bị fallback rõ ràng: nếu wc2026api không truy cập được, website tiếp tục dùng schedule/kết quả persisted gần nhất trong Supabase và Worker không được ghi đè bằng dữ liệu rỗng.

#### 1.2. Thay PIN bằng Supabase Auth

Luồng mục tiêu:

```text
Admin login -> Supabase Auth JWT -> Worker verifies JWT/role
            -> Worker service-role mutation -> Supabase
```

- [ ] Tạo admin user trong Supabase Auth.
- [ ] Đặt quyền trong `app_metadata`, không dùng `user_metadata`:

```json
{
  "role": "admin"
}
```

- [ ] Bỏ PIN `0301` khỏi frontend.
- [ ] Bỏ `sessionStorage.add_hl_auth`.
- [ ] Tạo login/logout dựa trên Supabase Auth session.
- [ ] Frontend gửi `Authorization: Bearer <access_token>` tới Worker.
- [ ] Worker xác minh token và `app_metadata.role === "admin"`.
- [ ] Chuyển mutation endpoint từ `GET` sang `POST`/`PATCH`/`DELETE` phù hợp.
- [ ] Giới hạn CORS về production origin và local development origin được phép.
- [ ] Frontend không gọi `.update()` Supabase trực tiếp bằng anon key.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` chỉ tồn tại trong Worker secret.
- [ ] Bảo vệ các endpoint:
  - [ ] `/sync-schedule`
  - [ ] `/sync-predictions`
  - [ ] `/sync-events`
  - [ ] `/sync-events-today`
  - [ ] `/trigger-highlights-workflow`
  - [ ] API cập nhật/xóa highlight

#### Security acceptance criteria

- [ ] PIN không còn trong source hoặc production bundle.
- [ ] Không có JWT trả `401`.
- [ ] JWT hợp lệ nhưng không có role admin trả `403`.
- [ ] Admin hợp lệ mutation thành công.
- [ ] Anon key không thể update `wc2026_matches`.
- [ ] Service-role không xuất hiện trong frontend bundle/log.

#### Rollback

- Rollback Worker về deployment trước.
- Deployment rollback tiếp tục đọc key hiện tại từ Wrangler Secret; không đưa key trở lại `wrangler.worker.toml`.
- Giữ admin mutation tạm thời disabled nếu Auth gặp lỗi, không khôi phục public endpoint.

### Phase 2 — Nâng GitHub Actions lên Node.js 24

Ước lượng: 0,5–1 ngày.

#### Tasks

- [ ] Thêm `.nvmrc` với nội dung `24`.
- [ ] Thêm `engines.node` vào `package.json`:

```json
{
  "engines": {
    "node": "24.x"
  }
}
```

- [ ] Đổi `deploy.yml` từ Node 20 sang Node 24.
- [ ] Giữ `sync_highlights.yml` ở Node 24.
- [ ] Giữ `package-lock.json` và dùng `npm ci`.
- [ ] Pin Wrangler trong `devDependencies` thay vì tải phiên bản không kiểm soát qua `npx`.
- [ ] Sửa lỗi lint hiện tại.
- [ ] Thêm CI checks theo thứ tự:

```text
npm ci
  -> npm run lint
  -> npm run build
  -> deploy production
```

#### Validation

- [ ] `npm ci` thành công trên Node 24.
- [ ] Next.js build thành công.
- [ ] Đủ 104 analysis routes.
- [ ] Highlight scraper khởi động được trên Node 24.
- [ ] Supabase client read test thành công.
- [ ] Production Pages vẫn gọi Supabase và Worker bình thường.

#### Rủi ro và rollback

- Nếu một dependency chưa tương thích Node 24, chuyển tạm sang Node 22.
- Nếu workflow deploy lỗi, Pages production cũ vẫn hoạt động.
- Không rollback xuống Node 20 sau 30/06/2026 trừ tình huống khẩn cấp ngắn hạn.

### Phase 3 — Đồng bộ schema Supabase

Ước lượng: 1–2 ngày.

#### Mục tiêu

- Production schema và source-controlled schema mô tả cùng một trạng thái.
- Không mất 32 highlight URL hiện có.
- Không drop/recreate production tables.

#### Tasks

- [ ] Dùng Supabase MCP kiểm tra:
  - [ ] Columns của `wc2026_matches`.
  - [ ] `highlight_url`.
  - [ ] `wc2026_match_predictions`.
  - [ ] Foreign keys.
  - [ ] RLS policies.
  - [ ] Grants cho `anon` và `authenticated`.
- [ ] Chạy advisors qua MCP.
- [ ] Thiết kế migration tăng dần cho schema source-controlled.
- [ ] Đưa `highlight_url` và predictions vào schema/migration chuẩn.
- [ ] Kiểm tra foreign key predictions -> matches.
- [ ] Xác định số phận `wc2026_match_live_snapshots`:
  - Ghi snapshot đúng nghĩa; hoặc
  - Loại bỏ fallback/table nếu không còn dùng.
- [ ] Chạy migration qua Supabase MCP.
- [ ] Test query đọc bằng anon.
- [ ] Test mutation bằng Worker service-role.

#### Acceptance criteria

- [ ] 32 highlight URL vẫn tồn tại.
- [ ] Predictions vẫn còn dữ liệu và foreign key hợp lệ.
- [ ] Public chỉ đọc được các bảng được phép.
- [ ] Public không update được match/highlight.
- [ ] Worker update được bằng service-role.
- [ ] Schema source-controlled phản ánh production.

### Phase 4 — Tách Worker thành module

Ước lượng: 2–4 ngày.

#### Cấu trúc đề xuất

```text
scripts/worker/
├── index.ts
├── config.ts
├── realtime/
│   └── live-cache-do.ts
├── routes/
│   ├── public.ts
│   └── admin.ts
├── jobs/
│   ├── live-refresh.ts
│   ├── schedule-sync.ts
│   ├── prediction-sync.ts
│   └── event-sync.ts
├── providers/
│   ├── bongdalu.ts
│   ├── wc2026api.ts
│   └── thethao247.ts
├── repositories/
│   └── supabase.ts
├── auth/
│   └── require-admin.ts
└── domain/
    ├── match-normalizer.ts
    └── change-detector.ts
```

#### Quy tắc refactor

- [ ] Một module chỉ có một trách nhiệm chính.
- [ ] Provider không gọi trực tiếp UI hoặc route.
- [ ] Supabase access chỉ qua repository.
- [ ] Route admin luôn đi qua `requireAdmin`.
- [ ] Durable Object không chứa batch prediction/schedule logic.
- [ ] Giữ nguyên URL public trong giai đoạn đầu để không phá frontend.
- [ ] Không đổi Durable Object class/migration nếu không cần.

#### Tối ưu ghi Supabase

Hiện live loop có thể PATCH Supabase mỗi 15 giây. Luồng mới:

- [ ] DO cập nhật minute trong memory/storage phục vụ WebSocket.
- [ ] Chỉ persist khi thay đổi nghiệp vụ:
  - Tỷ số.
  - Status.
  - Phase.
  - Penalty.
  - Thẻ.
  - Event mới.
- [ ] Có heartbeat/persist định kỳ thưa hơn nếu cần phục hồi.
- [ ] Ghi log khi provider lỗi hoặc fallback được dùng.

#### Acceptance criteria

- [ ] Public endpoint response không đổi contract.
- [ ] WebSocket vẫn reconnect và nhận live data.
- [ ] Alarm chỉ chạy khi có trận active/upcoming.
- [ ] Số Supabase PATCH giảm đáng kể.
- [ ] Bundle dưới giới hạn Free tier.
- [ ] Cron vẫn chỉ dùng tối đa 3 trigger hiện tại.

### Phase 5 — Frontend Data Strategy

Ước lượng: 3,5–5 ngày.

#### 5.1. Mục tiêu

- Giữ Next.js static export trên Cloudflare Pages.
- Dữ liệu thay đổi sau build được cập nhật mà không cần deploy frontend.
- Không query Supabase lại sau mỗi WebSocket message.
- Trang analysis nhận prediction/highlight mới tại runtime.
- Có fallback rõ ràng khi Supabase hoặc Worker lỗi.

#### 5.2. Freshness matrix

| Dữ liệu | Nguồn chuẩn | Cách cập nhật frontend | Mức freshness |
|---|---|---|---|
| Teams | Supabase | Load một lần + refresh thưa | Hàng giờ/ngày |
| Schedule | Supabase | Initial load + 5 phút/reconnect | Vài phút |
| Live score/minute | Worker/DO overlay | WebSocket, fallback polling | 15–30 giây |
| Persisted score/status | Supabase | Refresh khi status transition | Vài phút |
| Events | Worker/Supabase | Live overlay + persisted fallback | 15–30 giây |
| Predictions | Supabase | Runtime revalidation | Vài phút |
| Highlights | Supabase | Runtime revalidation | Vài phút |

#### 5.3. Data layer đề xuất

Tách `src/lib/dataManager.ts` thành:

```text
src/data/
├── supabase/
│   ├── matches.repository.ts
│   ├── teams.repository.ts
│   └── predictions.repository.ts
├── worker/
│   ├── live.client.ts
│   └── websocket.client.ts
├── domain/
│   ├── merge-match-data.ts
│   └── calculate-standings.ts
└── hooks/
    ├── use-tournament-data.ts
    ├── use-live-matches.ts
    └── use-match-analysis.ts
```

Quy tắc:

- Repository chỉ giao tiếp nguồn dữ liệu.
- Domain functions là pure functions để dễ test.
- Hooks quản lý loading, error, cache, retry và lifecycle.
- Components chỉ nhận view model và render.

#### 5.4. Initial loading

- [ ] Fetch teams và matches song song đúng một lần.
- [ ] Bỏ việc `fetchMatches()` tự gọi `fetchTeams()` nếu caller đã lấy teams.
- [ ] Tạo normalized cache:

```text
teamsById
matchesById
liveByMatchId
predictionsByMatchId
```

- [ ] Merge bằng pure function `mergeMatchData(match, teamMap, live)`.
- [ ] Không mutate dữ liệu cache gốc.

#### 5.5. WebSocket và live overlay

- [ ] Một WebSocket connection dùng chung trong mỗi browser tab.
- [ ] WebSocket message chỉ cập nhật `liveByMatchId`.
- [ ] Không query lại teams/matches mỗi message.
- [ ] Exponential backoff có giới hạn.
- [ ] Không reconnect khi không còn subscriber.
- [ ] Fallback polling `/live` khi WebSocket lỗi liên tục.
- [ ] Refresh Supabase khi:
  - WebSocket reconnect sau mất kết nối dài.
  - Match chuyển `live -> finished`.
  - Người dùng bấm Refresh.
  - Chu kỳ 5 phút.

#### 5.6. Trang chủ, standings và bracket

- [ ] Dùng chung tournament data hook/store.
- [ ] Standings được tính từ merged matches.
- [ ] Không duplicate `fetchTeams()`.
- [ ] Không tạo thêm Supabase query khi minute thay đổi.
- [ ] Refresh indicator phản ánh đúng network state.

#### 5.7. Trang analysis runtime revalidation

Giữ SSG initial data để tải nhanh và có HTML ban đầu:

```text
Build-time initial data
        |
        v
Static HTML + RSC payload
        |
        v
Client hydration
        |
        v
Runtime fetch Supabase + live overlay
```

- [ ] `generateStaticParams()` tiếp tục tạo 104 route.
- [ ] Không catch lỗi build rồi âm thầm trả `[]`; build phải fail nếu không tạo đủ route.
- [ ] Page truyền `matchId` và `initialData` cho client.
- [ ] `useMatchAnalysis(matchId, initialData)` fetch match/prediction mới sau hydration.
- [ ] So sánh `updated_at` trước khi thay initial data.
- [ ] Subscribe WebSocket nếu match live/upcoming.
- [ ] Revalidate prediction và `highlight_url` mà không deploy lại.
- [ ] Hiển thị `Dữ liệu cập nhật lúc ...`.
- [ ] Có skeleton, empty state và error state riêng.

#### 5.8. Admin frontend

- [ ] Admin route vẫn có thể là static page.
- [ ] Kiểm tra Supabase Auth session khi load.
- [ ] Không có session thì hiện login.
- [ ] Có session nhưng không có admin role thì hiện `403` UI.
- [ ] Mutation đi qua protected Worker API.
- [ ] Sau mutation, invalidate/refetch match cache.
- [ ] Logout xóa session đúng cách.

#### 5.9. Error và fallback

| Lỗi | Hành vi mong muốn |
|---|---|
| Supabase lỗi | Giữ cache hiện có, hiển thị cảnh báo và retry |
| Worker lỗi | Hiển thị dữ liệu persisted từ Supabase |
| WebSocket lỗi | Reconnect, sau đó fallback polling |
| Prediction chưa có | Hiển thị trạng thái đang cập nhật, không coi là crash |
| Build không lấy được route | Fail build, không deploy bản thiếu routes |
| Admin token hết hạn | Refresh session hoặc yêu cầu đăng nhập lại |

#### 5.10. Frontend acceptance criteria

- [ ] Build đủ 104 analysis routes.
- [ ] Prediction mới hiển thị không cần deploy frontend.
- [ ] Highlight mới hiển thị không cần deploy frontend.
- [ ] WebSocket minute update không tạo query teams.
- [ ] Worker lỗi vẫn xem được schedule và persisted scores.
- [ ] Supabase lỗi tạm thời không làm UI crash.
- [ ] WebSocket tự reconnect hoặc fallback polling.
- [ ] Admin chưa đăng nhập không mutation được.
- [ ] Loading/error/empty states rõ ràng.
- [ ] ESLint và build thành công.

#### 5.11. Rollback frontend

- Giữ data contract public endpoint tương thích trong suốt phase.
- Mỗi page được chuyển từng bước thay vì thay toàn bộ cùng lúc.
- Có thể revert từng page về `dataManager.ts` cũ.
- Rollback Cloudflare Pages về deployment production trước nếu có lỗi.

### Phase 6 — Observability và vận hành

Ước lượng: 1–2 ngày.

- [ ] Chuẩn hóa job name/source trong `wc2026_api_sync_log`.
- [ ] Mỗi job có `started_at`, `finished_at`, `rows_read`, `rows_written`, status và error message.
- [ ] Thêm correlation/job ID.
- [ ] Thêm distributed lock hoặc idempotency key cho batch job.
- [ ] Bật Worker observability/logs phù hợp Free tier.
- [ ] Theo dõi:
  - Worker request count.
  - Worker CPU errors.
  - DO request/storage writes.
  - WebSocket reconnect rate.
  - Supabase PATCH rate.
  - Cron success/failure.
  - GitHub Action duration/failure.
- [ ] Tạo checklist vận hành ngày có trận.

## 8. Thứ tự triển khai khuyến nghị

```text
Phase 0 Baseline
    -> Phase 1 Security
    -> Phase 2 Node 24
    -> Phase 3 Schema
    -> Phase 4 Worker modules
    -> Phase 5 Frontend strategy
    -> Phase 6 Observability
```

Không nên bắt đầu Phase 4/5 trước khi hoàn thành security và schema baseline, vì refactor trên một schema không xác định sẽ làm tăng rủi ro.

## 9. Ước lượng tổng thể

| Phase | Ước lượng |
|---|---:|
| Phase 0 — Baseline | 0,5 ngày |
| Phase 1 — Security | 1–2 ngày |
| Phase 2 — Node 24 | 0,5–1 ngày |
| Phase 3 — Schema | 1–2 ngày |
| Phase 4 — Worker modules | 2–4 ngày |
| Phase 5 — Frontend data | 3,5–5 ngày |
| Phase 6 — Observability | 1–2 ngày |
| **Tổng** | **9,5–16,5 ngày làm việc** |

Ước lượng chưa bao gồm thời gian xử lý sự cố hoặc thay đổi ngoài quyền kiểm soát từ provider.

## 10. Dependencies và blockers

### Dependencies

- Quyền quản lý Wrangler Secrets và deploy Worker.
- Supabase MCP được authenticate đúng project.
- Quyền tạo/quản lý Supabase Auth admin user.
- Quyền sửa GitHub Actions secrets/workflows.
- Quyền rollback Cloudflare Pages/Worker deployment.

### Blockers có thể gặp

- Production schema khác đáng kể so với SQL trong repo.
- RLS production có policy không được source-control.
- Key wc2026api hiện tại có thể bị rate-limit, lạm dụng hoặc vô hiệu hóa vì đã lộ và không thể rotate.
- Worker bundle vượt giới hạn sau khi chuyển TypeScript/bundling.
- Scraper phụ thuộc DOM bên thứ ba thay đổi.

Sau 2–3 lần thử thất bại cho cùng một vấn đề, dừng triển khai, chuyển sang diagnosis, ghi lại root cause và đề xuất hướng mới.

## 11. Checklist deploy production

### Trước deploy

- [ ] Git worktree chỉ có thay đổi thuộc phase hiện tại.
- [ ] Secrets không xuất hiện trong diff/log/bundle.
- [ ] `npm ci` thành công.
- [ ] `npm run lint` thành công.
- [ ] `npm run build` thành công.
- [ ] Có đủ 104 route analysis.
- [ ] Worker local/dry validation thành công.
- [ ] Supabase read/write test đúng quyền.
- [ ] Có deployment/commit rollback.

### Deploy Pages

```powershell
npx wrangler pages deploy out --project-name lichworldcup --branch main
```

### Sau deploy

- [ ] Trang chủ tải teams/matches.
- [ ] `/standings` và `/bracket` hoạt động.
- [ ] Một route `/analysis/[matchId]` hoạt động.
- [ ] `/live` và WebSocket hoạt động.
- [ ] Admin login đúng.
- [ ] Unauthenticated mutation bị từ chối.
- [ ] Highlight hiển thị.
- [ ] Không có error spike trong Worker logs.

## 12. Tài liệu tham khảo

- Supabase Node.js 20 deprecation: https://supabase.com/changelog/45715-deprecation-notice-dropping-support-for-node-js-20
- Supabase Data API security: https://supabase.com/docs/guides/api/securing-your-api
- Cloudflare Worker limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Durable Object limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- Cloudflare Pages Next.js: https://developers.cloudflare.com/pages/framework-guides/nextjs/
- Cloudflare Workers Next.js: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/

## 13. Quyết định đang chờ phê duyệt

- [ ] Phê duyệt Supabase Auth + `app_metadata.role = admin` làm cơ chế admin chính.
- [ ] Phê duyệt Node.js 24 cho local và GitHub Actions.
- [ ] Phê duyệt giữ một Worker deployment và chỉ tách module.
- [ ] Phê duyệt giữ Next.js static export trên Pages.
- [ ] Phê duyệt thứ tự triển khai Phase 0 -> Phase 6.

Quyết định đã xác nhận:

- [x] Nhà cung cấp wc2026api không cấp lại key; dự án chấp nhận tiếp tục sử dụng key hiện tại.
- [x] Không đặt rotate/revoke `WC2026_API_KEY` làm điều kiện triển khai.
- [x] Vẫn chuyển key hiện tại sang Wrangler Secret để ngừng phát tán thêm trong các commit mới.

Không phase nào trong tài liệu này được xem là đã triển khai cho tới khi task tương ứng được thực hiện, kiểm thử và đánh dấu hoàn tất.
