# Hướng Dẫn Chạy Task - GPM Automation Tool

## Yêu cầu trước khi chạy

1. **GPM Login** phải đang mở
2. **Node.js 18+** đã cài đặt
3. Cài đặt dependencies:
   ```
   npm install
   ```
4. File **data/accounts.xlsx** đã có dữ liệu (xem hướng dẫn bên dưới)
5. File **.env** đã cấu hình (copy từ `.env.sample`)

---

## Cấu hình file .env

Copy file `.env.sample` thành `.env`, sau đó sửa:

```
QUIP_REFERRAL_URL=https://quest.quip.network/airdrop?referral_code=YOUR_CODE
```

Thay `YOUR_CODE` bằng referral code của bạn.

---

## Cấu hình file data/accounts.xlsx

Mở file Excel, tạo các cột theo đúng tên:

### Cho task quip-network:

| group | gpm_group_id | profileName | wallet_password | wallet_type |
|-------|-------------|-------------|-----------------|-------------|
| quip  | 17          | P-20260329-0001 | matkhau123 | okx |
| quip  | 17          | P-20260329-0002 | matkhau123 | okx |

- **group**: tên group (dùng để filter, vd: `quip`)
- **gpm_group_id**: ID group trong GPM Login (xem trong GPM Login hoặc gọi API `http://127.0.0.1:19995/api/v3/groups`)
- **profileName**: tên profile trong GPM Login (phải trùng khớp chính xác)
- **wallet_password**: mật khẩu OKX wallet
- **wallet_type**: `okx` hoặc `metamask`

### Cho task github-signup:

| group | gpm_group_id | profileName | email | pass | wallet_password |
|-------|-------------|-------------|-------|------|-----------------|
| github | 17 | P-0001 | email@gemmmo.vn | passGitHub | passEmail |

- **email**: email dùng để đăng ký GitHub (từ gemmmo.vn)
- **pass**: mật khẩu GitHub muốn đặt
- **wallet_password**: mật khẩu email gemmmo.vn (để lấy mã xác nhận)

---

## Cách check Group ID trong GPM Login

Chạy lệnh:
```
curl http://127.0.0.1:19995/api/v3/groups
```

Sẽ trả về danh sách group, vd:
```json
{"id":17,"name":"quip"}
```

Lấy số `id` điền vào cột `gpm_group_id` trong Excel.

---

## Task 1: quip-network

### Chức năng
Tự động connect OKX wallet + connect X (Twitter) + follow + claim trên quest.quip.network

### Các bước script thực hiện
1. Mở khóa OKX Wallet (nhập password)
2. Vào trang quest.quip.network/airdrop (có referral code từ .env)
3. Click "Connect Wallet" -> "Connect with Ethereum" -> chọn OKX
4. Xác nhận popup OKX (Connect + Sign)
5. Click "Log In" -> xác nhận popup OKX (2 lần)
6. Connect X (Twitter) -> Authorize app
7. Click "Go to Account" -> Follow @quipnetwork trên X
8. Đóng tab X, quay về trang chính
9. Click "Claim" -> kiểm tra "Great job!"

### Lệnh chạy

**Chạy 1 profile:**
```
node index.js --task quip-network --group quip --profiles P-20260329-0001 -c 1
```

**Chạy nhiều profile cụ thể:**
```
node index.js --task quip-network --group quip --profiles P-20260329-0001,P-20260329-0002,P-20260329-0003 -c 3
```

**Chạy 1 dải profile:**
```
node index.js --task quip-network --group quip --range P-20260329-0001-P-20260329-0020 -c 3
```

**Giải thích tham số:**
- `--task quip-network`: tên task cần chạy
- `--group quip`: chỉ chạy các account thuộc group "quip" trong Excel
- `--profiles X,Y,Z`: chỉ chạy các profile cụ thể (cách nhau bởi dấu phẩy)
- `--range X-Y`: chạy từ profile X đến profile Y
- `-c 3`: số profile chạy đồng thời (1 = từng cái, 3 = chạy 3 cái 1 lúc)

### Lưu ý
- Profile GPM phải có OKX Wallet extension đã cài sẵn
- Tài khoản X (Twitter) phải đã đăng nhập sẵn trên profile GPM
- Kết quả lưu tại folder `results/`

---

## Task 2: github-signup

### Chức năng
Tự động đăng ký tài khoản GitHub mới, sử dụng email từ gemmmo.vn để lấy mã xác nhận.

### Các bước script thực hiện
1. Mở trang github.com/signup
2. Điền email, password, username (lấy từ email)
3. Click "Create account"
4. Đợi captcha được giải (thủ công hoặc tự động)
5. Gọi API gemmmo.vn để lấy mã xác nhận email
6. Nhập mã xác nhận
7. Đăng nhập nếu bị redirect về trang login
8. Xác nhận thiết bị nếu cần (lấy mã lần 2 từ gemmmo.vn)

### Lệnh chạy

**Chạy 1 profile:**
```
node index.js --task github-signup --group github --profiles P-0001 -c 1
```

**Chạy nhiều profile:**
```
node index.js --task github-signup --group github --range P-0001-P-0020 -c 3
```

### Lưu ý
- Email phải là email gemmmo.vn (tool tự động lấy mã xác nhận qua API)
- Captcha cần được giải thủ công (script sẽ đợi tối đa 2 phút)
- Nên chạy `-c 1` nếu phải giải captcha thủ công

---

## Các lệnh hữu ích khác

**Xem danh sách tất cả task:**
```
node index.js --list-tasks
```

**Chạy lại các profile bị fail:**
```
node index.js --task quip-network --group quip --resume -c 3
```

**Xem kết quả:**
Mở file JSON trong folder `results/`, vd: `results/quip-network_2026-03-29T11-26-52-735Z.json`

---

## Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|-----|------------|------------|
| `GPM profile not found` | Tên profile trong Excel không khớp với GPM | Kiểm tra tên profile trong GPM Login |
| `Failed to connect to GPM Login API` | GPM Login chưa mở | Mở GPM Login trước khi chạy |
| `OKX Wallet popup not found` | OKX extension chưa cài hoặc ID sai | Kiểm tra OKX extension trong GPM profile |
| `Authorize button not found` | Chưa đăng nhập X trên profile | Đăng nhập X thủ công trên profile GPM |
| `session not created` | ChromeDriver không tương thích | GPM tự động dùng driver đúng phiên bản, kiểm tra GPM cập nhật |
| `EBUSY: resource busy` | File Excel đang mở | Đóng file Excel trước khi chạy |
