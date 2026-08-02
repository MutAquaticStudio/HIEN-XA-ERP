# Android UAT flows

Các flow trong `uat/` chỉ mở màn hình, kiểm tra cô lập dữ liệu, GPS/push và đăng xuất. Chúng không xác nhận ghi sổ, tạo đơn, nhận việc hoặc gửi chứng từ.

## Biến môi trường bắt buộc

Mỗi vai trò dùng hai biến, không ghi mật khẩu vào repository:

- `UAT_OWNER_USERNAME`, `UAT_OWNER_PASSWORD`
- `UAT_ACCOUNTANT_USERNAME`, `UAT_ACCOUNTANT_PASSWORD`
- `UAT_WAREHOUSE_USERNAME`, `UAT_WAREHOUSE_PASSWORD`
- `UAT_DISPATCHER_USERNAME`, `UAT_DISPATCHER_PASSWORD`
- `UAT_DRIVER_USERNAME`, `UAT_DRIVER_PASSWORD`
- `UAT_WORKER_USERNAME`, `UAT_WORKER_PASSWORD`
- `UAT_CUSTOMER_USERNAME`, `UAT_CUSTOMER_PASSWORD`
- `UAT_SUPPLIER_USERNAME`, `UAT_SUPPLIER_PASSWORD`

## Chạy trên staging

Khởi động AVD `VLXD_Pixel_7`, cài APK staging rồi chạy từ repository root:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
& 'C:\Users\TUYEN\.maestro-cli-v2\bin\maestro.bat' test .maestro\uat --exclude-tags=offline
```

Flow `09-offline-read-recovery.yaml` thay đổi airplane mode của emulator và phải chạy riêng. Flow GPS chỉ bật rồi dừng trên chuyến staging `in_transit` được gán đúng tài xế. Quyền hệ thống được xử lý tùy chọn bằng tiếng Việt hoặc tiếng Anh.
