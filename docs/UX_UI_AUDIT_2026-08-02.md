# Báo cáo audit UX/UI webapp VLXD Hiền Xá

Ngày audit: 2026-08-02  
Phạm vi: webapp Next.js, route công khai, route bảo vệ, component dùng chung, CSS toàn cục và CSS module  
Chế độ: read-only, không sửa giao diện, không thay đổi dữ liệu

## 1. Executive Summary

- Tổng số issue gốc: **10**.
- Critical: **1**.
- High: **3**.
- Medium: **6**.
- Route có lỗi nghiêm trọng nhất: **`/dat-hang`** vì route live hiện trả màn lỗi máy chủ.
- Component có rủi ro nhất quán cao nhất: **`OperationsApp`** vì tập trung 5.328 dòng, 23 form, 36 bảng và 46 section trong một client component.
- Vấn đề UX lớn nhất: luồng đặt hàng trên mobile dài nhưng ba bước chỉ là nhãn minh họa, chưa phải wizard thực.
- Vấn đề responsive lớn nhất: nút đổi cỡ chữ dùng `position: fixed` che nội dung ở màn 375x812.
- Vấn đề accessibility lớn nhất: chữ 12-15px, control thấp 23-44px và dòng phụ thương hiệu chỉ đạt khoảng 1.54:1.
- Đánh giá: các trang đăng nhập và cổng đặt hàng local có nền tảng semantic tốt, không có horizontal overflow ở tám breakpoint đã kiểm tra. Tuy nhiên live còn lỗi chặn tác vụ, hệ token/CSS phân mảnh và chưa có bằng chứng browser cho các màn hình sau đăng nhập.
- Kết luận: **UI Not Production Ready**.

## 2. Phương pháp và giới hạn

Đã thực hiện:

- Đọc cấu trúc route, component, `globals.css`, `elder-friendly-ui.css`, CSS module và tài liệu UX của repository.
- Khởi động production build local tại `127.0.0.1:3011` và dev app tại `127.0.0.1:3012`.
- Kiểm tra live tại `https://vlxd-hien-xa.vercel.app` ở chế độ read-only.
- Kiểm tra viewport 320, 375, 390, 768, 1024, 1280, 1440 và 1920.
- Kiểm tra keyboard focus, label, heading, touch target, contrast gần đúng, dropdown và cập nhật báo giá.
- Chụp bằng chứng mobile cho login, đặt hàng và chế độ chữ lớn.

Giới hạn:

- Không có phiên đăng nhập trong browser audit. Các module sau đăng nhập được kiểm tra cấu trúc source và redirect boundary, nhưng browser UX được đánh dấu `BLOCKED`.
- Không có token hợp lệ cho `/invite/[token]` và `/track/[token]`.
- Không thực hiện mutation, upload, gửi form, bật quyền thông báo hay GPS.
- Không chạy Lighthouse. Điểm hiệu năng và Core Web Vitals chưa được xác minh.
- Production build local fail-closed khi thiếu `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`; route công khai được kiểm tra đầy đủ bằng dev server. Live route được kiểm tra riêng.

## 3. Khảo sát hệ thống giao diện

| Hạng mục | Hiện trạng |
| --- | --- |
| Framework | Next.js 16, React, TypeScript |
| Styling | CSS toàn cục, CSS module, không có CSS framework |
| Form | React Hook Form ở màn vận hành; form HTML/React ở portal |
| Icon | Lucide React |
| Font render thực tế | Aptos, Segoe UI, sans-serif |
| Font khai báo cũ | Arial, Helvetica Neue, sans-serif trong `globals.css` |
| Theme | Light mode |
| Màu nền tảng | Token gốc thiên xanh lam, lớp elder-friendly và portal thiên xanh lá |
| Layout chính | App shell có sidebar, panel grid; auth card; portal card/grid; map |
| Shared component | OperationsApp, DisplayPreferences, PushNotificationControl, PartnerConversation, DeliveryTrackingMap, AdminOrderMonitor, portal components |
| Table | `DataTable` nội bộ trong OperationsApp và table HTML trong module riêng |
| Modal/Drawer | Không phát hiện primitive dùng chung trong OperationsApp |
| Feedback | `feedback`, `alert`, status text, `aria-live` ở một số flow |
| Responsive | Breakpoint đang phân tán từ 560 đến 1320px |

### Component inventory

| Thành phần | Hiện trạng | Ghi chú audit |
| --- | --- | --- |
| Header | Mỗi portal/module tự dựng | Chưa có shared page header |
| Sidebar/Navigation | Nằm trong `OperationsApp` | Có tablet toggle, chưa kiểm tra sau đăng nhập |
| Page title | Auth, portal và app shell dùng pattern khác nhau | Cần token cấp heading chung |
| Card/Panel | Global `.panel` cộng nhiều card riêng | Radius, shadow và padding phân tán |
| Button | Global `.button` cộng button riêng trong CSS module | Chiều cao từ 23 đến 58px |
| Input/Select | Global field cộng CSS module | Select đặt hàng chỉ cao 23px ở browser |
| Tabs | Có tab/module navigation tùy màn | Chưa có primitive shared |
| Table | 36 lần dùng `DataTable` trong OperationsApp | Có wrapper scroll nhưng browser mobile chưa xác minh |
| Alert/Error | Có feedback component style | 404/500 vẫn dùng trang mặc định tiếng Anh |
| Empty state | Có ở portal, table và map | Phần lớn có hướng dẫn, đây là điểm tốt |
| Loading | Có pending state ở form | Chưa có skeleton chung |
| Push | Fixed panel dùng chung | Source có bật, tắt, gửi thử và ẩn nhắc |
| Readability | Fixed `DisplayPreferences` | Hoạt động nhưng che nội dung mobile |
| Modal/Tooltip/Pagination | Không xác nhận primitive chung | Cần kiểm tra lại sau khi có session |

## 4. Bảng tổng hợp issue

| ID | Severity | Route | Component | Loại lỗi | Mô tả ngắn | Viewport |
| --- | --- | --- | --- | --- | --- | --- |
| UI-001 | Critical | `/dat-hang` live | Customer order page | Function/UX/Error | Route live trả `This page couldn’t load` | 1280x720 |
| UI-002 | High | Toàn bộ route | DisplayPreferences | Responsive/Accessibility | Nút đổi cỡ chữ cố định che nội dung | 375x812 |
| UI-003 | High | Login, portal login, `/dat-hang` | Form controls | Typography/Touch | Chữ 12-15px, control 23-44px | 320-390 |
| UI-004 | High | `/dat-hang` | CustomerOrderPreview | UX flow/Responsive | Flow dài 2.661-2.859px, stepper chỉ là nhãn | 320-390 |
| UI-005 | Medium | 404, 500 | Next error fallback | Content/UX | Trang lỗi tiếng Anh, không có lối quay lại | 375x812, live |
| UI-006 | Medium | Toàn hệ thống | CSS/design tokens | Consistency | Hai lớp global style chồng lấn, màu và breakpoint phân tán | All |
| UI-007 | Medium | `/` sau đăng nhập | OperationsApp | Component/Maintainability | Client component 5.328 dòng chứa hầu hết UI nghiệp vụ | Source |
| UI-008 | Medium | Recover owner, Audit, errors | Microcopy | Content | Dùng Owner, Audit, command, idempotency và chuỗi lỗi hỏng dấu | All |
| UI-009 | Medium | `/login` | Auth brand note | Accessibility/Color | `ERP vận hành` chỉ khoảng 1.54:1 | 1440x900 |
| UI-010 | Medium | App shell | Layout/Accessibility | Keyboard | Không có skip navigation tới nội dung chính | Keyboard |

## 5. Chi tiết issue

## [UI-001] Cổng đặt hàng live không tải được

- **Severity:** Critical
- **Loại:** Function / UX / Error state
- **Route:** `/dat-hang`
- **Component:** Customer order page
- **Viewport:** 1280x720 live
- **File liên quan:** `src/app/dat-hang/page.tsx`, `src/modules/operations/customer-order-catalog.ts`
- **Vị trí:** Server render của catalog công khai
- **Mô tả lỗi:** Route live hiển thị lỗi framework thay vì danh mục và báo giá.
- **Kết quả hiện tại:** H1 là `This page couldn’t load`, console ghi Server Components render error và digest `3930547011`.
- **Kết quả mong đợi:** Danh mục công khai phải tải được hoặc có error state tiếng Việt với nút thử lại/liên hệ cửa hàng.
- **Bằng chứng:** Kiểm tra trực tiếp `https://vlxd-hien-xa.vercel.app/dat-hang` ngày 2026-08-02.
- **Ảnh chụp màn hình:** Browser evidence trong phiên audit; route local dev render được, route live không render.
- **Design rule bị vi phạm:** Critical task availability, localized error recovery.
- **Đề xuất sửa:** Deploy projection legacy-safe đã kiểm tra local, xác minh Supabase data shape trên live, thêm route-level `error.tsx` tiếng Việt và smoke test live.
- **Giá trị hiện tại:** HTTP render tới generic Next error.
- **Giá trị đề xuất:** Trang đặt hàng hoạt động; fallback có hành động `Thử lại` và `Liên hệ cửa hàng`.
- **Rủi ro regression:** Dữ liệu sản phẩm cũ thiếu commercial policy, pricing snapshot hoặc field mới.

## [UI-002] Nút đổi cỡ chữ che nội dung trên mobile

- **Severity:** High
- **Loại:** Responsive / Accessibility / Overlay
- **Route:** Tất cả route có root layout
- **Component:** `DisplayPreferences`
- **Viewport:** 375x812
- **File liên quan:** `src/components/display-preferences.tsx`, `src/app/elder-friendly-ui.css`
- **Vị trí:** `.display-preferences` và `.readability-toggle`
- **Mô tả lỗi:** Control được cố định ở góc dưới bên phải và phủ lên card/form khi cuộn.
- **Kết quả hiện tại:** Chế độ chữ lớn tạo control tại x=194, y=748, w=152, h=50 trong viewport cao 812; control che metadata và nội dung card sản phẩm.
- **Kết quả mong đợi:** Control không che nội dung ở mọi cỡ chữ và tôn trọng safe area.
- **Bằng chứng:** Screenshot 375x812 ở trạng thái `Chữ lớn` và `Chữ thường`.
- **Ảnh chụp màn hình:** Browser evidence trong phiên audit.
- **Design rule bị vi phạm:** Overlay không che nội dung, accessibility control không tạo barrier mới.
- **Đề xuất sửa:** Đưa tùy chọn vào header/menu tài khoản trên mobile. Nếu vẫn fixed, dành bottom padding ít nhất 72px và dùng collision-safe container.
- **Giá trị hiện tại:** `position: fixed; right: 20px; bottom: 20px`.
- **Giá trị đề xuất:** Inline/sticky trong header hoặc fixed có reserved safe area.
- **Rủi ro regression:** Push panel và shortcut trao đổi cũng dùng fixed position, cần kiểm tra va chạm cùng lúc.

## [UI-003] Cỡ chữ và touch target thấp hơn chuẩn dự án

- **Severity:** High
- **Loại:** Typography / Accessibility / Form
- **Route:** `/login`, `/khach-hang/dang-nhap`, `/nha-cung-cap/dang-nhap`, `/dat-hang`
- **Component:** Auth forms, CustomerOrderPreview, CSS module controls
- **Viewport:** 320, 375, 390
- **File liên quan:** `src/app/globals.css`, `src/app/elder-friendly-ui.css`, `src/app/dat-hang/page.module.css`
- **Vị trí:** Label, helper, product metadata, quantity input, payment select, portal link
- **Mô tả lỗi:** Nhiều nội dung thiết yếu dùng 12-15px; input số lượng cao 44px; select thanh toán cao 23px; link cổng khách cao khoảng 25px.
- **Kết quả hiện tại:** Không đạt yêu cầu mobile tối thiểu 16px và hành động chính tối thiểu 48px trong tài liệu UX dự án.
- **Kết quả mong đợi:** Body, label, helper và control quan trọng dễ đọc/chạm trên Android phổ thông.
- **Bằng chứng:** Browser computed style và bounding box tại 320-390px.
- **Ảnh chụp màn hình:** Screenshot login và đặt hàng 375x812.
- **Design rule bị vi phạm:** Mobile font >=16px, touch target >=48px.
- **Đề xuất sửa:** Tạo token `--font-body: 16px`, `--font-label: 16px`, `--control-height: 52px`; áp dụng cho input/select/link/button. Product code có thể 14px trên desktop nhưng phải 16px ở simple mode/mobile.
- **Giá trị hiện tại:** 12, 13, 14, 14.8, 15.2px; 23, 25, 44px.
- **Giá trị đề xuất:** 16px trở lên; control 48-52px.
- **Rủi ro regression:** Card sản phẩm tăng chiều cao, cần kiểm tra lại 320px và text wrapping.

## [UI-004] Luồng đặt hàng mobile chưa phải wizard thực

- **Severity:** High
- **Loại:** UX flow / Responsive / Cognitive load
- **Route:** `/dat-hang`
- **Component:** `CustomerOrderPreview`
- **Viewport:** 320, 375, 390
- **File liên quan:** `src/components/customer-order-preview.tsx`, `src/app/dat-hang/page.module.css`
- **Vị trí:** Intro steps, catalog, quote và customer form
- **Mô tả lỗi:** Ba bước chỉ là badge tĩnh; catalog, báo giá và toàn bộ form vẫn nằm trên một trang dài.
- **Kết quả hiện tại:** Document cao 2.859px ở 320 và 2.661px ở 375/390; người dùng phải cuộn qua nhiều card trước khi hoàn thành.
- **Kết quả mong đợi:** Mỗi bước tập trung một nhiệm vụ và giữ được draft khi chuyển bước/đăng nhập.
- **Bằng chứng:** Responsive metrics tại tám breakpoint; DOM cho thấy steps là generic text, không phải tab/wizard.
- **Ảnh chụp màn hình:** Screenshot đặt hàng 375x812.
- **Design rule bị vi phạm:** Form dài chia theo bước, một màn hình tập trung một nhiệm vụ.
- **Đề xuất sửa:** Wizard thực gồm `Chọn hàng`, `Giao và thanh toán`, `Rà soát`; sticky summary chỉ xuất hiện ở bước review; lưu draft local không tài chính.
- **Giá trị hiện tại:** Một document 2.661-2.859px.
- **Giá trị đề xuất:** Mỗi bước khoảng một viewport, có progress và nút Tiếp tục/Quay lại rõ ràng.
- **Rủi ro regression:** Idempotency và server pricing không đổi; chỉ chuyển cấu trúc UI và draft state.

## [UI-005] Trang 404/500 không được địa phương hóa và không có recovery action

- **Severity:** Medium
- **Loại:** Error state / Content / UX
- **Route:** Route không tồn tại và lỗi Server Component
- **Component:** Next.js default error fallback
- **Viewport:** 375x812 và live 1280x720
- **File liên quan:** `src/app` chưa có `not-found.tsx` và `error.tsx` phù hợp
- **Vị trí:** App Router error boundary
- **Mô tả lỗi:** Người dùng thấy `This page could not be found` hoặc `This page couldn’t load`.
- **Kết quả hiện tại:** Không có nút về trang chính, thử lại hoặc liên hệ cửa hàng; font lỗi 14px.
- **Kết quả mong đợi:** Thông báo tiếng Việt, giải thích ngắn và một hành động tiếp theo rõ ràng.
- **Bằng chứng:** Local synthetic 404 và live `/dat-hang` error.
- **Ảnh chụp màn hình:** Browser evidence trong phiên audit.
- **Design rule bị vi phạm:** Error state phải rõ, có recovery, nội dung tiếng Việt dễ hiểu.
- **Đề xuất sửa:** Thêm `not-found.tsx`, `error.tsx`, route-level error state và correlation code chỉ trong phần chi tiết kỹ thuật.
- **Giá trị hiện tại:** English framework fallback.
- **Giá trị đề xuất:** `Không tìm thấy trang` / `Chưa tải được dữ liệu`, kèm `Về trang chính` hoặc `Thử lại`.
- **Rủi ro regression:** Không để error boundary hiển thị secret hoặc thông tin nội bộ.

## [UI-006] Design token và breakpoint bị phân mảnh

- **Severity:** Medium
- **Loại:** Design system / Component consistency / Spacing
- **Route:** Toàn hệ thống
- **Component:** Global CSS, elder-friendly layer và CSS module
- **Viewport:** All
- **File liên quan:** `src/app/globals.css`, `src/app/elder-friendly-ui.css`, các `*.module.css`
- **Vị trí:** Root token, button, panel, auth, sidebar, portal và media query
- **Mô tả lỗi:** `globals.css` định nghĩa accent xanh lam và Arial; lớp elder-friendly chuyển sang xanh lá và Aptos. Nhiều selector như auth, sidebar, nav, button và field được định nghĩa lại. Breakpoint trải từ 560 đến 1320px.
- **Kết quả hiện tại:** Cascade quyết định style cuối thay vì component contract; spacing dùng 13, 18, 22, 25, 26, 28, 34, 42px; radius dùng 10, 11, 12, 14, 16, 18, 20, 22, 28px và pill.
- **Kết quả mong đợi:** Một semantic token layer và breakpoint có chủ đích.
- **Bằng chứng:** Source audit `globals.css` 2.100 dòng và `elder-friendly-ui.css` hơn 2.200 dòng, cùng nhiều CSS module tự định nghĩa màu/radius/shadow.
- **Ảnh chụp màn hình:** Không áp dụng.
- **Design rule bị vi phạm:** Component cùng loại phải dùng cùng token và scale.
- **Đề xuất sửa:** Hợp nhất token trước, không rewrite UI: color semantic, spacing 4/8, radius 10/16/20, elevation 0/1/2, breakpoint 640/768/1024/1280.
- **Giá trị hiện tại:** Nhiều hard-coded value và media query rời rạc.
- **Giá trị đề xuất:** Token semantic dùng chung, module chỉ bố cục đặc thù.
- **Rủi ro regression:** Cascade hiện tại có nhiều override; cần visual regression theo route trước khi xóa rule.

## [UI-007] OperationsApp quá lớn làm tăng design drift

- **Severity:** Medium
- **Loại:** Component / Consistency / Maintainability
- **Route:** `/` sau đăng nhập
- **Component:** `OperationsApp`
- **Viewport:** Source audit; browser authenticated `BLOCKED`
- **File liên quan:** `src/components/operations-app.tsx`
- **Vị trí:** Toàn component
- **Mô tả lỗi:** Một client component chứa navigation, dashboard và phần lớn view nghiệp vụ.
- **Kết quả hiện tại:** 5.328 dòng, 23 form, 31 button JSX, 36 `DataTable`, 46 section, 42 h3.
- **Kết quả mong đợi:** Mỗi bounded context có view component riêng nhưng vẫn dùng chung primitive và command boundary hiện tại.
- **Bằng chứng:** Static source count.
- **Ảnh chụp màn hình:** Chưa có vì browser không có session.
- **Design rule bị vi phạm:** Shared primitives nhất quán, module ownership rõ ràng, giảm CSS cục bộ.
- **Đề xuất sửa:** Tách view theo module, giữ `OperationsApp` làm shell/router; tạo shared `PageHeader`, `Panel`, `FormField`, `ActionReview`, `DataTable`, `EmptyState`.
- **Giá trị hiện tại:** Một file 5.328 dòng.
- **Giá trị đề xuất:** Shell nhỏ, module view độc lập và primitive có API ổn định.
- **Rủi ro regression:** Không đổi action name, field name, audit hoặc state machine khi tách component.

## [UI-008] Microcopy còn thuật ngữ kỹ thuật và chuỗi lỗi không dấu/hỏng dấu

- **Severity:** Medium
- **Loại:** Content / Accessibility / UX
- **Route:** `/recover-owner`, Audit, error messages
- **Component:** RecoverOwnerPage, AuditView, operation error boundary
- **Viewport:** All
- **File liên quan:** `src/app/recover-owner/page.tsx`, `src/components/operations-app.tsx`, `src/server/application/operations-command-service.ts`, `src/app/layout.tsx`, `src/app/manifest.ts`
- **Vị trí:** `Owner`, `Audit`, `command`, `idempotency`, biến môi trường và metadata
- **Mô tả lỗi:** Nội dung hướng đến người vận hành nhưng dùng từ kỹ thuật hoặc tiếng Anh; một error literal có chuỗi mojibake và maintenance message không dấu.
- **Kết quả hiện tại:** Ví dụ `Khôi phục tài khoản Owner`, `mã idempotency`, `command đã xử lý`, `ERP_OWNER_RECOVERY_TOKEN`, `Thiáº¿u command nghiá»‡p vá»¥.`.
- **Kết quả mong đợi:** Ngôn ngữ đời thường; chi tiết kỹ thuật chỉ xuất hiện trong phần dành cho quản trị kỹ thuật.
- **Bằng chứng:** Source search và nội dung render của recover page.
- **Ảnh chụp màn hình:** Không bắt buộc.
- **Design rule bị vi phạm:** Tiếng Việt dễ hiểu, không trộn thuật ngữ nếu không giải thích.
- **Đề xuất sửa:** `Chủ cửa hàng`, `Nhật ký hoạt động`, `mã chống chạy trùng`, `thao tác`; sửa toàn bộ literal UTF-8 và metadata có dấu.
- **Giá trị hiện tại:** Mixed Vietnamese/English/technical copy.
- **Giá trị đề xuất:** Plain Vietnamese theo role.
- **Rủi ro regression:** Không đổi error code, action name hoặc audit event; chỉ đổi message hiển thị.

## [UI-009] Dòng thương hiệu phụ không đạt contrast

- **Severity:** Medium
- **Loại:** Accessibility / Color / Typography
- **Route:** `/login`
- **Component:** Auth brand note
- **Viewport:** 1440x900, cùng màu ở mobile
- **File liên quan:** `src/app/login/page.tsx`, `src/app/globals.css`, `src/app/elder-friendly-ui.css`
- **Vị trí:** `.auth-brand-note`
- **Mô tả lỗi:** Text `ERP vận hành` rất nhạt trên nền trắng.
- **Kết quả hiện tại:** Màu render rgb(184,216,194), 15px, contrast gần đúng 1.54:1.
- **Kết quả mong đợi:** Tối thiểu 4.5:1 cho text thường.
- **Bằng chứng:** Browser computed style và contrast calculation.
- **Ảnh chụp màn hình:** Screenshot login 375x812.
- **Design rule bị vi phạm:** WCAG AA color contrast.
- **Đề xuất sửa:** Dùng text secondary tối hơn từ semantic token, giữ phân cấp bằng weight/size thay vì giảm contrast quá mức.
- **Giá trị hiện tại:** Khoảng 1.54:1.
- **Giá trị đề xuất:** >=4.5:1.
- **Rủi ro regression:** Kiểm tra toàn bộ subtitle dùng cùng token trên nền xanh nhạt và trắng.

## [UI-010] App shell thiếu skip navigation

- **Severity:** Medium
- **Loại:** Accessibility / Keyboard navigation
- **Route:** `/` sau đăng nhập
- **Component:** RootLayout, OperationsApp shell
- **Viewport:** Keyboard
- **File liên quan:** `src/app/layout.tsx`, `src/components/operations-app.tsx`
- **Vị trí:** Trước sidebar/navigation
- **Mô tả lỗi:** Không có link bỏ qua sidebar để đi thẳng tới nội dung chính.
- **Kết quả hiện tại:** Người dùng bàn phím phải tab qua navigation lặp lại khi chuyển module/page.
- **Kết quả mong đợi:** Focus đầu trang có `Bỏ qua menu, tới nội dung chính` và target `main` ổn định.
- **Bằng chứng:** Source layout và app shell không có skip link; login focus ring hoạt động tốt.
- **Ảnh chụp màn hình:** Không áp dụng.
- **Design rule bị vi phạm:** Keyboard navigation và bypass blocks.
- **Đề xuất sửa:** Thêm skip link chỉ hiện khi focus, giữ focus-visible hiện có.
- **Giá trị hiện tại:** Không có skip link.
- **Giá trị đề xuất:** Một skip link semantic trước navigation.
- **Rủi ro regression:** Cần target ID duy nhất và không trùng giữa layout/module.

## 6. Design consistency matrix

| Thành phần | Biến thể hiện tại | Vấn đề | Chuẩn đề xuất |
| --- | --- | --- | --- |
| Font family | Arial/Helvetica và Aptos/Segoe UI | Cascade đổi font | Một token font stack có hỗ trợ tiếng Việt |
| Body/label size | 12, 13, 14, 15, 16, 17, 18px | Nhiều text dưới chuẩn mobile | 16px body/label/helper; 14px chỉ desktop metadata không thiết yếu |
| Button/control height | 23, 25, 32, 42, 44, 48, 50, 52, 54, 58px | Cùng cấp khác chiều cao | 40px compact desktop; 48px standard; 52px primary/mobile |
| Spacing | 13, 18, 22, 25, 26, 28, 34, 42px | Magic number nhiều | 4, 8, 12, 16, 24, 32, 48px |
| Card padding | 18, 20, 22, 24, 25, 26, 34, 42px | Module tự chọn | 16px mobile; 24px desktop; 32px hero/major panel |
| Border radius | 10, 11, 12, 14, 16, 18, 20, 22, 28, 999px | Không có rule rõ | 10px control; 16px card; 20px major panel; pill chỉ status |
| Shadow | Root token và nhiều shadow hard-code | Elevation không nhất quán | 0, 1, 2 semantic elevation |
| Accent | Blue token, green elder/portal, module-specific | Primary action đổi màu theo cascade | Một brand action token; status token riêng |
| Breakpoint | 560, 640, 700, 720, 760, 820, 880, 900, 920, 1080, 1100, 1180, 1320 | Khó dự đoán chuyển layout | 640, 768, 1024, 1280; ngoại lệ phải có lý do |
| Page header | Auth, portal, admin tự dựng | Hierarchy thay đổi | Shared `PageHeader` có title, description, action |
| Table | DataTable nội bộ và table module | Mobile behavior chưa thống nhất | Shared table + priority columns + scroll cue |

## 7. Responsive matrix

| Route | 320 | 375 | 390 | 768 | 1024 | 1280 | 1440 | 1920 | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/login` | Minor | Minor | Minor | Minor | Minor | Minor | Minor | Minor | Không overflow; chữ nhỏ và contrast thấp |
| `/dat-hang` local dev | Major | Major | Major | Minor | Minor | Minor | Minor | Minor | Mobile dài, control nhỏ, overlay che; desktop không overflow |
| `/dat-hang` live | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Broken | Broken | Broken | Broken | Server error trên live |
| `/khach-hang/dang-nhap` | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Minor | Minor | Chưa kiểm tra | Label nhỏ; link thấp 48px |
| `/nha-cung-cap/dang-nhap` | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Minor | Minor | Chưa kiểm tra | Label nhỏ |
| `/recover-owner` | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Minor | Minor | Chưa kiểm tra | Copy kỹ thuật, trang dài |
| `/` sau đăng nhập | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Không có session browser |
| `/admin` và monitor | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Redirect `/login` |
| Portal khách/NCC | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Thiếu session role |
| Tracking có token | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Thiếu token hợp lệ |
| 404 | Minor | Minor | Minor | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Chưa kiểm tra | Không vỡ layout nhưng English/no recovery |

## 8. Accessibility matrix

| Hạng mục | Kết quả | Issue liên quan |
| --- | --- | --- |
| Keyboard navigation | Partial | UI-010; login tab order hoạt động |
| Focus visibility | Pass trên login | Focus ring 3px và box-shadow nhìn thấy rõ |
| Color contrast | Fail | UI-009 |
| Form labels | Pass trên route công khai | Label semantic tồn tại, không dùng placeholder thay label |
| Modal focus trap | Chưa kiểm tra | Không phát hiện modal primitive; route auth bị BLOCKED |
| Semantic heading | Pass trên login/đặt hàng | H1, H2, H3 tuần tự ở `/dat-hang` |
| Touch target | Fail | UI-003 |
| Screen reader support | Partial | Có aria-label/role/status; chưa test screen reader thật |
| Error announcement | Partial | Form có role/status ở một số flow; 404/500 không localized |
| Reduced motion | Pass ở CSS layer | Có `prefers-reduced-motion` |
| Skip navigation | Fail | UI-010 |

## 9. Route coverage

| Route | Mục tiêu | Browser result |
| --- | --- | --- |
| `/login` | Nhân sự đăng nhập | PASS với issue typography/contrast |
| `/recover-owner` | Khôi phục chủ cửa hàng | PARTIAL, copy kỹ thuật |
| `/dat-hang` | Xem giá và đặt hàng | Local PARTIAL; live BROKEN |
| `/khach-hang/dang-nhap` | Khách đăng nhập | PASS với issue touch/font |
| `/nha-cung-cap/dang-nhap` | NCC đăng nhập | PASS với issue font |
| `/` | ERP theo role | BLOCKED bởi auth |
| `/admin` | Quản trị tài khoản | BLOCKED bởi auth |
| `/admin/theo-doi-don-hang` | Theo dõi đơn/map | BLOCKED bởi auth |
| `/cash/transfer-proofs` | Chứng từ chuyển khoản | BLOCKED bởi auth |
| `/delivery-tracking` | Map điều hành | BLOCKED bởi auth |
| `/giao-hang/theo-doi` | Tài xế web tracking | BLOCKED bởi auth |
| `/khach-hang` | Portal khách | Redirect đúng tới login khách |
| `/nha-cung-cap` | Portal NCC | Redirect đúng tới login NCC |
| `/trao-doi` | Chat admin/partner | BLOCKED bởi auth |
| `/invite/[token]` | Nhận lời mời | BLOCKED, không có token |
| `/track/[token]` | Public tracking | BLOCKED, không có token |
| 404 | Route không tồn tại | PARTIAL, default English |
| 500 | Server render error | BROKEN, default English |

Không có route register tự do theo chính sách invite-only; đây không phải thiếu sót UI. Không có route profile/settings độc lập được phát hiện; quản trị hiện nằm trong `/admin` hoặc module app shell.

## 10. Visual Quality Score

| Hạng mục | Điểm | Giải thích |
| --- | ---: | --- |
| Spacing | 6.5/10 | Public page thoáng, nhưng scale và padding phân tán |
| Typography | 5.5/10 | Hierarchy tốt ở hero, nhiều text dưới 16px |
| Alignment | 7.5/10 | Grid và form public thẳng hàng, không overflow |
| Visual hierarchy | 7/10 | CTA và tổng tiền rõ; flow dài làm loãng mục tiêu |
| Component consistency | 4.5/10 | Global CSS chồng lấn, module tự định nghĩa nhiều primitive |
| Responsive | 6/10 | Tám breakpoint không overflow nhưng overlay và touch target lỗi |
| Accessibility | 5.5/10 | Semantic/focus tốt; contrast, touch target và skip link chưa đạt |
| Interaction | 7/10 | Quantity, pricing và select cập nhật đúng; chưa kiểm tra auth modules |
| Content | 5.5/10 | Nhiều copy rõ, nhưng error/technical terms chưa phù hợp người lớn tuổi |
| Overall polish | 5.8/10 | Nền tảng khá nhưng chưa đủ độ tin cậy và nhất quán để production-ready |

## 11. Danh sách ưu tiên sửa

### P0 - Chặn người dùng

- UI-001: sửa và deploy cổng `/dat-hang`, thêm live smoke test.

### P1 - Cần sửa trước release

- UI-002: loại va chạm của control fixed trên mobile.
- UI-003: nâng font/touch target theo chuẩn dự án.
- UI-004: chuyển đặt hàng thành wizard thực, giữ draft.

### P2 - Cải thiện chất lượng sản phẩm

- UI-005: error/404/500 tiếng Việt có recovery.
- UI-006: hợp nhất token, spacing, radius, shadow và breakpoint.
- UI-007: tách OperationsApp theo bounded context, tạo primitive dùng chung.
- UI-008: chuẩn hóa microcopy đời thường và UTF-8.
- UI-009: sửa contrast auth subtitle.
- UI-010: thêm skip navigation.

### P3 - Polish sau khi P0-P2 đạt

- Chuẩn hóa metadata có dấu tiếng Việt.
- Thêm visual regression screenshot theo role.
- Thêm responsive table cue và review lại radius/shadow sau khi token được hợp nhất.

## 12. Release gate đề xuất

UI chỉ được nâng lên `Production Ready with Minor Fixes` khi:

- `/dat-hang` live trả nội dung thật ở desktop/mobile.
- P1 đạt ở 320, 375 và 390px.
- Có browser UAT sau đăng nhập cho Owner, kế toán, kho, điều phối, thợ, khách và NCC.
- Table, form, push, map, upload, error và empty state được chụp evidence theo role.
- Contrast và touch target không còn lỗi chặn.
- 404/500 có tiếng Việt và recovery action.

