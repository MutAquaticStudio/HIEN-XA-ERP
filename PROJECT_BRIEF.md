# Project Brief

## Tên tạm

VLXD Operations System

## Bài toán

Doanh nghiệp đang dùng Excel để quản lý bán hàng, công nợ, vật tư và nhân viên. Quy trình thực tế phức tạp hơn Excel hiện tại vì hàng có thể:

- Nhập về kho cửa hàng
- Giao thẳng từ nhà cung cấp đến khách
- Chia một lần mua cho nhiều điểm nhận
- Lấy từ nhiều nguồn cho cùng một đơn bán

Nhân công không chỉ chấm theo giờ mà chủ yếu tính theo sản lượng, số chuyến, nhiệm vụ hoặc giá trọn gói.

## Người dùng

- Chủ cửa hàng
- Kế toán
- Nhân viên bán hàng
- Nhân viên kho
- Điều phối
- Tài xế
- Phụ xe
- Thợ bốc xếp
- Người chạy chạc
- Giám sát
- Người chỉ xem

Phần lớn người dùng không chuyên công nghệ và có thể là người trung niên.

## Mục tiêu sản phẩm

- Thay thế quy trình Excel dễ sai
- Theo dõi chính xác phải thu, phải trả và dòng tiền
- Phân biệt hàng trong kho với hàng giao thẳng
- Biết giá vốn và lợi nhuận từng đơn/dịch vụ
- Theo dõi giao hàng và sản lượng nhân công
- Có lịch sử chỉnh sửa và phân quyền
- Sử dụng tốt trên máy tính và điện thoại Android phổ thông

## Full ERP capabilities

1. Customer and supplier management
2. Product catalog and units
3. Sales orders
4. Purchase orders
5. Goods receipt and direct delivery
6. Inventory ledger
7. Delivery jobs
8. Receivables and payables
9. Cash receipts and payments
10. Work orders and piece-rate compensation
11. Employee advances and settlements
12. Reporting
13. Excel migration
14. Audit and permissions

## Full ERP baseline

Phase 1 không đóng ở bản tối thiểu. Lõi đầu tiên phải cho phép chạy xuyên suốt và giữ đúng invariant tài chính/kho/công:

`Bán → cấp nguồn → nhập kho hoặc giao thẳng → giao khách → phát sinh công nợ → thu tiền → ghi nhận sản lượng → duyệt công → thanh toán nhân viên → báo cáo`

## Triển khai sau khi lõi ERP ổn định

Các mục dưới đây không bị loại khỏi tầm nhìn sản phẩm, nhưng chỉ triển khai sau khi lõi vận hành, dữ liệu, phân quyền và audit đã đủ chắc:

- Full accounting general ledger
- Microservices
- Route optimization
- Native mobile application
- Facial attendance
- Automatic bank reconciliation
- E-invoice integration
- AI forecasting
