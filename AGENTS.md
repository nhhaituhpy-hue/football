<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Quy tắc Dự án Lịch Thi Đấu World Cup 2026

## 1. Deploy lên Production (Cloudflare Pages)
- **Quy tắc**: Mọi hoạt động deploy dự án phải được đẩy thẳng lên môi trường production, không deploy lên nhánh master/preview thông thường (để tránh wrangler tạo preview alias master.lichworldcup.pages.dev thay vì trỏ thẳng vào main production).
- **Nhánh chỉ định**: Sử dụng flag `--branch main` khi chạy lệnh deploy của wrangler.
- **Lệnh thực thi**:
  ```bash
  npx wrangler pages deploy out --project-name lichworldcup --branch main
  ```

## 2. Quản lý và Thay đổi Database qua MCP
- **Quy tắc**: Tất cả các cập nhật database, thay đổi schema, tạo bảng, hay chèn dữ liệu mẫu/dữ liệu thực tế lên Supabase phải được thực hiện thông qua **Supabase MCP server** (công cụ `execute_sql` hoặc các công cụ Schema tương ứng).
- **Không thực hiện**: Không chạy script SQL trực tiếp bên ngoài hoặc qua các công cụ không được theo dõi bởi agent nếu không có yêu cầu đặc biệt.
- **Project ID**: `qblkjphwwnrexlhfqoyo`
