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

Copy file `.env.sample` thành `.env`, sau đó sửa theo nhu cầu:

```env
# Referral link cho task quip-network
QUIP_REFERRAL_URL=https://quest.quip.network/airdrop?referral_code=YOUR_CODE

# Kích thước cửa sổ mỗi profile (pixel)
WINDOW_WIDTH=960
WINDOW_HEIGHT=700

# Số lần retry khi profile chạy fail (0 = không retry)
RETRY_ON_FAIL=1

# Tỉ lệ zoom browser (100 = bình thường, 30 = thu nhỏ 30%)
BROWSER_ZOOM=100
```

### Giải thích từng biến:

| Biến | Mô tả | Ví dụ |
|------|-------|-------|
| `QUIP_REFERRAL_URL` | Link referral cho task quip-network. Thay `YOUR_CODE` bằng code của bạn | `...?referral_code=4QPPZ95H` |
| `WINDOW_WIDTH` | Chiều rộng cửa sổ browser (pixel). Giảm xuống khi chạy nhiều profile đồng thời | `960` (vừa 2 cột trên màn 1920px) |
| `WINDOW_HEIGHT` | Chiều cao cửa sổ browser (pixel) | `700` |
| `RETRY_ON_FAIL` | Số lần retry khi profile fail. `0` = không retry, `2` = retry tối đa 2 lần | `1` |
| `BROWSER_ZOOM` | Tỉ lệ zoom của browser. `100` = kích thước gốc, `30` = thu nhỏ còn 30% | `100` |

### Auto-zoom (mới)

Tool giờ tự động tính zoom để xếp nhiều browser trên màn hình:
- `WINDOW_WIDTH/HEIGHT` là resolution **logic** mà browser "thấy" (khuyên dùng `1920x1080`)
- Tool tự chia grid dựa trên `screenWidth/screenHeight` trong config.json và số concurrent
- Browser được scale xuống (zoom) để fit vào grid cell
- Ví dụ: 5 concurrent trên màn 2560x1440 → grid 3x2 → zoom ~44%

**Không cần set `BROWSER_ZOOM`** trừ khi muốn override thủ công.

| Concurrent (-c) | WINDOW_WIDTH | WINDOW_HEIGHT | Ghi chú |
|----------------|-------------|--------------|---------|
| 1-5 | 1920 | 1080 | Khuyên dùng, auto-zoom sẽ fit |
| 1 | 1920 | 1080 | Full size, zoom = 1.0 |

**Lưu ý:** Nếu set `BROWSER_ZOOM` trong .env, nó sẽ override auto-zoom cho tất cả profile.

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
2. Vào trang quest.quip.network/airdrop (dùng `quip_url` từ Excel hoặc referral code từ .env)
3. Click "Connect Wallet" -> "Connect with Ethereum" -> chọn OKX
4. Xác nhận popup OKX (Connect + Sign)
5. Click "Log In" -> xác nhận popup OKX (2 lần)
6. Connect X (Twitter) -> Authorize app
7. Click "Go to Account" -> Follow @quipnetwork trên X
8. Đóng tab X, quay về trang chính
9. Click "Claim" -> kiểm tra "Great job!"
10. Daily Check-in: click "Check in" -> đợi "Check-In Succeeded!"

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

### Cột Excel hỗ trợ
- **quip_url**: (tuỳ chọn) link referral riêng cho từng account. Nếu không có, dùng `QUIP_REFERRAL_URL` từ .env

### Lưu ý
- Profile GPM phải có OKX Wallet extension đã cài sẵn
- Tài khoản X (Twitter) phải đã đăng nhập sẵn trên profile GPM
- Kết quả lưu tại folder `results/`

---

## Task 2: quip-checkin (Daily Check-in)

### Chức năng
Tự động check-in hàng ngày trên quest.quip.network (nằm trong task quip-network, step cuối)

### Lệnh chạy
```
node index.js --task quip-network --group quip --range P-20260329-0001-P-20260329-0020 -c 5
```

### Lưu ý
- Wallet phải đã connect trước đó (chạy quip-network lần đầu để connect)
- Nếu đã check-in hôm nay, nút "Check in" sẽ không xuất hiện → script skip

---

## Task 3: quip-ref (Lấy Referral Link)

### Chức năng
Tự động lấy referral link từ quest.quip.network và ghi vào cột `link ref` trong Excel

### Các bước script thực hiện
1. Mở khóa OKX Wallet
2. Vào trang quest.quip.network/airdrop (không dùng referral code)
3. Kiểm tra wallet đã connect chưa → nếu chưa, ghi "not connected" vào Excel
4. Click "Get My Referral Link"
5. Đợi popup hiển thị referral link
6. Copy link và ghi vào cột `link ref` trong Excel

### Lệnh chạy
```
node index.js --task quip-ref --group quip --range P-20260329-0001-P-20260329-0020 -c 5
```

### Kết quả
- Cột `link ref` trong Excel sẽ chứa referral link hoặc "not connected"

---

## Task 4: quip-post (Post trên X + Claim điểm)

### Chức năng
Tự động đăng bài trên X (Twitter) về @quipnetwork, submit link lên Quip và claim điểm daily

### Các bước script thực hiện
1. Mở khóa OKX Wallet
2. Vào x.com/home, chọn random bài từ `src/tasks/quip-network/posts.txt`
3. Đăng tweet
4. Dismiss popup "Got it" nếu có
5. Lấy link tweet mới nhất từ timeline (thêm `?s=20`)
6. Vào quest.quip.network/airdrop
7. Click "Submit Post" (quest "Post about Quip on X Daily")
8. Nhập link tweet vào input
9. Click "Claim" → đợi "Great job!"
10. Nếu claim lần 1 không thành công → reload → kiểm tra Submit Post còn không → retry

### Lệnh chạy

**Chạy 1 profile:**
```
node index.js --task quip-post --group quip --profiles P-20260329-0001 -c 1
```

**Chạy nhiều profile:**
```
node index.js --task quip-post --group quip --range P-20260329-0001-P-20260329-0020 -c 5
```

### Lưu ý
- Tài khoản X phải đã đăng nhập sẵn trên profile GPM
- Wallet phải đã connect trên Quip
- X home cần 15-30s để load compose box (một số profile chậm có thể fail)
- File `posts.txt` chứa 100 bài viết sẵn, script random chọn 1 bài
- Nếu muốn thêm/sửa bài viết, edit file `src/tasks/quip-network/posts.txt`

---

## Task 5: github-signup

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
- Khi đăng ký thành công, cột `github` trong Excel sẽ được ghi "ok"

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
