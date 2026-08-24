# HIỀN XA ERP V2 — PRODUCT PURCHASE / SALE PRICE & MARKUP

## 1. Kết luận

ProductUnit hiện có bộ giá thương mại rõ ràng gồm giá mua chuẩn, tỷ lệ markup theo phần trăm và giá bán chuẩn. Công thức được kiểm tra lại ở domain/server; UI hỗ trợ tính hai chiều, phân biệt giá trị `0` với giá trị chưa khai báo, từ chối markup âm và không cho lưu bộ giá thiếu hoặc mâu thuẫn.

- Branch: `codex/erp-v2-product-pricing-20260824`
- Base SHA: `bf2b7d9df24090dc4f7262111eb53f5cbde14a3e`
- Phạm vi: source ERP V2, fixture cục bộ/cô lập, unit/integration-style tests, authenticated Playwright và rendered browser QA.
- Không deploy staging, không deploy production và không mutation production.
- Candidate chưa được commit hoặc push trong Goal này.

## 2. Công thức và hợp đồng dữ liệu

| Yêu cầu | Hợp đồng authoritative | Kết quả |
|---|---|---|
| Giá mua | `purchasePrice >= 0` trên ProductUnit | PASS |
| Markup | phần trăm uplift, `markupRate >= 0` | PASS |
| Giá bán | `salePrice >= 0` trên ProductUnit | PASS |
| Tính xuôi | `salePrice = purchasePrice × (1 + markupRate / 100)` | PASS |
| Tính ngược | `markupRate = (salePrice / purchasePrice - 1) × 100` | PASS |
| Giá mua bằng 0 | chỉ bộ `purchasePrice=0`, `salePrice=0` hợp lệ; không chia cho 0 | PASS |
| Undefined và zero | `undefined` là chưa khai báo; `0` là giá trị hợp lệ có chủ ý | PASS |
| Markup âm | từ chối ở domain/server | PASS |
| Bộ giá không nhất quán | từ chối ở domain/server với tolerance tiền tệ 0,01 | PASS |

`targetMarginRate` cũ vẫn giữ nguyên ý nghĩa gross-margin fraction trong các policy đã phát hành; không bị đổi nghĩa thành markup và không được dùng để suy ngược lịch sử.

## 3. Product create/edit và lịch sử bất biến

- Create Product yêu cầu đủ quyền tạo danh mục và quyền quản lý giá thương mại; server xác minh lại cả ba giá trị và tạo bản ghi lịch sử đầu tiên.
- Edit Product yêu cầu `expectedVersion`, lý do thay đổi và permission server-side. Thành công tăng version, ghi actor, thời gian, lý do, old/new purchase price, markup, sale price và VAT.
- UI tính hai chiều purchase + markup → sale và purchase + sale → markup; preview luôn phản ánh đúng payload sẽ gửi.
- Mutation intent ổn định chặn double-submit; lỗi server không làm mất dữ liệu form; thành công dùng router refresh/navigation nên không cần F5.
- Danh sách hiển thị vật tư, đơn vị, giá mua, markup, giá bán và trạng thái khi actor có quyền xem giá.
- Chi tiết có khu vực **Giá & thương mại**, lợi nhuận/đơn vị, VAT, giá sau VAT và lịch sử giá append-only.
- CAS từ chối version cũ; retry cùng idempotency key không ghi thêm lịch sử.

## 4. Tính bất biến của chứng từ

| Luồng | Hành vi | Kết quả |
|---|---|---|
| Purchase master reference | PO mới có thể lấy giá mua chuẩn làm giá tham khảo | PASS |
| Purchase actual price | người dùng có quyền vẫn nhập giá thực tế trên PO; giá PO không ghi ngược ProductUnit | PASS |
| Purchase history | đổi giá master không sửa PO, receipt, AP, inventory, export hoặc DocumentUnitSnapshot đã có | PASS |
| Sales draft/new | server bỏ qua giá/VAT từ client, đọc lại sale price/VAT authoritative hiện hành | PASS |
| Sales confirmed/history | đổi giá master không sửa chứng từ đã chụp snapshot | PASS |
| Sales update eligible draft | dòng được cập nhật từ giá hiện hành và lưu snapshot mới theo đúng state/version | PASS |

## 5. Đơn vị và quy đổi

- Fixed conversion dùng cùng hệ số authoritative để quy đổi giá mua và giá bán ở Purchase, Sales và Customer Portal.
- Client không thể giả hệ số; server luôn đọc lại ProductUnit/conversion hiện hành trước khi tính base quantity và snapshot.
- Variable conversion chỉ hợp lệ trong Purchase và được chốt theo số thực nhận; không tự sinh giá bán Customer/Sales và không xuất hiện trong Customer Portal.
- Inventory, kiểm kê, moving-average cost và lịch sử chứng từ tiếp tục lưu theo base unit/snapshot đã phát hành.

## 6. RBAC và portal privacy

| Actor/surface | Purchase price | Markup/history/profit | Sale price | Mutation | Kết quả |
|---|---:|---:|---:|---:|---|
| Internal có permission giá | Có | Có | Có | Theo permission catalog | PASS |
| Internal không có permission giá | Ẩn | Ẩn | Ẩn | Bị server từ chối | PASS |
| Warehouse/Driver/Worker | Ẩn | Ẩn | Ẩn | Bị server từ chối | PASS |
| Customer Portal | Không | Không | Chỉ giá bán public của chính catalog | Không sửa master | PASS |
| Supplier Portal | Không | Không | Không | Không sửa master | PASS |

Customer catalog là purpose-built allow-list DTO. Projection loại bỏ `purchasePrice`, `markupRate`, lịch sử giá, profit, target margin, cost, supplier và reorder metadata trước khi tới client. Test kiểm tra cả object/JSON/DOM, bao gồm Customer A/B và Supplier A/B cross-scope. Không bổ sung public debug endpoint.

## 7. Verification executable

| Check | Kết quả | Evidence |
|---|---|---|
| Focused product pricing | PASS | 1 file, 13 tests; formula, zero/negative, history, CAS, RBAC, idempotency, immutable docs, portal privacy, fixed/variable conversion |
| Full Vitest | PASS | 148 files, 664 tests |
| Typecheck final | PASS | `tsc --noEmit`, rerun sau khi thêm E2E pricing |
| Next production build | PASS | compile/typecheck và toàn bộ 55 route/page artifacts |
| OpenNext/Cloudflare build | PASS | clean Linux release-target build bằng Node 24.17.0; không mang `.env.integration.local` vào build copy |
| Worker security scan | PASS | bundle không chứa runtime dependency bị cấm theo repository scan |
| Public Playwright | PASS | 24/24, 6 viewport, axe/visual/order wizard |
| Product pricing authenticated UX | PASS | 6/6 serial, 1440×900, 1366×768, 1024×768, 390×844, 375×812, 360×800 |
| Authenticated role matrix | PASS | 54/54 serial, 8 roles và shell persistence |
| Cross-scope account isolation | PASS | 24/24 serial, Customer A/B, Supplier A/B, Worker A/B, Driver A/B |
| Final patch check | PASS | `git diff --check`; không có staged file hoặc tracked secret material |

Một thử nghiệm OpenNext trực tiếp trên Windows trước release-target build gặp giới hạn dung lượng và native Sharp của nền tảng. Gate authoritative được chạy lại từ clean Linux source copy và PASS; kết quả Windows không được chuyển thành PASS hay dùng thay cho Linux gate.

## 8. Rendered browser QA

Flow xác minh: `/dat-hang` → chọn/tăng số lượng Xi măng và Cát đen → số lượng cùng tổng sau VAT cập nhật ngay → catalog chỉ hiển thị giá bán/VAT an toàn.

- Desktop 1440×900: ba sản phẩm render đúng; Xi măng `89.000 ₫/bao`; tăng số lượng lên 2 cập nhật tổng `192.240 ₫`; không có error/warning console.
- Mobile 390×844: card xếp một cột, không overflow ngang; tăng Cát đen lên 1 cập nhật tổng `456.840 ₫`; control vẫn usable và không có error/warning console.
- DOM desktop/mobile không có chuỗi hoặc field giá mua, markup, lợi nhuận hay history nội bộ.
- Bộ Playwright pricing lặp cùng hành vi ở đủ sáu viewport, có Axe, create/edit/detail, owner positive, warehouse negative, portal privacy và no-F5.

## 9. Release boundary

| Gate | Trạng thái |
|---|---|
| Product pricing implementation | PASS |
| Regression / build / security | PASS |
| Authenticated and portal E2E | PASS |
| Rendered browser QA | PASS |
| Ready for staging validation | YES |
| Staging deployment | NOT RUN — ngoài phạm vi Goal |
| Production change/mutation/deploy | NO |

Không còn blocker code/test trong phạm vi Product Pricing. Bước tiếp theo được phép là tạo release candidate/commit theo yêu cầu riêng, sau đó chạy staging validation; Goal này dừng trước các hành động đó.
