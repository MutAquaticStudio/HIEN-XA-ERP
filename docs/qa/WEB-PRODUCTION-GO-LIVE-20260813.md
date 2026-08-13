# Web Production Go-Live 2026-08-13

## Phạm vi

- Web/backend/Cloudflare/QA cho phiên bản `0.1.1`.
- Android không thuộc đợt phát hành này.
- Không migration schema production và không tạo fixture hoặc chứng từ thử trên production.

## Release candidate

| Bằng chứng | Giá trị |
| --- | --- |
| `WEB_RC_SHA` | Chờ gate |
| Cloudflare Build ID | Chờ gate |
| Staging Worker version | Chờ gate |
| Production Worker trước cutover | Lưu riêng tư, không ghi vào Git trước cutover |
| Production candidate version | Chờ gate |

## Gate staging

| Gate | Trạng thái | Bằng chứng |
| --- | --- | --- |
| Typecheck | PENDING | Raw log ngoài Git |
| Vitest tối thiểu 509/509 | PENDING | Raw log ngoài Git |
| Next/OpenNext build | PENDING | Cloudflare Linux build |
| Runtime dependency audit | PENDING | Raw log ngoài Git |
| D1 CAS và reconciliation | PENDING | Raw log ngoài Git |
| R2 private round-trip | PENDING | Raw log ngoài Git |
| Queue enqueue only | PENDING | Raw log ngoài Git |
| Public Playwright/axe | PENDING | Raw log ngoài Git |
| 8 vai trò tại 390/768/1440 | PENDING | Raw log ngoài Git |
| IDOR A/B | PENDING | Raw log ngoài Git |
| Security headers | PENDING | Raw log ngoài Git |

## Ba lỗi UAT

| Mã | Mức độ | Trạng thái | Điều kiện đóng |
| --- | --- | --- | --- |
| `UAT-20260813-001` | P1 | OPEN | Integration và fixture staging trả `200`; D1/R2/Queue/CAS đạt, reconciliation `0` |
| `UAT-20260813-002` | P1 | OPEN | Production candidate trả HSTS chính xác cùng CSP, nosniff, referrer và cache policy |
| `UAT-20260813-003` | P2 | OPEN | Visual `/login` và `/dat-hang` ổn định, không diff chưa giải thích |

## Cutover và rollback

- Candidate được upload bằng Workers Versions, không tự cấp traffic.
- Smoke candidate bằng version override khi deployment là `old=100%, candidate=0%`.
- Chỉ chuyển candidate lên `100%` nếu toàn bộ smoke đạt.
- Rollback chỉ đưa Worker version trước cutover về `100%`; không tự restore D1.
- D1 Time Travel bookmark và telemetry thô được lưu riêng tư ngoài Git.

## Xác nhận bắt buộc

- Docker build dependency: `0`.
- Docker runtime dependency: `0`.
- Docker deployment dependency: `0`.
- Production schema mutation: `NONE`.
- Production fixture/synthetic business data: `NONE`.
- `WEB_RELEASE`: `BLOCKED` cho đến khi mọi P0/P1 bằng `0`.
- `WEB_GO_LIVE`: `NOT PERFORMED` cho đến khi staging và production preflight đạt.
