# HIỀN XA ERP V2 — BUTTON / ACTION REMEDIATION RESULT

## 1. Kết luận

Toàn bộ chín finding có thể sửa bằng code trong audit `05-button-action-function-audit.md` đã được xử lý trên đúng worktree hiện hữu. Phương pháp tái kiểm toán giữ nguyên mẫu 352 control record của audit gốc: 275 khai báo control DOM, thay 9 wrapper dùng chung bằng 86 call site thực tế; control động cùng label, handler và command vẫn được tính là một control family.

- Branch: `codex/master-data-crud-remediation-20260822`
- Base SHA: `2b0c3f63828e8af07e9be9d873e0cc53675281cc`
- Phạm vi: application source, domain/server contracts, isolated local fixture, unit/integration-style tests và rendered Playwright QA.
- Không deploy, không gọi mutation production và không tạo dữ liệu production.
- Kết quả tái kiểm toán: **352 PASS, 0 FAIL, 0 PARTIAL, 0 BLOCKED**.

## 2. Remediation register

### P1-01 — Delivery discrepancy action

- ID: `P1-01`
- SEVERITY: `P1`
- PAGE: `/delivery/jobs*` worker/driver view
- CONTROL_LABEL: `Báo chênh lệch`
- EXPECTED: gửi đúng request chênh lệch để Owner/Accountant duyệt, không tự sửa delivered quantity.
- ACTUAL TRƯỚC SỬA: UI gọi `requestDeliveryQuantityChange` nhưng schema server action từ chối operation trước command service.
- ROOT_CAUSE: allowlist `operationInputSchema` thiếu đúng operation đã có trong registry/domain.
- UI_COMPONENT: `WorkerDeliveryView` / `WorkflowActionButton`.
- CLIENT_HANDLER: `useOperationsRuntime.runOperation` với line quantities và reason do người dùng nhập.
- SERVER_ACTION: `runErpV2OperationAction`; schema chỉ bổ sung chính xác `requestDeliveryQuantityChange`, vẫn từ chối operation lạ.
- DOMAIN_COMMAND: `requestDeliveryQuantityChange`.
- PERMISSION: `delivery.request_quantity_change`; actor, assignment, delivery job ID và state được kiểm tra lại ở server/domain.
- FIX: mở đúng bounded operation, chấp nhận quantity bằng `0` để báo thiếu toàn phần, chuyển đủ structured line quantities qua cả flow có attachment, giữ CAS/idempotency/audit/revision projection.
- TEST: action-level positive với explicit zero, unknown operation negative, registry/source wiring, domain RBAC/state tests và rendered worker → owner workflow không F5.

### P1-02A — Delivery discrepancy approve/reject controls

- ID: `P1-02A`
- SEVERITY: `P1`
- PAGE: `/delivery/jobs*` internal view
- CONTROL_LABEL: `Duyệt chênh lệch`, `Từ chối chênh lệch`
- EXPECTED: người có quyền xử lý pending quantity-change trên Web ERP.
- ACTUAL TRƯỚC SỬA: command tồn tại nhưng Web ERP không có caller.
- ROOT_CAUSE: internal `DeliveryView` chỉ render approval của delivery completion.
- UI_COMPONENT: `DeliveryView`.
- CLIENT_HANDLER: shared `WorkflowActionButton`; reject dùng reason người dùng nhập.
- SERVER_ACTION: `runErpV2OperationAction` với bounded operation schema.
- DOMAIN_COMMAND: `approveDeliveryQuantityChange`, `rejectDeliveryQuantityChange`.
- PERMISSION: `delivery.approve_quantity_change`, `delivery.reject_quantity_change`; state guard vẫn ở domain.
- FIX: render control theo permission và chỉ khi có pending quantity request; pending/disabled/reason/error/retry dùng shared runtime.
- TEST: server action allowlist, source wiring, domain transition/RBAC và rendered request → review → approve không F5; reject affordance mở/cancel được xác minh.

### P1-02B — Customer receipt waiver control

- ID: `P1-02B`
- SEVERITY: `P1`
- PAGE: `/delivery/jobs*` internal view
- CONTROL_LABEL: `Miễn ảnh khách nhận`
- EXPECTED: chỉ Owner được miễn receipt khi domain policy cho phép, bắt buộc lý do và audit.
- ACTUAL TRƯỚC SỬA: domain command không có caller Web/mobile.
- ROOT_CAUSE: thiếu control trên internal delivery surface.
- UI_COMPONENT: `DeliveryView`.
- CLIENT_HANDLER: shared `WorkflowActionButton`, reason form và mutation intent registry.
- SERVER_ACTION: `runErpV2OperationAction`.
- DOMAIN_COMMAND: `waiveCustomerDeliveryReceipt`.
- PERMISSION: `delivery.waive_customer_receipt` cộng owner guard và state guard server-side.
- FIX: thêm control permission/state-aware; completion approval bị vô hiệu cho tới khi có customer receipt hoặc waiver hợp lệ.
- TEST: action schema, permission/source tests, domain workflow và rendered owner waiver không F5.

### P1-03 — Stable idempotency across retry

- ID: `P1-03`
- SEVERITY: `P1`
- PAGE: shared internal mutations, catalog, portal, upload actions
- CONTROL_LABEL: 65 mutation call sites và các upload/portal form dùng chung lifecycle
- EXPECTED: một logical mutation giữ một key qua pending, transport/unknown server error và response-loss; double click không gửi lần hai; success hoặc payload mới mới mở intent mới.
- ACTUAL TRƯỚC SỬA: runtime/form tạo UUID mới mỗi lần submit; upload action tự sinh key server-side.
- ROOT_CAUSE: không có intent lifecycle dùng chung giữa UI pending/retry và server action payload.
- UI_COMPONENT: `useOperationsRuntime`, catalog CRUD, customer/supplier portal forms, partner conversation.
- CLIENT_HANDLER: `MutationIntentRegistry` gắn với mounted runtime/component, fingerprint payload xác định, không dùng local/session storage.
- SERVER_ACTION: caller truyền idempotency key cho cả JSON và upload action; upload retry replay sẽ dọn attachment vừa ghi dư.
- DOMAIN_COMMAND: mọi mutating command tiếp tục đi qua `ErpV2CommandService` CAS/idempotency transaction.
- PERMISSION: không thay đổi; mỗi command vẫn tái kiểm tra permission server-side.
- FIX: giữ key khi response outcome chưa biết, chặn concurrent submit, rotate sau success hoặc khi người dùng thay payload; hash command bỏ qua duy nhất attachment storage `id/uploadedAt` nhưng giữ content hash/owner/public metadata.
- TEST: rapid double click, delayed response, commit rồi mất response, retry replay, 5xx trước persistence, validation payload change, success rồi intentional second action và upload content mismatch.

### P2-01 — Receivables collection controls

- ID: `P2-01`
- SEVERITY: `P2`
- PAGE: `/receivables`
- CONTROL_LABEL: `Giao phụ trách thu hồi`, `Ghi nhận thu hồi công nợ`
- EXPECTED: Web ERP dùng đúng collection commands đã phát hành.
- ACTUAL TRƯỚC SỬA: chỉ có mobile/domain caller.
- ROOT_CAUSE: thiếu internal collection panel.
- UI_COMPONENT: `CustomerCollectionControls` trong `ReceivablesView`.
- CLIENT_HANDLER: chọn một customer, active employee, follow-up status và note; shared runtime.
- SERVER_ACTION: `runErpV2OperationAction`.
- DOMAIN_COMMAND: `assignCustomerCollectionOwner`, `recordCustomerCollectionFollowUp`.
- PERMISSION: `receivables.assign_collection_owner`, `receivables.record_collection_follow_up`.
- FIX: thêm panel permission-aware, current assignment và recent follow-up; follow-up chỉ ghi metadata/audit, không sửa ledger.
- TEST: source wiring, full domain/RBAC suite và rendered controls 6 viewport.

### P2-02 — Unit/conversion delete confirmation

- ID: `P2-02`
- SEVERITY: `P2`
- PAGE: `/catalog/units`
- CONTROL_LABEL: `Xóa đơn vị`, `Xóa quy đổi`
- EXPECTED: xác nhận record và hậu quả trước destructive command.
- ACTUAL TRƯỚC SỬA: một click chạy command ngay.
- ROOT_CAUSE: thiếu explicit destructive intent state.
- UI_COMPONENT: `CatalogUnitSettingsWorkspace`.
- CLIENT_HANDLER: accessible `role=alertdialog`, Cancel/Confirm; dialog chỉ đóng sau success.
- SERVER_ACTION: existing create-command action.
- DOMAIN_COMMAND: `deleteUnitDefinition`, `deletePurchaseUnitConversion`.
- PERMISSION: `catalog.manage_purchase_units`; dependency guards server-side giữ nguyên.
- FIX: thêm confirmation flow, consequence copy và stable mutation intent.
- TEST: source and unit dependency tests; rendered confirm/cancel 6 viewport.

### P2-03 — Inventory audit reasons and confirmations

- ID: `P2-03`
- SEVERITY: `P2`
- PAGE: inventory count and negative-stock panels
- CONTROL_LABEL: `Yêu cầu kiểm lại`, `Từ chối`, `Đảo phiếu`, `Từ chối tồn âm`
- EXPECTED: reason phản ánh ý định thực, inline validation/recovery, reversal nêu rõ append-only consequence.
- ACTUAL TRƯỚC SỬA: fixed reason hoặc `window.prompt`; reversal không confirm.
- ROOT_CAUSE: shared quick action không có user-intent form state.
- UI_COMPONENT: `InventoryCountSessionPanel`, `NegativeStockOverridePanel`.
- CLIENT_HANDLER: inline reason form/cancel; stable intent registry cho evidence count.
- SERVER_ACTION: existing bounded operation/evidence actions.
- DOMAIN_COMMAND: recount/reject/reverse count, reject negative-stock override.
- PERMISSION: existing inventory reject/reverse and Owner negative-stock guards.
- FIX: bỏ fixed reason/prompt, thêm reason validation và append-only warning; không ghi trực tiếp stock balance.
- TEST: source anti-pattern test, count/inventory domain suite và rendered form interaction 6 viewport.

### P2-04 — Truthful success/error semantics

- ID: `P2-04`
- SEVERITY: `P2`
- PAGE: inventory count, customer/supplier portal, `/dat-hang`
- CONTROL_LABEL: `Lưu số đếm`, payment proof, customer receipt, supplier response/notice, customer order
- EXPECTED: success/error khác type, class và ARIA; form giữ dữ liệu và retry được khi lỗi.
- ACTUAL TRƯỚC SỬA: message string chung, lỗi dùng success/status presentation.
- ROOT_CAUSE: component bỏ `result.ok` khi tạo feedback state.
- UI_COMPONENT: các form portal và inventory count.
- CLIENT_HANDLER: typed feedback `{ type, message }`, pending guard và stable intent lifecycle.
- SERVER_ACTION: portal/actions hiện có, không đổi authorization boundary.
- DOMAIN_COMMAND: existing proof/receipt/response/notice/order/count commands.
- PERMISSION: customer/supplier party scope và inventory permission giữ server-side.
- FIX: error dùng `role=alert` và style error; success dùng status; retry giữ input/key đúng lifecycle.
- TEST: component/source assertions, portal/domain negative tests, Axe/rendered QA.

### P2-05 — Deterministic login and mobile navigation E2E

- ID: `P2-05`
- SEVERITY: `P2`
- PAGE: `/login`, partner login, ERP shell
- CONTROL_LABEL: login submits and mobile `Phải thu` navigation
- EXPECTED: role landing trực tiếp; test không nhận `/dang-nhap` là portal success; menu được mở lại trước active-link assertion.
- ACTUAL TRƯỚC SỬA: internal login đi `/` rồi `/dashboard`; portal landing regex match nhầm login path; URL timeout 5 giây trong lúc authoritative UI đã render; mobile link assertion chạy khi details đã đóng.
- ROOT_CAUSE: extra redirect và test assertion không mô hình hóa đúng streamed navigation/menu state.
- UI_COMPONENT: login actions and `ErpShell`.
- CLIENT_HANDLER: native server form / Next navigation.
- SERVER_ACTION: `loginAction`, `acceptInvitationAction`.
- DOMAIN_COMMAND: identity authenticate/session.
- PERMISSION: role landing derived from authenticated server user.
- FIX: redirect trực tiếp theo role; E2E chờ authoritative main, so sánh exact pathname với bounded timeout và mở lại mobile menu khi cần.
- TEST: authenticated matrix rerun sạch 54/54, không retry/flaky; shell mounted navigation trên cả 6 viewport.

### P3-01 — Vietnamese GPS labels

- ID: `P3-01`
- SEVERITY: `P3`
- PAGE: workforce location action
- CONTROL_LABEL: GPS labels/status
- EXPECTED: tiếng Việt đầy đủ dấu và nhất quán.
- ACTUAL TRƯỚC SỬA: nhãn không dấu.
- ROOT_CAUSE: hard-coded incomplete Vietnamese strings.
- UI_COMPONENT: shared workforce location action.
- CLIENT_HANDLER: geolocation handler không đổi.
- SERVER_ACTION: existing work-location action.
- DOMAIN_COMMAND: `recordWorkOrderLocation`.
- PERMISSION: existing workforce permission/scope.
- FIX: `Đang lấy vị trí…`, `Lấy vị trí hiện tại`, `Nguồn vị trí`, `Vĩ độ`, `Kinh độ`.
- TEST: source string test và rendered P2/P3 matrix.

## 3. P1 wiring trace after remediation

`Worker/Driver UI → stable mutation intent → runErpV2OperationAction → exact Zod operation allowlist → requireIdentityUser/requireOperationsActor → ErpV2CommandService → registry permission → delivery domain state/assignment guards → transactional persistence/CAS → DeliveryQuantityChange* audit event → returned projected state/revision → applyMutationResult + background snapshot sync → Owner controls update without F5`.

Unknown operation remains rejected by schema. Cross-scope delivery entity IDs remain rejected by domain authorization. Approval does not post inventory/AR/AP until the pre-existing delivery completion workflow reaches its authorized posting transition.

## 4. Idempotency verification

| Scenario | Expected | Result |
|---|---|---|
| Double click | second click does not execute | PASS |
| Delayed response | intent remains in-flight and key stable | PASS |
| Commit then response lost | retry uses identical logical key | PASS |
| Retry after response loss | backend replays, no duplicate mutation | PASS |
| 5xx before persistence | retry remains one logical mutation | PASS |
| Validation correction | changed payload creates a new intent | PASS |
| Successful action then deliberate second action | new key and second authorized mutation | PASS |
| Same upload saved under a new storage ID | command hash still replays by content | PASS |
| Different upload content under same key | conflict remains detectable | PASS |

`MutationIntentRegistry` is scoped to the mounted application runtime and is never written to browser-global storage. Server CAS, registry permission, audit and bounded replay storage remain authoritative.

## 5. Same-method 352-control re-audit

| Classification | Before | After | Evidence |
|---|---:|---:|---|
| PASS | 273 | 352 | prior PASS controls revalidated by full regression; all 13 FAIL and 66 PARTIAL records remediated |
| FAIL | 13 | 0 | exact P1/P2/P3 paths now have executable/source evidence |
| PARTIAL | 66 | 0 | 65 retry call sites share the intent lifecycle; login control is direct and deterministic |
| BLOCKED | 0 | 0 | no button/action record lacks a trace or executable classification |

All 91 mutating registry commands retain explicit permission, idempotency metadata, audit event and transaction boundary. Re-audit applies the original precedence rule (`FAIL > PARTIAL > PASS`) and does not grant PASS merely because a control renders.

## 6. Module regression

| Module | Result | Key evidence |
|---|---|---|
| Master Data | PASS | create/edit surfaces 6/6 viewport; stable create/update intent; destructive unit confirmation |
| Sales | PASS | command/action/domain regression; stable draft/confirm/allocation intents and authoritative IDs |
| Purchase | PASS | receipt/direct-delivery state guards, attachment key replay and DocumentUnitSnapshot regression |
| Inventory | PASS | movement-derived stock, count/reversal/negative-stock controls, 6/6 rendered inventory/unit suite |
| Finance | PASS | receipt/payment/collection controls, ledger invariants, no direct balance mutation |
| Workforce | PASS | atomic claim/exactly-once compensation regression and corrected GPS controls |
| Delivery | PASS | bounded discrepancy request/review/waiver plus no-F5 rendered workflow |
| Customer Portal | PASS | scoped proof/receipt/order actions, truthful errors and stable intent keys |
| Supplier Portal | PASS | scoped response/notice actions, truthful errors and stable intent keys |
| Reporting/Audit | PASS | read-only controls and exports unchanged; audit events retained for mutations |

## 7. Executable evidence

| Check | Result | Evidence |
|---|---|---|
| Focused button/delivery/idempotency/inventory tests | PASS | 7 files, 39 tests |
| Full Vitest | PASS | 147 files, 651 tests |
| Typecheck | PASS | `tsc --noEmit` |
| Next production build | PASS | compiled/typechecked; 55 static pages generated; full route manifest |
| OpenNext/Cloudflare build | PASS | Worker bundle generated at `.open-next/worker.js` |
| Worker security scan | PASS | no forbidden Undici/Wrangler/Miniflare/OpenNext runtime dependency pattern |
| Public Playwright | PASS | 24/24 across 6 required viewports |
| Authenticated role E2E | PASS | clean rerun 54/54 across 8 roles and 6 required viewports; no retry/flaky result |
| Cross-account isolation E2E | PASS | 24/24 for Customer A/B, Supplier A/B, Worker A/B and Driver A/B |
| Button remediation rendered E2E | PASS | 7 passed; P2/P3 rendered on all 6 viewports; isolated delivery mutation run once at 1440; 5 intentional non-mutating skips |
| Inventory/unit rendered E2E | PASS | 6/6 serial across all required viewports, no overflow and Axe serious/critical = 0 |
| Master-data rendered E2E | PASS | 6/6 across all required viewports; all create/edit surfaces reachable |
| Dedicated staging DB integration | GUARDED / NOT PART OF LOCAL CONTROL COUNT | runner refused before tests because approved staging Supabase env was absent; guard was not bypassed |

Rendered viewport coverage: `1440×900`, `1366×768`, `1024×768`, `390×844`, `375×812`, `360×800`. Mobile controls are reachable; destructive confirmations and inline reason forms are keyboard-accessible; tested pages have no horizontal overflow or Axe serious/critical findings.

## 8. Final checkpoint

```text
BUTTON_ACTION_REMEDIATION
BASE_SHA=2b0c3f63828e8af07e9be9d873e0cc53675281cc

P1_DELIVERY_DISCREPANCY=PASS
P1_DELIVERY_APPROVE_REJECT=PASS
P1_RECEIPT_CONFIRMATION_WAIVER=PASS
P1_IDEMPOTENCY_RETRY=PASS

NO_DUPLICATE_MUTATION=PASS
LOST_RESPONSE_REPLAY=PASS
DOUBLE_SUBMIT_PROTECTION=PASS

TOTAL_CONTROLS=352
PASS_COUNT=352
FAIL_COUNT=0
PARTIAL_COUNT=0
BLOCKED_COUNT=0

MASTER_DATA_BUTTONS=PASS
SALES_BUTTONS=PASS
PURCHASE_BUTTONS=PASS
INVENTORY_BUTTONS=PASS
FINANCE_BUTTONS=PASS
WORKFORCE_BUTTONS=PASS
DELIVERY_BUTTONS=PASS
CUSTOMER_PORTAL_BUTTONS=PASS
SUPPLIER_PORTAL_BUTTONS=PASS
REPORTING_AUDIT_BUTTONS=PASS

BUTTON_ACTION_WIRING=PASS
RBAC_BUTTON_GATING=PASS
ASYNC_LOADING_STATES=PASS
ERROR_RETRY_STATES=PASS
MOBILE_BUTTON_ACCESSIBILITY=PASS

P0_FINDINGS=0
P1_FINDINGS=0
P2_FINDINGS=0
P3_FINDINGS=0

FULL_UNIT_TESTS=PASS
TYPECHECK=PASS
NEXT_BUILD=PASS
OPENNEXT_BUILD=PASS
WORKER_SECURITY_SCAN=PASS
PUBLIC_PLAYWRIGHT=PASS
AUTHENTICATED_E2E=PASS
BROWSER_QA=PASS

PRODUCTION_CHANGED=NO
PRODUCTION_MUTATED=NO
DEPLOYED=NO
READY_FOR_STAGING_VALIDATION=YES
FINAL_BLOCKERS=NONE
```
