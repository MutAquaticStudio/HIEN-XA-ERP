# Production-ready UX V2 - Trạng thái triển khai

## Phạm vi đã hoàn thành

- Thiết lập font Be Vietnam Pro cục bộ cho web và Expo.
- Bổ sung design tokens xanh lam/slate, focus rõ, control tối thiểu 48px và responsive shell.
- Bổ sung các primitive giao diện dùng chung cho web và mobile.
- Bổ sung loading, not-found và error state tiếng Việt cho app shell và trang đặt hàng.
- Chuyển trang đặt hàng thành wizard ba bước; giỏ hàng chỉ lưu số lượng không nhạy cảm và server vẫn tính lại giá khi gửi.
- Đưa cỡ chữ và push notification vào khu vực tài khoản, loại bỏ fixed overlay.
- Chuẩn hóa nền tảng điều hướng và typography theo vai trò trên Android native.
- Bổ sung Playwright, axe, screenshot regression và smoke test đăng nhập theo cấu hình UAT.

## Bằng chứng kiểm tra hiện có

- Root TypeScript, mobile TypeScript, root unit test và mobile unit test đạt.
- Web production build, Expo Doctor và Android export đạt.
- Playwright public UX đạt tại 320, 375, 390, 768, 1024, 1280, 1440 và 1920 px.
- APK local release đã tạo để kiểm tra cài đặt nội bộ.

## Cổng phát hành còn chặn

- Chưa có Supabase staging riêng và fixture UAT đã xác nhận để chạy integration, RLS và mutation test.
- Authenticated Playwright bị bỏ qua khi chưa có tài khoản UAT staging.
- Chưa chạy Maestro, emulator/máy Android thật và UAT GPS/push/upload.
- Việc tách toàn bộ `OperationsApp` theo bounded context và migrate từng module sang primitive V2 chưa hoàn tất.
- Android mới hoàn thiện design foundation; chưa thể tuyên bố toàn bộ màn theo vai trò đạt UAT production.

## Quyết định phát hành

Không promote production, không tăng Expo lên `1.1.0` và không tạo EAS Internal mới cho đến khi staging integration, authenticated UAT, Maestro và UAT máy thật đều đạt. APK `1.0.3` tiếp tục là bản rollback.
