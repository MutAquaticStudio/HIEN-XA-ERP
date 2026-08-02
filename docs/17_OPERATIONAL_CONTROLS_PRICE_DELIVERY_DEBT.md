# Kiểm soát giá, giao nhận và công nợ

## 1. Đổi giá vật tư

1. Chủ cửa hàng hoặc nhân viên được cấp quyền nhập giá bán, VAT, biên lợi nhuận, thời gian giao và ngưỡng tồn theo kho.
2. Bắt buộc nêu lý do thay đổi.
3. Hệ thống tạo một bản lịch sử bất biến chứa giá cũ, giá mới, người đổi và thời điểm đổi.
4. Giá mới chỉ dùng cho đơn hoặc báo giá tạo sau thời điểm lưu. Đơn cũ giữ nguyên pricing snapshot.

## 2. Xác nhận giao hàng

1. Người giao chụp ảnh bằng chứng giao và gửi yêu cầu hoàn tất; không nhập số lượng thực giao.
2. Khách mở trang `/khach-hang/xac-nhan-giao`, đăng nhập tài khoản của mình và chụp ảnh nhận hàng.
3. Chủ cửa hàng hoặc kế toán duyệt giao sau khi có ảnh khách; khi đó mới ghi xuất kho append-only và phải thu.
4. Nếu khách không thể chụp ảnh, chỉ Chủ cửa hàng được miễn ảnh; phải nêu lý do và có audit.

## 3. Chênh lệch số lượng

1. Người giao chỉ tạo báo chênh lệch kèm lý do và bằng chứng.
2. Chủ cửa hàng hoặc kế toán duyệt/từ chối báo chênh lệch.
3. Số lượng được duyệt mới được dùng để post giao một phần. Phần còn lại của đơn giữ mở để giao tiếp.
4. Không sửa số lượng đã post; nếu sai sau posting phải dùng reversal/adjustment theo workflow hiện có.

## 4. Cảnh báo tồn và thu hồi công nợ

- Mỗi vật tư có thể đặt ngưỡng tồn tối thiểu riêng cho từng kho.
- Cảnh báo kho được tính từ inventory movements: `Sắp hết` khi tồn không vượt ngưỡng, `Hết hàng` khi tồn nhỏ hơn hoặc bằng 0.
- Hạn phải thu được tính từ ngày giao thực tế cộng điều khoản thanh toán trên snapshot đơn.
- Danh sách nhắc nợ chỉ gồm nghĩa vụ còn mở: trước hạn 7, 3, 1 ngày và mỗi ngày quá hạn.
- Mỗi khách có thể được gán một người phụ trách thu hồi; mọi lần liên hệ được ghi nhật ký, không sửa trực tiếp số dư ledger.
