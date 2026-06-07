const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const channelSecret = process.env.LINE_CHANNEL_SECRET;
if (!channelSecret) {
  console.error('Error: LINE_CHANNEL_SECRET not found in .env');
  process.exit(1);
}

const scenarios = [
  {
    name: "Scenario 1: Google Calendar booking",
    text: "ช่วยจองคิวประชุมในปฏิทิน หัวข้อ 'คุยแผนโปรเจกต์ใหม่' วันที่ 10 มิถุนายน 2026 เวลา 14:00 ถึง 15:00 น. ขอลิงก์ Google Meet ด้วย"
  },
  {
    name: "Scenario 2: Google Sheets creation",
    text: "สร้างตาราง Google Sheet ชื่อ 'รายรับรายจ่ายประจำเดือน' โดยให้มีคอลัมน์ วันที่, รายการ, และจำนวนเงิน"
  },
  {
    name: "Scenario 3: Append to Google Sheet",
    text: "ช่วยจดบันทึกบรรทัดใหม่ลงในสเปรดชีต id abc123xyz ว่า วันที่ '2026-06-05' รายการ 'ซื้อคีย์บอร์ดใหม่' และจำนวนเงิน '1500' บาท"
  },
  {
    name: "Scenario 4: General Chat (Q&A)",
    text: "สวัสดีครับเลขาฯ ช่วยแนะนำวิธีจัดสรรตารางการทำงานที่ดียามเช้าให้มีประสิทธิภาพหน่อยครับ"
  }
];

async function runScenario(scenario) {
  console.log(`\n=========================================`);
  console.log(`Running ${scenario.name}`);
  console.log(`User Text: "${scenario.text}"`);

  const body = JSON.stringify({
    destination: "Uxxxxxx",
    events: [
      {
        type: "message",
        message: {
          type: "text",
          id: "msg_" + Math.random().toString(36).substr(2, 9),
          text: scenario.text
        },
        timestamp: Date.now(),
        source: {
          type: "user",
          userId: "Uxxxxxx"
        },
        replyToken: "mock_reply_" + Math.random().toString(36).substr(2, 9),
        mode: "active"
      }
    ]
  });

  const signature = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64');

  try {
    const res = await fetch('http://localhost:3000/api/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signature
      },
      body: body
    });

    console.log(`Response Status: ${res.status}`);
    const data = await res.json().catch(() => null);
    console.log(`Response Data:`, data);
  } catch (err) {
    console.error('Error running scenario:', err);
  }
}

async function runAll() {
  for (const scenario of scenarios) {
    await runScenario(scenario);
    // Wait a little between requests to avoid overloading or interleaving logs
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

runAll();
