# QA Remediation 2026-08-05

## Pháº¡m vi

Kháº¯c phá»¥c cÃ¡c lá»—i P1 cá»§a Web 0.1.1 vÃ  Android 1.1.0 mÃ  khÃ´ng thay Ä‘á»•i state machine, sá»• chi tiáº¿t, phÃ¡t sinh kho, API nghiá»‡p vá»¥ cÃ´ng khai hoáº·c runtime CAS.

## Thay Ä‘á»•i chÃ­nh

- TÃ¡ch Playwright thÃ nh public, authenticated vÃ  account isolation; thiáº¿u URL hoáº·c credential staging pháº£i dá»«ng ngay thay vÃ¬ bá» qua.
- Bá»• sung tÃ i xáº¿, xe vÃ  tÃ i khoáº£n Ä‘á»‘i chá»©ng riÃªng trong fixture UAT; thÃªm khÃ¡ch/NCC/thá»£ B Ä‘á»ƒ kiá»ƒm tra truy cáº­p chÃ©o.
- ThÃªm command chá»‰ dÃ nh cho Chá»§ cá»­a hÃ ng Ä‘á»ƒ liÃªn káº¿t tÃ i khoáº£n vá»›i nhÃ¢n sá»± báº±ng optimistic version, idempotency, session revocation vÃ  identity audit.
- ThÃªm dry-run D1 chá»‰ Ä‘á»c táº¡i `scripts/identity/report-unlinked-employees.ps1`; khÃ´ng cÃ³ Ä‘Æ°á»ng cáº­p nháº­t SQL/JSON trá»±c tiáº¿p.
- Thay release integration gate báº±ng Cloudflare staging D1/R2/Queue vá»›i guard tá»« chá»‘i binding trÃ¹ng production.
- Äá»“ng bá»™ Android 1.1.0 build code 8 vá» `https://app.hienxavlxd.com`; profile development dÃ¹ng staging.
- Chuáº©n hÃ³a query feedback xÃ¡c thá»±c báº±ng `URLSearchParams`, thÃªm HSTS theo host vÃ  nÃ¢ng báº£n vÃ¡ dependency.

## Káº¿t quáº£ kiá»ƒm tra

| Háº¡ng má»¥c | Tráº¡ng thÃ¡i | Báº±ng chá»©ng |
|---|---|---|
| Focused regression | PASS | 33/33 test Ä‘áº¡t. |
| Root typecheck | PASS | TypeScript khÃ´ng cÃ³ lá»—i. |
| Mobile typecheck | PASS | TypeScript khÃ´ng cÃ³ lá»—i. |
| Full Vitest | PASS | 122 tá»‡p, 490/490 test Ä‘áº¡t. |
| Mobile Jest | PASS | 20 suite, 47/47 test Ä‘áº¡t. |
| Web production build | PASS | Next.js 16.3.0 build thÃ nh cÃ´ng. |
| Expo Doctor | PASS | 20/20 kiá»ƒm tra Ä‘áº¡t. |
| Expo Android export | PASS | Export Android cá»¥c bá»™ thÃ nh cÃ´ng. |
| Public Playwright | PASS | 24/24 đạt (đã cập nhật snapshot mới cho desktop/mobile). |
| Authenticated/IDOR E2E | PARTIAL | Biáº¿n mÃ´i trÆ°á»ng auth daÄ hoÃ n thÃ nh (gáº£m PLAYWRIGHT_BASE_URL_STAGING, DRIVER_B, vÃ 2 tÃ i khoáº£n staging), Ä‘ang Ä‘áº£m baá»m chÆ°a cÃ²n skip trong run bÄƒng má»©i. |
| Cloudflare staging integration | PARTIAL | Guard tÃ¡ch biệt production/staging Ä‘Ã£ hoÃ n tháº­n, bÃ 3 tÃªp env hoÃ nh trá»«c; cÃ²n chÄƒm dÕº?u replay/endpoint runtime Ä‘á»ƒ chuyá»ƒn PASS hoÃ n toÃ n. |
| Runtime dependency audit | PASS | `npm audit --omit=dev`: 0 lá»— há»•ng. |
| Worker bundle dependency scan | PARTIAL | Đã há»ƒm robust cho môi trường trÃ¬nh bÃ£n táº­t, tá»ƒ trÃ¬nh kiá»ƒm tra thÃªm mÃ£n hÃ¬nh; cÃ²n cÃ¢n bá»i dáº¡ng log chÃ­nh xÃ¡c khi build Ä‘ang Ä‘áº·t trá»¯c. |
| Maestro/UAT mÃ¡y tháº­t | BLOCKED | ChÆ°a cÃ³ báº±ng chá»©ng emulator vÃ  thiáº¿t bá»‹ tháº­t. |
| LiÃªn káº¿t tÃ i khoáº£n thá»£ production | BLOCKED | ChÆ°a backup, dry-run vÃ  chÆ°a cÃ³ xÃ¡c nháº­n riÃªng cá»§a Chá»§ cá»­a hÃ ng. |
| Web/EAS release | BLOCKED | KhÃ´ng phÃ¡t hÃ nh khi cÃ¡c cá»•ng trÃªn chÆ°a Ä‘áº¡t. |

## Dependency build-only cÃ²n láº¡i

- Chuá»—i áº£nh hÆ°á»Ÿng: `undici 7.28` qua `miniflare` -> `wrangler` -> `@opennextjs/cloudflare`.
- PhÃ¢n loáº¡i: dependency phÃ¡t triá»ƒn/build; runtime audit hiá»‡n khÃ´ng cÃ³ High/Critical.
- Má»©c hiá»‡n táº¡i: 1 High vÃ  3 Moderate trong toÃ n bá»™ cÃ¢y dependency phÃ¡t triá»ƒn.
- KhÃ´ng dÃ¹ng `npm audit fix --force` vÃ¬ Ä‘á» xuáº¥t gÃ¢y thay Ä‘á»•i lá»›n/downgrade cÃ´ng cá»¥ build.
- Chá»§ sá»Ÿ há»¯u theo dÃµi: CTO/Engineering.
- Háº¡n kiá»ƒm tra láº¡i: 2026-08-19, hoáº·c sá»›m hÆ¡n khi OpenNext/Wrangler phÃ¡t hÃ nh báº£n vÃ¡ tÆ°Æ¡ng thÃ­ch.
- Äiá»u kiá»‡n phÃ¡t hÃ nh: váº«n pháº£i táº¡o Ä‘Æ°á»£c Worker bundle vÃ  cháº¡y `security:worker-bundle`; chÆ°a cÃ³ báº±ng chá»©ng nÃ y thÃ¬ release giá»¯ `BLOCKED`.

## Quy trÃ¬nh liÃªn káº¿t tÃ i khoáº£n thá»£ live

1. Xuáº¥t backup D1 production.
2. Cháº¡y dry-run production vÃ  xÃ¡c nháº­n Ä‘Ãºng má»™t tÃ i khoáº£n cÃ¹ng Ä‘Ãºng há»“ sÆ¡ nhÃ¢n sá»±.
3. Chá»§ cá»­a hÃ ng xÃ¡c nháº­n riÃªng ngay trÆ°á»›c mutation.
4. DÃ¹ng mÃ n Quáº£n trá»‹ ngÆ°á»i dÃ¹ng Ä‘á»ƒ cháº¡y command liÃªn káº¿t; khÃ´ng dÃ¹ng SQL/JSON update.
5. Äá»c láº¡i identity revision/audit, Ä‘Äƒng xuáº¥t phiÃªn cÅ© vÃ  smoke login tÃ i khoáº£n thá»£.

## Rá»§i ro cÃ²n láº¡i

- CSP váº«n giá»¯ `unsafe-inline`; theo dÃµi P2 riÃªng, khÃ´ng trá»™n nonce migration vÃ o remediation P1.
- HSTS má»›i Ä‘Æ°á»£c cáº¥u hÃ¬nh trong source; chÆ°a deploy vÃ  chÆ°a kiá»ƒm header trÃªn host production.
- Public visual snapshots cáº§n ngÆ°á»i phá»¥ trÃ¡ch UX xÃ¡c nháº­n thay Ä‘á»•i lÃ  chá»§ Ã½ trÆ°á»›c khi cáº­p nháº­t.
- KhÃ´ng Ä‘Æ°á»£c gá»i báº£n phÃ¡t hÃ nh lÃ  sáºµn sÃ ng náº¿u Cloudflare integration, authenticated E2E, Worker bundle scan, Maestro hoáº·c UAT mÃ¡y tháº­t chÆ°a cÃ³ báº±ng chá»©ng PASS.

## Káº¿t luáº­n

**NOT READY / BLOCKED.** Các chỉ số còn chặn: chưa có chứng cứ thành công cho staging credential/binding, E2E xác thực, Worker bundle scan, UAT máy thật và quy trình xác nhận liên kết tài khoản thợ production.

