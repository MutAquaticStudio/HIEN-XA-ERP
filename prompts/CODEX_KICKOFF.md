# Codex Kickoff Prompt

Hãy đọc `AGENTS.md` và toàn bộ source-of-truth documents theo thứ tự được chỉ định.

Sau đó:

1. Tóm tắt domain và các invariant không được vi phạm.
2. Liệt kê open questions có thể chặn phần việc hiện tại.
3. Đề xuất implementation slice nhỏ nhất có thể chạy end-to-end.
4. Không viết landing page.
5. Không tạo CRUD độc lập nếu chưa xác định aggregate, transaction boundary và posting side effects.
6. Mọi logic công nợ, kho, giá vốn và tiền công phải nằm phía server.
7. Khi tạo schema, đối chiếu với `schema/core.dbml`, nhưng cập nhật tài liệu nếu có quyết định tốt hơn.
8. Khi hoàn thành một slice, cập nhật:
   - tests
   - docs
   - ADR nếu có quyết định kiến trúc mới
   - backlog status

Slice đầu tiên khuyến nghị:

- Authentication
- Customer/Product/Unit master data
- Sales Order draft/confirm
- Pricing snapshot
- Server authorization
- Audit log
- Domain tests
