# Current State and Excel Findings

## 1. Workbook

Workbook nguồn: `reference/Demo.xlsx`, khoảng 28 MB, gồm 16 sheet.

### Nhóm sheet

- `Thong tin`: danh mục vật tư, khách hàng, nhân viên
- `5.26`, `6.26`, `7.26`: giao dịch tháng 5–7/2026
- `1.26–4.26`, `8.26–12.26`: sheet mẫu/ẩn
- `TH`: dữ liệu tổng hợp
- `Tong_hop_KH`: tổng hợp khách hàng
- `Công nợ`: báo cáo công nợ

Dữ liệu quan sát được đến ngày 15/07/2026.

## 2. Quy mô dữ liệu đã phân tích

- 3.344 dòng dữ liệu trong ba sheet tháng
- 2.992 dòng bán hàng
- 74 khách hàng khác nhau
- Khoảng 5,134 tỷ đồng trước VAT
- Khoảng 5,430 tỷ đồng sau VAT

Các số này dùng để profiling, không được coi là số kế toán cuối cùng trước khi reconciliation.

## 3. Lỗi và rủi ro đã phát hiện

### 3.1 Ngày tháng

- 47 giao dịch ngày 14/07/2026 được lưu dạng text nên bị `QUERY` loại khỏi sheet tổng hợp.
- Một dòng trong sheet tháng 6 mang ngày 29/04/2026, làm báo cáo sai kỳ.
- Ngày, số và serial date bị trộn trong một số trường.

### 3.2 Bộ lọc và tổng hợp

- Sheet tháng 6 còn bộ lọc khách hàng `TUẤN LẠI`.
- Dòng tổng dùng `SUBTOTAL`, do đó số hiển thị phụ thuộc bộ lọc.
- Một ô tổng thanh toán có dấu hiệu nhập thủ công thay vì công thức.
- Công thức Google Sheets khi xuất sang Excel có thể biến thành hàm không được Excel tính lại.

### 3.3 Công nợ và VAT

- Công thức `Còn lại` thay đổi logic tùy hình thức thanh toán.
- Khi hình thức thanh toán trống, một số dòng dùng tiền trước VAT thay vì sau VAT.
- Hơn một nửa dòng bán hàng chưa có hình thức thanh toán.
- Có dòng đã thanh toán đủ nhưng số còn lại vẫn âm.

### 3.4 Danh mục vật tư

Tên vật tư không phải khóa duy nhất.

Ví dụ `Cát đen` có nhiều đơn vị và giá. Tra cứu theo tên có thể chọn sai dòng đầu tiên.

Các đơn vị quan sát được trong danh mục và giao dịch gồm `Bao`, `Kg`, `Tấn`, `Cây`, `Hộp`, `Viên`, `Túi`, `Khối`, `M3`, `Xe`, `Xe cn to`, `Xe điện`, `Xe oto`, `Ôtô`, `Oto to`, `Xe máy`, `Xe rùa`, `Ca`, `Giờ`, `Lượt`, `Mã`, `Gầu`, `Xẻng`, `Xô` và `Lết`. Biến thể hoa/thường, không dấu được gộp khi đưa vào danh mục ứng dụng; `KHG` được coi là lỗi nhập của `Kg`.

Cần chuyển thành:

- Product
- Unit
- Product Unit
- Price Rule

### 3.5 Dữ liệu nghi ngờ

- Có giao dịch có khả năng nhập trùng.
- Có số lượng giống serial date của Excel.
- Khách hàng, nhân viên và vật tư có bản ghi trùng tên.
- Một số dòng có thể là thu công nợ, điều chỉnh hoặc dư đầu kỳ nhưng được lưu chung với bán hàng.

## 4. Kết luận migration

Không import các cột sau như nguồn sự thật:

- Còn lại
- Tổng cộng
- Sheet tổng hợp
- Kết quả công thức
- Số dư báo cáo chưa đối chiếu

Phải phân loại từng dòng thành:

- Master data
- Sales transaction
- Payment
- Opening balance
- Adjustment
- Suspicious/invalid

Xem mapping tại `docs/data/excel-field-mapping.csv`.
