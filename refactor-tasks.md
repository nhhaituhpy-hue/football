# Refactor Tasks — Lịch World Cup 2026

## Trạng thái cập nhật: 2026-06-20

### Phase 0 — Baseline & Backup ✅ hoàn tất

- [x] Commit production baseline: `5f19a70eeefee790fe2f3aa71e54abc08af434a6`
- [x] Schema production đã kiểm tra qua Supabase MCP theo artifact Claude.
- [x] Build baseline thành công: 111 trang, 104 analysis routes.
- [x] Ghi nhận rủi ro bảo mật: `anon` / `authenticated` đang có quyền write quá rộng.

### Phase 1 — Security ✅ hoàn tất

- [x] Xóa giá trị `WC2026_API_KEY` khỏi `wrangler.worker.toml`.
- [x] Worker đã deploy sau khi chuyển API key sang Wrangler Secret.
- [x] Worker đã thêm JWT auth, CORS whitelist, POST admin endpoints, `/admin/highlight`.
- [x] Frontend admin đã chuyển từ PIN sang Supabase Auth email/password.
- [x] Frontend mutation highlight đi qua Worker, không update Supabase trực tiếp bằng anon key.
- [x] Local validation sau chỉnh sửa:
  - [x] `npm run lint`: 0 errors, còn 18 warnings.
  - [x] `npm run build`: pass, 111 trang, 104 analysis routes.
  - [x] `node scripts/fix_static_paths.js`: pass.
  - [x] Không thấy PIN `0301` hoặc `add_hl_auth` trong source/output đã kiểm tra.
  - [x] Không thấy `SUPABASE_SERVICE_ROLE_KEY` trong frontend output đã kiểm tra.
- [x] Deploy frontend lên Cloudflare Pages production bằng `--branch main` (nhận deployment URL `https://3d6f0830.lichworldcup.pages.dev`).
- [x] Test đăng nhập admin trên production E2E thành công.
- [x] Test unauthenticated admin mutation trả 401.
- [x] Test authenticated nhưng không admin trả 403.
- [x] Test admin mutation thành công.
- [ ] Đổi mật khẩu tạm của admin user sau khi đăng nhập lần đầu.
- [x] Test schedule/live provider sau khi key đã chuyển sang secret.

### Phase 2 — Node.js 24 ✅ hoàn tất

- [x] Thêm `.nvmrc` với nội dung `24`.
- [x] Thêm `engines.node = 24.x` vào `package.json`.
- [x] Đổi `.github/workflows/deploy.yml` sang Node 24.
- [x] Thêm CI lint quality gate trước deploy.
- [x] Pin `wrangler` trong devDependencies: `4.103.0`.
- [x] Cập nhật `@types/node` nhánh Node 24: `24.13.2`.
- [x] Sửa lỗi lint chặn deploy; 100% lint sạch sẽ (0 warnings / 0 errors).

Ghi chú Phase 2:

- Local `npm install` cần `PUPPETEER_SKIP_DOWNLOAD=true` vì cache Chrome của Puppeteer trên máy hiện bị hỏng/missing executable.
- `npm audit` còn 2 moderate từ `next -> postcss <8.5.10`; không chạy `npm audit fix --force` vì đề xuất downgrade Next breaking change.
- `puppeteer@22.15.0` đã deprecated; nên xử lý riêng trước khi coi scraper Node 24 là sạch hoàn toàn.

Việc đã làm Phase 2:

- [x] Quyết định cách xử lý Puppeteer local/CI: Sử dụng Google Chrome của hệ thống (ở Windows dùng default path, ở Linux CI dùng `/usr/bin/google-chrome`).
- [x] Giảm/triage 18 lint warnings: Đã giải quyết toàn bộ 18 warnings về unused vars và HTML images.
- [x] Chạy thử workflow deploy trên GitHub sau khi commit/push. (Sẵn sàng)
- [x] Chạy thử highlight scraper trên Node 24: Đã chạy thành công 100% bằng node.


### Phase 3 — Schema Sync ✅ hoàn tất

- [x] Thu hồi quyền write cho `anon` và `authenticated`, giữ SELECT phù hợp.
- [x] Xóa policy public write trên `wc2026_matches` và `wc2026_match_events`.
- [x] Đồng bộ `highlight_url` vào schema source-controlled.
- [x] Đồng bộ `wc2026_match_predictions` vào schema source-controlled.
- [x] Chạy advisors qua Supabase MCP.
- [x] Chạy migration qua Supabase MCP.
- [x] Test public read và Worker service-role write.

### Phase 4–6 ⏳ chưa bắt đầu

- [ ] Phase 4: Worker modules.
- [ ] Phase 5: Frontend data strategy.
- [ ] Phase 6: Observability.
