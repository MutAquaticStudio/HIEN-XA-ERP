# Risk Register

| Rủi ro | Khả năng | Ảnh hưởng | Biện pháp |
|---|---|---|---|
| Import sai công nợ | Cao | Rất cao | Reconciliation theo khách và batch rollback |
| Trùng khách hàng | Cao | Cao | Normalize, phone matching, manual merge |
| Vật tư trùng tên/đơn vị | Cao | Cao | Product-unit unique code |
| Người dùng quay lại Excel | Cao | Cao | Role-based UX, training, cutover policy |
| Post trùng do mạng yếu | Trung bình | Cao | Idempotency key, unique posting key |
| Direct delivery làm sai kho | Cao | Rất cao | Bounded workflow và invariant |
| Tiền công tính hai lần | Trung bình | Cao | Unique output-compensation link |
| Sửa chứng từ đã post | Cao | Cao | Reversal only, permissions |
| Scope MVP quá lớn | Cao | Cao | Phase gate và backlog priority |
| Logic tài chính ở client | Trung bình | Rất cao | Server transaction |
| Giá cũ đổi theo bảng giá mới | Trung bình | Cao | Pricing/rate snapshot |
| Tồn đầu kỳ không đối chiếu | Cao | Cao | Physical count and sign-off |
| Người trung niên thao tác nhầm | Cao | Cao | Large controls, review step, simple mode |
| Quyền truy cập sai | Trung bình | Rất cao | Server policy tests + RLS |
| Báo cáo khác số ledger | Trung bình | Cao | Read models derived from source ledger |
