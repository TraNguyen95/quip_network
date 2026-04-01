# Debug Guide — GPM Automation Tool

Kinh nghiệm debug từ các session phát triển. Đọc trước khi fix bug để tránh mất thời gian.

---

## 1. GPM Login API

### Profile không start được
- **Lỗi "Không thể kết nối tới proxy"**: Proxy trong Excel sai hoặc proxy đã chết. Để trống cột proxy nếu không cần.
- **GPM phải đang mở**: API chạy local, không mở GPM = không gọi được API.
- **Port GPM**: Mặc định `19995`, kiểm tra trên app GPM Login nếu khác.

### API V2 vs V3
- Source hiện tại dùng **V3** (endpoint: `/api/v3/profiles/...`)
- V2 dùng `/v2/start?profile_id=xxx`, V3 dùng `/api/v3/profiles/start/{id}`
- V3 close profile dùng **GET** (không phải POST): `GET /api/v3/profiles/close/{id}`

---

## 2. MetaMask Extension

### Extension ID thay đổi sau khi update MetaMask
- **Vấn đề**: MetaMask update → extension ID thay đổi → unlock fail vì URL sai.
- **Triệu chứng**: `Waiting for element to be located By(css selector, *[id="password"])` timeout.
- **Fix**: Mở browser thủ công, vào MetaMask, copy URL từ address bar:
  ```
  chrome-extension://EXTENSION_ID_MOI/home.html
  ```
  Cập nhật `config.json` → `wallet.extensionId`.
- **Extension ID cũ**: `nkbihfbeogaeaoehlefnkodbefgpgknn`
- **Extension ID mới (hiện tại)**: `njifadofgijamiddalklhbfielmgnpgn`

### MetaMask unlock URL
```
chrome-extension://{extensionId}/home.html#onboarding/unlock
```
- Cần `sleep(3000)` sau khi navigate vì MetaMask load chậm.
- Sau khi unlock cần `sleep(5000)` để MetaMask khởi tạo xong.

### MetaMask popup không xuất hiện
- **Nguyên nhân**: Wallet đã connected trước đó (GPM lưu state).
- **Fix**: Kiểm tra `getAllWindowHandles()` trước và sau click → nếu số handle không tăng = không có popup → skip.

---

## 3. Selenium — Lỗi thường gặp

### "element click intercepted"
- **Nguyên nhân**: Có overlay/banner/popup che phủ element (cookie banner, promo popup).
- **Fix**: Dùng JavaScript click thay vì Selenium click:
  ```javascript
  await driver.executeScript('arguments[0].click();', element);
  ```
- Hoặc scroll element vào giữa màn hình trước:
  ```javascript
  await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', element);
  ```

### "stale element reference"
- **Nguyên nhân**: Page re-render sau khi dismiss overlay → element reference cũ bị invalid.
- **Fix**: Tìm lại element sau khi dismiss overlay, không cache element reference quá lâu.

### Element không tìm thấy
- Tăng timeout: mặc định 3000ms có thể không đủ cho trang nặng.
- Dùng `_findOptional()` pattern: trả về null thay vì throw error.
- Kiểm tra XPath trên browser thật trước bằng Playwright MCP.

---

## 4. Playwright MCP

### Setup trên Windows
- File config: `.mcp.json` tại project root (`node_gpm/.mcp.json`)
- **Windows bắt buộc** dùng `cmd /c` wrapper:
  ```json
  {
    "mcpServers": {
      "playwright": {
        "command": "cmd",
        "args": ["/c", "npx", "@playwright/mcp", "--browser", "chromium"]
      }
    }
  }
  ```
  Không có `cmd /c` → MCP không start được trên Windows.

### Cài Chromium cho Playwright
- Lần đầu chạy sẽ lỗi `Browser "chromium" is not installed`.
- Dùng tool `mcp__playwright__browser_install` để cài, hoặc:
  ```bash
  npx playwright install chromium
  ```
- Sau khi cài, cần **restart Claude Code** để MCP nhận browser mới.

### Connect Playwright vào GPM browser (inspect browser thật)
1. Start GPM profile qua API → lấy `remote_debugging_address` (vd: `127.0.0.1:59412`)
2. Sửa `.mcp.json`:
   ```json
   {
     "mcpServers": {
       "playwright": {
         "command": "cmd",
         "args": ["/c", "npx", "@playwright/mcp", "--cdp-endpoint", "http://127.0.0.1:59412"]
       }
     }
   }
   ```
3. **Restart Claude Code** → Playwright connect vào browser GPM đang chạy.
4. Có thể navigate, click, snapshot DOM, screenshot trên browser thật (có extensions, ví...).
5. **Sau khi xong**: restore `.mcp.json` về mode `--browser chromium`, đóng GPM profile.

### Hạn chế Playwright MCP
- **Không navigate được `chrome-extension://`** URL → không inspect MetaMask trực tiếp.
- Snapshot trang lớn có thể vượt token limit → dùng `Grep` hoặc `node -e` để filter nội dung.
- Mỗi lần đổi `.mcp.json` cần restart Claude Code.
- **Playwright MCP thường fail khi connect CDP** — package `@anthropic-ai/mcp-playwright` hoặc `@playwright/mcp` không ổn định với GPM browser (Chrome 129). Sau restart Claude Code, MCP có thể không load (không xuất hiện trong deferred tools).

### Thay thế: Debug bằng Selenium trực tiếp (khuyên dùng)
Khi Playwright MCP không hoạt động, dùng Selenium connect vào GPM browser qua CDP để debug:
```javascript
// node --input-type=module -e "..."
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const driverPath = String.raw`C:\Users\Admin\AppData\Local\Programs\GPMLogin\gpm_browser\gpm_browser_chromium_core_129\gpmdriver.exe`;
const service = new chrome.ServiceBuilder(driverPath);
const opts = new chrome.Options();
opts.debuggerAddress('127.0.0.1:{PORT}');  // từ GPM API start response
const driver = await new Builder().forBrowser('chrome').setChromeService(service).setChromeOptions(opts).build();

// Debug commands
await driver.get('https://example.com');
const text = await driver.executeScript('return document.body.innerText.substring(0, 500)');
console.log(text);
```

**Lưu ý quan trọng**:
- **Phải dùng `gpmdriver.exe`** (GPM bundled driver), KHÔNG dùng system chromedriver (version mismatch: system = Chrome 146, GPM = Chrome 129).
- Dùng `String.raw` cho Windows path để tránh escape issues.
- Regex trong `executeScript` có thể gây lỗi `Invalid regular expression` trên Chrome 129 — tránh dùng regex, dùng `indexOf`/`split` thay thế.
- Không gọi `driver.quit()` nếu muốn giữ browser mở để debug tiếp.

---

## 5. XPath — Bài học thực tế

### Ưu tiên selector theo thứ tự
1. **`data-testid`** (ổn định nhất): `button[data-testid="faucet_card_sepolia_native"]`
2. **`id` / `name`**: `By.id("password")`, `By.name("q")`
3. **Role + text**: `//button[text()="Continue"]`
4. **Class-based** (dễ vỡ khi rebuild): tránh dùng nếu có lựa chọn khác

### Verify XPath trước khi code
- Dùng Playwright MCP connect vào GPM browser → snapshot → tìm element → click thử.
- Tốt hơn nhiều so với đoán XPath rồi chạy automation bị fail.

### Website thay đổi flow
- Chainlink Faucet: code cũ click Connect ở header → code mới phải click faucet card → Continue → modal nhập address.
- **Luôn inspect lại** khi task fail — website thay đổi UI thường xuyên.

---

## 6. Task Development — Checklist

### Trước khi viết task mới
- [ ] Dùng Playwright MCP connect vào GPM browser thật
- [ ] Navigate tới website → screenshot + snapshot DOM
- [ ] Click qua từng bước thủ công → ghi lại flow chính xác
- [ ] Xác định có captcha không (Cloudflare Turnstile, reCAPTCHA, hCaptcha)
- [ ] Xác định wallet connect flow (popup hay modal hay redirect)

### Khi task fail
- [ ] Xem screenshot trong `logs/screenshots/` (tự chụp khi error)
- [ ] Xem log file trong `logs/app.log`
- [ ] Kiểm tra extension ID còn đúng không
- [ ] Kiểm tra proxy còn sống không
- [ ] Thử connect Playwright vào GPM browser để inspect trực tiếp

---

## 7. Build & Package

### ESM + esbuild
- Project dùng ES Modules (`"type": "module"` trong package.json).
- `pkg` không hỗ trợ ESM → dùng `esbuild` bundle thành CJS trước:
  ```bash
  npm run bundle   # → dist/bundle.cjs
  npm run build    # → bundle + pkg → dist/automation-tool.exe
  ```
- `import.meta.url` không hoạt động trong CJS → `src/config/default.js` có try/catch fallback dùng `process.cwd()`.

---

## 8. React Input — setValue không hoạt động

### Vấn đề
Dùng `executeScript` để set `input.value` + dispatch `input`/`change` event → React state không cập nhật → form submit gửi giá trị rỗng.

Cả `nativeInputValueSetter` pattern cũng không hoạt động:
```javascript
// ❌ KHÔNG HOẠT ĐỘNG với React
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
setter.call(input, value);
input.dispatchEvent(new Event('input', { bubbles: true }));
```

### Fix
Dùng `sendKeys()` — Selenium gõ từng ký tự như người dùng thật, React nhận event đúng:
```javascript
// ✅ HOẠT ĐỘNG
await input.click();
await input.clear();
await input.sendKeys(value);
```

**Lưu ý**: `sendKeys` chỉ hoạt động khi element visible + interactable. Nếu bị lỗi `invalid element state`, thêm `scrollIntoView` trước:
```javascript
await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', input);
```

### Ngoại lệ: contenteditable div (X/Twitter compose)
X dùng `contenteditable` div, `sendKeys` không hoạt động. Dùng `execCommand`:
```javascript
el.focus();
document.execCommand('insertText', false, text);
```

---

## 9. OKX Wallet — Unlock fail do setValue

### Vấn đề
Dùng `el.value = password` trên OKX password input → OKX app không nhận → nút Unlock vẫn disabled.

### Fix
Dùng `sendKeys()` thay vì set `el.value`:
```javascript
await passwordInput.clear();
await passwordInput.sendKeys(password);
```

---

## 10. Quip Network — Nhiều nút cùng tên

### Vấn đề
Quip có nhiều quest với cùng nút "Submit Post". Dùng `By.xpath("//button[contains(.,'Submit Post')]")` sẽ click nút đầu tiên (sai quest).

### Fix
Tìm nút trong context quest đúng bằng JS:
```javascript
var btns = document.querySelectorAll('button');
for (var btn of btns) {
  if (btn.textContent.includes('Submit Post')) {
    var card = btn.parentElement.parentElement.parentElement;
    if (card && card.innerText.indexOf('Post about Quip') !== -1) {
      btn.click(); // Đúng quest
    }
  }
}
```

### Debug tip
List tất cả buttons cùng tên + context xung quanh để xác định đúng nút:
```javascript
var btns = document.querySelectorAll('button');
for (var b of btns) {
  if (b.textContent.includes('Submit Post')) {
    console.log(b.parentElement.parentElement.parentElement.innerText.substring(0, 200));
  }
}
```

---

## 11. Window Size & Zoom

### Vấn đề
`WindowManager` tự chia `screenWidth/screenHeight` cho grid concurrent → window size thực tế rất nhỏ → element không visible → click/interact fail.

### Fix (hiện tại)
`WindowManager` giữ nguyên `window.width/height` từ config, tính `zoom = cellSize / windowSize` để GPM scale browser fit vào grid. Browser "thấy" full resolution nhưng hiển thị nhỏ trên màn hình.

### Lưu ý
- `.env` `WINDOW_WIDTH/HEIGHT` override `config.json`
- `BROWSER_ZOOM` trong `.env` override auto-calc zoom
- GPM param: `win_scale` (decimal, e.g. 0.44) khác `zoom` (percentage)

---

## 12. Lỗi hay gặp — Quick Reference

| Lỗi | Nguyên nhân | Fix |
|-----|------------|-----|
| `element click intercepted` | Overlay/banner che | `executeScript('arguments[0].click()')` |
| `stale element reference` | Page re-render | Tìm lại element |
| `password input timeout` | Extension ID sai | Check URL MetaMask, update config |
| `Không thể kết nối tới proxy` | Proxy chết/sai | Xóa proxy trong Excel |
| `Browser not installed` | Playwright chưa cài Chrome | `mcp__playwright__browser_install` |
| `MetaMask popup not found` | Wallet đã connected | Check handle count, skip nếu không tăng |
| `Wait timed out` | Element chưa load | Tăng timeout, thêm sleep |
| `GPM API connection refused` | GPM Login chưa mở | Mở GPM Login app |
| `import.meta not available` | esbuild CJS mode | Dùng try/catch fallback |
| `Windows npx MCP fail` | Thiếu `cmd /c` wrapper | Thêm `"command": "cmd", "args": ["/c", "npx", ...]` |
| `invalid element state` | Element không interactable (zoom nhỏ) | `scrollIntoView({block:"center"})` trước khi interact |
| React input value rỗng | `el.value = x` không trigger React | Dùng `sendKeys()` thay vì JS setValue |
| OKX Unlock button disabled | Password set qua JS không nhận | Dùng `sendKeys()` cho password input |
| Click nhầm button | Nhiều button cùng text trên page | Tìm button trong context parent card đúng |
| `target window already closed` | Browser crash/X load chậm | Tăng wait, retry, hoặc check profile stability |
| Tweet link thiếu `?s=20` | Quip reject link không có param | Append `?s=20` sau khi lấy link |
