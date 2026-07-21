# Excel Migration Plan

## 1. Nguyên tắc

Không import trực tiếp workbook như database. Migration phải có profiling, cleaning, dry run và reconciliation.

## 2. Các giai đoạn

1. Data profiling
2. Mapping
3. Chuẩn hóa khách hàng, vật tư, đơn vị, nhân viên
4. Deduplication
5. Phân loại transaction
6. Xác định opening balances
7. Dry-run import
8. Reconciliation
9. User acceptance
10. Final import
11. Parallel run
12. Cutover
13. Post-migration audit

## 3. Chiến lược lịch sử

Khuyến nghị:

- Import giao dịch chi tiết từ 05/2026 trở đi sau khi làm sạch
- Phần lịch sử cũ hơn dùng opening balance đã ký xác nhận
- Không import sheet `TH`, `Tong_hop_KH`, `Công nợ` làm transaction source

## 4. Các lỗi phải xử lý

- Ngày dạng text
- Ngày sai tháng
- Serial date nằm trong quantity
- Dòng nghi trùng
- Customer duplicate
- Product name duplicate
- Unit ambiguity
- Missing payment method
- VAT/debt mismatch
- Payment không xác định nghĩa vụ
- Opening balance không có nguồn

## 5. Reconciliation

Đối chiếu theo tháng và đối tượng:

- Doanh thu trước VAT
- VAT
- Doanh thu sau VAT
- Tiền đã thu
- Phải thu
- Mua hàng
- Phải trả
- Tồn kho
- Tiền công
- Tạm ứng

Sai lệch phải có issue record và quyết định xử lý.

## 6. Rollback

- Giữ bản workbook đóng băng tại cutover
- Import dùng batch ID
- Có thể reverse toàn batch trước khi người dùng post giao dịch mới
- Sau go-live, không xóa batch; dùng correction migration có audit
