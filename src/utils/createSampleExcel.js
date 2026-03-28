/**
 * Run this script once to create a sample accounts.xlsx file.
 * Usage: node src/utils/createSampleExcel.js
 */
import XLSX from 'xlsx';
import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');
const dataDir = resolve(ROOT, 'data');

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const sampleData = [
  {
    group: 'incentiv',
    profileName: 'A0001',
    email: 'acc1@gmail.com',
    pass: 'password123',
    proxy: '',
    wallet_password: '9486277210qQ@',
    wallet_type: 'metamask',
    '2fa_secret': '',
    send_to_address: '0x1234567890abcdef1234567890abcdef12345678',
    search_keyword: 'AI mới nhất',
    isSendToken: 1,
    isSwapToken: 1,
    notes: 'Sample account 1',
  },
  {
    group: 'incentiv',
    profileName: 'A0002',
    email: 'acc2@gmail.com',
    pass: 'password456',
    proxy: '5.6.7.8:3128:user2:pass2',
    wallet_password: '9486277210qQ@',
    wallet_type: 'metamask',
    '2fa_secret': '',
    send_to_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    isSendToken: 1,
    isSwapToken: 0,
    notes: 'Sample account 2',
  },
  {
    group: 'defi',
    profileName: 'A0003',
    email: 'acc3@gmail.com',
    pass: 'password789',
    proxy: 'socks5://9.10.11.12:1080',
    wallet_password: '9486277210qQ@',
    wallet_type: 'metamask',
    '2fa_secret': 'NHOYI3CND7WKJRLC',
    send_to_address: '',
    isSendToken: 0,
    isSwapToken: 1,
    notes: 'Sample account 3',
  },
  {
    group: 'defi',
    profileName: 'A0004',
    email: 'acc4@gmail.com',
    pass: 'password000',
    proxy: '',
    wallet_password: 'myOKXpassword',
    wallet_type: 'okx',
    '2fa_secret': '',
    send_to_address: '',
    isSendToken: 0,
    isSwapToken: 0,
    notes: 'OKX wallet account',
  },
];

const worksheet = XLSX.utils.json_to_sheet(sampleData);

// Set column widths
worksheet['!cols'] = [
  { wch: 12 }, // group
  { wch: 14 }, // profileName
  { wch: 22 }, // email
  { wch: 14 }, // pass
  { wch: 36 }, // proxy
  { wch: 18 }, // wallet_password
  { wch: 12 }, // wallet_type
  { wch: 20 }, // 2fa_secret
  { wch: 46 }, // send_to_address
  { wch: 12 }, // isSendToken
  { wch: 12 }, // isSwapToken
  { wch: 20 }, // notes
];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Accounts');

const outputPath = resolve(dataDir, 'accounts.xlsx');
XLSX.writeFile(workbook, outputPath);

console.log(`Sample accounts.xlsx created at: ${outputPath}`);
console.log(`Rows: ${sampleData.length}`);
