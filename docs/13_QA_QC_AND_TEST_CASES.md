# 13. QA/QC va Test Case Tong The

**Ngay cap nhat:** 2026-07-22  
**Pham vi:** Web Operations, API, workflow nghiep vu, PWA, Expo mobile Android/iOS, live GPS tracking va Supabase migration.  
**Muc dich:** Day la ke hoach QA/QC va danh sach test case dung de regression, SIT va UAT. Khong duoc dung bang nay de bo qua business rule, phan quyen, audit, idempotency hoac kiem thu du lieu tai chinh.

## 1. Trang thai bang chung hien tai

| Hang muc | Ket qua da xac nhan | Ghi chu QA |
| --- | --- | --- |
| Root automated suite | `170/170` test qua, `27/27` test files | Da bao gom worker claiming va Admin live tracking. |
| Root TypeScript | Dat `tsc --noEmit` | Kiem tra source web/backend. |
| Root production build | Dat `next build` | API mobile, API public tracking va trang ban do duoc compile. |
| Mobile TypeScript | Dat `tsc --noEmit` | Kiem tra Expo source. |
| iOS JavaScript bundle | Dat `expo export --platform ios` | Khong thay the UAT tren thiet bi iOS that. |
| Mobile automated test | Chua co | Script hien tai dung voi `Error: no test specified`; la gap phai xu ly. |
| Android native rebuild | Chua xac nhan lai | Gradle bi timeout sau 5 phut; APK debug build thanh cong truoc do van ton tai. |
| Supabase tracking migration | Chua xac nhan deploy | Can chay va doi chieu tren project Supabase that truoc go-live. |

## 2. Quy uoc thuc thi

| Ky hieu | Nghia |
| --- | --- |
| `AUTO` | Da co test tu dong trong repository; phai chay trong CI/regression. |
| `MANUAL` | QA/UAT thao tac tren web, mobile, emulator hoac thiet bi that. |
| `GAP` | Chua co test tu dong hoac chua duoc xac nhan; la hang muc can bo sung. |
| `P0` | Chay va block phat hanh: mat du lieu, sai so tien, sai phan quyen, hai nguoi nhan mot don. |
| `P1` | Phai xong truoc go-live: workflow bi chan, GPS/sync khong dung, audit thieu. |
| `P2` | Can sua som: UX, hieu nang, thong bao hoac bao cao sai nhung co workaround. |

### Moi truong va du lieu kiem thu

- Web: Chrome va Edge ban gan nhat, viewport desktop `1440x900` va mobile `390x844`.
- Mobile: Android emulator Pixel 7 API 35, mot Android may that tam trung, iPhone iOS ban ho tro gan nhat.
- Tai khoan: Owner, Administrator, Dispatcher, Supervisor, Sales, Procurement, Warehouse, Cashier, Worker, Driver va Customer public link.
- Du lieu mau: it nhat 2 khach, 2 nha cung cap, 3 san pham co don vi/quy doi, 2 kho, 2 tho/tai xe, 3 don giao, 1 phieu thu va 1 phieu chi.
- Du lieu canh tranh: 2 tho du dieu kien nhan cung mot don; 2 request cung idempotency key; 2 tab cung sua mot chung tu.
- GPS: hai diem hop le tai Viet Nam, mot diem trung `clientPointId`, mot diem sai vi do/kinh do va mot diem thoi gian tuong lai.
- Du lieu tai chinh: don chua thanh toan, thanh toan mot phan, thanh toan nhieu lan, cap phat qua so tien va chung tu da xac nhan.

### Quy trinh QC cho moi test case

1. Ghi lai `Test ID`, build/version, tai khoan, du lieu mau va moi truong.
2. Thuc hien dung tien dieu kien va thao tac trong bang.
3. Doi chieu UI, API response, du lieu persistence, event/audit va man hinh theo vai tro lien quan.
4. Danh dau `Pass`, `Fail`, `Blocked` hoac `Not run`; dinh kem screenshot/log khi Fail.
5. Tao defect voi severity, buoc tai hien, ket qua mong doi/thuc te va du lieu da dung.

## 3. Test case nen tang, identity va phan quyen

| ID | Dieu kien va thao tac | Ket qua mong doi | Loai |
| --- | --- | --- | --- |
| COM-01 | Mo trang khi chua dang nhap. | Chuyen den dang nhap, khong lo du lieu van hanh. | MANUAL |
| COM-02 | Dang nhap bang tai khoan hop le. | Tao session; vao dung dashboard theo vai tro. | AUTO + MANUAL |
| COM-03 | Dang nhap sai mat khau lien tiep. | Bao loi ro rang, ap dung khoa/tang cuong bao ve theo policy. | AUTO |
| COM-04 | Dat lai mat khau cua tho, thu dung mat khau cu. | Session/mat khau cu khong con dung; mat khau moi dang nhap duoc. | AUTO |
| COM-05 | Tao user trung username/email. | Tu choi, khong tao ban ghi trung. | AUTO |
| COM-06 | Dung session het han hoac da bi thu hoi. | API va web tu choi; yeu cau dang nhap lai. | AUTO + MANUAL |
| COM-07 | Dung token Web Bridge qua han hoac sai session version. | Tu choi bridge, khong tao browser session. | AUTO |
| AUTH-01 | Owner tao tai khoan tho quan ly. | Username duy nhat, role/module scope dung, password khong luu plaintext. | AUTO |
| AUTH-02 | Administrator cap role/module scope cho user. | Chi module duoc cap xuat hien va API cung enforce scope. | AUTO + MANUAL |
| AUTH-03 | Worker go truc tiep URL Admin. | Khong xem du lieu/quyen quan tri cua nguoi khac. | MANUAL |
| AUTH-04 | Sales goi command procurement hoac cash. | Server tra loi phan quyen; khong tao chung tu. | AUTO |
| AUTH-05 | Dispatcher co `delivery.*` mo ban do tracking. | Xem tat ca chuyen dang chia se. | AUTO + MANUAL |
| AUTH-06 | Driver mo tracking overview. | Chi thay chuyen duoc phan cong. | AUTO + MANUAL |
| AUTH-07 | Customer mo link tracking cong khai. | Chi thay thong tin han che cua dung chuyen, khong thay danh tinh day du cua tai xe. | AUTO + MANUAL |
| AUTH-08 | Customer thu sua API hoac doi token link. | Khong co quyen ghi GPS, dung hoac xem chuyen khac. | MANUAL |
| AUTH-09 | Kiem tra tim kiem khong dau voi ten khach/san pham/tho. | Tim duoc ket qua co dau va khong dau. | MANUAL |
| AUTH-10 | Mo bang UI bang man hinh mobile. | Chu toi thieu 16px, nut quan trong toi thieu 48px, trang thai co chu. | MANUAL |

## 4. Test case danh sach cho nhan don va workflow don hang

| ID | Dieu kien va thao tac | Ket qua mong doi | Loai |
| --- | --- | --- | --- |
| ORD-01 | Tao don ban hop le co day du du lieu bat buoc. | Don duoc tao, co pricing snapshot va audit. | AUTO |
| ORD-02 | Tao don thieu khach, hang hoa hoac so luong khong hop le. | Validation tu choi, khong co don nua tao mot phan. | AUTO |
| ORD-03 | Gui lai cung request/idempotency key tao don. | Tra lai ket qua cu, khong tao don hay phat sinh trung. | AUTO |
| ORD-04 | Tao don hop le can giao/thi cong. | Tao dung mot viec cho nhan don va thong bao cho tho du dieu kien. | AUTO |
| ORD-05 | Tho du dieu kien mo danh sach cho nhan. | Chi thay don da san sang va duoc phep nhan. | AUTO + MANUAL |
| ORD-06 | Tho khong du role, inactive hoac khong du scope nhan don. | Tu choi phia server; UI khong hien nut nhan kha dung. | AUTO |
| ORD-07 | Tho A nhan don hop le. | Don chuyen trang thai dung, luu worker ID va thoi gian nhan. | AUTO |
| ORD-08 | Tho A va B dong thoi nhan mot don. | Dung mot request thanh cong; request con lai nhan `ORDER_ALREADY_CLAIMED` hoac ma quy uoc tuong duong. | AUTO |
| ORD-09 | Gui lai cung request nhan don cua tho thang. | Khong tao assignment, history hay audit trung. | AUTO |
| ORD-10 | Tho B reload queue sau khi A nhan. | Don bien mat khoi queue cua B. | AUTO + MANUAL |
| ORD-11 | Thu nhan lai don da co nguoi. | Loi nghiep vu ro rang va audit claim that bai duoc ghi. | AUTO |
| ORD-12 | Kiem tra event khi don vao queue va khi claim thanh cong. | Event/audit co actor, timestamp, document va outcome dung. | AUTO |
| ORD-13 | Cap nhat trang thai don khong theo state machine. | Server tu choi; khong co state/history khong hop le. | AUTO |
| ORD-14 | Hai nguoi cung sua chung tu versioned. | Optimistic locking canh bao xung dot, khong ghi de am tham. | AUTO + MANUAL |

## 5. Test case catalog, don vi, gia va doi tac

| ID | Dieu kien va thao tac | Ket qua mong doi | Loai |
| --- | --- | --- | --- |
| CAT-01 | Tao san pham co don vi co so va don vi mua mac dinh. | Luu dung don vi, he so quy doi va validation. | AUTO |
| CAT-02 | Doi san pham cua dong mua hang. | Don vi/he so tu dong dong bo theo san pham moi. | AUTO |
| CAT-03 | Sua don vi/he so tren dong da co san pham. | Chi chap nhan gia tri hop le, khong lam sai so luong quy doi. | AUTO |
| CAT-04 | Tao bang gia va lap don. | Don luu pricing snapshot tai thoi diem tao. | AUTO |
| CAT-05 | Doi bang gia sau khi don da xac nhan. | Don lich su khong doi gia am tham. | AUTO |
| CAT-06 | Nhap gia am, so luong 0 hoac he so 0. | Validation tu choi. | AUTO |
| CAT-07 | Tao khach/nha cung cap trung thong tin dinh danh. | Canh bao/tranh trung theo rule hien hanh, khong gay data split. | MANUAL |
| CAT-08 | Tim kiem san pham/doi tac khong dau. | Ket qua dung, phan biet du lieu inactive neu co. | MANUAL |
| CAT-09 | Dung san pham inactive tren chung tu moi. | Khong cho chon hoac canh bao ro rang theo state machine. | MANUAL |
| CAT-10 | Mo chung tu cu co san pham da inactive. | Van xem duoc snapshot lich su. | MANUAL |

## 6. Test case mua hang, nhap kho va giao thang

| ID | Dieu kien va thao tac | Ket qua mong doi | Loai |
| --- | --- | --- | --- |
| PRO-01 | Tao yeu cau/lenh mua hop le. | Luu snapshot gia, doi tac va audit. | AUTO |
| PRO-02 | Tao phieu nhap kho tu don mua. | Phat sinh inventory movement append-only co source document va idempotency key. | AUTO |
| PRO-03 | Gui lai request post phieu nhap. | Khong co movement trung. | AUTO |
| PRO-04 | Mua giao thang khach. | Khong tao nhap/xuat ton tai kho cua cua hang. | AUTO |
| PRO-05 | Thu nhap kho so luong am, vuot phep hoac sai don vi. | Tu choi va khong cap nhat ton. | AUTO |
| PRO-06 | Thu sua chung tu mua da post. | Khong sua truc tiep; chi cho reversal/adjustment theo quyen. | MANUAL |
| PRO-07 | Huy/reverse chung tu da post. | Tao but to dao co audit, ton va gia von nhat quan. | MANUAL |
| PRO-08 | Mo module procurement bang role khong du quyen. | Server va UI deu chan thao tac. | AUTO + MANUAL |

## 7. Test case kho, ton va gia von

| ID | Dieu kien va thao tac | Ket qua mong doi | Loai |
| --- | --- | --- | --- |
| INV-01 | Post nhap kho hop le. | So du ton tinh tu movement; khong sua truc tiep stock balance. | AUTO |
| INV-02 | Post xuat kho giao khach. | Tao movement day du source document, so luong va idempotency key. | AUTO |
| INV-03 | Thu post lai cung movement. | Khong tang/giam ton lan hai. | AUTO |
| INV-04 | Thu xuat vuot ton theo rule MVP. | Server tu choi hoac xu ly dung policy da cong bo; khong am ton im lang. | MANUAL |
| INV-05 | Thu sua movement da post. | Khong cho sua truc tiep. | AUTO + MANUAL |
| INV-06 | Reverse movement. | So du ton va audit phan anh dung reversal. | MANUAL |
| INV-07 | Nhap hang moi gia, tinh weighted average. | Gia von binh quan di dong dung theo cong thuc. | AUTO |
| INV-08 | Hang giao thang. | Gia von dung gia mua/landed cost, khong chen vao weighted average kho. | AUTO |
| INV-09 | Doi chieu stock projection voi ledger. | Tong movement khop ton hien thi. | AUTO + MANUAL |

## 8. Test case giao hang, bang dieu phoi va GPS live tracking

| ID | Dieu kien va thao tac | Ket qua mong doi | Loai |
| --- | --- | --- | --- |
| DEL-01 | Dispatcher phan cong tai xe/tho cho chuyen giao. | Job co driver/helper dung, lich su va phan quyen cap nhat. | AUTO + MANUAL |
| DEL-02 | Tai xe chua duoc phan cong bat dau GPS. | Server tu choi, khong tao session. | AUTO |
| DEL-03 | Tai xe duoc phan cong bat dau GPS khi job `in_transit`. | Tao mot active session, public token hash, audit `tracking_started` va `tracking_share_created`. | AUTO |
| DEL-04 | Bat dau GPS khi job chua xuat ben/da ket thuc. | Tu choi ro rang, khong tao session. | MANUAL |
| DEL-05 | Bat dau GPS lan hai cho cung job dang active. | Khong tao session trung; renew link theo rule. | AUTO |
| DEL-06 | Gui mot diem GPS hop le. | Luu latest point, route point, receivedAt va cac truong accuracy/heading/speed hop le. | AUTO |
| DEL-07 | Gui lai cung `clientPointId`. | Idempotent, route chi co mot diem. | AUTO |
| DEL-08 | Gui diem GPS sai latitude, longitude, accuracy, speed hoac thoi gian tuong lai. | Validation tu choi, khong luu diem. | MANUAL |
| DEL-09 | Nguoi khac gui diem vao session cua tai xe. | Tu choi phan quyen. | AUTO |
| DEL-10 | Admin/Dispatcher mo [`/delivery-tracking`](/D:/Project%20Hien%20Xa/src/app/delivery-tracking/page.tsx). | Xem moi chuyen active, ten thợ/tai xe, marker va route GPS. | AUTO + MANUAL |
| DEL-11 | Dung Web Bridge tu mobile cho Admin. | Browser session duoc tao an toan va mo dung panel tracking. | AUTO + MANUAL |
| DEL-12 | Cho map Admin 10 giay sau khi co diem moi. | Marker/route duoc refresh, khong can reload trang. | MANUAL |
| DEL-13 | Khach mo link `/track/{token}`. | Chi xem ten chuyen/route da han che, khong thay full driver identity. | AUTO + MANUAL |
| DEL-14 | Thu dung token sai, token qua han hoac token cua chuyen khac. | Tra 404/loi an toan, khong ro ri hanh trinh. | GAP |
| DEL-15 | Tai xe dung chia se vi tri. | Session chuyen `stopped`, GPS nen dung, ghi `tracking_stopped`, public sharing theo lifetime quy dinh. | AUTO + MANUAL |
| DEL-16 | GPS nen khi app foreground, background, mat mang va co mang lai. | Co xin quyen dung, queue offline, gui lai idempotent, co thong bao trang thai. | MANUAL |
| DEL-17 | Hoan tat giao hang co anh/bang chung neu bat buoc. | Khong hoan tat neu thieu bang chung; anh luu dung va co audit. | AUTO + MANUAL |
| DEL-18 | Kiểm tra dong y chia se vi tri va nut dung. | Khong gui toa do truoc consent; dung chuyen thi ngung gui ngay. | MANUAL |

## 9. Test case cong no, thu chi va phan bo thanh toan

| ID | Dieu kien va thao tac | Ket qua mong doi | Loai |
| --- | --- | --- | --- |
| FIN-01 | Tao don ban chua thanh toan. | Cong no duoc tinh tu sub-ledger, khong phai o so co the sua. | AUTO |
| FIN-02 | Tao phieu thu hop le. | Co journal/audit, trang thai dung va khong sua truc tiep sau xac nhan. | AUTO |
| FIN-03 | Phan bo mot phieu thu cho nhieu don. | Tong phan bo dung bang/nhon hon so tien phieu theo rule. | AUTO |
| FIN-04 | Phan bo nhieu phieu thu cho mot don. | Cong no con lai tinh dung. | AUTO |
| FIN-05 | Thu phan bo vuot gia tri phieu hoac vuot cong no don. | Validation tu choi; khong tao allocation mot phan. | AUTO |
| FIN-06 | Thu sua so tien phieu thu da xac nhan. | Khong cho sua truc tiep. | AUTO |
| FIN-07 | Reverse/adjust phieu thu sai. | Tao reversal/adjustment co audit, so du phuc hoi dung. | MANUAL |
| FIN-08 | Tao phieu chi nha cung cap. | Payable ledger, audit va state machine dung. | AUTO |
| FIN-09 | Phan bo phieu chi cho nhieu chung tu mua. | Tong phan bo khong vuot phieu va so du phai tra dung. | AUTO |
| FIN-10 | Mo cong no khach/nha cung cap sau nhieu phat sinh. | So du bang tong sub-ledger, co drill-down chung tu. | AUTO + MANUAL |
| FIN-11 | Hai request xac nhan/phat hanh cung luc. | Idempotency/optimistic locking tranh but toan trung. | AUTO |
| FIN-12 | Role khong phai cashier thu post phieu thu/chi. | Server tu choi va co thong diep ro rang. | MANUAL |
| FIN-13 | Kiem tra so tien, so luong va hau qua truoc confirm. | UI hien thi gia tri quan trong va canh bao truoc hanh dong. | MANUAL |
| FIN-14 | Kiem tra audit cua confirm, reverse, override. | Co actor, thoi gian, ly do, reference document va ket qua. | AUTO + MANUAL |
| FIN-15 | Thu hard delete chung tu da confirm. | Bi chan; chi co reversal theo workflow. | MANUAL |
| FIN-16 | Export/bao cao cong no sau reversal. | Khong tinh trung, du lieu lich su van truy vet duoc. | MANUAL |

## 10. Test case nhan cong, san luong, tam ung va phe duyet

| ID | Dieu kien va thao tac | Ket qua mong doi | Loai |
| --- | --- | --- | --- |
| WOR-01 | Tao task/san luong cho tho. | Gan dung don/nhom/tho va theo state machine. | AUTO |
| WOR-02 | Duyet san luong hop le. | Tao co so tinh cong dung mot lan. | AUTO |
| WOR-03 | Thu duyet lai cung output. | Khong tinh cong trung. | AUTO |
| WOR-04 | Attendance khong co output duoc duyet. | Khong tu dong phat sinh tien cong. | AUTO |
| WOR-05 | Chia tien cong cho nhieu thanh vien. | Tong chia bang tong tien cong phieu. | AUTO |
| WOR-06 | Thu chia tong lon hon/nho hon tien cong. | Validation tu choi. | AUTO |
| WOR-07 | Sua bang gia cong moi sau phieu da duyet. | Khong anh huong nguoc phieu lich su. | AUTO |
| WOR-08 | Tao tam ung cho nhan vien. | Co ledger/audit va quy trinh thanh toan dung. | MANUAL |
| WOR-09 | Bu tru tam ung vao thanh toan. | So du tam ung va net payment dung. | MANUAL |
| WOR-10 | Approver khong du quyen duyet task/output. | Tu choi phia server. | AUTO |
| WOR-11 | Tu choi/yeu cau lam lai. | Luu ly do, lich su trang thai va thong bao dung. | AUTO + MANUAL |

## 11. Test case bao cao, import, attachment va projection

| ID | Dieu kien va thao tac | Ket qua mong doi | Loai |
| --- | --- | --- | --- |
| REP-01 | Mo bao cao thang co du lieu ban/mua/thu/chi. | Tong hop dung, khop ledger/projection nguon. | AUTO |
| REP-02 | Loc bao cao theo khoang ngay, kho va doi tac. | Ket qua dung filter, khong ro du lieu ngoai scope. | MANUAL |
| REP-03 | Bao cao khong co du lieu. | Empty state ro rang, khong hien so 0 gay hieu nham. | MANUAL |
| REP-04 | Export bao cao. | File co cot, dinh dang so va tong so dung. | MANUAL |
| REP-05 | Import file Excel hop le. | Preview, validation va import dung so dong. | MANUAL |
| REP-06 | Import dong loi mot phan. | Bao dong loi ro rang; khong post du lieu tai chinh nua chung. | MANUAL |
| REP-07 | Retry import cung idempotency key. | Khong tao ban ghi trung. | MANUAL |
| ATT-01 | Upload attachment/anh giao hang hop le. | File gan dung chung tu, phan quyen tai ve dung. | AUTO + MANUAL |
| ATT-02 | Thu truy cap attachment bang ID cua chung tu khac. | Tu choi, khong ro ri file. | AUTO |
| ATT-03 | Upload file sai loai/kich thuoc. | Validation va thong bao ro rang. | MANUAL |

## 12. Test case dashboard, PWA va mobile UX

| ID | Dieu kien va thao tac | Ket qua mong doi | Loai |
| --- | --- | --- | --- |
| UX-01 | Dang nhap bang moi role. | Dashboard rieng theo vai tro; worker/driver khong thay menu tai chinh. | AUTO + MANUAL |
| UX-02 | Trang dashboard dang tai, rong va loi API. | Co loading, empty, error va nut thu lai de hieu. | MANUAL |
| UX-03 | Mo PWA tren Android pho thong. | Layout khong tran, nut chinh de bam, chu doc duoc. | AUTO + MANUAL |
| UX-04 | Cai PWA/manifest. | Ten, icon, start URL va cach offline phu hop. | AUTO + MANUAL |
| UX-05 | Mat mang khi dang xem du lieu cached. | Cho phep read cache/local draft theo scope; khong offline-post chung tu tai chinh. | AUTO + MANUAL |
| UX-06 | Quay lai mang sau khi co draft/anh queue. | Dong bo an toan, bao trang thai va khong duplicate. | MANUAL |
| MOB-01 | Dang nhap mobile bang username/email. | Session duoc luu an toan, loi dang nhap de hieu. | MANUAL |
| MOB-02 | Worker mo tab Nhan don. | Chi thay task claimable, claim cap nhat ngay. | MANUAL |
| MOB-03 | Driver mo tab Giao hang. | Chi thay job duoc phan cong va trang thai tracking dung. | MANUAL |
| MOB-04 | Admin mo link Web Bridge tu mobile. | Mo browser panel Admin da dang nhap, khong lo bearer token tren URL. | AUTO + MANUAL |
| MOB-05 | Xin quyen foreground location. | Giai thich ro rang truoc khi xin, xu ly user tu choi. | MANUAL |
| MOB-06 | Xin quyen background location Android. | Chi sau foreground consent; hien huong dan dung; khong crash khi tu choi. | MANUAL |
| MOB-07 | iOS build/chay tren iPhone. | Permission text dung, tab/navigation/map khong vo layout. | GAP |
| MOB-08 | Kiem tra Dark/Light va Dynamic Type neu he dieu hanh ho tro. | Van doc duoc, contrast va tap target dat yeu cau. | MANUAL |

## 13. Test case audit, idempotency, bao mat va migration

| ID | Dieu kien va thao tac | Ket qua mong doi | Loai |
| --- | --- | --- | --- |
| SEC-01 | Goi API ghi du lieu khi khong co session/token. | HTTP 401/403, khong co side effect. | AUTO + MANUAL |
| SEC-02 | Gui input co script, control character, SQL-like payload. | Validation/encoding an toan, khong XSS hay corrupt data. | AUTO + MANUAL |
| SEC-03 | Thu request cross-user doi document ID. | Khong xem/sua du lieu ngoai scope. | AUTO + MANUAL |
| SEC-04 | Kiem tra token tracking cong khai trong log/UI. | Chi hash token duoc persistence; khong log secret. | MANUAL |
| SEC-05 | Kiem tra rate limit/lockout dang nhap. | Giam brute force ma khong khoa nham user hop le. | AUTO + MANUAL |
| SEC-06 | Kiem tra audit cho create, confirm, reverse, claim, GPS start/stop. | Event immutable, co actor/timestamp/summary/reference. | AUTO |
| SEC-07 | GUI lai command voi cung idempotency key. | Cung result, khong co chung tu/movement/allocation/assignment trung. | AUTO |
| SEC-08 | Hai request dong thoi cho command tai chinh/kho/claim. | Transaction/locking bao ve invariant. | AUTO |
| SEC-09 | Kiem tra RLS va privilege Supabase bang role khong du quyen. | Khong doc/ghi cross-tenant/cross-role. | GAP |
| SEC-10 | Chay migration tren database trong. | Chay thanh cong, tao dung index, constraint, RLS va function. | MANUAL |
| SEC-11 | Chay lai migration da ap dung. | An toan theo convention migration; khong lam mat du lieu. | MANUAL |
| SEC-12 | Backup/restore du lieu mau va doc audit sau restore. | Du lieu, ledger va audit con nhat quan. | GAP |
| SEC-13 | Kiem tra bien moi truong production. | Secret khong co trong git/client bundle; bootstrap admin chi dung lan dau. | AUTO + MANUAL |

## 14. Test case hieu nang, tuong thich va van hanh

| ID | Dieu kien va thao tac | Ket qua mong doi | Loai |
| --- | --- | --- | --- |
| NFR-01 | Mo dashboard voi tap du lieu MVP. | TTFB/render phu hop, khong block thao tac chinh. | MANUAL |
| NFR-02 | Admin map co nhieu chuyen va 240 diem/chuyen. | Map van thao tac duoc, marker/route dung. | MANUAL |
| NFR-03 | GPS gui lien tuc toi gioi han session. | Gioi han 2,400 diem/session duoc ap dung, khong memory leak. | MANUAL |
| NFR-04 | Mat mang khi GUI GPS va khoi phuc. | Queue retry co gioi han, khong mat/nhan ban diem. | MANUAL |
| NFR-05 | Kiem tra Chrome, Edge, Android WebView va Safari iOS. | Luong web, map, upload, session va public link dung. | MANUAL |
| NFR-06 | Kiem tra timezone, ngay thang va dinh dang VND. | Bao cao/chung tu khong lech ngay va so tien de doc. | MANUAL |
| NFR-07 | Khoi dong lai backend voi file store demo. | Khong corrupt JSON; session/GPS state doc lai duoc. | MANUAL |
| NFR-08 | Theo doi log khi loi API/GPS. | Co correlation/reference, khong log mat khau/token/toa do qua muc can thiet. | MANUAL |
| NFR-09 | Smoke test sau deploy. | Dang nhap, tao don, claim, tracking, public link va logout deu hoat dong. | MANUAL |
| NFR-10 | Chay Android debug build va iOS release candidate. | Cai dat/chay duoc tren thiet bi muc tieu. | GAP |

## 15. Bo regression bat buoc truoc moi phat hanh

1. Chay `npm.cmd test`, `npm.cmd run typecheck` va `npm.cmd run build` tai root.
2. Chay `npm.cmd run typecheck` trong `apps/mobile` va export iOS bundle.
3. Chay native Android build, cai APK moi va smoke test tren emulator/may that.
4. Thuc hien `ORD-04` den `ORD-12`, `DEL-02` den `DEL-18`, `FIN-01` den `FIN-15` va `SEC-01` den `SEC-13`.
5. UAT mot luong end-to-end: Tao don -> tho claim -> dispatch -> GPS start -> Admin theo doi -> customer mo link -> giao xong -> GPS stop -> doi chieu audit.
6. Kiem tra migration/RLS tren Supabase staging truoc production.
7. Khong release khi con `P0`, `P1`, migration chua xac nhan, hoac mobile khong co bang chung chay tren thiet bi muc tieu.

## 16. Danh sach gap va hanh dong QC uu tien

| Uu tien | Gap | Hanh dong bat buoc |
| --- | --- | --- |
| P1 | Mobile chua co test runner. | Cau hinh Vitest/Jest + React Native Testing Library; them test login, queue, tracking, permission state va retry queue. |
| P1 | Supabase tracking migration chua duoc xac nhan tren project that. | Apply tren staging, kiem tra RLS/index/constraint, backup va ghi ket qua. |
| P1 | Android application ID build thuc te tung lech voi package cau hinh. | Dong bo package ID truoc release, generate lai native project va cai APK moi. |
| P1 | Chua co UAT GPS nen Android/iOS tren thiet bi that. | Chay `DEL-16`, `DEL-18`, `MOB-05` den `MOB-08` tren ca Android va iPhone. |
| P2 | Android native rebuild chua xac nhan lai trong dot nay. | Chay Gradle voi timeout dai hon, luu log va APK checksum. |
| P2 | Token expiry, RLS, backup/restore va load test chua co automation. | Bo sung integration/E2E test tren Supabase staging va theo doi trong CI. |

## 17. Tieu chi sign-off

- Tat ca `AUTO` phai xanh trong CI.
- Tat ca case `P0` va `P1` phai `Pass`; case `P2` can co owner, workaround va ngay sua ro rang.
- Khong co defect mo lien quan den sai so tien, ton kho, cong no, claim trung, quyen truy cap hoac ro ri GPS.
- Admin, dispatcher, worker/driver va customer da UAT dung vai tro.
- Co bang chung migration staging/production, Android va iOS smoke test, va audit report cho luong giao hang end-to-end.
