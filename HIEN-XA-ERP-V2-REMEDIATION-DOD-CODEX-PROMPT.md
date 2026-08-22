# HIỀN XA ERP V2 — QUY TẮC SỬA LỖI, DEFINITION OF DONE & CODEX PROMPT

**Repository:** `MutAquaticStudio/HIEN-XA-ERP`  
**Phạm vi:** Web ERP  
**Harness revision:** `1.2 — mandatory repository-rescan + failure-prevention execution contract`  
**Cập nhật:** `2026-08-18`  
**Mục tiêu:** Rewrite UI/UX V2 đồng thời sửa các lỗi liên kết dữ liệu xuyên module, dropdown rỗng, workflow chưa kết nối, và các thiếu hụt nghiệp vụ đã thống nhất.  
**Nguyên tắc:** Không làm lại domain tài chính/kho nếu logic hiện tại đang đúng; ưu tiên sửa kiến trúc dữ liệu, projection, read model, routing và UX.

---

# 0. MANDATORY REPOSITORY RESCAN — PHẢI ĐỌC LẠI CODE TRƯỚC KHI SỬA

**Bước này bắt buộc và phải hoàn tất trước mọi thay đổi source. Không được sửa code, tạo migration, đổi schema, refactor UI hoặc bắt đầu implementation trước khi hoàn thành repository rescan.**

File này được viết dựa trên một checkpoint của project. Vì vậy khi bắt đầu thực thi, **mọi nhận định về code hiện tại trong tài liệu này chỉ là hypothesis cho đến khi được xác nhận lại từ latest `main`**.

## 0.1. Quy tắc scan

Trước bất kỳ edit nào:

1. `git fetch` và xác định **latest `main` SHA** thực tế.
2. Xác nhận branch hiện tại và working tree.
3. Inventory toàn bộ repository tree.
4. Đọc lại `AGENTS.md`, `PROJECT_BRIEF.md`, `README.md`, ADRs và package scripts.
5. Đọc lại schema, migrations, persistence/backend đang dùng.
6. Deep-scan toàn bộ Web ERP source liên quan, không chỉ search vài symbol.
7. Đọc lại test suite trước khi thiết kế fix.
8. Đối chiếu docs cũ với code hiện tại và ghi rõ drift.
9. Chỉ sau khi scan + evidence PASS mới được tạo/tiếp tục feature branch để sửa.

## 0.2. Phạm vi bắt buộc phải scan

```text
AGENTS.md
PROJECT_BRIEF.md
README.md
package.json
tsconfig / eslint / vitest / playwright configs
OpenNext / Wrangler / Cloudflare configs

src/app/**
src/components/**
src/erp/**
src/lib/**
src/modules/**
src/server/**

schema/**
migrations/**
supabase/**            # historical input nếu còn
tests/**
test/**
e2e/**
playwright/**

docs/**
adr/**
```

`apps/mobile/**` không nằm trong scope rewrite, nhưng phải scan các shared type/import có khả năng bị ảnh hưởng bởi thay đổi domain dùng chung.

## 0.3. Current-state map bắt buộc phải tái dựng

Scan phải xác minh lại bằng source:

```text
CURRENT ROUTE MAP
CURRENT NAVIGATION MODEL
CURRENT DOMAIN TYPES
CURRENT CREATE COMMANDS
CURRENT OPERATIONS
CURRENT RBAC PERMISSIONS
CURRENT PROJECTION RULES
CURRENT D1/PERSISTENCE MODEL
CURRENT MIGRATIONS
CURRENT INVENTORY INVARIANTS
CURRENT RECEIVABLE/PAYABLE INVARIANTS
CURRENT PAYMENT CONFIRM/ALLOCATION FLOW
CURRENT WORK CLAIM FLOW
CURRENT CUSTOMER PORTAL CATALOG FLOW
CURRENT UNIT CONVERSION FLOW
CURRENT SNAPSHOT/REVISION SYNC FLOW
CURRENT DROPDOWN DATA SOURCES
CURRENT TEST COVERAGE
CURRENT BUILD/RELEASE COMMANDS
```

Không được dùng hội thoại cũ, mockup hoặc assumption cũ để thay thế việc đọc current source.

## 0.4. Evidence phải tạo trước khi sửa

Tạo equivalent evidence trong branch, ví dụ:

```text
docs/erp-v2-remediation/
  00-repository-rescan.md
  00-code-map.md
  00-current-behavior.md
  00-current-route-map.md
  00-current-data-flow.md
  00-current-domain-command-map.md
  00-current-rbac-projection-map.md
  00-current-dropdown-inventory.md
  00-current-test-map.md
```

`00-repository-rescan.md` tối thiểu:

```text
RESCAN_MAIN_SHA=
RESCAN_TIMESTAMP=
REPOSITORY_TREE_REVIEWED=
WEB_ROUTES_REVIEWED=
DOMAIN_MODULES_REVIEWED=
SERVER_APPLICATION_REVIEWED=
PERSISTENCE_REVIEWED=
MIGRATIONS_REVIEWED=
RBAC_PROJECTION_REVIEWED=
PORTAL_REVIEWED=
TESTS_REVIEWED=
BUILD_CONFIG_REVIEWED=
DOC_CODE_DRIFT=
UNKNOWN_OR_UNVERIFIED_AREAS=
```

## 0.5. Gate trước khi implementation

Chỉ được sửa code khi toàn bộ đều PASS:

```text
REPOSITORY_RESCAN = PASS
CURRENT_CODE_MAP = PASS
CURRENT_DATA_FLOW_MAP = PASS
CURRENT_RBAC_PROJECTION_MAP = PASS
CURRENT_DROPDOWN_INVENTORY = PASS
CURRENT_TEST_MAP = PASS
```

Nếu bất kỳ mục nào `FAIL`, `BLOCKED`, `UNKNOWN` hoặc `NOT RUN`:

**STOP. Không bắt đầu implementation.**

Báo:

```text
BLOCKER
MISSING_EVIDENCE
AFFECTED_PATHS
WHY_SCAN_IS_INCOMPLETE
MINIMUM_SAFE_NEXT_ACTION
```

## 0.6. Nếu code hiện tại khác tài liệu

1. Không ép code khớp assumption cũ.
2. Ghi `DOC_CODE_DRIFT`.
3. Xác định behavior thật sự đang chạy.
4. Kiểm tra test/invariant hiện tại.
5. Chọn fix từ requirement đã khóa + invariant an toàn.
6. Cập nhật remediation plan trước khi edit.

## 0.7. Nếu `main` đổi trong lúc làm

Pin `RESCAN_MAIN_SHA`.

Nếu `main` thay đổi materially trước merge hoặc rebase kéo vào các file thuộc scope:

- re-scan các path bị thay đổi;
- rerun impacted characterization tests;
- cập nhật code/data-flow map;
- không reuse PASS evidence cũ cho source đã đổi.

**Không có ngoại lệ cho repository rescan.**

---

# 1. MỤC TIÊU CỦA ĐỢT SỬA

Đợt sửa này không được coi là một loạt patch UI rời rạc.

Đây là một **ERP Web V2 remediation + UX rewrite**, gồm:

1. Kết nối lại dữ liệu xuyên module.
2. Sửa tất cả dropdown bị rỗng dù dữ liệu đã tồn tại.
3. Chuẩn hóa một source of truth cho master data.
4. Đảm bảo dữ liệu tạo ở một nơi xuất hiện đúng ở mọi nơi có quyền sử dụng.
5. Rewrite toàn bộ ERP UI thành một hệ thống thống nhất.
6. Tạo route riêng cho các danh mục và trang chi tiết.
7. Đưa logic quy đổi đơn vị về đúng trang vật tư.
8. Redesign form tạo đơn bán và mua.
9. Tách rõ nguồn hàng và phân việc.
10. Bổ sung tồn đầu kỳ.
11. Sửa luồng nhân sự/phiếu công.
12. Đổi module Excel chính sang xuất dữ liệu kế toán.
13. Giữ nguyên các invariant tài chính, kho, công nợ, audit, RBAC, reversal, idempotency.

---

# 2. NON-NEGOTIABLE RULES

## 2.1. Một dữ liệu chỉ được tạo một lần

Nếu một entity đã tồn tại trong Master Data thì các module khác **phải dùng cùng ID đó**.

Ví dụ:

```text
Vật tư
  ↓
Sales
Purchase
Inventory
Portal khách
```

Không được:

```text
Vật tư trong Catalog
Vật tư trong Kho
Vật tư trong Portal
```

là ba bản ghi khác nhau.

Tương tự cho:

- Khách hàng
- Nhà cung cấp
- Nhân sự
- Kho / bãi
- Phương tiện
- Đơn vị
- Vật tư

## 2.2. D1 là nguồn dữ liệu nghiệp vụ chính trong runtime Cloudflare

Luồng dữ liệu chuẩn:

```text
D1
 ↓
Domain State
 ↓
Authorization / Projection
 ↓
Shared Read Model / Selector
 ↓
UI
```

Không để từng component tự dựng luật riêng từ raw state nếu cùng một nghiệp vụ được dùng nhiều nơi.

## 2.3. Không sửa dropdown bằng dữ liệu giả

Tuyệt đối không:

```ts
employees ?? demoEmployees
products ?? fallbackProducts
```

Không hard-code lựa chọn mặc định để che lỗi.

Nếu dropdown rỗng, phải trace:

```text
D1
 ↓
Backend snapshot
 ↓
OperationsState
 ↓
Projection / RBAC
 ↓
Shared selector
 ↓
Component
```

và sửa root cause.

## 2.4. Cross-module propagation là release gate P0

Sau khi tạo một entity, mọi module downstream phải nhìn thấy entity đó ở revision hợp lệ tiếp theo.

Ví dụ:

```text
Create Product
  ├→ Sales thấy
  ├→ Purchase thấy
  ├→ Inventory thấy
  └→ Customer Portal thấy

Create Employee
  ├→ Work Assignment thấy
  ├→ Work Order thấy
  └→ Delivery thấy nếu role phù hợp

Create Warehouse
  ├→ Purchase destination thấy
  ├→ Sales source thấy
  └→ Inventory transfer thấy
```

Không cần user nhập lại dữ liệu.

Không được yêu cầu F5 thủ công như giải pháp bình thường.

## 2.5. Projection phải phục vụ nghiệp vụ, nhưng không phá RBAC

Projection được phép lọc dữ liệu theo quyền.

Projection **không được vô tình loại mất dữ liệu mà màn hình có quyền hợp lệ cần dùng**.

Nếu Sales cần chọn nhân sự để phân việc thì Sales projection/read model phải có đủ worker phù hợp.

Nếu Inventory cần vật tư thì inventory read model phải có product master phù hợp.

Nếu Customer Portal cần catalog thì portal phải dùng public-safe catalog read model, không dùng projection nội bộ sai mục đích.

## 2.6. Không cho sửa trực tiếp số dư

Không tạo field editable cho:

- Đang nợ khách hàng
- Còn phải trả nhà cung cấp
- Tồn kho
- Tiền mặt / tiền ngân hàng
- Công còn phải trả nhân viên

Các số này phải được tính từ transaction/ledger/movement.

## 2.7. Kho chỉ thay đổi qua Inventory Movement

Tồn kho:

```text
opening
receipt
issue
transfer_out
transfer_in
adjustment
reverse
```

Không:

```text
stock = 500
```

rồi sửa trực tiếp.

## 2.8. Công nợ chỉ thay đổi qua ledger/payment

Không sửa trực tiếp balance khách/NCC.

Thu tiền và khớp chứng từ là hai thao tác khác nhau.

```text
Đã thu tiền
≠
Đã khớp vào hóa đơn/chứng từ
```

## 2.9. Chứng từ lịch sử phải giữ snapshot

Nếu cấu hình đơn vị, giá, VAT hoặc quy đổi thay đổi sau này, chứng từ cũ không được thay đổi theo.

## 2.10. Quy đổi đơn vị do người dùng tự cài

ERP không tự quyết định công thức quy đổi.

Ví dụ người dùng có thể tự khai báo:

```text
1 bao = 50 kg
1 tạ = 2 bao
1 tấn = 20 bao
```

hoặc:

```text
1 xe = 6 m³
```

Hệ thống chỉ:

- lưu cấu hình,
- validate dữ liệu,
- áp dụng đúng cấu hình,
- snapshot vào chứng từ,
- không tự suy diễn thay người dùng.

## 2.11. Không phá audit

Các hành vi quan trọng phải có audit:

- backdate ngày chứng từ
- sửa master data
- sửa quy đổi đơn vị
- discount
- commission
- opening stock
- assignment
- claim work
- payment matching
- reversal

Audit timestamp luôn là thời gian thao tác thật.

## 2.12. Không phá idempotency

Retry hoặc double-click không được tạo:

- đơn bán trùng
- đơn mua trùng
- phiếu thu/chi trùng
- opening stock trùng
- allocation trùng
- claim work trùng

## 2.13. Sửa sai bằng reversal, không xóa lịch sử

Đối với giao dịch tài chính/kho/công đã ghi nhận:

```text
Sai
 ↓
Reverse
 ↓
Ghi lại đúng
```

Không delete lịch sử để làm sạch số liệu.

---

# 3. KIẾN TRÚC DỮ LIỆU V2 BẮT BUỘC

```text
                       D1
                        │
                        ▼
               Operations Backend
                        │
                        ▼
                  Domain State
                        │
                        ▼
                 RBAC / Scope
                        │
                        ▼
               Projection Layer
                        │
                        ▼
              Shared Read Models
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
      Sales          Purchase         Inventory
        │               │                │
        ├───────────────┼────────────────┤
        ▼               ▼                ▼
   Receivables       Payables         Workforce
        │               │                │
        └───────────────┼────────────────┘
                        ▼
                 Customer Portal
```

## Shared selectors/read models cần có

Tối thiểu:

```ts
getSelectableCustomers(actor, context)
getSelectableSuppliers(actor, context)
getSelectableProducts(actor, context)
getSelectableWarehouses(actor, context)
getAssignableWorkers(actor, context)
getAvailableVehicles(actor, context)
getProductUnits(productId)
getCustomerPortalCatalog(customerContext)
```

Không để từng page tự filter một bộ luật khác nhau.

---

# 4. P0 DEFECTS & DEFINITION OF DONE

## P0-01 — Dropdown rỗng dù dữ liệu đã tồn tại

### Lỗi

Các dropdown như:

- Nhân viên
- Vật tư
- Kho
- Nhà cung cấp
- Khách hàng
- Phương tiện

có trường hợp trống dù master data đã được tạo.

### Root cause phải điều tra

```text
Persistence
→ Snapshot
→ OperationsState
→ Projection
→ Scope
→ status filter
→ role filter
→ component
```

### Cách sửa

1. Audit tất cả dropdown.
2. Xác định entity source cho từng dropdown.
3. Dùng shared selector.
4. Sửa projection dependency.
5. Không hardcode fallback.
6. Empty state phải giải thích được vì sao không có lựa chọn.

### DOD

- [ ] Tạo một Employee active.
- [ ] Mở Work Order form.
- [ ] Employee xuất hiện mà không refresh thủ công.
- [ ] Tạo một Warehouse active.
- [ ] Warehouse xuất hiện ở Purchase destination.
- [ ] Warehouse xuất hiện ở Inventory transfer.
- [ ] Tạo Supplier.
- [ ] Supplier xuất hiện trong Purchase.
- [ ] Tạo Product.
- [ ] Product xuất hiện trong Sales/Purchase/Inventory.
- [ ] Không dropdown nào render blank option list nếu entity hợp lệ tồn tại.
- [ ] Không dùng demo/fallback entity.
- [ ] Test projection/RBAC pass.

## P0-02 — Dữ liệu giữa các module không đồng bộ tốt

### Lỗi

Các module đang có xu hướng hoạt động như những màn độc lập dùng cùng database, thay vì một ERP liên thông.

### Cách sửa

Chuẩn hóa data dependency:

```text
Master Data
 ↓
Read Models
 ↓
Operational Modules
```

Sau mutation:

```text
Command
 ↓
Persist
 ↓
Revision mới
 ↓
Projection mới
 ↓
UI mới
```

### DOD

- [ ] Entity tạo ở module A được module B đọc ngay đúng revision.
- [ ] Không cần nhập lại.
- [ ] Không cần F5 thủ công.
- [ ] Polling chỉ là recovery/realtime convenience, không phải workaround cho stale state.
- [ ] Mutation response cập nhật state đúng.
- [ ] Route độc lập được revalidate nếu cần.
- [ ] Cross-module integration tests pass.

## P0-03 — Product không propagation đúng ra Customer Portal

### Lỗi

Vật tư tạo trong ERP phải trở thành nguồn dữ liệu cho portal khách.

### Rule mới

Product có các trạng thái public:

```text
Visible on portal = yes/no
Orderable online = yes/no
```

Nếu public:

```text
Có giá + VAT + có hàng
→ Có thể đặt

Có giá + VAT + hết hàng
→ Tạm hết hàng

Thiếu giá hoặc VAT
→ Cần báo giá
```

Không tự ẩn product chỉ vì hết tồn hoặc thiếu giá, trừ khi cấu hình hide.

### DOD

- [ ] Tạo Product active.
- [ ] Bật "Hiển thị cho khách".
- [ ] Portal nhìn thấy product.
- [ ] Thiếu giá/VAT → "Cần báo giá".
- [ ] Có giá/VAT, tồn = 0 → "Tạm hết hàng".
- [ ] Có giá/VAT, tồn > 0 → "Có thể đặt".
- [ ] Tắt public → portal không thấy.
- [ ] Portal không lộ giá nội bộ / preferred supplier / margin.
- [ ] Customer order dùng đúng product ID từ master data.

---

# 5. UI/UX V2 DEFECTS & DOD

## P1-01 — ERP UI rời rạc, nhiều form dọc hẹp

### Sửa

Rewrite toàn bộ ERP Web UI thành một design system thống nhất.

### DOD

- [ ] Sidebar/navigation thống nhất.
- [ ] Page header thống nhất.
- [ ] Toolbar/search/filter thống nhất.
- [ ] Form không còn bị bó hẹp trong side-stack nếu nghiệp vụ cần nhiều cột.
- [ ] Desktop order editor full-width.
- [ ] Mobile không bị shrink desktop.
- [ ] Không lẹm chữ tiếng Việt.
- [ ] Không horizontal viewport overflow.

## P1-02 — Danh mục chưa có route riêng

### Sửa

Tạo:

```text
/catalog/customers
/catalog/customers/[id]
/catalog/suppliers
/catalog/suppliers/[id]
/catalog/products
/catalog/products/[id]
/catalog/warehouses
/catalog/warehouses/[id]
/catalog/vehicles
/catalog/vehicles/[id]
/catalog/employees
/catalog/employees/[id]
```

### DOD

- [ ] Mỗi danh mục có list page.
- [ ] Mỗi record có detail route.
- [ ] Back/forward hoạt động.
- [ ] URL bookmark được.
- [ ] RBAC server-side.
- [ ] Không còn dùng `<details>` trong bảng làm detail experience chính.

## P1-03 — Detail layout đối tác chưa đúng

### Sửa

Desktop:

```text
HEADER
Tên
Mã
Trạng thái
Quay lại

LEFT: Hồ sơ / sửa
RIGHT: Tổng hợp tiền

TABS:
Đơn hàng
Công nợ
Thanh toán
Bút toán
Lịch sử ghi nhận
```

### DOD

- [ ] Customer detail đúng layout.
- [ ] Supplier detail đúng layout.
- [ ] Mobile một cột.
- [ ] Tab scroll ngang được trên mobile.
- [ ] Table dài chuyển sang card khi cần.

---

# 6. PRODUCT & UNIT CONVERSION

## P1-04 — "Cài đặt đơn vị mua" sai vị trí nghiệp vụ

### Sửa

Đưa quy đổi vào Product Detail.

### Product detail tabs

```text
Tổng quan
Quy đổi đơn vị
Tồn kho
Giá & lịch sử
Mua / bán
Lịch sử ghi nhận
```

### Rule

Người dùng tự cài:

```text
Đơn vị A = X đơn vị B
```

Hệ thống không tự sáng tạo công thức.

### DOD

- [ ] Mỗi Product có UI quản lý conversion.
- [ ] Tạo/sửa/xóa/deactivate conversion có permission.
- [ ] Fixed conversion hoạt động.
- [ ] Variable conversion hoạt động nếu hiện domain cần.
- [ ] Order dùng conversion đã lưu.
- [ ] User không phải nhập lại factor trong mỗi đơn.
- [ ] Document snapshot giữ conversion lịch sử.
- [ ] Sửa conversion không làm thay đổi đơn cũ.

---

# 7. SALES V2

## P1-05 — Tạo đơn bán khó nhìn

### Sửa

Desktop line editor:

```text
Vật tư | ĐVT | SL | Đơn giá | CK | VAT | Thành tiền | Xóa
```

Header:

```text
Khách hàng
Ngày đơn
Điều khoản
Ngày giao
CTV
Địa chỉ
Ghi chú
```

### DOD

- [ ] Full-width desktop.
- [ ] Mobile line card.
- [ ] Add/remove line.
- [ ] User chọn Product từ master data.
- [ ] User chọn unit đã cấu hình.
- [ ] Không nhập factor thủ công với fixed conversion.
- [ ] Validation rõ.
- [ ] Tổng tiền realtime.

## P1-06 — Thiếu ngày chứng từ

### Sửa

Cho phép nhập business date.

### Rule

```text
orderDate = ngày chứng từ
createdAt/audit = thời gian tạo thật
```

### DOD

- [ ] User chọn được ngày đơn.
- [ ] Backdate hợp lệ.
- [ ] Audit không bị backdate.
- [ ] Ngày giao/điều khoản tính đúng từ business date nếu domain yêu cầu.

## P1-07 — Discount / CTV / Total chưa đầy đủ

### Sửa

Discount:

```text
%
hoặc
số tiền
```

Commission:

```text
CTV/người giới thiệu
%
hoặc
số tiền
```

### Rule

Commission là chi phí nội bộ.

Không giảm `Khách phải trả`.

### DOD

- [ ] % discount đúng.
- [ ] fixed discount đúng.
- [ ] VAT đúng.
- [ ] delivery charge đúng nếu có.
- [ ] commission % đúng.
- [ ] commission amount đúng.
- [ ] commission không làm thay đổi customer gross.
- [ ] Total realtime đúng deterministic selector/service.

---

# 8. NGUỒN HÀNG & PHÂN VIỆC

## P1-08 — "Phân bổ nguồn" gộp hai nghiệp vụ khác nhau

### Sửa

Tách:

```text
NGUỒN HÀNG
PHÂN VIỆC
```

### Nguồn hàng

```text
Kho
Mua NCC
Giao thẳng khách
```

### Phân việc

```text
Quản lý chỉ định
hoặc
Để thợ tự nhận
```

### DOD

- [ ] Hai khái niệm có UI riêng.
- [ ] Work assignment dùng WorkOrder hiện có.
- [ ] Open pool dùng claim workflow hiện có.
- [ ] Không tạo work assignment system thứ hai.
- [ ] Hai worker claim cùng lúc → chỉ một người thắng.
- [ ] Replay không claim trùng.

---

# 9. PURCHASE V2

## P1-09 — Purchase form dọc/chật

### Sửa

Desktop:

```text
Vật tư | ĐVT | SL | Giá nhập | CK | VAT | Điểm nhận | Thành tiền
```

Header:

```text
NCC
Ngày đơn
Điều khoản
Ngày dự kiến nhận
Ghi chú
```

### Điểm nhận

```text
Kho/Bãi
hoặc
Giao thẳng khách
```

### DOD

- [ ] Full-width desktop editor.
- [ ] Mobile cards.
- [ ] Product/Supplier/Warehouse dropdown dùng shared selector.
- [ ] Purchase discount đúng.
- [ ] Total đúng.
- [ ] Direct delivery giữ linkage với Sales.
- [ ] Existing receipt approval giữ nguyên.
- [ ] Existing reversal giữ nguyên.

---

# 10. INVENTORY V2

## P1-10 — Chưa có UX tạo tồn đầu kỳ

### Sửa

Thêm:

```text
Tạo tồn đầu kỳ
```

Input:

```text
Kho
Vật tư
Đơn vị
Số lượng
Ngày ghi nhận
Đơn giá vốn nếu costing yêu cầu
Lý do
```

### Rule

Tạo:

```text
InventoryMovement
movementType = opening
```

### DOD

- [ ] Tạo được opening stock.
- [ ] Không edit balance trực tiếp.
- [ ] Opening idempotent.
- [ ] Có audit.
- [ ] Có permission.
- [ ] StockBalance thay đổi từ movement.
- [ ] Có reversal strategy hợp lệ.

## P1-11 — "Tạo sản phẩm trong kho" dễ sinh duplicate

### Sửa

Kho không sở hữu Product.

Kho dùng Product Master.

Nếu chưa có:

```text
+ Tạo vật tư mới
```

sau đó quay lại flow kho.

### DOD

- [ ] Không tạo Product duplicate.
- [ ] Product mới có cùng ID ở Sales/Purchase/Inventory/Portal.
- [ ] Inventory chỉ tạo relation/movement cần thiết.

---

# 11. WORKFORCE V2

## P1-12 — Employee dropdown trong Phiếu công rỗng

### Sửa

Trace root cause.

### DOD

- [ ] Employee active + eligible xuất hiện.
- [ ] Inactive không xuất hiện.
- [ ] Role không phù hợp không xuất hiện.
- [ ] User không có quyền không thấy dữ liệu ngoài scope.
- [ ] Không có employee → message rõ, không blank dropdown.

## P1-13 — Phiếu công layout chưa phù hợp

### Sửa

Desktop:

```text
Thợ / nhân viên
Công việc
Sản lượng
Đơn vị
Tổng tiền công
Ngày
Nguồn đơn / công việc
```

### DOD

- [ ] Desktop grid rõ.
- [ ] Mobile 1–2 cột.
- [ ] Approval trước compensation.
- [ ] Không tính công trùng.
- [ ] Tạm ứng/thanh toán vẫn reconcile đúng employee ledger.

---

# 12. FINANCE LANGUAGE & UX

## P1-14 — Thuật ngữ quá kỹ thuật

### UI mapping

```text
Receivable balance → Đang nợ
Money received → Đã thu
Money paid → Đã chi
Unallocated payment → Chưa khớp chứng từ
Allocate → Khớp chứng từ
Ledger → Lịch sử ghi nhận
```

### DOD

- [ ] Customer detail dùng từ đời thường.
- [ ] Supplier detail dùng từ đời thường.
- [ ] Internal code có thể giữ technical names.
- [ ] Không global replace làm hỏng domain terminology.

---

# 13. EXCEL / ACCOUNTING EXPORT

## P1-15 — Module chính đang là Import Excel

### Sửa

Main navigation:

```text
Xuất dữ liệu kế toán
```

### Filters

```text
Từ ngày
Đến ngày
```

### Sheets

```text
BAN_HANG
MUA_HANG
THU_CHI
CONG_NO_KH
CONG_NO_NCC
TON_KHO
TIEN_CONG
BUT_TOAN
```

### DOD

- [ ] Export `.xlsx` thật.
- [ ] Date range đúng.
- [ ] User chọn sheet.
- [ ] Export read-only.
- [ ] Không mutate ERP.
- [ ] Permissions đúng.
- [ ] Số liệu reconcile với domain selectors/read models.

## P1-16 — Legacy import vẫn cần nhưng sai vị trí

### Sửa

Chuyển:

```text
Quản trị
→ Nhập dữ liệu cũ
```

### DOD

- [ ] ImportJob giữ.
- [ ] ImportIssue giữ.
- [ ] Dry-run giữ.
- [ ] Resolve/ignore giữ.
- [ ] Không còn là module nghiệp vụ chính cho user thường.

---

# 14. RESPONSIVE DOD

Test tối thiểu:

```text
1440x900
1366x768
1024x768
390x844
375x812
360x800
```

Pass khi:

- [ ] Không horizontal viewport overflow.
- [ ] Không clipped text.
- [ ] Không button mất.
- [ ] Money không wrap vô lý.
- [ ] Tabs dùng được.
- [ ] Tables dài chuyển card khi hợp lý.
- [ ] Order line mobile là card.
- [ ] Detail mobile một cột.
- [ ] Empty/loading/error state đầy đủ.

---

# 15. CROSS-MODULE CONNECTIVITY TEST MATRIX

## Customer

```text
Create Customer
→ Sales customer dropdown
→ Receivables
→ Customer payment
→ Delivery context
→ Customer detail
```

DOD: tất cả PASS.

## Supplier

```text
Create Supplier
→ Purchase supplier dropdown
→ Product preferred supplier
→ Payables
→ Supplier payment
→ Supplier detail
```

DOD: tất cả PASS.

## Product

```text
Create Product
→ Sales
→ Purchase
→ Inventory
→ Inventory count
→ Customer Portal
```

DOD: tất cả PASS.

## Warehouse

```text
Create Warehouse
→ Purchase destination
→ Sales source
→ Inventory transfer
→ Stock reporting
```

DOD: tất cả PASS.

## Employee

```text
Create Employee
→ Work assignment
→ Work order
→ Compensation
→ Employee payment
```

DOD: tất cả PASS.

## Vehicle

```text
Create Vehicle
→ Delivery job
```

DOD: PASS.

---

# 16. SECURITY & DATA-SAFETY DOD

- [ ] Server-side RBAC trên mọi route mới.
- [ ] Projection không leak financial/internal data.
- [ ] Customer Portal không nhận internal margin/cost/supplier info.
- [ ] Supplier Portal không nhận sale price/internal customer info ngoài scope.
- [ ] Warehouse scope vẫn enforce.
- [ ] Idempotency cho mutation.
- [ ] Audit cho action nhạy cảm.
- [ ] Reversal thay delete.
- [ ] Không production fixtures.
- [ ] Không mutate production khi test.
- [ ] Không đổi Cloudflare release architecture ngoài nhu cầu bắt buộc.

---

# 17. RELEASE GATES

Không merge nếu bất kỳ gate nào FAIL:

```text
BASELINE_CHARACTERIZATION = PASS
REPOSITORY_RESCAN = PASS
CURRENT_CODE_MAP = PASS
CURRENT_DATA_FLOW_MAP = PASS
CURRENT_RBAC_PROJECTION_MAP = PASS
CURRENT_DROPDOWN_INVENTORY = PASS
CURRENT_TEST_MAP = PASS
CROSS_MODULE_DATA_CONNECTIVITY = PASS
DROPDOWN_DATA_INTEGRITY = PASS
PORTAL_CATALOG_PROPAGATION = PASS
SCHEMA_MIGRATION_SAFETY = PASS
FINANCIAL_INVARIANTS = PASS
INVENTORY_INVARIANTS = PASS
RBAC_PROJECTION = PASS
AUDIT_IDEMPOTENCY = PASS
DASHBOARD_CHART_DATA_INTEGRITY = PASS
REGRESSION_MATRIX = PASS
DESKTOP_RESPONSIVE_QA = PASS
MOBILE_RESPONSIVE_QA = PASS
TYPECHECK_LINT_TEST_BUILD = PASS
DESIGN_SYSTEM_FIDELITY = PASS
NO_PRODUCTION_MUTATION = PASS
```

---


# 18. NGÔN NGỮ THIẾT KẾ V2 — LOCKED VISUAL SPEC

Phần này là **design specification chính thức** cho lần rewrite ERP Web V2. Nếu mockup, component cũ hoặc CSS hiện tại mâu thuẫn với phần này, implementation mới phải ưu tiên spec này trừ khi có blocker nghiệp vụ/accessibility cụ thể.

**Design direction đã chốt:** sạch, rộng, data-first, hiện đại nhưng không phô trương; cảm giác của một hệ thống vận hành doanh nghiệp thật, không phải landing page hoặc admin template generic.

Reference concept: **“HIỀN XA ERP — NGÔN NGỮ THIẾT KẾ V2”** bản refinement đã duyệt trong quá trình thiết kế. Nếu hình reference không được cung cấp cho môi trường implement, phần text specification bên dưới là nguồn chuẩn.

---

## 18.1. Design principles

### 1. Rõ ràng trước trang trí

Mỗi màn phải trả lời ngay:

```text
Tôi đang ở đâu?
Tôi đang xem đối tượng nào?
Việc chính tôi cần làm là gì?
Số liệu quan trọng nhất là gì?
Trạng thái hiện tại là gì?
```

Không thêm decoration nếu không giúp người dùng hiểu hoặc thao tác nhanh hơn.

### 2. Data-first

ERP ưu tiên:

- số tiền,
- trạng thái,
- chứng từ,
- ngày,
- số lượng,
- đối tác,
- hành động tiếp theo.

Typography, spacing và màu phải giúp đọc dữ liệu nhanh, không cạnh tranh với dữ liệu.

### 3. Một màn — một nhiệm vụ chính

Ví dụ:

- Sales List → tìm và theo dõi đơn bán.
- Sales Editor → tạo/sửa đơn.
- Customer Detail → hiểu toàn bộ quan hệ với một khách.
- Inventory → hiểu tồn và phát sinh.

Không nhồi quá nhiều create forms, reports và settings vào cùng một viewport.

### 4. Enterprise nhưng thân thiện

UI phải đủ chuyên nghiệp cho quản lý/kế toán, nhưng dùng được với nhân sự không chuyên công nghệ.

Ưu tiên:

- label rõ,
- nút có động từ,
- empty state có giải thích,
- error nói người dùng cần làm gì tiếp theo.

### 5. Màu mang ý nghĩa

Blue = primary action / selected state / navigation.

Green = thành công / đã thu / hoàn thành / positive.

Amber = chờ xử lý / cần chú ý.

Red = lỗi / quá hạn / nợ cảnh báo / hành động nguy hiểm.

Cyan/Info = thông tin trung tính cần nhấn nhẹ.

Không dùng màu chỉ để “cho đẹp”.

### 6. Density có kiểm soát

ERP không được quá thoáng như website marketing, cũng không được dày đặc như spreadsheet thô.

Mục tiêu: **medium operational density**.

- Dashboard: dễ scan.
- Form nhập liệu: compact và nhanh.
- Detail page: nhiều dữ liệu nhưng chia hierarchy rõ.
- Mobile: giảm density, không giảm thông tin quan trọng.

---

## 18.2. Visual identity

### Sidebar

Desktop dùng sidebar navy đậm cố định.

Đặc điểm:

```text
Background: deep navy
Text: white / muted blue-gray
Active item: blue fill
Icon: outline, đồng nhất stroke
Section label: uppercase/small muted
```

Sidebar phải tạo cảm giác ổn định và làm “khung” cho toàn ERP.

Không dùng gradient sidebar.

Không dùng hiệu ứng glass.

Không dùng shadow nặng.

### Main workspace

Main background:

```text
white / very light slate
```

Panels và cards dùng nền trắng với border nhẹ.

Không biến mọi nhóm nội dung thành một card bo tròn lớn.

Ưu tiên:

- open layout,
- table,
- section band,
- simple bordered panel,
- information group.

---

## 18.3. Color tokens

Các token dưới đây là palette reference của bản refinement. Có thể map sang CSS variables hiện có nếu giữ đúng quan hệ màu và contrast.

```css
--hx-primary: #3563EB;
--hx-primary-dark: #174EA6;

--hx-success: #16A34A;
--hx-warning: #F59E0B;
--hx-danger: #DC2626;
--hx-info: #0EA5E9;

--hx-gray-50:  #F8FAFC;
--hx-gray-100: #F1F5F9;
--hx-gray-200: #E2E8F0;
--hx-gray-300: #CBD5E1;
--hx-gray-400: #94A3B8;
--hx-gray-500: #64748B;
--hx-gray-600: #475569;
--hx-gray-700: #334155;
--hx-gray-800: #1E293B;
--hx-gray-900: #0F172A;

--hx-sidebar: #062448;
--hx-sidebar-active: #0D4D92;
```

Nếu contrast thực tế không đạt WCAG AA, điều chỉnh luminance nhưng không đổi semantic relationship của palette.

### Semantic usage

```text
Primary blue
→ CTA, active navigation, selected tab, focus, link quan trọng

Success green
→ Hoàn thành, Đã thu, Đã thanh toán, Đang hoạt động

Warning amber
→ Chờ duyệt, Cần xử lý, Sắp quá hạn

Danger red
→ Quá hạn, lỗi, hủy/đảo nguy hiểm, nợ cảnh báo

Neutral slate
→ text, border, table, metadata
```

Không dùng red cho con số chỉ vì số giảm nếu đó không phải trạng thái xấu về nghiệp vụ.

---

## 18.4. Typography

Primary UI font:

```text
Inter
```

Fallback:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Reference scale:

```text
H1 / Page title       28px / 700
H2 / Section title    22px / 700
H3 / Panel title      18px / 600
Body                  14px / 400
Body emphasized       14px / 600
Small                  12px / 400–500
Caption                11px / 400
Control text           14px / 500
```

Financial values / KPI:

```text
16–24px / 600–700
font-variant-numeric: tabular-nums
```

### Typography rules

- Không dùng heading quá lớn trong ERP.
- Không dùng text dưới 12px cho thông tin vận hành quan trọng.
- Money, quantity, percentage nên dùng tabular numerals.
- Label form ngắn, weight 500–600.
- Metadata dùng gray 500–600.
- Không viết uppercase dài cho body text.

---

## 18.5. Spacing system

Base spacing = **8px**.

Reference scale:

```text
4px
8px
12px
16px
20px
24px
32px
40px
48px
64px
```

Rules:

- Form fields trong cùng group: 12–16px.
- Group-to-group: 20–24px.
- Section-to-section: 24–32px.
- Page gutter desktop: 24–32px.
- Mobile gutter: 16px.

Không tạo khoảng trắng lớn chỉ để giao diện “sang”.

---

## 18.6. Border radius

Reference:

```text
Small: 4px
Medium: 8px
Large: 12px
2XL / special container: 16px max
```

Không dùng bo góc 20–32px cho mọi card.

ERP phải có hình học gọn, chính xác, enterprise.

---

## 18.7. Shadows & borders

Shadow phải rất nhẹ.

Reference:

```css
--shadow-sm: 0 1px 2px rgba(16,24,40,.05);
--shadow-md: 0 4px 8px -1px rgba(16,24,40,.08);
--shadow-lg: 0 10px 15px -3px rgba(16,24,40,.10);
```

Default panel nên dùng:

```text
1px light border + little/no shadow
```

Large shadow chỉ dành cho:

- modal,
- command drawer,
- elevated dropdown/popover.

Không dùng shadow nặng quanh tất cả cards.

---

## 18.8. Layout grid

Desktop >= 1280px:

```text
12-column grid
```

Tablet 768–1279px:

```text
6-column grid
```

Mobile < 768px:

```text
4-column grid
```

### Desktop shell

```text
Sidebar: khoảng 232–248px
Main: fluid
Top/page header: compact
Page gutter: 24–32px
```

### Detail page

Desktop top section:

```text
7/5 hoặc 8/4

LEFT
Hồ sơ / nội dung chính

RIGHT
Financial / operational summary
```

Sau đó full-width tabs.

Mobile:

```text
header
summary
profile
horizontal tabs
content cards/list
```

---

## 18.9. Navigation language

Sidebar chia theo nhóm nghiệp vụ thay vì một danh sách dài phẳng.

Reference grouping:

```text
TỔNG QUAN
- Tổng quan

BÁN HÀNG
- Đơn bán
- Khách hàng
- Báo giá (nếu có)

MUA HÀNG
- Đơn mua
- Nhà cung cấp

KHO & VẬT TƯ
- Tồn kho
- Phiếu nhập
- Phiếu xuất
- Chuyển kho
- Kiểm kê
- Vật tư

CÔNG NỢ & TIỀN
- Công nợ khách hàng
- Công nợ nhà cung cấp
- Thu tiền
- Chi tiền

NHÂN SỰ & CÔNG VIỆC
- Nhân sự
- Phân việc
- Phiếu công
- Tiền công
- Tạm ứng

BÁO CÁO
- Báo cáo
- Xuất dữ liệu kế toán

HỆ THỐNG
- Danh mục
- Cài đặt
- Nhật ký hệ thống
```

Chỉ hiển thị nhóm/module user có quyền.

---

## 18.10. Page header

Page header compact, không biến thành marketing hero.

Cấu trúc:

```text
Breadcrumb / back action (nếu cần)
Page title
1 dòng mô tả ngắn khi thực sự cần
Primary actions bên phải
```

Ví dụ Customer Detail:

```text
← Khách hàng

Công ty TNHH Tuấn Lai                  [Sửa] [Thêm đơn bán] [Thao tác]
KH00015 · MST... · Điện thoại...       [Đang hoạt động]
```

---

## 18.11. Dashboard

Dashboard không được biến thành “bento showcase”.

First viewport:

1. 4–5 KPI quan trọng.
2. 1 chart doanh thu/chuyển động chính.
3. 1 bảng Top vật tư hoặc hoạt động.
4. Công việc cần xử lý.
5. Dòng tiền tổng quan.
6. Thông báo quan trọng.

KPI card:

```text
label
large value
small trend/context
```

Trend chỉ dùng nếu có dữ liệu so sánh thực.

Không fake percentage.

### Dashboard chart contract

Dashboard V2 **phải có biểu đồ**, nhưng chart chỉ được tồn tại khi giúp người vận hành ra quyết định.

Desktop ưu tiên khoảng **3–4 biểu đồ thực sự hữu ích**; mobile chỉ giữ **1–2 biểu đồ quan trọng nhất** và dẫn sang trang phân tích chi tiết.

Biểu đồ đề xuất:

```text
1. Doanh thu theo ngày / tuần / tháng
2. Thu vào vs Chi ra theo thời gian
3. Công nợ khách hàng / NCC theo xu hướng
4. Tồn kho hoặc top vật tư theo kỳ
```

Rules:

- Không hardcode số liệu hoặc percentage để làm đẹp mockup.
- Chart phải đọc từ reporting/read model hoặc selector authoritative, không tự tính công thức cạnh tranh trong component.
- Mọi chart phải có bộ lọc thời gian hoặc kế thừa bộ lọc chung của dashboard.
- Label phải ghi rõ đơn vị: VND, tấn, m³, viên, %, ngày...
- Bar chart dùng zero baseline trừ khi có lý do phân tích được ghi rõ.
- Không dùng dual-axis gây hiểu nhầm nếu một chart đơn giản hơn có thể trả lời câu hỏi.
- Tooltip phải hiển thị giá trị đầy đủ, không chỉ số compact.
- Có loading / empty / error state.
- Có text/table summary đủ để đọc số liệu quan trọng khi chart không render hoặc cho người dùng trợ năng.
- Nếu chart hỗ trợ click-through, click phải dẫn tới danh sách dữ liệu nguồn đã lọc tương ứng.
- Mobile không được làm chart quá nhỏ đến mức label chồng lấn.

Dashboard chart được coi là PASS khi:

- [ ] Dữ liệu chart reconcile với reporting read model.
- [ ] Không có hardcoded business data trong production component.
- [ ] Bộ lọc thời gian thay đổi chart đúng.
- [ ] Empty/loading/error state hoạt động.
- [ ] Desktop có tối đa số chart cần thiết, không card-overload.
- [ ] Mobile chỉ giữ chart quan trọng và vẫn đọc được.
- [ ] Có drill-down hoặc link tới dữ liệu nguồn khi nghiệp vụ cần.
- [ ] Không có chart gây hiểu sai vì scale/trục/đơn vị.

---

## 18.12. Detail pages

Customer/Supplier/Product/Employee/Warehouse detail dùng cùng component language.

### Header

```text
Back
Name
Code / identifiers
Status
Actions
```

### Top content

```text
LEFT: information/profile
RIGHT: summary/KPI
```

### Tabs

Tabs dùng underline/active blue đơn giản.

Không dùng giant pill tabs.

Example Customer:

```text
Đơn hàng
Công nợ
Thanh toán
Bút toán
Lịch sử ghi nhận
```

---

## 18.13. Sales & Purchase editor

Đây là màn có density cao nhất và phải tối ưu thao tác.

### Desktop

Document header ở trên.

Line editor full-width.

```text
Vật tư | ĐVT | SL | Đơn giá | Chiết khấu | VAT | Thành tiền | Xóa
```

Right-side hoặc upper-right payment summary:

```text
Tiền hàng
Chiết khấu
Tiền sau CK
VAT
Phí giao
Tổng cộng
Hoa hồng CTV
TỔNG KHÁCH PHẢI TRẢ
```

Nguồn hàng và Phân việc nằm thành các section riêng bên dưới, không nhét vào line table.

### Desktop behavior

- Numeric columns align right.
- Money uses tabular numerals.
- Totals visible mà không cần scroll quá xa.
- Add line action gần table.
- Không mở modal chỉ để đổi một field đơn giản.

### Mobile

Mỗi order line trở thành card compact:

```text
1. Xi măng Hoàng Long                  [⋮]
ĐVT: Tấn
SL: 10                  Đơn giá: 1.250.000
CK: 5%                  VAT: 10%
Thành tiền: 11.875.000
```

Bottom primary action có thể sticky khi form dài, nhưng không che nội dung.

---

## 18.14. Forms

### Input height

```text
Desktop: 38–40px
Mobile: 44px minimum touch target
```

### Label

- nằm trên input,
- 12–13px,
- semibold,
- required indicator rõ nhưng nhẹ.

### Focus

Blue focus ring rõ.

### Error

Red border + message ngay dưới field.

Không chỉ đổi màu border mà không nói lỗi gì.

### Select / Dropdown

Dropdown có dữ liệu lớn phải hỗ trợ search/typeahead.

Phải có các state:

```text
Loading
Has data
No eligible data
Error loading data
```

Không render select trắng.

Nếu không có dữ liệu:

```text
Chưa có thợ đang hoạt động.
+ Thêm nhân sự
```

nếu user có quyền.

---

## 18.15. Buttons

Variants:

```text
Primary
Secondary
Ghost/Text
Danger
```

Primary = blue fill.

Danger = red, chỉ dùng cho destructive/reversal actions.

Button labels phải là hành động:

```text
Tạo đơn
Xác nhận
Lưu thay đổi
Khớp chứng từ
Đảo phiếu
```

Không dùng label mơ hồ như:

```text
OK
Submit
Action
Process
```

Mobile touch target tối thiểu ~44px.

---

## 18.16. Tables

Desktop table là thành phần chính của ERP, không được thay mọi table bằng cards.

Rules:

- Header 12–13px / semibold.
- Row 44–52px tùy density.
- Money/quantity right aligned.
- Name/document left aligned.
- Status centered hoặc left theo context.
- Row hover nhẹ.
- Action ở cột cuối.
- Sticky header cho table dài khi hợp lý.
- Không dùng vertical border quá nhiều.
- Không zebra stripe đậm.

Mobile:

Nếu table có >4–5 field quan trọng hoặc action, chuyển thành record cards.

Không chỉ `overflow-x:auto` cho mọi bảng.

---

## 18.17. Status badges

Badge nhỏ, soft background, semantic color.

Examples:

```text
Đang giao      → blue/info
Hoàn thành     → green
Chờ duyệt      → amber
Đã hủy         → red/gray depending context
Tạm ngưng      → gray
```

Không dùng badge cho mọi metadata.

---

## 18.18. Tabs

Tab style:

```text
text + underline active blue
```

Desktop:

- nằm trên content section,
- không quá cao.

Mobile:

- horizontal scroll,
- active tab luôn nhìn thấy,
- không xuống hai dòng nếu tránh được.

---

## 18.19. Icons

Icon language:

```text
outline icon family
consistent stroke
16–20px in controls/navigation
```

Ưu tiên icon family hiện có nếu đồng nhất; không mix filled/outline/random styles.

Icon không thay thế label cho hành động nghiệp vụ quan trọng, trừ các action quen thuộc như delete/chevron/search có accessible label.

---

## 18.20. Empty / Loading / Error states

### Empty

Phải trả lời:

```text
Không có gì?
Tại sao?
Tôi có thể làm gì tiếp?
```

Example:

```text
Chưa có dữ liệu
Hiện chưa có đơn bán trong kỳ này.
[+ Tạo đơn bán]
```

### Loading

Dùng skeleton hoặc spinner nhẹ tùy component.

Không làm toàn trang nhảy layout sau load.

### Error

Hiện message dễ hiểu + retry.

Không lộ stack trace/internal error cho user.

---

## 18.21. Mobile behavior

Mobile không phải desktop bị co nhỏ.

Rules:

- Sidebar → drawer.
- Header giảm metadata thứ cấp.
- Summary cards có thể 2 cột rồi 1 cột tùy width.
- Table nghiệp vụ → cards khi cần.
- Primary action dễ chạm.
- Inputs full width khi hợp lý.
- Không text clip.
- Không horizontal viewport overflow.
- Không yêu cầu zoom browser để thao tác.

Test:

```text
390x844
375x812
360x800
```

---

## 18.22. Motion

Motion tối giản.

Reference:

```text
120–180ms
```

Dùng cho:

- hover,
- dropdown,
- drawer,
- tab content,
- success state nhẹ.

Không dùng animation trang trí liên tục.

Respect:

```css
prefers-reduced-motion
```

---

## 18.23. Writing & terminology

Ngôn ngữ UI là tiếng Việt đời thường, ngắn và nhất quán.

Preferred:

```text
Đang nợ
Đã thu
Đã chi
Chưa khớp chứng từ
Khớp chứng từ
Lịch sử ghi nhận
Tồn kho
Nguồn hàng
Phân việc
Tiền công
Tạm ứng
```

Không expose technical terms nếu không cần:

```text
ledger
allocation
projection
output
compensation batch
processed operation
```

Technical terms vẫn giữ trong code/domain.

---

## 18.24. Forbidden visual patterns

Không dùng trong ERP V2 nếu không có lý do chức năng đặc biệt:

- glassmorphism,
- gradients trang trí,
- neon/glow,
- giant hero section,
- oversized type,
- bento grid cho mọi nội dung,
- nested card trong card trong card,
- radius 20–32px trên mọi component,
- shadow nặng,
- rainbow status colors,
- icon-only navigation khó hiểu,
- raw browser-default controls ở các workflow chính,
- table bị ép nhỏ đến mức text xuống 3–4 dòng,
- desktop side-form 280–320px cho document editor phức tạp.

---

## 18.25. Design System DOD

Design được coi là PASS khi:

- [ ] Sidebar/nav đúng hierarchy và permission.
- [ ] Palette semantic nhất quán.
- [ ] Typography dùng Inter và đúng scale.
- [ ] Spacing bám 8px baseline.
- [ ] Radius/shadow restrained.
- [ ] Dashboard không card-overload.
- [ ] Detail pages dùng chung visual grammar.
- [ ] Sales/Purchase desktop editor full-width.
- [ ] Sales/Purchase mobile line cards dễ đọc.
- [ ] Dropdown có loading/empty/error state.
- [ ] Numeric data alignment nhất quán.
- [ ] Tables desktop giữ density tốt.
- [ ] Mobile không mất dữ liệu.
- [ ] Không horizontal viewport overflow.
- [ ] Focus state rõ.
- [ ] Contrast đạt WCAG AA cho nội dung chính.
- [ ] `prefers-reduced-motion` được tôn trọng.
- [ ] Không còn form/browser controls nhìn như prototype.
- [ ] Không có visual pattern nằm trong danh sách forbidden mà không được ghi rõ intentional deviation.

---

# 19. CODEX PROMPT — READY TO PASTE

```text
HIEN XA ERP — WEB V2 FULL REMEDIATION
FIX CROSS-MODULE DATA CONNECTIVITY + DROPDOWNS + FULL UI/UX REWRITE

REPOSITORY:
MutAquaticStudio/HIEN-XA-ERP

SCOPE:
WEB ERP ONLY.

Do not deploy production.
Do not mutate production data.
Do not add fake fallback data.
Do not weaken RBAC, audit, idempotency, financial, inventory, reversal, or release invariants.

============================================================
PHASE -1 — MANDATORY FULL REPOSITORY RESCAN BEFORE ANY EDIT
============================================================

Do NOT edit code yet.

The repository may have changed since this specification was written.
Treat every statement in this document about current implementation as a
hypothesis until latest main is scanned and verified.

MANDATORY:
1. git fetch latest refs and record latest main SHA.
2. confirm current branch and working tree state.
3. inventory the full repository tree.
4. re-read AGENTS.md, PROJECT_BRIEF.md, README.md, relevant ADRs, package.json,
   build/test configs, current schema/migrations and Cloudflare/OpenNext config.
5. deep-read src/app/**, src/components/**, src/erp/**, src/lib/**,
   src/modules/**, src/server/** and all relevant tests.
6. inspect shared mobile/domain imports only where shared changes could affect
   apps/mobile; do not rewrite mobile.
7. reconstruct current route, command, permission, projection, persistence,
   dropdown, portal, sync/revision and test maps.
8. document doc-vs-code drift.
9. create repository-rescan evidence.
10. only after the pre-edit gates below PASS may implementation begin.

PRE-EDIT GATES:
REPOSITORY_RESCAN = PASS
CURRENT_CODE_MAP = PASS
CURRENT_DATA_FLOW_MAP = PASS
CURRENT_RBAC_PROJECTION_MAP = PASS
CURRENT_DROPDOWN_INVENTORY = PASS
CURRENT_TEST_MAP = PASS

If any gate is FAIL/BLOCKED/UNKNOWN/NOT RUN:
STOP before editing.

Do not rely on previous conversation context, old screenshots, prior prompts,
or old assumptions instead of current source.

After this rescan passes, create the feature branch from the pinned latest main
SHA and continue to baseline/characterization.

============================================================
HARNESS MODE — MANDATORY
============================================================

Treat this task as a gated remediation program, not as free-form refactoring.

Do not begin broad implementation until the baseline is captured and characterization tests exist for the behavior being changed.

MANDATORY ORDER:

PHASE -1 — REPOSITORY RESCAN / CURRENT-STATE RECONSTRUCTION
1. Fetch latest main and pin `RESCAN_MAIN_SHA`.
2. Inventory the full repository tree.
3. Deep-read all Web ERP routes/components/domain/server/persistence/projection/config/tests in scope.
4. Build current route, code, domain-command, persistence, projection, dropdown, portal and test maps.
5. Record all doc/code drift and unknown areas.
6. Do not edit source before rescan evidence exists.

Gate:
REPOSITORY_RESCAN = PASS
CURRENT_CODE_MAP = PASS
CURRENT_DATA_FLOW_MAP = PASS
CURRENT_RBAC_PROJECTION_MAP = PASS
CURRENT_DROPDOWN_INVENTORY = PASS
CURRENT_TEST_MAP = PASS

If this gate is not fully PASS, STOP.

PHASE 0 — PRE-FLIGHT / BASELINE
1. Record latest main SHA and branch.
2. Confirm working tree is clean.
3. Record Node/package-manager versions.
4. Discover actual package.json quality-gate commands; do not invent command names.
5. Run current typecheck/lint/unit/integration/build gates that can run safely.
6. Record existing failures separately as BASELINE FAILURES; do not silently attribute them to this change.
7. Inspect current schema/migrations and create a persistence/data-flow map.
8. Capture current desktop/mobile screenshots for the screens being replaced.
9. Create a regression matrix before implementation.

If baseline cannot be established, STOP and report BLOCKER.

PHASE 1 — CHARACTERIZATION TESTS
Add tests around current invariants before changing them:
- ledger balances
- inventory movements
- payment confirmation/allocation separation
- work claiming
- projection/scoping
- portal catalog
- document unit snapshots

Do not rewrite an invariant without a test proving intended old behavior.

PHASE 2 — P0 DATA CONNECTIVITY
Fix dropdown/projection/read-model propagation first.
Do not start the full visual rewrite while data connectivity gates are failing.

PHASE 3 — DOMAIN / MIGRATION CHANGES
Only add schema/domain changes that are required by accepted requirements.
Prefer additive/backward-compatible migrations.
No destructive migration without explicit evidence and rollback.

PHASE 4 — UI SHELL / ROUTES / DESIGN SYSTEM
Implement the locked V2 design language and route structure.

PHASE 5 — FEATURE WORKFLOWS
Product units → Sales → Purchase → Inventory → Workforce → Finance/Export → Dashboard charts.
Each feature must pass its own local tests before the next feature is treated as complete.

PHASE 6 — FULL REGRESSION / SECURITY / VISUAL QA
Run the entire discovered quality suite, cross-module matrix, RBAC/projection tests, browser tests, responsive screenshots, OpenNext/Cloudflare-compatible build and no-production-mutation checks.

PHASE 7 — PR EVIDENCE
Do not open/mark PR ready until every release gate has evidence.

EVIDENCE RULE:
A checkbox is not evidence.
A PASS must include at least one of:
- test name + result,
- command + exit code,
- screenshot path,
- migration verification output,
- explicit manual QA scenario + observed result.

Never convert FAIL/SKIP/NOT RUN into PASS.
Never weaken/remove a failing test just to make the suite green unless the old expectation is proven obsolete by an accepted requirement; document the reason.
Never use production data to make tests pass.

STOP CONDITIONS:
Stop implementation and report a blocker if any of these occurs:
- baseline financial/inventory reconciliation is non-zero and root cause is unknown;
- current D1 schema differs materially from migration assumptions;
- a proposed change requires destructive financial/history migration;
- a permission requirement is ambiguous and broadening access could leak data;
- a production-only secret or production mutation would be required for validation;
- existing release architecture would need an unrelated change;
- a test failure indicates possible customer/supplier/warehouse cross-scope leakage.

Do not “work around” stop conditions.

============================================================
PRIMARY PROBLEM
============================================================

The ERP currently has multiple UI and integration defects.

The most important problem is NOT visual.

The most important problem is that data does not consistently propagate
between modules.

Examples observed:

- dropdowns can be empty although master data already exists;
- employee data can exist but Work Order employee selection is empty;
- product creation does not consistently behave like one authoritative master
  record across Sales, Purchase, Inventory and Customer Portal;
- module projection/read-model dependencies are not always aligned with the
  data needed by the current screen;
- modules can behave like isolated screens sharing a database instead of one
  connected ERP.

Treat this as P0.

============================================================
NON-NEGOTIABLE DATA RULE
============================================================

One entity is created once.

Customer, Supplier, Product, Warehouse, Vehicle, Employee and Unit master data
must use the same authoritative IDs across all downstream modules.

Required architecture:

D1
→ backend snapshot
→ domain state
→ authorization/scope
→ projection
→ shared read model/selector
→ UI

Do not let multiple components implement competing filters for the same
business concept.

Create or consolidate selectors/read models such as:

getSelectableCustomers
getSelectableSuppliers
getSelectableProducts
getSelectableWarehouses
getAssignableWorkers
getAvailableVehicles
getProductUnits
getCustomerPortalCatalog

Adapt names to repository conventions.

============================================================
P0 — AUDIT EVERY DROPDOWN
============================================================

Inventory every select/dropdown in the ERP.

For each dropdown document:

- source entity
- required permission
- required module
- active/status filter
- role filter
- warehouse/customer/supplier scope
- current projection dependency
- empty-state behavior

Trace each one end-to-end:

D1
→ getSnapshot
→ OperationsState
→ projectOperationsState
→ selector
→ component

Do NOT patch with fallback/demo data.

If valid eligible records exist, dropdown must show them.

If none exist, render a meaningful empty state, e.g.:

"Chưa có thợ đang hoạt động."

For authorized users, provide navigation/quick-create where appropriate.

============================================================
P0 — FIX PROJECTION DEPENDENCIES
============================================================

Inspect src/server/identity/operations-projection.ts.

Current projection intentionally removes state collections not allowed for a
role/module.

Preserve security, but ensure every legitimate workflow receives the safe
data it needs.

Example:

If Sales V2 supports work assignment, Sales must have a safe worker selector
or read model.

Do not solve this by broadly giving every module every state collection.

Prefer purpose-specific safe read models/projections.

Add tests proving no sensitive data leak.

============================================================
P0 — CROSS-MODULE PROPAGATION
============================================================

The following must work:

Create Customer
→ Sales
→ Receivables
→ Customer Payment
→ Customer detail

Create Supplier
→ Purchase
→ Product preferred supplier
→ Payables
→ Supplier Payment

Create Product
→ Sales
→ Purchase
→ Inventory
→ Inventory Count
→ Customer Portal

Create Warehouse
→ Purchase destination
→ Sales source
→ Inventory transfer

Create Employee
→ Work assignment
→ Work order
→ Compensation
→ Employee payment

Create Vehicle
→ Delivery

The user must not re-enter the same entity in another module.

The user must not need manual F5 as normal behavior.

Use revision/state updates and route revalidation correctly.

Existing polling may remain as realtime/recovery convenience, but it must not
be the fix for broken data ownership.

============================================================
P0 — CUSTOMER PORTAL CATALOG
============================================================

Customer Portal must consume authoritative Product master data through a
public-safe catalog read model.

Product must support explicit public behavior.

Add or reuse appropriate fields/configuration for:

- visibleOnCustomerPortal
- orderableOnline

Names may follow repository conventions.

Behavior:

visible = false
→ hidden

visible = true + missing price/VAT
→ show "Cần báo giá"

visible = true + price/VAT + zero stock
→ show "Tạm hết hàng"

visible = true + price/VAT + positive availability
→ show "Có thể đặt"

Do not hide products merely because they are temporarily out of stock unless
configuration explicitly says so.

Never expose internal cost, margin, preferred supplier, internal price
history, or privileged data to customer projection.

Customer order lines must reference the same Product master ID.

============================================================
PRODUCT UNIT CONVERSION
============================================================

Important requirement:

THE USER CONFIGURES UNIT CONVERSIONS.

The ERP must NOT invent or infer the user's commercial conversion rules.

Examples the user may manually configure:

1 bao = 50 kg
1 tạ = 2 bao
1 tấn = 20 bao

or:

1 xe = 6 m3

Move the primary unit configuration experience into Product Detail.

The user should configure, edit and version conversions there.

Normal Sales/Purchase order entry should only select a configured unit.

Do not require order-entry staff to manually enter conversion factors for
configured fixed conversions.

Preserve historical DocumentUnitSnapshot behavior.

Changing a conversion must not mutate old documents.

============================================================
FULL ERP WEB UI V2
============================================================

Rewrite the Operations Web UI as one coherent ERP.

Do not keep patching isolated side panels.

Use real routes for major list/detail screens.

Catalog routes should include:

/catalog/customers
/catalog/customers/[id]
/catalog/suppliers
/catalog/suppliers/[id]
/catalog/products
/catalog/products/[id]
/catalog/warehouses
/catalog/warehouses/[id]
/catalog/vehicles
/catalog/vehicles/[id]
/catalog/employees
/catalog/employees/[id]

Customer/Supplier detail:

HEADER:
back
name
code
status

DESKTOP TOP:
left = profile/edit form
right = money/debt summary

TABS:
Orders
Debt
Payments
Accounting entries
History

Use Vietnamese UI wording.

Customer:
Tổng mua
Đã thu
Đang nợ
Chưa khớp chứng từ

Supplier:
Tổng mua
Đã chi
Còn phải trả
Chưa khớp chứng từ

Use "Lịch sử ghi nhận" instead of exposing "ledger" terminology generally.

============================================================
SALES V2
============================================================

Replace narrow vertical sales draft UI with full-width document editor.

Desktop line layout:

Product
Unit
Quantity
Unit Price
Discount
VAT
Line Total
Remove

Header:

Customer
Order Date
Payment Terms
Promised Delivery
CTV/referrer
Delivery Address
Note

Allow explicit business orderDate.

Audit timestamp remains real creation time.

Add:

- percentage discount
- amount discount
- live deterministic totals
- optional CTV/referrer
- commission percentage or amount

Commission is internal.

Commission must NOT reduce customer payable amount.

Do not duplicate pricing math in random components.
Reuse deterministic domain calculation.

============================================================
SOURCE VS WORK ASSIGNMENT
============================================================

Separate:

NGUỒN HÀNG
from
PHÂN VIỆC

Nguồn hàng:

- warehouse
- supplier/direct purchase
- direct supplier-to-customer

Phân việc:

- manager assigns worker
- open work pool for worker self-claim

Reuse existing WorkOrder and atomic claim behavior.

Do not build a second job system.

Concurrency test:

two eligible workers claim same work
→ exactly one succeeds.

============================================================
PURCHASE V2
============================================================

Replace narrow vertical Purchase UI with full-width document editor.

Line:

Product
Unit
Quantity
Unit Cost
Discount
VAT
Destination
Line Total

Destination:

Warehouse
or
Direct customer

Preserve:
- sales linkage
- direct delivery
- freight
- goods receipt approval
- reversal
- historical snapshots

============================================================
INVENTORY V2
============================================================

Stock remains derived from InventoryMovement.

Add explicit:

Tạo tồn đầu kỳ

Inputs:

Warehouse
Product
Configured unit
Quantity
Business date
Unit cost if required by costing model
Reason

Posting must create:

movementType = opening

Do NOT directly edit a stock balance.

Idempotency + audit required.

Do not create duplicate Product records inside Inventory.

Inventory may provide:

"+ Thêm vật tư vào kho"

If missing, authorized user can create Product through the same master-data
command, then return to inventory flow.

============================================================
WORKFORCE V2
============================================================

Fix empty employee dropdown root cause.

Do not add fake employee records.

Only eligible active employees should be selectable.

If none exist:

"Chưa có thợ đang hoạt động."

Redesign Work Order form:

Employee/worker
Work
Quantity/output
Unit
Total compensation
Date
Related order/work source

Preserve:

submit output
→ approve output
→ post compensation
→ employee ledger
→ advance/payment

Do not calculate compensation twice.

============================================================
EXCEL
============================================================

Main operational module becomes:

"Xuất dữ liệu kế toán"

Read-only export.

Filters:

from date
to date

Selectable sheets:

BAN_HANG
MUA_HANG
THU_CHI
CONG_NO_KH
CONG_NO_NCC
TON_KHO
TIEN_CONG
BUT_TOAN

Generate a real .xlsx workbook.

Export must not mutate ERP state.

Keep legacy import but move it under admin/migration tooling:

Quản trị
→ Nhập dữ liệu cũ

Preserve:
ImportJob
ImportIssue
dry-run
resolve
ignore

============================================================
FINANCIAL / INVENTORY INVARIANTS
============================================================

Never add editable fields for:

customer debt
supplier payable
cash balance
stock balance
employee payable

These remain computed consequences of ledger/movements.

Payment confirmation and payment matching remain separate.

Corrections use reversal.

Historical transactions are not deleted.


============================================================
DESIGN LANGUAGE V2 — LOCKED VISUAL SPEC
============================================================

The UI rewrite must follow this visual language.

DESIGN CHARACTER:
- clean
- data-first
- enterprise
- operational
- medium density
- restrained
- easy for non-technical and middle-aged users

Do NOT redesign this as a marketing site or generic admin template.

VISUAL SYSTEM:

Primary blue:
#3563EB

Primary dark:
#174EA6

Sidebar:
#062448

Semantic:
Success #16A34A
Warning #F59E0B
Danger  #DC2626
Info    #0EA5E9

Neutral family:
Slate 50–900 equivalent, with white as main workspace surface.

TYPOGRAPHY:
Inter.

Reference scale:
Page title 28/700
Section title 22/700
Panel title 18/600
Body 14/400
Small 12/400-500
Control 14/500

Financial/numeric values should use tabular numerals.
Do not use oversized dashboard typography.
Do not make operational text smaller than 12px.

SPACING:
8px baseline.
Use 4/8/12/16/20/24/32/40/48/64.
Desktop gutter 24–32.
Mobile gutter 16.

RADIUS:
4 / 8 / 12px standard.
16px only for special large containers.
Do not round everything excessively.

SHADOW:
Very subtle.
Default panels primarily use light 1px borders.
Reserve elevated shadows for modal/popover/drawer.

DESKTOP SHELL:
- fixed deep navy sidebar about 232–248px
- white/light-slate workspace
- compact page header
- 12-column content grid at >=1280px
- 6-column tablet
- 4-column mobile

SIDEBAR:
Group by business area.
Active item uses blue fill.
Use consistent outline icons.
No gradient/glass/glow.

DASHBOARD:
Do not create a bento showcase.
First viewport should prioritize:
- 4–5 real KPI values
- primary trend/chart
- top products/operations table
- work requiring attention
- cashflow summary
- important notifications

DETAIL PAGE:
Header:
back + entity name + identifiers + status + actions

Desktop top:
left profile/information
right financial/operational summary

Below:
full-width tabs using simple blue underline.

SALES/PURCHASE EDITOR:
Full-width desktop document editor.
Never put a complex order form into a narrow 280–320px side panel.

Desktop line table:
Product | Unit | Qty | Unit price/cost | Discount | VAT | Total | Action

Numbers right-aligned.
Totals always easy to see.
Source and Work Assignment are separate lower sections.

Mobile line items become compact cards.
Primary action may be sticky at bottom when useful, without covering content.

FORMS:
Desktop controls 38–40px.
Mobile touch controls >=44px.
Labels above controls.
Visible blue focus state.
Inline error text.

DROPDOWNS:
Large entity selects should support search/typeahead.
Must implement:
- loading
- data
- no eligible data
- load error

Never render a blank select.

TABLES:
Desktop remains table-first for dense operational data.
Do not replace all tables with cards.
Use 44–52px row height, light borders, subtle hover.
Right-align numeric columns.
Use cards on mobile when the row has too many meaningful fields/actions.

STATUS:
Use small soft semantic badges only when status matters.
Do not badge every metadata field.

MOTION:
120–180ms only for functional state transitions.
No decorative continuous animation.
Respect prefers-reduced-motion.

COPY:
Use plain Vietnamese business language:
Đang nợ
Đã thu
Đã chi
Chưa khớp chứng từ
Khớp chứng từ
Lịch sử ghi nhận
Nguồn hàng
Phân việc
Tiền công

Do not expose internal terms such as ledger/allocation/projection in normal UI.

FORBIDDEN:
- glassmorphism
- decorative gradients
- neon/glow
- giant hero areas
- bento everywhere
- nested-card overload
- huge radius everywhere
- heavy shadows
- raw browser-default controls for primary workflows
- unreadable squeezed tables
- clipped Vietnamese text
- horizontal viewport overflow

VISUAL QA MUST CHECK:
1. sidebar hierarchy
2. dashboard density
3. customer detail
4. product detail/conversion editor
5. sales desktop editor
6. sales mobile editor
7. purchase editor
8. inventory screens
9. workforce form/dropdowns
10. accounting export

Do not report visual PASS from TypeScript/build only.
Capture desktop and mobile screenshots and review them.

============================================================
RESPONSIVE
============================================================

Desktop test:

1440x900
1366x768
1024x768

Mobile test:

390x844
375x812
360x800

Requirements:

- no viewport horizontal overflow
- no clipped Vietnamese labels
- no disappearing fields
- no unreadable wrapped buttons
- long operational tables become cards when appropriate
- mobile order lines become cards
- detail layout becomes one column
- tabs remain usable
- loading/empty/error states exist

============================================================
TESTS — REQUIRED
============================================================

Add tests for:

CROSS-MODULE:
create customer → downstream visibility
create supplier → downstream visibility
create product → downstream visibility
create warehouse → downstream visibility
create employee → downstream visibility
create vehicle → downstream visibility

DROPDOWNS:
eligible data appears
inactive data excluded
scope enforced
empty state explicit

PORTAL:
public product visible
quote_required
out_of_stock
in_stock
hidden product excluded
no sensitive field leakage

UNIT:
user-defined conversion applied
historical snapshot stable after edit

SALES:
orderDate
audit timestamp
discount percentage
discount amount
VAT
commission
commission does not affect customer total

INVENTORY:
opening movement
stock derived correctly
duplicate request idempotent

WORK:
assignment
open pool
atomic claim
inactive employee unavailable

EXPORT:
date range
selected sheets
no state mutation
reconcile values

============================================================
RELEASE GATES
============================================================

Do not declare completion unless:

BASELINE_CHARACTERIZATION = PASS
REPOSITORY_RESCAN = PASS
CURRENT_CODE_MAP = PASS
CURRENT_DATA_FLOW_MAP = PASS
CURRENT_RBAC_PROJECTION_MAP = PASS
CURRENT_DROPDOWN_INVENTORY = PASS
CURRENT_TEST_MAP = PASS
CROSS_MODULE_DATA_CONNECTIVITY = PASS
DROPDOWN_DATA_INTEGRITY = PASS
PORTAL_CATALOG_PROPAGATION = PASS
SCHEMA_MIGRATION_SAFETY = PASS
FINANCIAL_INVARIANTS = PASS
INVENTORY_INVARIANTS = PASS
RBAC_PROJECTION = PASS
AUDIT_IDEMPOTENCY = PASS
DASHBOARD_CHART_DATA_INTEGRITY = PASS
REGRESSION_MATRIX = PASS
DESKTOP_RESPONSIVE_QA = PASS
MOBILE_RESPONSIVE_QA = PASS
TYPECHECK_LINT_TEST_BUILD = PASS
DESIGN_SYSTEM_FIDELITY = PASS
NO_PRODUCTION_MUTATION = PASS

Run all repo quality gates.

Run browser visual QA.

Do not rely only on build passing.

============================================================
DELIVERY
============================================================

Open one focused PR.

PR must include:

- root causes found
- projection/read-model changes
- dropdown audit matrix
- cross-module propagation matrix
- route map
- UI rewrite summary
- unit conversion behavior
- portal catalog behavior
- sales/purchase changes
- opening inventory behavior
- workforce dropdown fix
- Excel export behavior
- RBAC review
- audit/idempotency review
- desktop screenshots
- mobile screenshots
- test results
- build result
- migration notes
- rollback notes
- remaining limitations

Do not report PASS for incomplete requirements.

If blocked, report:

BLOCKER
ROOT CAUSE
FILES
RISK
MINIMUM SAFE NEXT ACTION

Otherwise implement and verify autonomously.
```

---

# 20. FINAL DEFINITION OF DONE — ERP V2

ERP V2 được coi là hoàn tất khi đồng thời đạt:

## Pre-edit repository rescan

- [ ] Latest `main` được fetch và pin SHA.
- [ ] Repository tree được inventory đầy đủ.
- [ ] Web ERP source trong scope được deep-read lại.
- [ ] Schema/migrations/persistence được đọc lại.
- [ ] RBAC/projection được đọc lại.
- [ ] Mọi dropdown source được inventory.
- [ ] Customer Portal data flow được trace lại.
- [ ] Existing tests và build scripts được map lại.
- [ ] Doc/code drift được ghi rõ.
- [ ] Không có implementation edit trước khi `REPOSITORY_RESCAN = PASS`.

## Data connectivity

- [ ] Tạo dữ liệu một lần.
- [ ] Downstream module thấy đúng dữ liệu.
- [ ] Không nhập lại.
- [ ] Không fake fallback.
- [ ] Không F5 thủ công như giải pháp.

## UI

- [ ] Ngôn ngữ thiết kế V2 được implement nhất quán.
- [ ] Sidebar navy + workspace trắng/light-slate đúng visual direction.
- [ ] Typography Inter, spacing 8px baseline, radius/shadow restrained.
- [ ] Dashboard không card-overload.
- [ ] Focus/empty/loading/error states đúng design system.
- [ ] Không glass/gradient/glow/nested-card overload.
- [ ] Danh mục có route riêng.
- [ ] Detail pages hoàn chỉnh.
- [ ] Sales/Purchase editor ngang desktop.
- [ ] Mobile cards đúng.
- [ ] Không lẹm chữ.

## Product

- [ ] User tự cấu hình quy đổi.
- [ ] Product dùng cùng ID xuyên module.
- [ ] Portal nhận product public đúng rule.

## Finance

- [ ] Thu/chi đúng.
- [ ] Khớp chứng từ đúng.
- [ ] Công nợ từ ledger.
- [ ] Reversal hoạt động.
- [ ] Không edit balance.

## Inventory

- [ ] Tồn từ movements.
- [ ] Opening stock hoạt động.
- [ ] Không duplicate product.
- [ ] Transfer/count/reversal không regression.

## Workforce

- [ ] Employee dropdown không rỗng sai.
- [ ] Assignment/self-claim hoạt động.
- [ ] Compensation đúng.

## Export

- [ ] Xuất Excel kế toán hoạt động.
- [ ] Legacy import nằm Admin.

## Safety

- [ ] RBAC pass.
- [ ] Audit pass.
- [ ] Idempotency pass.
- [ ] No sensitive data leak.
- [ ] No production mutation during QA.

## Release

- [ ] Typecheck pass.
- [ ] Lint pass.
- [ ] Unit/integration tests pass.
- [ ] Browser tests pass.
- [ ] OpenNext/Cloudflare-compatible build pass.
- [ ] Desktop QA pass.
- [ ] Mobile QA pass.


---

# 21. EXECUTION HARNESS — FAILURE-PREVENTION CONTRACT

Phần này biến tài liệu từ một specification thành **runbook có gate**. Mục tiêu không phải hứa “không bao giờ có lỗi”, mà là ngăn lỗi chưa được phát hiện đi qua từng phase và ngăn một bản build xanh giả tạo được coi là hoàn tất.

## 21.0. Pre-edit repository rescan gate

Harness bắt đầu từ **đọc lại code hiện tại**, không bắt đầu từ implementation.

Trước bất kỳ edit nào:

```text
latest main
→ repository tree inventory
→ source deep-scan
→ current behavior reconstruction
→ code/data-flow maps
→ baseline tests
→ implementation
```

Các assertion quan trọng phải được xác minh lại bằng current source và ghi path/function/type liên quan trong rescan evidence.

Mandatory outputs:

```text
REPOSITORY_RESCAN = PASS
RESCAN_MAIN_SHA = <sha>
ROUTE_MAP = <evidence path>
CODE_MAP = <evidence path>
DATA_FLOW_MAP = <evidence path>
DOMAIN_COMMAND_MAP = <evidence path>
RBAC_PROJECTION_MAP = <evidence path>
DROPDOWN_INVENTORY = <evidence path>
PORTAL_FLOW_MAP = <evidence path>
PERSISTENCE_MIGRATION_MAP = <evidence path>
TEST_MAP = <evidence path>
DOC_CODE_DRIFT = <none | documented list>
UNKNOWN_AREAS = <none | blocker list>
```

Hard stop: không được tạo migration, đổi type, sửa component hoặc thay projection trước khi rescan gate PASS.

---

## 21.1. Source-of-truth precedence

Khi có mâu thuẫn, dùng thứ tự sau:

```text
1. Invariant tài chính / kho / RBAC / audit đã được test và đang dùng production
2. Schema + migration + domain/service hiện tại
3. Requirement đã khóa trong file này
4. Locked V2 design language
5. Existing UI implementation / old mockup
6. Convenience refactor / developer preference
```

Không được hy sinh invariant để đạt mockup.

Không được giữ UI cũ nếu UI cũ trái requirement đã khóa.

---

## 21.2. Baseline manifest bắt buộc

Trước khi sửa, tạo evidence nội bộ trong branch, ví dụ:

```text
docs/erp-v2-remediation/
  00-baseline.md
  01-data-flow-map.md
  02-dropdown-audit.md
  03-projection-matrix.md
  04-route-map.md
  05-migration-plan.md
  06-regression-matrix.md
  07-visual-fidelity.md
  08-release-evidence.md
```

Không bắt buộc đúng tên nếu repo có convention khác, nhưng phải có equivalent evidence.

`00-baseline.md` tối thiểu ghi:

```text
MAIN_SHA=
FEATURE_BRANCH=
NODE_VERSION=
PACKAGE_MANAGER=
BASELINE_TYPECHECK=
BASELINE_LINT=
BASELINE_UNIT=
BASELINE_INTEGRATION=
BASELINE_BUILD=
BASELINE_KNOWN_FAILURES=
```

DOD:

- [ ] Main SHA được pin.
- [ ] Không làm việc trên production/main trực tiếp.
- [ ] Working tree ban đầu sạch hoặc mọi thay đổi có sẵn được ghi rõ.
- [ ] Baseline failures được tách khỏi regression mới.

---

## 21.3. Characterization-before-refactor rule

Trước khi refactor một khu vực có ảnh hưởng nghiệp vụ, phải có test khóa hành vi cần giữ.

Tối thiểu cho:

```text
Payment confirm ≠ allocation
Inventory balance = movements
Correction = reversal
Work claim atomic
Warehouse scope
Customer/supplier projection
DocumentUnitSnapshot immutability
ProcessedOperation idempotency
```

Không được viết lại cả service rồi mới “xem test nào hỏng”.

---

## 21.4. Phase gate sequence

### Gate 0 — Repository rescan

```text
REPOSITORY_RESCAN = PASS
CURRENT_CODE_MAP = PASS
CURRENT_DATA_FLOW_MAP = PASS
CURRENT_RBAC_PROJECTION_MAP = PASS
CURRENT_DROPDOWN_INVENTORY = PASS
CURRENT_TEST_MAP = PASS
```

Chưa PASS → **không được edit source**.

### Gate A — Baseline

```text
BASELINE_CHARACTERIZATION = PASS
```

Chưa PASS → không bắt đầu broad refactor.

### Gate B — P0 connectivity

```text
REPOSITORY_RESCAN = PASS
CURRENT_CODE_MAP = PASS
CURRENT_DATA_FLOW_MAP = PASS
CURRENT_RBAC_PROJECTION_MAP = PASS
CURRENT_DROPDOWN_INVENTORY = PASS
CURRENT_TEST_MAP = PASS
CROSS_MODULE_DATA_CONNECTIVITY = PASS
DROPDOWN_DATA_INTEGRITY = PASS
PORTAL_CATALOG_PROPAGATION = PASS
RBAC_PROJECTION = PASS
```

Chưa PASS → không coi UI rewrite là feature-complete.

### Gate C — Persistence/domain

```text
SCHEMA_MIGRATION_SAFETY = PASS
FINANCIAL_INVARIANTS = PASS
INVENTORY_INVARIANTS = PASS
AUDIT_IDEMPOTENCY = PASS
```

Chưa PASS → không tiếp tục tới release candidate.

### Gate D — UX/features

```text
DESIGN_SYSTEM_FIDELITY = PASS
DASHBOARD_CHART_DATA_INTEGRITY = PASS
DESKTOP_RESPONSIVE_QA = PASS
MOBILE_RESPONSIVE_QA = PASS
```

### Gate E — Full regression/release

```text
REGRESSION_MATRIX = PASS
TYPECHECK_LINT_TEST_BUILD = PASS
NO_PRODUCTION_MUTATION = PASS
```

Chỉ khi A→E đều PASS mới được báo DONE.

---

## 21.5. Regression matrix

Trước implementation phải lập bảng:

| Capability | Baseline test/evidence | Changed? | New test | Manual QA | Result |
|---|---|---:|---|---|---|
| Login/RBAC | ... | | | | |
| Customer master | ... | | | | |
| Supplier master | ... | | | | |
| Product master | ... | | | | |
| Sales | ... | | | | |
| Purchase | ... | | | | |
| Inventory | ... | | | | |
| Receivables | ... | | | | |
| Payables | ... | | | | |
| Cash | ... | | | | |
| Workforce | ... | | | | |
| Portal customer | ... | | | | |
| Portal supplier | ... | | | | |
| Reporting/export | ... | | | | |
| Audit | ... | | | | |

Không được chỉ test màn vừa sửa.

---

## 21.6. Dropdown audit harness

Mọi dropdown entity phải có entry trong audit matrix:

| Screen | Field | Entity source | Selector/read model | RBAC scope | Eligible filter | Loading | Empty | Error | Cross-module test |
|---|---|---|---|---|---|---|---|---|---|

Hard fail nếu:

- valid data có trong D1 nhưng UI nhận `[]` ngoài ý muốn;
- select trống không có empty state;
- component tự fallback sang demo data;
- broadening projection làm lộ dữ liệu ngoài scope;
- cùng entity nhưng module dùng ID khác.

---

## 21.7. Projection security harness

Mỗi projection/read model mới phải test cả **positive access** và **negative access**.

Ví dụ Customer Portal:

```text
MUST SEE:
product id
code
name
public unit
public price if configured
public VAT if configured
safe availability

MUST NOT SEE:
internal cost
preferred supplier
margin
price history
warehouse-only metadata
audit internals
processedOperations
```

Warehouse/driver/worker/customer/supplier scopes cũng phải có negative test tương ứng.

---

## 21.8. Migration harness

Nếu có migration:

1. Chụp schema trước.
2. Ghi rõ forward migration.
3. Ghi rõ dữ liệu nào được backfill.
4. Không đoán dữ liệu lịch sử không thể suy ra chắc chắn.
5. Chạy migration trên test database/staging fixture trước.
6. Reconcile counts + financial/inventory invariants sau migration.
7. Ghi rollback/recovery plan.

Hard fail nếu migration:

- drop history/ledger/movement;
- rewrite document snapshot;
- reset balance;
- tạo duplicate master IDs;
- cần production thử trực tiếp mới biết đúng hay sai.

---

## 21.9. Financial reconciliation harness

Trước và sau thay đổi domain/persistence phải kiểm:

```text
Customer AR totals
Supplier AP totals
Cash balance/read model
Inventory quantities
Employee payable totals
Payment allocated/unallocated totals
```

Nếu chênh lệch ngoài thay đổi nghiệp vụ có chủ đích:

```text
FINANCIAL_INVARIANTS = FAIL
```

Không “adjust fixture” để làm chênh lệch biến mất nếu chưa tìm root cause.

---

## 21.10. Cross-module smoke harness

Một fixture/test scenario phải chạy xuyên hệ thống:

```text
1. Create Customer
2. Create Supplier
3. Create Product
4. Configure user-defined unit conversion
5. Create Warehouse
6. Create Employee/worker
7. Create Vehicle
8. Verify all downstream dropdowns
9. Create Sales draft
10. Confirm Sales
11. Allocate source
12. Assign/open work
13. Create/confirm Purchase if required
14. Receive to warehouse or direct-deliver
15. Deliver customer order
16. Verify AR
17. Create/confirm customer payment
18. Verify unallocated amount
19. Match payment
20. Verify debt
21. Submit/approve work output
22. Post compensation
23. Pay employee
24. Verify reports/dashboard/export
25. Verify audit trail
```

Mọi mutation dùng local/test fixture hoặc staging-safe data, **không production**.

---

## 21.11. Dashboard/chart harness

Dashboard không PASS chỉ vì chart render.

Mỗi chart phải có:

```text
Question answered
Authoritative data source
Time/filter semantics
Unit/format
Empty/loading/error behavior
Mobile behavior
Drill-down target (nếu có)
```

Ví dụ:

```text
Chart: Doanh thu theo ngày
Question: Doanh thu đang tăng/giảm thế nào trong kỳ?
Source: reporting read model từ Sales/ledger đã xác nhận
Filter: fromDate/toDate
Unit: VND
Drill-down: Sales list cùng date filter
```

DOD:

- [ ] Chart không dùng seed/hardcoded business values trong production.
- [ ] Tổng trên chart reconcile với report/table tương ứng.
- [ ] Filter ngày được test.
- [ ] Tooltip chính xác.
- [ ] Bar axis không gây hiểu sai.
- [ ] Mobile không chồng label.
- [ ] Có empty/loading/error.
- [ ] Có accessible summary.

---

## 21.12. Visual regression harness

Bắt buộc screenshot các màn sau ở desktop và nơi relevant ở mobile:

```text
Dashboard
Customer detail
Supplier detail
Product detail + unit conversion
Sales editor
Purchase editor
Inventory / opening stock
Workforce / employee dropdown
Accounting export
Customer portal catalog/order
```

Viewport tối thiểu:

```text
1440x900
1366x768
1024x768
390x844
375x812
360x800
```

Visual PASS không được dựa trên mô tả bằng chữ.

Hard fail nếu có:

- clipped text,
- hidden primary action,
- viewport overflow,
- money wrapping khó đọc,
- select blank,
- table squeezed vô nghĩa,
- mobile desktop-shrink,
- browser-default primary workflow controls,
- divergence rõ với locked design language.

---

## 21.13. No-silent-skip rule

Nếu một test/gate không chạy được, trạng thái phải là:

```text
NOT RUN
```

hoặc:

```text
BLOCKED
```

Không được ghi PASS.

Mỗi NOT RUN/BLOCKED phải ghi:

```text
WHY
RISK
WHAT WOULD BE NEEDED TO RUN IT
```

---

## 21.14. Test-change rule

Không được:

- xóa test đang fail,
- skip test,
- relax assertion,
- tăng timeout vô hạn,
- mock bỏ mất boundary thật,

chỉ để đạt green build.

Nếu requirement mới thực sự thay đổi expected behavior:

1. ghi requirement nào thay đổi,
2. chứng minh old assertion không còn đúng,
3. thay test bằng expectation mới,
4. giữ regression coverage tương đương hoặc mạnh hơn.

---

## 21.15. Scope guard

Không được lan scope sang:

- native mobile rewrite,
- unrelated deployment redesign,
- Docker/WSL release path,
- full accounting GL mới,
- AI/bank reconciliation mới,
- infrastructure migration không liên quan,

trừ khi một compile compatibility change tối thiểu là bắt buộc.

Nếu shared type làm `apps/mobile` fail compile, chỉ sửa compatibility nhỏ nhất và ghi rõ trong PR.

---

## 21.16. Production safety harness

Production chỉ được dùng cho read-only verification khi được yêu cầu rõ.

Không:

```text
create test customer
create test order
create test payment
create inventory opening
create work order
send real customer notification/call
```

trên production để chứng minh feature hoạt động.

`NO_PRODUCTION_MUTATION = PASS` cần evidence rằng test mutation được chạy ở local/test/staging, không phải production.

---

## 21.17. Commit/PR harness

Commit theo capability, tránh một commit khổng lồ không review được.

Mỗi commit phải:

- build/test phần liên quan,
- không chứa debug log/temporary screenshot ngoài evidence folder được chấp nhận,
- không chứa secret,
- không chứa generated fixture vô tình,
- không đổi production config ngoài scope.

Trước PR:

```text
review git diff
review changed file list
search secrets
search TODO/FIXME introduced
search console.log/debug
search disabled tests
search fallback/demo data
search obsolete technical UI copy
```

PR không được mark ready khi release evidence chưa hoàn tất.

---

## 21.18. Required final evidence format

Final implementation report phải có dạng:

```text
BASELINE
- main SHA:
- branch:
- known pre-existing failures:

ROOT CAUSES
- dropdown:
- projection:
- portal catalog:
- other:

MIGRATIONS
- files:
- data impact:
- rollback/recovery:

GATES
BASELINE_CHARACTERIZATION = PASS/FAIL/BLOCKED/NOT RUN
CROSS_MODULE_DATA_CONNECTIVITY = ...
DROPDOWN_DATA_INTEGRITY = ...
PORTAL_CATALOG_PROPAGATION = ...
SCHEMA_MIGRATION_SAFETY = ...
FINANCIAL_INVARIANTS = ...
INVENTORY_INVARIANTS = ...
RBAC_PROJECTION = ...
AUDIT_IDEMPOTENCY = ...
DASHBOARD_CHART_DATA_INTEGRITY = ...
REGRESSION_MATRIX = ...
DESKTOP_RESPONSIVE_QA = ...
MOBILE_RESPONSIVE_QA = ...
TYPECHECK_LINT_TEST_BUILD = ...
DESIGN_SYSTEM_FIDELITY = ...
NO_PRODUCTION_MUTATION = ...

EVIDENCE
- commands/results:
- tests:
- screenshots:
- reconciliation:

KNOWN LIMITATIONS
- ...

FINAL STATUS
READY / NOT READY
```

Không dùng câu “mọi thứ ổn” thay cho evidence.

---

## 21.19. Definition of NOT DONE

ERP V2 **chưa hoàn tất** nếu bất kỳ điều nào sau đây đúng:

- build pass nhưng dropdown vẫn rỗng sai;
- UI đẹp nhưng module không propagation dữ liệu;
- portal dùng product copy/ID khác master;
- user vẫn phải F5 để thấy master data mới;
- chart dùng dữ liệu hardcoded;
- chart không reconcile với report;
- test bị skip/relax để green;
- migration chưa có rollback/recovery plan;
- financial/inventory reconciliation chưa rõ;
- RBAC negative tests chưa có;
- mobile bị overflow;
- design chỉ kiểm bằng code, không screenshot;
- production mutation được dùng làm UAT;
- một gate là NOT RUN/BLOCKED nhưng final status vẫn ghi READY.

---

# 22. HARNESS COMPLETION CHECKLIST

Trước khi gửi PR cho review, phải tick đủ:

- [ ] Baseline manifest hoàn tất.
- [ ] Characterization tests tồn tại cho invariants bị đụng tới.
- [ ] Dropdown audit hoàn tất.
- [ ] Projection matrix hoàn tất.
- [ ] Cross-module propagation tests pass.
- [ ] Portal catalog public-safe tests pass.
- [ ] Unit conversion snapshot tests pass.
- [ ] Schema migration safety evidence có đủ nếu có migration.
- [ ] Financial reconciliation pass.
- [ ] Inventory reconciliation pass.
- [ ] Work claim concurrency pass.
- [ ] Dashboard charts dùng read model thật và reconcile.
- [ ] Accounting export reconcile.
- [ ] Full regression matrix pass.
- [ ] RBAC positive + negative tests pass.
- [ ] Audit/idempotency pass.
- [ ] Desktop screenshot QA pass.
- [ ] Mobile screenshot QA pass.
- [ ] Typecheck/lint/tests/build pass.
- [ ] No skipped/disabled tests introduced without accepted rationale.
- [ ] No fallback/demo data introduced.
- [ ] No secrets/debug artifacts.
- [ ] No production mutation used for QA.
- [ ] Rollback/recovery notes complete.
- [ ] Every PASS has evidence.
- [ ] FINAL STATUS = READY only if every required gate is PASS.
