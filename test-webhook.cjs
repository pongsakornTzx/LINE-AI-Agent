const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');

// Load env from project root
dotenv.config();

const channelSecret = process.env.LINE_CHANNEL_SECRET;
if (!channelSecret) {
  console.error('Error: LINE_CHANNEL_SECRET not found in .env');
  process.exit(1);
}

const body = JSON.stringify({
  destination: "Uxxxxxx",
  events: [
    {
      type: "message",
      message: {
        type: "text",
        id: "12345",
        text: "ช่วยสร้าง Google Doc หัวข้อ แผนพัฒนาผลิตภัณฑ์ ปี 2026 และเขียนรายละเอียดว่า 'โฟกัสเรื่องระบบผู้ช่วยอัจฉริยะและการผสานงาน Google Workspace และ LINE Chatbot'"
      },
      timestamp: Date.now(),
      source: {
        type: "user",
        userId: "Uxxxxxx"
      },
      replyToken: "mock_reply_token_" + Date.now(),
      mode: "active"
    }
  ]
});

// Compute signature
const signature = crypto
  .createHmac('sha256', channelSecret)
  .update(body)
  .digest('base64');

console.log('Sending request to http://localhost:3000/api/webhook...');
console.log('Signature:', signature);

const url = 'http://localhost:3000/api/webhook';

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-line-signature': signature
  },
  body: body
})
.then(async (res) => {
  console.log('Response Status:', res.status);
  const data = await res.json().catch(() => null);
  console.log('Response Data:', data);
})
.catch((err) => {
  console.error('Error sending request:', err);
});
