# CLAUDE.md — GPM Automation Tool

## Project Overview
Tool CLI automation chạy nhiều browser profiles đồng thời qua GPM Login API, phục vụ airdrop số lượng lớn account.
Source nằm tại `automation-tool/`, các source cũ (`nodejs-gpm-login/`, `office/`, `GPMLoginApiV3Sample/`) giữ nguyên để tham khảo.

## Tech Stack
- Node.js 18+ ESM (`"type": "module"`)
- Selenium (chính) + Puppeteer (phụ)
- p-queue (concurrency), winston (logging), xlsx (Excel), commander (CLI)
- esbuild → pkg để build exe

## Key Files
```
index.js                              # CLI entry point
config.json                           # Config (GPM, wallet, window, logging)
src/core/GpmClient.js                 # GPM API V2+V3 wrapper
src/core/TaskRunner.js                # Queue + retry + wallet + proxy orchestration
src/core/BrowserManager.js            # Profile lifecycle (start → connect → close)
src/extensions/MetaMaskHandler.js     # Unlock, confirm popup
src/extensions/OKXHandler.js          # OKX wallet
src/extensions/index.js               # Wallet factory (auto-select by config)
src/tasks/index.js                    # Task registry — ĐĂNG KÝ TASK MỚI Ở ĐÂY
src/tasks/BaseTask.js                 # Abstract class cho mọi task
src/services/DataStore.js             # Excel reader + group filter + results + resume
data/accounts.xlsx                    # Excel accounts (group, profileName, proxy, wallet_password...)
DEBUG_GUIDE.md                        # Kinh nghiệm debug chi tiết
PLAN.md                               # Plan & features đầy đủ
```

## CLI Commands
```bash
node index.js --list-tasks                          # Liệt kê tasks
node index.js --task incentiv --group defi -c 3     # Chạy group defi, 3 concurrent
node index.js --task incentiv --profiles A0001,A0002
node index.js --task incentiv --range A0001-A0020
node index.js --task incentiv --resume              # Chạy lại accounts fail
npm run bundle                                       # esbuild → dist/bundle.cjs
npm run build                                        # bundle + pkg → exe
```

## Thêm Task Mới
1. Tạo `src/tasks/{name}/{Name}Task.js` extends `BaseTask`
2. Implement `static taskName`, `static description`, `async execute(driver, account, helpers)`
3. Đăng ký trong `src/tasks/index.js`: `import` + `register()`
4. Chạy: `node index.js --task {name}`

## Quy trình viết task bằng Playwright MCP
1. Start GPM profile: `curl http://127.0.0.1:19995/api/v3/profiles/start/{id}` → lấy port
2. Sửa `.mcp.json` → `--cdp-endpoint http://127.0.0.1:{port}` → restart Claude Code
3. Navigate → snapshot → screenshot → click qua từng bước → ghi XPath
4. Viết task script → restore `.mcp.json` về `--browser chromium`

## GPM Login API (V3)
- Base: `http://127.0.0.1:19995`
- List: `GET /api/v3/profiles?group_id={id}&page=1&per_page=100&sort=2`
- Start: `GET /api/v3/profiles/start/{id}?win_size=W,H&win_pos=X,Y`
- Close: `GET /api/v3/profiles/close/{id}`
- API docs: https://docs.gpmloginapp.com/api-document

## Cấu hình hiện tại
- MetaMask extension ID: `njifadofgijamiddalklhbfielmgnpgn`
- GPM profile test: A0001 (id: `f5969801-2f17-4224-bf03-7e9be285bab4`)
- GPM group ID: 11
- MetaMask password: `9486277210qQ@`

## Excel Format (accounts.xlsx)
| group | profileName | email | pass | proxy | wallet_password | wallet_type | faucet_network | ... |

## Lưu ý quan trọng
- Windows: Playwright MCP cần `cmd /c` wrapper trong `.mcp.json`
- MetaMask extension ID thay đổi khi update → check `config.json` → `wallet.extensionId`
- Dùng `executeScript('arguments[0].click()')` thay vì `.click()` khi bị overlay chặn
- GPM Login phải đang mở khi chạy tool
- Đọc `DEBUG_GUIDE.md` trước khi fix bug
