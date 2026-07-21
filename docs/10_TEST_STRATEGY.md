# Test Strategy

## 1. Các lớp test

- Unit tests cho calculation và policy
- Domain tests cho invariant/state machine
- Integration tests cho database transaction
- Constraint tests cho unique/check/FK
- Authorization tests
- Import and reconciliation tests
- End-to-end tests
- Mobile UX tests
- Offline retry/idempotency tests

## 2. Critical scenarios

1. Một phiếu thu phân bổ nhiều đơn.
2. Một đơn nhận nhiều lần thanh toán.
3. Khách trả dư tiền.
4. Reverse phiếu thu.
5. Đơn mua chia kho mình và giao thẳng.
6. Nhận hàng nhiều đợt.
7. Giao hàng nhiều đợt.
8. Direct delivery không tăng kho.
9. Receipt request retry không post trùng.
10. Hai người sửa cùng chứng từ.
11. Bảng giá thay đổi nhưng snapshot cũ giữ nguyên.
12. Moving average cost chính xác.
13. Sales return cập nhật kho và công nợ đúng.
14. Chia công đều, theo hệ số và thủ công.
15. Tổng chia công sai phải bị chặn.
16. Output không được tính công hai lần.
17. Tạm ứng giảm employee payable đúng.
18. Driver không xem COGS.
19. Posted document không hard delete.
20. Import xử lý ngày text và dòng nghi trùng.
21. Offline completion retry không tạo hai work output.
22. One vehicle cannot be assigned to overlapping active trips.
23. Một tài xế không được có hai chuyến active cùng ngày.
24. Supplier/employee cash out bị chặn nếu quỹ không đủ.
25. Trạng thái phiếu phải khớp đúng cash transaction và sub-ledger entry.
26. Direct delivery reversal ghi hai bút toán ngược và không tạo kho.
27. Direct delivery reversal bị chặn sau khi phải thu được phân bổ.
28. Nhập-xuất-nhập lại vẫn tính moving average theo giá trị tồn có dấu.
29. Đơn nháp không được ghi nhận doanh thu tháng.
30. Giá vốn tháng gồm issue kho và direct cost; reversal loại cả doanh thu và giá vốn.
31. Import batch chỉ reviewed khi không còn issue mở thuộc batch.
32. Production actor spoofing từ browser bị fail-closed.
