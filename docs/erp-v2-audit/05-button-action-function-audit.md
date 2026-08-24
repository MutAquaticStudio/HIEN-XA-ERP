# HIỀN XA ERP V2 — COMPLETE BUTTON / ACTION FUNCTION AUDIT

## 1. Kết luận

Audit được thực hiện trên đúng worktree đang có, không reset, không sửa application source, không commit, không push và không deploy. Kết quả tổng thể là **FAIL**: phần lớn control đã nối đúng tới command service, RBAC, revision và snapshot refresh, nhưng còn ba lỗi P1 có thể làm workflow giao hàng hoặc retry mutation không đáp ứng hợp đồng vận hành.

- Branch: `codex/master-data-crud-remediation-20260822`
- HEAD khi audit: `2b0c3f63828e8af07e9be9d873e0cc53675281cc`
- Phương pháp đếm: 275 khai báo control DOM có thể đi tới từ 88 route; thay 9 implementation wrapper dùng chung bằng 86 call site của wrapper để thu được **352 control record**. Các dòng bảng động cùng label, handler và command được tính một control family, không nhân theo số bản ghi runtime.
- Registry có **91 mutating command**: 91/91 có permission, idempotency metadata, audit event và test reference; 82 command có call site TSX trực tiếp, 4 đi qua action chuyên biệt, 5 không có control web nội bộ.
- Quy tắc phân loại: `FAIL` thắng `PARTIAL`, `PARTIAL` thắng `PASS`. Control bị lỗi ở một role/state được coi là FAIL cho cả record.

| Kết quả | Số control | Diễn giải |
|---|---:|---|
| PASS | 273 | Wiring/read-only action hoặc mutation path có bằng chứng server authorization, state guard, revision/refresh và executable test phù hợp. |
| FAIL | 13 | Broken command allowlist, destructive action không xác nhận, audit reason cố định, hoặc error bị trình bày như success/status. |
| PARTIAL | 66 | 65 mutation call site còn dùng key mới cho retry sau response-loss; 1 login control có two-hop redirect flaky. |
| BLOCKED | 0 | Không có control nào hoàn toàn không thể truy vết; staging database suite bị guard chặn nhưng local/domain evidence vẫn đủ để phân loại control. |

## 2. Chuỗi wiring authoritative

Mutation web nội bộ chủ yếu đi theo:

`UI component → useOperationsRuntime.runOperation/runCreateCommand → server action → requireIdentityUser/requireOperationsActor → ErpV2CommandService → domain handler → transaction/CAS/idempotency/audit → projected state + revision → applyMutationResult/polling snapshot`.

Portal đi theo:

`portal form → portal server action → same-origin + identity role/scope → ErpV2 runtime → command service/domain → revalidate partner paths → refreshed portal projection`.

Đã xác minh:

- Registry permission được kiểm tra ở UI readiness và lại được kiểm tra server-side/domain; UI gating không phải authorization boundary.
- 91/91 command đăng ký `idempotent: true`, có `auditEvent` và transaction boundary.
- Runtime áp dụng mutation snapshot ngay khi revision không cũ hơn, polling `/api/operations/snapshot` mỗi 3 giây, bỏ snapshot cũ và có retry 1/3/7 giây; thao tác bình thường không cần F5.
- Customer/Supplier/Worker/Driver projection và attachment scope có positive/negative/cross-scope tests.
- Các action local filter, tab, search, expand/collapse, export CSV và navigation không ghi domain state.

Ngoại lệ được nêu tại Findings: client không giữ cùng idempotency key qua retry; một operation user-visible không qua được server action allowlist.

## 3. Control matrix

Các row dưới đây bao phủ toàn bộ control family. Dòng có nhiều label chỉ nhóm các call site dùng cùng component, handler, server action, permission contract và kết quả; label cụ thể vẫn được liệt kê.

| PAGE | CONTROL_LABEL | CONTROL_TYPE | VISIBLE_TO_ROLE | UI_COMPONENT | CLIENT_HANDLER | SERVER_ACTION/API | DOMAIN_COMMAND | REQUIRED_PERMISSION | EXPECTED_RESULT | POST_ACTION_REFRESH | EXPECTED_REDIRECT | AUDIT/IDEMPOTENCY | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/login`, partner login | Đăng nhập; Đăng nhập khách; Đăng nhập cổng đối tác | submit | anonymous | login pages | native server form | `loginAction` | identity authenticate/session | public + rate limit | session theo đúng role | redirect chain | `/` rồi role landing; partner đi thẳng portal | identity audit/session | PARTIAL — internal login two-hop flaky |
| ERP shell | tất cả sidebar links; mobile menu; Đăng xuất | navigation/summary/submit | role-projected internal user | `ErpShell` | Next Link/details/form | `logoutAction` | clear session | projected modules | route đúng, shell giữ nguyên | Next route render | route đích hoặc `/login` | read-only/logout audit | PASS |
| `/catalog/*` | Tạo; Lưu thay đổi; Hủy; Xem; Chỉnh sửa | submit/link | master-data permissions | `catalog-crud`, `catalog-ui` | form submit/router | create/operation actions | create/update catalog commands | registry permission theo entity | authoritative ID/version | result state + refresh | detail/list | server audit; fresh retry key | PARTIAL — retry key không ổn định |
| `/catalog/units` | Thêm đơn vị; Đổi tên; Lưu/Cập nhật quy đổi | submit/button | `catalog.manage_purchase_units` | `CatalogUnitSettingsWorkspace` | runtime create command | `runErpV2CreateCommandAction` | create/update/upsert unit commands | `catalog.manage_purchase_units` | revision tăng, cấu hình authoritative | mutation snapshot | none | server audit; fresh retry key | PARTIAL |
| `/catalog/units` | Xóa đơn vị; Xóa quy đổi | destructive button | `catalog.manage_purchase_units` | `CatalogUnitSettingsWorkspace` | immediate runtime command | create-command action | delete unit/conversion | `catalog.manage_purchase_units` | xóa nếu không có dependency | mutation snapshot | none | audited; no confirm | FAIL |
| `/sales/orders*` | Tạo/Lưu đơn nháp; thêm/xóa dòng; Xác nhận; Cấp nguồn | form/button/select/file | sales/owner roles by permission | `SalesView` | runtime create/operation | create/operation/image actions | sales commands | `sales.create`, `sales.confirm`, `sales.allocate_source` | document snapshot, version, source allocation | immediate result + polling | focused detail/list | audited; fresh retry key | PARTIAL |
| `/procurement/orders*` | Tạo/Lưu đơn; Gửi/Duyệt/Từ chối nhận; Ghi nhập; Giao thẳng; Đảo giao | form/button/select/file | procurement/warehouse/owner/accountant | `ProcurementView` | runtime create/operation | create/operation/image actions | purchase/receipt/direct commands | registry permission per action | state transition; stock/AP only after approval | immediate result + polling | focused detail/list | audited; upload action uses server-random key | PARTIAL |
| `/inventory/stock` | search; 4 filters; 5 section links; Tạo kho/bãi | search/select/link | projected inventory reader | `InventoryStockSection`, `InventoryView` | local state/Next Link | none | none | read projection | filtered stock rows including `—` without warehouse | local | section query/catalog create | read-only | PASS |
| `/inventory/stock` | Điều chỉnh tồn; đóng drawer; Ghi tồn đầu kỳ; Chuyển kho | modal/form/button | scoped inventory permissions | `QuickInventoryCountDrawer`, inventory forms | stable quick-count key/runtime | evidence/create/operation actions | quick count/opening/transfer | inventory create/post permissions | pending count or append-only movements | immediate result + polling | none | quick-count key stable; opening/transfer key fresh | PASS/PARTIAL |
| inventory count panel | Tạo phiếu; Thêm dòng; Lưu số đếm; Bỏ qua; Gửi; Duyệt | form/button/file | scoped count permissions | `InventoryCountSessionPanel` | action/runtime | evidence action/operation action | count-session commands | count permission per transition | versioned count workflow; adjustment only after approval | result/polling | none | server audit/CAS | FAIL only for error feedback of Lưu số đếm; other controls PASS/PARTIAL |
| inventory count panel | Yêu cầu kiểm lại; Từ chối; Đảo phiếu | destructive/workflow button | owner/accountant by permission | `InventoryCountSessionPanel` | immediate runtime command | operation action | recount/reject/reverse count | inventory reject/reverse permissions | transition with truthful reason/confirmation | mutation snapshot | none | audited but UI injects fixed reason | FAIL |
| negative stock panel | Gửi Owner duyệt; Duyệt | form/button | requester/owner | `NegativeStockOverridePanel` | runtime operation | operation action | request/approve override | negative-stock permissions + owner guard | approval only; movement later | mutation snapshot | none | audited | PASS/PARTIAL retry |
| negative stock panel | Từ chối | prompt button | owner | `NegativeStockOverridePanel` | `window.prompt` then runtime | operation action | reject override | owner + reject permission | reject with reason | mutation snapshot | none | audited; browser prompt | FAIL |
| `/delivery/jobs*` | Tạo chuyến; Bốc hàng; Xuất bến; Xác nhận/Chụp ảnh; Duyệt giao; Từ chối; Hoàn tất; Thất bại | form/button/file | scoped dispatcher/driver/worker/owner/accountant | `DeliveryView`, `WorkerDeliveryView`, `WorkflowActionButton` | runtime create/operation | create/operation/image actions | delivery commands | registry delivery permissions | state transition; posting only after approval | result/polling | list/detail/tracking | audited; fresh/server-random retry key | PARTIAL |
| worker delivery | Báo chênh lệch | workflow button | assigned worker/driver | `WorkerDeliveryView` | runtime operation | `runErpV2OperationAction` | `requestDeliveryQuantityChange` | `delivery.request_quantity_change` | pending request for approval | expected mutation snapshot | none | command is registered/audited | FAIL — server action rejects before domain |
| internal delivery | Duyệt/Từ chối báo chênh lệch; Miễn ảnh khách nhận | expected workflow controls | owner/accountant | no web component | none | mobile API only for quantity approval; none for waiver | approve/reject quantity; waive receipt | delivery approval/waive permissions | unblock completion workflow | n/a | n/a | domain commands audited/tested | FAIL — controls absent from web ERP |
| `/receivables` | filters; export; select debt row; create/confirm/allocate/reverse receipt | select/button/form | finance-scoped roles | `ReceivablesView` | local download/runtime | create/operation actions | customer payment commands | cash/receivable permissions | ledger/cash state per transition | result/polling | none/download | audited; fresh retry key | PARTIAL |
| `/receivables` | Giao phụ trách thu hồi; Ghi nhận thu hồi | expected controls | owner/authorized collector | no web component | none | mobile API only | assign/follow-up collection | receivable collection permissions | collection metadata/audit | n/a | n/a | domain commands audited/tested | FAIL — web controls absent |
| `/payables` | filters; export; create/confirm/allocate/reverse supplier payment | select/button/form | finance roles | `PayablesView` | local download/runtime | create/operation actions | supplier payment commands | payables/cash permissions | AP/cash ledger transition | result/polling | none/download | audited; fresh retry key | PARTIAL |
| `/cash*` | create/confirm/reverse voucher; transfer proof upload; review/reject customer proof | form/button/file | cash permissions | cash view and proof pages | runtime/server form | actions | cash/proof commands | cash permissions | draft then confirmed/reversed/reviewed | result/revalidate | feedback query where applicable | audit and form key | PARTIAL |
| `/workforce/orders`, `/compensation` | claim; assign; create/approve work; post compensation; employee payment/advance confirm/reverse; GPS | form/button/select | workforce-scoped roles | `WorkforceView`, shared action | runtime | create/operation actions | workforce commands | workforce/cash permissions | atomic claim; exactly-once compensation; cash effects on confirm | result/polling | none | audited; fresh retry key | PARTIAL |
| `/import` | upload; dry run; create/resolve/ignore issue | file/form/button | import roles | `ImportView` | runtime/file action | import actions | import commands | import permissions | dry-run/issues only; explicit resolution | result/polling | none | fingerprint/audit/idempotency | PARTIAL retry; domain behavior PASS |
| `/audit`, `/reporting`, dashboard | filters; date apply; expand detail; export CSV/accounting package | select/button/summary/link | projected reporting/audit roles | audit/reporting/dashboard views | local state/download/server navigation | read model only | none | reporting/audit read | read-only export and filtered view | local/RSC | download/query | no mutation | PASS |
| `/dat-hang` | refresh catalog; unit select; +/- quantity; next/back; ask store; submit order | button/select/link | public/customer as appropriate | `CustomerOrderPreview` | local wizard/fetch/server action | communications API/portal action | customer portal order | customer role for mutation | authoritative repricing and draft order | revalidation/local reset | login if anonymous | stable order/availability key; feedback mixed | FAIL only for error/status semantics; functional path otherwise PASS |
| customer portal | order/detail/nav; payment proof; delivery receipt; tracking; messages; notification | link/form/file/button | scoped customer | portal components | server actions/fetch | portal actions/APIs | proof/receipt/message commands | customer identity + party scope | submitted request only, no early ledger/posting | revalidate/projection refresh | portal routes | payment proof stable; receipt key regenerates; errors use status | FAIL/PARTIAL |
| supplier portal | order/detail/nav; response; delivery notice; messages; notification | link/form/select/file/button | scoped supplier | `SupplierPortalWorkspace` | server actions/fetch | portal actions/APIs | response/notice/message commands | supplier identity + party scope | pending response/notice only | revalidate/projection refresh | portal routes | each retry creates a new portal key; errors use status | FAIL/PARTIAL |
| global error/loading | Thử lại; Quay lại; route reset | button/link | all | error/loading components | reset/router refresh/back | RSC retry | none | route access remains server-guarded | preserves shell/page or shows route error | RSC | current/back | read-only | PASS |

## 4. Registry command coverage

Mỗi command dưới đây có permission, audit event và transaction boundary trong `erp-registry.ts`; 91/91 được tham chiếu trong test. `PASS` ở đây chỉ xác nhận server/domain contract, không ghi đè finding UI/handler ở phần 5.

- Master data (20): `createCustomer`, `createSupplier`, `createProductUnit`, `updateProductCommercialPolicy`, `assignCustomerCollectionOwner`, `recordCustomerCollectionFollowUp`, `requestDeliveryQuantityChange`, `approveDeliveryQuantityChange`, `rejectDeliveryQuantityChange`, `confirmCustomerDeliveryReceipt`, `waiveCustomerDeliveryReceipt`, `createUnitDefinition`, `deleteUnitDefinition`, `resetPurchaseUnitSettings`, `upsertPurchaseUnitConversion`, `deletePurchaseUnitConversion`, `createWarehouse`, `createVehicle`, `createEmployee`, `updateCatalogRecord`.
- Sales (5): `createSalesOrderDraft`, `updateSalesOrderDraft`, `createCustomerPortalSalesOrder`, `confirmSalesOrder`, `allocateSalesSources`.
- Procurement (11): `createPurchaseOrderDraft`, `updatePurchaseOrderDraft`, `submitSupplierPurchaseOrderResponse`, `submitSupplierDeliveryNotice`, `confirmPurchaseOrder`, `submitGoodsReceipt`, `approveGoodsReceipt`, `rejectGoodsReceipt`, `postGoodsReceipt`, `confirmDirectDelivery`, `reverseDirectDelivery`.
- Delivery (8): `createDeliveryJob`, `startDeliveryLoading`, `dispatchDelivery`, `submitDeliveryCompletion`, `approveDeliveryCompletion`, `rejectDeliveryCompletion`, `completeDelivery`, `failDelivery`.
- Inventory (17): `requestNegativeStockOverride`, `approveNegativeStockOverride`, `rejectNegativeStockOverride`, `postOpeningInventory`, `postInventoryTransfer`, `postInventoryCountAdjustment`, `updateUnitDefinition`, `submitQuickInventoryCount`, `createInventoryCountSession`, `addInventoryCountLine`, `recordInventoryCountLine`, `submitInventoryCountSession`, `requestInventoryCountRecount`, `approveInventoryCountSession`, `rejectInventoryCountSession`, `reverseInventoryCountSession`, `reverseInventoryMovement`.
- Receivables (4): `createCustomerPaymentDraft`, `confirmCustomerPayment`, `allocateCustomerPayment`, `reverseCustomerPayment`.
- Payables (4): `createSupplierPaymentDraft`, `confirmSupplierPayment`, `allocateSupplierPayment`, `reverseSupplierPayment`.
- Cash (6): `createCashVoucherDraft`, `createBankTransferProof`, `submitCustomerPaymentProof`, `reviewCustomerPaymentProof`, `confirmCashVoucher`, `reverseCashVoucher`.
- Workforce (12): `claimOpenSalesWorkOrder`, `assignSalesWorkOrder`, `createWorkOrderDraft`, `recordWorkOrderLocation`, `createEmployeePaymentDraft`, `createEmployeeAdvanceDraft`, `approveWorkOutput`, `postCompensation`, `payEmployee`, `reverseEmployeePayment`, `confirmEmployeeAdvance`, `reverseEmployeeAdvance`.
- Import (4): `createImportDryRun`, `createImportIssue`, `resolveImportIssue`, `ignoreImportIssue`.

## 5. Findings

### P1-01 — Nút “Báo chênh lệch” luôn bị server action từ chối

- MODULE/PAGE: Delivery, `/delivery/jobs*` worker view.
- ROLE: Worker/Driver được phân công.
- CONTROL: `Báo chênh lệch`.
- EXPECTED: tạo request `requestDeliveryQuantityChange` chờ Owner/Accountant duyệt.
- ACTUAL: UI gọi operation này tại `delivery-view.tsx:245`, nhưng enum của `operationInputSchema` trong `actions.ts:30` không chứa operation đó; Zod từ chối trước khi command service/domain chạy.
- REPRODUCTION: đăng nhập Worker/Driver có chuyến `in_transit` → mở chuyến → Báo chênh lệch → nhập số lượng khác và lý do → Xác nhận.
- EVIDENCE: static UI-to-action trace; registry/domain/tests có command, web allowlist không có; 635 unit test không có positive action-level test cho đường này.
- DOWNSTREAM IMPACT: không tạo approval request, worker bị kẹt nếu số thực giao khác kế hoạch.
- SEVERITY/CONFIDENCE: P1 / HIGH.
- REMEDIATION: bổ sung operation vào validated server action contract và action-level positive/negative/cross-scope test.

### P1-02 — Web ERP thiếu control hoàn tất approval/exception của delivery

- MODULE/PAGE: Delivery internal web.
- ROLE: Owner/Accountant.
- CONTROL: `Duyệt báo chênh lệch`, `Từ chối báo chênh lệch`, `Miễn ảnh khách nhận hàng`.
- EXPECTED: Owner/Accountant xử lý pending quantity-change và có đường miễn ảnh kèm lý do khi policy cho phép.
- ACTUAL: `approveDeliveryQuantityChange`/`rejectDeliveryQuantityChange` chỉ có caller trong mobile service; `waiveCustomerDeliveryReceipt` không có caller web/mobile. Internal `DeliveryView` chỉ render approval của `delivery_completion`.
- EVIDENCE: registry lines 191/202/224; mobile quantity approval at `mobile-inventory-delivery-service.ts:422`; no UI/action caller for waiver.
- DOWNSTREAM IMPACT: quantity-change hoặc thiếu ảnh khách có thể khóa việc gửi/duyệt completion trên web.
- SEVERITY/CONFIDENCE: P1 / HIGH.
- REMEDIATION: thêm control internal web theo RBAC hiện có; không mở public endpoint; bắt buộc reason cho reject/waive.

### P1-03 — UI không giữ cùng idempotency key qua retry sau response-loss

- MODULE/PAGE: shared runtime, Sales/Purchase/Inventory/Finance/Workforce/Master data/Delivery và Supplier Portal.
- ROLE: mọi role mutation được phép.
- CONTROL: 66 `WorkflowActionButton`/`SubmitButton` call site và các upload/portal actions liên quan.
- EXPECTED: double-click bị khóa; nếu commit thành công nhưng response mất, retry gửi cùng key để replay đúng kết quả và không tạo chứng từ thứ hai.
- ACTUAL: `use-operations-runtime.ts:143,162,166` tạo UUID mới cho mỗi lần gọi; receipt/delivery image actions lại tạo key server-side mới tại `actions.ts:484,548`; supplier response/notice tạo key mới mỗi submit. Backend same-key replay PASS, nhưng client không giữ key nên không kích hoạt được bảo đảm này cho retry.
- EVIDENCE: source trace + backend idempotency tests; không có browser test mô phỏng commit-success/response-loss/double-click cho shared runtime.
- DOWNSTREAM IMPACT: create-draft controls có thể tạo bản ghi thứ hai; stateful posting thường bị state/CAS chặn nhưng trả lỗi thay vì replay kết quả thành công; attachment có thể bị ghi lại rồi cleanup.
- SEVERITY/CONFIDENCE: P1 / HIGH.
- REMEDIATION: giữ key theo intent/form cho tới success hoặc payload thay đổi; client gửi key cho upload action; thêm lost-response và rapid-double-click tests.

### P2-01 — Web receivables thiếu hai control collection workflow

- MODULE/PAGE: `/receivables`.
- ROLE: Owner/authorized collector.
- CONTROL: `Giao phụ trách thu hồi`, `Ghi nhận thu hồi công nợ`.
- ACTUAL: command và mobile service tồn tại, web UI không có caller.
- DOWNSTREAM IMPACT: không quản lý collection owner/follow-up từ ERP web dù domain đã phát hành.
- SEVERITY/CONFIDENCE: P2 / HIGH.

### P2-02 — Xóa đơn vị/quy đổi không có bước xác nhận

- MODULE/PAGE: `/catalog/units`.
- ROLE: `catalog.manage_purchase_units`.
- CONTROL: hai nút `Xóa` tại `catalog-unit-settings.tsx:75,93`.
- ACTUAL: một click gọi command ngay; không hiển thị tên bản ghi/hậu quả và không có confirm state. Một surface cũ trong `catalog-view.tsx` có `Xác nhận xóa`, cho thấy hành vi không đồng nhất.
- DOWNSTREAM IMPACT: thao tác nhầm có thể xóa cấu hình chưa được dùng; dependency server vẫn bảo vệ base unit/in-use data.
- SEVERITY/CONFIDENCE: P2 / HIGH.

### P2-03 — Reason/confirmation của kiểm kê và tồn âm không phản ánh ý định người dùng

- MODULE/PAGE: Inventory count/negative-stock panels.
- ROLE: Owner/Accountant.
- CONTROL: `Yêu cầu kiểm lại`, `Từ chối`, `Đảo phiếu`, `Từ chối tồn âm`.
- ACTUAL: ba control kiểm kê gửi reason cố định tại `inventory-count-session-panel.tsx:47-49`; đảo phiếu không có confirm. Reject tồn âm dùng `window.prompt` tại `negative-stock-override-panel.tsx:45`, không có inline validation/error/recovery.
- DOWNSTREAM IMPACT: audit trail có thể ghi lý do chung không đúng sự kiện; UX mobile/keyboard và recovery kém.
- SEVERITY/CONFIDENCE: P2 / HIGH.

### P2-04 — Error của một số action được công bố như success/status

- MODULE/PAGE: Inventory count, customer portal, supplier portal, `/dat-hang`.
- CONTROL: `Lưu số đếm`, payment proof, customer receipt, supplier response, supplier notice, customer order.
- ACTUAL: component chỉ giữ chuỗi message, không giữ `result.ok`; lỗi dùng `role="status"` và cùng class với success. Rõ nhất: `InventoryCountSessionPanel` đặt cả `result.summary` và `result.error` vào `feedback-success` tại lines 28/40.
- DOWNSTREAM IMPACT: người dùng có thể hiểu lỗi là thành công; screen reader không nhận error alert; form retry không có trạng thái phân biệt.
- SEVERITY/CONFIDENCE: P2 / HIGH.

### P2-05 — Authenticated E2E có two-hop redirect và mobile assertion flaky

- MODULE/PAGE: login + ERP shell navigation.
- ACTUAL: `loginAction` redirect internal user tới `/`, sau đó root mới redirect `/dashboard`. Lần chạy mới có 6 timeout ở URL `/` dù DOM đã là dashboard; retry PASS. Hai mobile navigation lượt đầu tìm link `Phải thu` sau khi menu tự đóng nên fail, retry PASS.
- EVIDENCE: authenticated run: 46 PASS, 8 flaky; error snapshot cho thấy dashboard authoritative đã render trong lúc URL assertion vẫn là `/`.
- IMPACT: gate E2E không deterministic; cold navigation có thêm redirect và test mobile đang khẳng định trạng thái menu không đúng thiết kế.
- SEVERITY/CONFIDENCE: P2 / HIGH.

### P3-01 — Nhãn GPS chưa phải tiếng Việt hoàn chỉnh

- MODULE/PAGE: Workforce location action.
- CONTROL: `Lay vi tri hien tai`, `Nguon vi tri`, `Vi do`, `Kinh do` tại `operations-shared.tsx:419-441`.
- IMPACT: chất lượng ngôn ngữ/khả năng đọc không đồng nhất.
- SEVERITY/CONFIDENCE: P3 / HIGH.

P0 findings: **NONE**.

## 6. RBAC, refresh, trạng thái và accessibility

### RBAC

- PASS: registry permission metadata đầy đủ; `canRunOperation` khóa/hide action phía UI; command service/domain kiểm tra permission lại.
- PASS: portal actions kiểm tra identity role và customer/supplier linkage; attachment tests có negative scope.
- PASS: authenticated isolation E2E 24/24 ở cả 6 viewport cho Customer A/B, Supplier A/B, Worker A/B và Driver A/B.
- Không tìm thấy mutative button chỉ dựa vào UI gating mà thiếu server authorization.

### Loading/error/retry/no-F5

- PASS: shared runtime giữ state hiện tại khi background sync, áp dụng snapshot mới theo revision và hiển thị inline retry; không dựng full-screen loader trong normal module refresh.
- PASS: route error boundaries có `Thử lại`; route loading có timeout/error/back/retry.
- PARTIAL: portal mutation error semantics và login redirect flaky như findings.
- PASS: inventory unit modal được giữ mở sau 3.5 giây; đóng bằng control `Đóng` và không tự đóng do background sync.

### Mobile/keyboard/touch

- Public Playwright chạy 1440×900, 1366×768, 1024×768, 390×844, 375×812, 360×800: 24/24 PASS, không overflow, Axe không có serious/critical ở viewport được cấu hình.
- Inventory/unit E2E chạy parallel: 6/6 FAIL do cold two-hop login và dev server stream abort. Rerun tuần tự `--workers 1`: 6/6 PASS, gồm route redirect compatibility, quick-count modal persistence, units page, no overflow và Axe.
- Browser trực tiếp local ở 390×844: không overflow; các control nhìn thấy trên `/dat-hang` cao 45–48 px, primary +/-/next là 48 px; console không có app warning/error; tăng số lượng và chuyển bước render đúng.
- Login empty-submit giữ route, focus input `identifier`, native invalid state hoạt động; không blank/framework overlay/console error.

## 7. Fresh executable evidence

| Check | Result | Evidence |
|---|---|---|
| Full Vitest | PASS | 145 files, 635 tests PASS |
| Typecheck | PASS | `tsc --noEmit` |
| Next production build | PASS | compiled, typecheck, 55 static pages, full route manifest |
| Public Playwright | PASS | 24/24 across 6 viewports |
| Authenticated role E2E | PARTIAL | 46 PASS, 8 flaky first attempts, command exit 0 after retries |
| Cross-account isolation E2E | PASS | 24/24 across 6 viewports |
| Inventory + units rendered E2E parallel | FAIL | 6/6 fail from cold two-hop/stream abort |
| Inventory + units rendered E2E serial | PASS | 6/6 across all requested viewports |
| Direct in-app Browser local | PASS | login validation + `/dat-hang` interaction, DOM/console/overflow/touch checks |
| Dedicated staging DB integration | BLOCKED BY GUARD | 0/3 required env vars, no `.env.integration.local`; 4 suites stopped before tests. Guard was not bypassed. |
| Production interaction | NOT RUN | production remained read-only; no production browser mutation attempted |

Build/dev tooling temporarily changed the generated `next-env.d.ts`; the two generated path lines were restored immediately. No application source was edited by this audit.

## 8. Remediation order

1. P1-01: đưa `requestDeliveryQuantityChange` qua validated web server action và test positive/negative.
2. P1-02: thêm Owner/Accountant web controls cho quantity approval/reject và customer-receipt waiver với reason.
3. P1-03: ổn định idempotency key theo user intent, gồm upload/server actions; thêm response-loss/double-click tests.
4. P2: confirm destructive unit actions; reason dialogs/forms; phân loại success/error; bổ sung collection controls.
5. Làm deterministic login landing và sửa mobile shell test theo trạng thái menu thực tế.
6. Sửa nhãn GPS tiếng Việt và rerun full audit/gates.

## 9. Final checkpoint

```text
BUTTON_FUNCTION_AUDIT
TOTAL_CONTROLS=352
PASS_COUNT=273
FAIL_COUNT=13
PARTIAL_COUNT=66
BLOCKED_COUNT=0

MASTER_DATA_BUTTONS=FAIL
SALES_BUTTONS=PARTIAL
PURCHASE_BUTTONS=PARTIAL
INVENTORY_BUTTONS=FAIL
FINANCE_BUTTONS=PARTIAL
WORKFORCE_BUTTONS=PARTIAL
DELIVERY_BUTTONS=FAIL
CUSTOMER_PORTAL_BUTTONS=PARTIAL
SUPPLIER_PORTAL_BUTTONS=PARTIAL
REPORTING_AUDIT_BUTTONS=PASS

BUTTON_ACTION_WIRING=FAIL
RBAC_BUTTON_GATING=PASS
ASYNC_LOADING_STATES=PARTIAL
ERROR_RETRY_STATES=FAIL
MOBILE_BUTTON_ACCESSIBILITY=PASS

P0_FINDINGS=0
P1_FINDINGS=3
P2_FINDINGS=5
P3_FINDINGS=1

SOURCE_MODIFIED=NO
PRODUCTION_MUTATED=NO
DEPLOYED=NO
REMEDIATION_REQUIRED=YES
```
