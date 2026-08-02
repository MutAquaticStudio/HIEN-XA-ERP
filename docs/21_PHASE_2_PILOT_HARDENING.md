# Phase 2: Pilot hardening theo vai trò

## Mục tiêu

Phase 2 không mở thêm posting tài chính từ portal. Mục tiêu là chứng minh rằng
mỗi vai trò trong pilot chỉ xem và thực hiện đúng phần việc của mình, trong khi
kho, ledger, công nợ, tiền công và audit vẫn do server-side workflow kiểm soát.

## Hardening đã áp dụng

- Projection cho tài xế và thợ không còn trả giá bán, VAT bán, biên lợi nhuận,
  lead time, ngưỡng tồn hoặc lịch sử giá của vật tư.
- Projection cho NCC chỉ trả đơn mua của chính NCC và giá đã thỏa thuận trên
  dòng PO; không trả giá bán lẻ hay chính sách thương mại nội bộ.
- Projection khách vẫn có giá bán công khai cho hàng của chính họ, nhưng không
  có biên lợi nhuận, lịch sử giá, ngưỡng tồn hoặc dữ liệu đối tác khác.
- Regression test nằm tại `tests/role-projection-hardening.test.ts`.

## Kịch bản UAT bắt buộc

| Vai trò | Kiểm tra đạt | Không được phép |
| --- | --- | --- |
| Owner/Kế toán | Duyệt chứng từ, reversal, đối chiếu và audit | Sửa trực tiếp ledger hoặc tồn |
| Kho | Nhận hàng, kiểm kho, cảnh báo thiếu hàng | Xác nhận thu/chi hoặc công nợ |
| Điều phối/Tài xế | Điều phối, GPS web khi tab mở, báo giao/chênh lệch | Sửa số lượng giao hoặc post kho/phải thu |
| Thợ | Nhận việc atomic, ghi sản lượng/vị trí của việc được giao | Xem giá, công nợ, lịch sử giá hoặc việc riêng tư của người khác |
| Khách | Đặt hàng, xem công nợ của mình, chụp ảnh xác nhận | Xem tồn, giá vốn, hồ sơ khách khác hoặc tự post thanh toán |
| NCC | Phản hồi PO của mình, gửi thông báo giao | Xem giá bán lẻ/đối tác khác hoặc tự post kho/phải trả |

## Bằng chứng cần có trước pilot production

1. Full unit suite, typecheck và build đạt.
2. E2E browser trên staging cho từng dòng trong bảng trên.
3. Database integration xác nhận RLS, Storage private, CSRF và idempotency.
4. Rehearsal cutover Phase 1 có đối chiếu bằng `0`; không dùng runtime CAS làm
   nguồn ghi production sau khi traffic chuyển.
5. Deep security scan mới và UAT có chữ ký owner trước khi promote production.
