# Theo doi don hang cho quan tri

## Muc dich

Man hinh `/admin/theo-doi-don-hang` giup Owner, quan tri va dieu phoi theo doi don ban va cac chuyen giao lien quan tai mot noi. Day la man hinh chi doc, khong thay the buoc xac nhan don, xuat kho, giao hang hay hach toan.

## Du lieu hien thi

- Ma don, ngay lap va trang thai don.
- Ten va so dien thoai khach hang.
- Ngay hen giao.
- Cac chuyen giao: ma chuyen, tai xe, trang thai va lan cap nhat GPS cuoi.
- Trang thai GPS bang chu: dang chia se, da dung, het han hoac chua bat.

Toa do GPS chi tiet, gia von, bien loi nhuan, dong hang va ledger khong duoc tra ve tu API danh sach nay. Ban do dieu phoi van la noi duy nhat de vai tro duoc cap quyen xem lo trinh day du.

## Phan quyen va cap nhat

API `/api/admin/order-monitoring` bat buoc phien dang nhap va dung cung chinh sach `canManage` cua dich vu theo doi giao hang. Khach hang, nha cung cap, tho va tai xe khong co quyen doc danh sach nay. Du lieu duoc lam moi moi 15 giay va phan hoi co `Cache-Control: private, no-store`.
