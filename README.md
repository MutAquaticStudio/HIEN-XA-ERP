# VLXD Operations System — Codex Context Kit

Bộ tài liệu này là nguồn thông tin nền để Codex xây dựng web app quản lý cửa hàng vật liệu xây dựng.

## Bắt đầu

Codex phải đọc `AGENTS.md` trước. Sau đó đọc tài liệu theo thứ tự được ghi trong file đó.

## Cấu trúc

- `AGENTS.md`: quy tắc bắt buộc khi viết code
- `PROJECT_BRIEF.md`: phạm vi và mục tiêu sản phẩm
- `GLOSSARY.md`: thuật ngữ nghiệp vụ
- `docs/`: phân tích hiện trạng, domain, kiến trúc, database, UX, migration, testing và roadmap
- `docs/diagrams/`: sơ đồ Mermaid
- `docs/data/`: mapping Excel, permissions và backlog dạng máy đọc
- `adr/`: Architecture Decision Records
- `schema/core.dbml`: bản nháp schema logic
- `reference/Demo.xlsx`: workbook nguồn để đối chiếu
- `prompts/CODEX_KICKOFF.md`: prompt bắt đầu phiên làm việc mới

## Trạng thái

Tài liệu hiện là architecture baseline, chưa phải schema migration cuối cùng. Những vấn đề chưa chốt được ghi trong `docs/12_OPEN_QUESTIONS.md`.

## Mục tiêu sử dụng

1. Khởi tạo repository.
2. Đọc context.
3. Chốt các open questions có ảnh hưởng lớn.
4. Tạo skeleton modular monolith.
5. Triển khai Phase 1 theo backlog.
6. Đối soát mọi migration với `Demo.xlsx`.

## Chạy ứng dụng local

Sau bootstrap, workspace có Next.js app tối thiểu cho lát cắt xác nhận đơn bán.

```bash
npm install
npm run dev
```

Before a clean start, copy `.env.example` to `.env.local` and replace every
placeholder. The app intentionally has no built-in default administrator
credentials. Production also requires `ERP_SESSION_SECRET`, HTTPS
`NEXT_PUBLIC_APP_URL`, and the trusted `ERP_ALLOWED_ORIGINS` host list.

Kiểm tra kiểu và domain tests:

```bash
npm run check
```

Ghi chú triển khai hiện tại nằm tại `docs/14_IMPLEMENTATION_NOTES.md`.

## Nguyên tắc tối quan trọng

Ba nguồn số dư chính phải là ledger:

- Customer/Supplier ledger
- Inventory ledger
- Employee compensation ledger

Dashboard và báo cáo chỉ là read model; không được trở thành nguồn dữ liệu độc lập.
