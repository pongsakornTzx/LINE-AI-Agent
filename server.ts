import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import crypto from 'crypto';
import { google } from 'googleapis';

// Load environment variables
dotenv.config();

// Global process exception safety handlers
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

// Path resolution safe for both ESM (tsx dev mode) and CJS (bundled by esbuild)
const getPaths = () => {
  try {
    if (typeof __filename !== 'undefined' && typeof __dirname !== 'undefined') {
      return { filename: __filename, dirname: __dirname };
    }
  } catch (e) {}

  const filename = fileURLToPath(import.meta.url);
  const dirname = path.dirname(filename);
  return { filename, dirname };
};

const { filename: activeFilename, dirname: activeDirname } = getPaths();

const EVENTS_FILE = process.env.EVENTS_DB_PATH || path.resolve(activeDirname, 'events-db.json');

function loadVirtualEvents() {
  if (!fs.existsSync(EVENTS_FILE)) {
    const defaultEvents = [
      {
        id: 'virt_1',
        summary: 'ประชุมสรุปแผนงานประจำสัปดาห์ (Weekly Sync)',
        description: 'ประชุมวางกลยุทธ์ทางโปรเจกต์ประจำอาทิตย์กับทีมบริหารกลุ่ม',
        start: { dateTime: new Date(Date.now() + 2 * 3600 * 1000).toISOString() },
        end: { dateTime: new Date(Date.now() + 3 * 3600 * 1000).toISOString() }
      },
      {
        id: 'virt_2',
        summary: 'ติดตามงานและจัดบอร์ดความต้องการลูกค้า (Task Grooming)',
        description: 'ทบทวนและพัฒนาฟีเจอร์ใหม่ตามข้อคิดเห็นลูกค้า',
        start: { dateTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString() },
        end: { dateTime: new Date(Date.now() + 25 * 3600 * 1000).toISOString() }
      },
      {
        id: 'virt_3',
        summary: 'ยินดีต้อนรับเพื่อพนักงานใหม่พัฒนาโครงระบบ (Onboarding)',
        description: 'ฉลองเปิดตัว และช่วยเทรนงานน้องใหม่เพื่อเริ่มงานได้คล่องตัว',
        start: { dateTime: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString() },
        end: { dateTime: new Date(Date.now() + 2 * 24 * 3600 * 1000 + 3600 * 1000).toISOString() }
      }
    ];
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(defaultEvents, null, 2), 'utf8');
    return defaultEvents;
  }
  try {
    const data = fs.readFileSync(EVENTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Error parsing events database:', e);
    return [];
  }
}

function saveVirtualEvents(events: any[]) {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving events database:', e);
  }
}

const SERVICE_ACCOUNT_FILE = path.resolve(activeDirname, 'google-service-account.json');
let googleAuthClient: any = null;

function getGoogleAuthClient() {
  if (googleAuthClient) return googleAuthClient;

  let credentials: any = null;

  if (fs.existsSync(SERVICE_ACCOUNT_FILE)) {
    try {
      credentials = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_FILE, 'utf8'));
    } catch (err) {
      console.error('Error loading Google Service Account credentials file:', err);
    }
  } else if (process.env.GOOGLE_WORKSPACE_CREDENTIALS) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_WORKSPACE_CREDENTIALS);
      console.log('Google Workspace credentials loaded from GOOGLE_WORKSPACE_CREDENTIALS environment variable!');
    } catch (err) {
      console.error('Error parsing GOOGLE_WORKSPACE_CREDENTIALS environment variable:', err);
    }
  } else {
    console.warn('WARNING: google-service-account.json not found and GOOGLE_WORKSPACE_CREDENTIALS environment variable not set. Google Workspace features will run in mock mode.');
  }

  if (credentials) {
    try {
      // Support authorized_user type (OAuth2 refresh token)
      if (credentials.type === 'authorized_user') {
        const oauth2 = new google.auth.OAuth2(
          credentials.client_id,
          credentials.client_secret
        );
        oauth2.setCredentials({ refresh_token: credentials.refresh_token });
        googleAuthClient = oauth2;
        console.log('Google OAuth2 user credentials loaded successfully!');
        return googleAuthClient;
      }

      // service_account type
      googleAuthClient = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/documents',
          'https://www.googleapis.com/auth/spreadsheets'
        ]
      );
      console.log('Google Service Account authenticated successfully!');
      return googleAuthClient;
    } catch (err) {
      console.error('Error authenticating Google client:', err);
    }
  }
  return null;
}

async function createGoogleDocAPI(title: string, bodyContent: string) {
  const auth = getGoogleAuthClient();
  if (!auth) {
    return {
      success: true,
      documentId: 'mock-doc-id',
      webViewLink: 'https://docs.google.com/document/d/mock-doc-id/edit',
      isMock: true
    };
  }

  const docs = google.docs({ version: 'v1', auth });
  const drive = google.drive({ version: 'v3', auth });

  const docFile = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.document'
    }
  });

  const documentId = docFile.data.id;
  if (!documentId) throw new Error('Failed to create document');

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: {
              index: 1
            },
            text: bodyContent
          }
        }
      ]
    }
  });

  await drive.permissions.create({
    fileId: documentId,
    requestBody: {
      role: 'reader',
      type: 'anyone'
    }
  });

  const fileInfo = await drive.files.get({
    fileId: documentId,
    fields: 'webViewLink'
  });

  return {
    success: true,
    documentId,
    webViewLink: fileInfo.data.webViewLink,
    isMock: false
  };
}

async function createGoogleSheetAPI(title: string, headers: string[]) {
  const auth = getGoogleAuthClient();
  if (!auth) {
    return {
      success: true,
      spreadsheetId: 'mock-sheet-id',
      webViewLink: 'https://docs.google.com/spreadsheets/d/mock-sheet-id/edit',
      isMock: true
    };
  }

  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const sheetFile = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.spreadsheet'
    }
  });

  const spreadsheetId = sheetFile.data.id;
  if (!spreadsheetId) throw new Error('Failed to create spreadsheet');

  if (headers && headers.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers]
      }
    });
  }

  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: {
      role: 'reader',
      type: 'anyone'
    }
  });

  const fileInfo = await drive.files.get({
    fileId: spreadsheetId,
    fields: 'webViewLink'
  });

  return {
    success: true,
    spreadsheetId,
    webViewLink: fileInfo.data.webViewLink,
    isMock: false
  };
}

async function appendToGoogleSheetAPI(spreadsheetId: string, rowValues: any[]) {
  const auth = getGoogleAuthClient();
  if (!auth) {
    return { success: true, isMock: true };
  }

  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [rowValues]
    }
  });

  return { success: true, isMock: false };
}

async function uploadFileToDriveAPI(fileName: string, fileContent: string) {
  const auth = getGoogleAuthClient();
  if (!auth) {
    return {
      success: true,
      fileId: 'mock-file-id',
      webViewLink: 'https://drive.google.com/file/d/mock-file-id/view',
      isMock: true
    };
  }

  const drive = google.drive({ version: 'v3', auth });
  const fileMetadata = {
    name: fileName
  };
  
  const { Readable } = await import('stream');
  const media = {
    mimeType: 'text/plain',
    body: Readable.from([fileContent])
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, webViewLink'
  });

  const fileId = response.data.id;
  if (!fileId) throw new Error('Failed to upload file');

  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone'
    }
  });

  const fileInfo = await drive.files.get({
    fileId,
    fields: 'webViewLink'
  });

  return {
    success: true,
    fileId,
    webViewLink: fileInfo.data.webViewLink,
    isMock: false
  };
}

async function createGoogleCalendarEventAPI(eventData: {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  enableMeet?: boolean;
}) {
  const auth = getGoogleAuthClient();
  if (!auth) {
    return {
      success: true,
      eventId: 'mock-event-id',
      htmlLink: 'https://calendar.google.com/calendar/r/eventedit',
      meetLink: eventData.enableMeet ? 'https://meet.google.com/mock-meet-id' : undefined,
      isMock: true
    };
  }

  const calendar = google.calendar({ version: 'v3', auth });

  const resource: any = {
    summary: eventData.summary,
    description: eventData.description,
    start: {
      dateTime: eventData.startDateTime,
      timeZone: 'Asia/Bangkok'
    },
    end: {
      dateTime: eventData.endDateTime,
      timeZone: 'Asia/Bangkok'
    }
  };

  if (eventData.enableMeet) {
    resource.conferenceData = {
      createRequest: {
        requestId: 'meet_' + Date.now(),
        conferenceSolutionKey: {
          type: 'hangoutsMeet'
        }
      }
    };
  }

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: resource,
    conferenceDataVersion: eventData.enableMeet ? 1 : 0
  });

  const eventId = response.data.id;
  const htmlLink = response.data.htmlLink;
  let meetLink = undefined;

  if (eventData.enableMeet && response.data.conferenceData?.entryPoints) {
    const meetEntryPoint = response.data.conferenceData.entryPoints.find(
      (ep: any) => ep.entryPointType === 'video'
    );
    if (meetEntryPoint) {
      meetLink = meetEntryPoint.uri;
    }
  }

  return {
    success: true,
    eventId,
    htmlLink,
    meetLink,
    isMock: false
  };
}

// Initialize Gemini SDK with telemetry header
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY environment variable is not defined");
}

const ai = new GoogleGenAI({
  apiKey: apiKey || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();

  // Enable CORS manually for cross-origin frontend requests (e.g. Netlify)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-line-signature');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));

  // 1. API: LINE Notify/Messaging API Proxy (Bypasses browser CORS restriction)
  app.post('/api/line-notify', async (req, res) => {
    const { token, message, apiType = 'messaging_api' } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'LINE API Token is required' });
    }
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message content is required' });
    }

    try {
      if (apiType === 'messaging_api') {
        console.log('Sending message via LINE Official Account Messaging API (Broadcast)...');
        
        const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            messages: [
              {
                type: 'text',
                text: message
              }
            ]
          })
        });

        if (response.ok) {
          return res.json({ success: true, message: 'Message successfully broadcasted via LINE Messaging API!' });
        } else {
          const errData = await response.json().catch(() => ({}));
          return res.status(400).json({
            success: false,
            error: errData.message || errData.details?.[0]?.message || `LINE API responded with status ${response.status}`
          });
        }
      } else {
        // Legacy LINE Notify
        console.log('Sending notification via Legacy LINE Notify API (Deprecated)...');
        
        const response = await fetch('https://notify-api.line.me/api/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${token}`
          },
          body: new URLSearchParams({ message })
        });

        const data = await response.json();

        if (response.ok && data.status === 200) {
          return res.json({ success: true, message: 'Message successfully sent to LINE!' });
        } else {
          return res.status(400).json({ 
            success: false, 
            error: data.message || 'Legacy LINE Notify API returned failure (Discontinued on March 31, 2025).' 
          });
        }
      }
    } catch (err: any) {
      console.error('Error calling LINE API:', err);
      return res.status(500).json({ 
        success: false, 
        error: err.message || 'Internal Server Error' 
      });
    }
  });

  // 2. API: AI Secretarial Agent endpoint runs server-side Gemini
  app.post('/api/agent/run', async (req, res) => {
    const { prompt, agentPersona, lineToken } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Goal prompt is required' });
    }

    const personaDescriptions: Record<string, string> = {
      secretary: 'เลขาฯ มืออาชีพ สุภาพ เรียบร้อย ละเอียดรอบคอบ และคอยดูแลตารางงานได้ไร้ที่ติ',
      pm: 'ผู้ช่วยผู้จัดการโครงการ (Project Manager) เน้นความชัดเจน แบ่งงานเป็นขั้นตอน และติดตามความคืบหน้าอย่างเป็นระบบ',
      coach: 'โค้ชสร้างแรงบันดาลใจ (Motivational Coach) ใช้คำพูดเติมพลังบวก กระตุ้นทีม และเปี่ยมไปด้วยพลังขับเคลื่อน',
      admin: 'ผู้ดูแลระบบและประกาศด่วน (System Co-ordinator) ชัดเจน กระชับ ตรงประเด็น ใช้ประกาศแจ้งข่าวสารด่วน',
    };

    const selectedPersona = personaDescriptions[agentPersona] || personaDescriptions.secretary;

    try {
      console.log(`Analyzing instruction using Gemini: "${prompt}" (Persona: ${agentPersona})`);

      // Define the structured schema we expect from Gemini
      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          intent: {
            type: Type.STRING,
            description: "สรุปเป้าหมายหรือความต้องการของผู้ใช้ในประโยคสั้นๆ",
          },
          reasoningSteps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "ลำดับขั้นตอนการทำงานของผู้ใช้นี้ (3-4 ขั้นตอนภาษาไทย) เช่น วิเคราะห์เนื้อหา, ร่างประโยค, จัดแต่งความสวยงาม",
          },
          draftMessage: {
            type: Type.STRING,
            description: "ร่างข้อความที่จะส่งลงไลน์ ออกแบบและจัดรูปแบบอย่างสวยงาม จัดย่อหน้า ใช้กระสุนนำ (bullet points) เว้นวรรคอย่างเหมาะสม และมีอิโมจิ (emojis) ตกแต่งอย่างเหมาะสม ดูเป็นมืออาชีพ มีความสุภาพ",
          },
          automationType: {
            type: Type.STRING,
            description: "ประเภทของการเตือนภัยหรือแอปพลิเคชัน: announcement, reminder, todo หรือ creative",
          },
          scheduleTime: {
            type: Type.STRING,
            description: "รายละเอียดวันเวลาหากเป็นสิ่งที่ต้องกำหนดตารางเวลา (เช่น ทุกเช้าวันจันทร์ 9:00 น., 25 พ.ค. 14:00 น.) หากไม่มีให้ปล่อยว่าง",
          },
          targetAudience: {
            type: Type.STRING,
            description: "คำอธิบายกลุ่มเป้าหมายผู้รับสาร เช่น กลุ่มเพื่อนร่วมงาน, กลุ่มครอบครัว หรือสำหรับการแจ้งเตือนส่วนตัว",
          }
        },
        required: ["intent", "reasoningSteps", "draftMessage", "automationType", "targetAudience"],
      };

      const systemInstruction = `คุณคือ "LINE AI Secretarial Agent" (เลขา AI ส่วนตัว).
หน้าที่ของคุณคือรับคำสั่งจากผู้ใช้เพื่อสั่งงาน เขียนประกาศ แต่งโพสต์ ตั้งเตือน หรือสรุปข้อความ เพื่อนำมาโพสต์หรือส่งแจ้งเตือนในระบบ LINE ของผู้ใช้
บุคลิกหลักของคุณคือ: ${selectedPersona}

กรุณาทำความเข้าใจเจตจำนงของผู้ใช้อย่างละเอียด และสร้างสรรค์ข้อความที่:
1. ภาษาไทยธรรมชาติ สุภาพ เรียบร้อย น่าอ่าน เหมาะสมกับบุคลิกที่เลือก
2. จัดวางหน้าอย่างประณีต มีหัวข้อหลัก มีจุดกระสุนนำ (bullet points) ย่อหน้า และช่องว่างสายตาที่ดี
3. มีการใช้อิโมจิสอดคล้องกับเนื้อความอย่างมีศิลปะ ไม่รกรุงรัง แต่ดึงดูดสายตา
4. มีข้อมูลครบถ้วนตามที่ร้องขอ

คุณต้องส่งผลลัพธ์กลับมาในรูปแบบ JSON ตาม Schema ที่กำหนดให้เท่านั้น`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.7,
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('No response text retrieved from Gemini Model.');
      }

      const agentResult = JSON.parse(responseText.trim());

      return res.json({
        success: true,
        agentResult,
      });

    } catch (err: any) {
      console.error('Gemini execution error:', err);
      return res.status(500).json({ 
        success: false, 
        error: err.message || 'Failed to analyze task with AI agent.' 
      });
    }
  });

  // 2.1.5 API: AI Calendar Event Extractor
  app.post('/api/agent/parse-event', async (req, res) => {
    const { prompt, currentTime } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    try {
      console.log(`Parsing calendar event using Gemini: "${prompt}" (Current Time: ${currentTime})`);

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: "หัวข้อนัดหมายหรือกิจกรรมสั้นๆ ที่จับใจความได้ เช่น ประชุมทีมการตลาด",
          },
          description: {
            type: Type.STRING,
            description: "รายละเอียดของนัดหมาย เช่น สถานที่ วิธีเข้าร่วมประชุม หรือข้อมูลเพิ่มเติม หากไม่มีให้ว่างไว้",
          },
          startDateTime: {
            type: Type.STRING,
            description: "วันเวลาเริ่มต้นของกิจกรรมในรูปแบบ ISO-8601 string (เช่น 2026-06-05T14:00:00+07:00)",
          },
          endDateTime: {
            type: Type.STRING,
            description: "วันเวลาสิ้นสุดของกิจกรรมในรูปแบบ ISO-8601 string (เช่น 2026-06-05T15:00:00+07:00)",
          },
          isValidEvent: {
            type: Type.BOOLEAN,
            description: "ข้อความนี้ประกอบด้วยข้อมูลนัดหมาย/ปฏิทินที่ระบุเวลาได้ใช่หรือไม่",
          }
        },
        required: ["summary", "description", "startDateTime", "endDateTime", "isValidEvent"],
      };

      const systemInstruction = `คุณคือ "AI Calendar Assistant".
หน้าที่ของคุณคือรับข้อความจากผู้ใช้และสกัดข้อมูลนัดหมายเป็น JSON ตาม Schema ที่กำหนด
โดยมี "เวลาปัจจุบันของผู้ใช้ (Current Local Time)" คือ: ${currentTime || new Date().toISOString()}
กรุณาใช้เวลาปัจจุบันนี้ในการคำนวณวันและเวลาสัมพัทธ์ เช่น "พรุ่งนี้", "วันมะรืน", "สัปดาห์หน้า", "วันจันทร์ถัดไป", "บ่ายสอง" หรือเวลาอื่นๆ ในข้อความอย่างแม่นยำ
หากไม่มีระบุเวลาสิ้นสุด ให้กำหนดให้เวลาสิ้นสุดห่างจากเวลาเริ่มต้นเป็นเวลา 1 ชั่วโมงโดยอัตโนมัติ`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.1,
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('No response text retrieved from Gemini Model.');
      }

      const eventResult = JSON.parse(responseText.trim());

      return res.json({
        success: true,
        eventResult,
      });

    } catch (err: any) {
      console.error('Gemini event parser error:', err);
      return res.status(500).json({ 
        success: false, 
        error: err.message || 'Failed to parse calendar event with AI.' 
      });
    }
  });

  // 2.1.8. API: Local File-Based Virtual Events DB
  app.get('/api/config', (req, res) => {
    res.json({
      success: true,
      lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
    });
  });

  app.get('/api/events', (req, res) => {
    try {
      const auth = getGoogleAuthClient();
      if (!auth) {
        return res.json({
          success: false,
          events: [],
          connected: false,
          error: "Google Calendar not connected"
        });
      }
      const events = loadVirtualEvents();
      res.json({ success: true, events, connected: true });
    } catch (err: any) {
      console.error('Error in GET /api/events:', err);
      res.status(500).json({
        success: false,
        events: [],
        connected: false,
        error: err.message || 'Internal server error'
      });
    }
  });

  app.post('/api/events', (req, res) => {
    const { event } = req.body;
    if (!event) {
      return res.status(400).json({ success: false, error: 'Event data is required' });
    }
    const events = loadVirtualEvents();
    const filtered = events.filter((e: any) => e.id !== event.id);
    filtered.unshift(event);
    saveVirtualEvents(filtered);
    res.json({ success: true, event });
  });

  // 2.1.9. API: LINE Webhook Endpoint
  app.post('/api/webhook', async (req, res) => {
    const signature = req.headers['x-line-signature'] as string;
    const channelSecret = process.env.LINE_CHANNEL_SECRET || '';

    // Verify signature
    if (channelSecret && signature) {
      const hash = crypto
        .createHmac('sha256', channelSecret)
        .update(req.rawBody || '')
        .digest('base64');
      if (hash !== signature) {
        console.warn('LINE webhook signature verification failed');
        return res.status(401).send('Invalid signature');
      }
    }

    const events = req.body.events;
    if (!events || !Array.isArray(events)) {
      return res.json({ success: true });
    }

    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!channelAccessToken) {
      console.error('LINE_CHANNEL_ACCESS_TOKEN is not configured in .env');
      return res.status(500).json({ success: false, error: 'LINE access token not configured' });
    }

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text;
        const replyToken = event.replyToken;

        console.log(`Received message via LINE Webhook: "${userText}"`);

        try {
          const tools = [
            {
              functionDeclarations: [
                {
                  name: 'createCalendarEvent',
                  description: 'Create a new Google Calendar event. If enableMeet is true, it also generates a Google Meet video conference link.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      summary: { type: Type.STRING, description: 'หัวข้อนัดหมาย' },
                      description: { type: Type.STRING, description: 'รายละเอียดเพิ่มเติม' },
                      startDateTime: { type: Type.STRING, description: 'วันเวลานัดหมายเริ่มต้น ISO string' },
                      endDateTime: { type: Type.STRING, description: 'วันเวลานัดหมายสิ้นสุด ISO string' },
                      enableMeet: { type: Type.BOOLEAN, description: 'สร้างลิงก์ประชุม Google Meet สำหรับการประชุมออนไลน์นี้หรือไม่' }
                    },
                    required: ['summary', 'startDateTime', 'endDateTime']
                  }
                },
                {
                  name: 'createGoogleDoc',
                  description: 'Create a new document in Google Docs with specified title and body text content.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: 'ชื่อหัวข้อเอกสาร Doc' },
                      bodyContent: { type: Type.STRING, description: 'เนื้อหาข้อความรายละเอียดที่จะเขียนลงในเอกสาร' }
                    },
                    required: ['title', 'bodyContent']
                  }
                },
                {
                  name: 'createGoogleSheet',
                  description: 'Create a new spreadsheet in Google Sheets with specified title and initial header columns.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: 'ชื่อหัวข้อสเปรดชีต' },
                      headers: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'รายชื่อหัวข้อคอลัมน์เริ่มต้น เช่น ["วันที่", "รายการ", "จำนวนเงิน"]'
                      }
                    },
                    required: ['title']
                  }
                },
                {
                  name: 'appendToGoogleSheet',
                  description: 'Append a new row of values to an existing Google Sheet spreadsheet.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      spreadsheetId: { type: Type.STRING, description: 'Spreadsheet ID (รหัสยาวๆ ในลิงก์ Google Sheets)' },
                      rowValues: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'ชุดข้อมูลคอลัมน์ที่ต้องการเขียนลงบรรทัดใหม่ เช่น ["2026-06-05", "ค่ากาแฟ", "60"]'
                      }
                    },
                    required: ['spreadsheetId', 'rowValues']
                  }
                },
                {
                  name: 'uploadFileToDrive',
                  description: 'Upload or write a plain text file directly to Google Drive.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      fileName: { type: Type.STRING, description: 'ชื่อไฟล์พร้อมนามสกุล เช่น report.txt หรือ memo.txt' },
                      fileContent: { type: Type.STRING, description: 'เนื้อหาข้อความในไฟล์' }
                    },
                    required: ['fileName', 'fileContent']
                  }
                }
              ]
            }
          ];

          const currentTimeStr = new Date().toISOString();
          const systemInstruction = `คุณคือ "LINE AI Secretary Agent" (เลขาบอทเชื่อมระบบ Google Workspace).
หน้าที่ของคุณคือรับคำสั่งจากผู้ใช้ LINE และช่วยประมวลผลจัดหาเครื่องมือ Google Workspace ที่เหมาะสมมาตอบสนอง
โดยมี "เวลาปัจจุบันของผู้ใช้ (Current Local Time)" คือ: ${currentTimeStr}

คำชี้แจงระบบ:
1. หากผู้ใช้สั่งการเกี่ยวกับ นัดหมาย, สร้างนัด, calendar หรือ Google Meet ให้เรียกใช้เครื่องมือ \`createCalendarEvent\`
2. หากสั่งการสร้างไฟล์เอกสาร, บันทึกข้อความยาวๆ หรือ Google Doc ให้เรียกใช้เครื่องมือ \`createGoogleDoc\`
3. หากสั่งสร้างตาราง, ตารางบันทึก หรือ Google Sheet ให้เรียกใช้เครื่องมือ \`createGoogleSheet\`
4. หากสั่งให้จดบันทึก เพิ่มแถว, บันทึกเงิน หรือ append ไปยัง Sheet ให้เรียกใช้เครื่องมือ \`appendToGoogleSheet\`
5. หากสั่งให้อัปโหลดไฟล์ หรือสร้างไฟล์ข้อมูลบน Drive ให้เรียกใช้เครื่องมือ \`uploadFileToDrive\`
6. หากเป็นข้อความทั่วไปที่ไม่ต้องการเครื่องมือ ให้ตอบกลับภาษาไทยอย่างเป็นกันเอง สุภาพ มีอิโมจิและจัดย่อหน้าสวยงาม`;

          const geminiResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: userText,
            config: {
              systemInstruction,
              tools,
              temperature: 0.2
            }
          });

          let responseText = '';
          const functionCalls = geminiResponse.functionCalls;

          if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            console.log(`Gemini triggered tool call: ${call.name}`, call.args);

            if (call.name === 'createCalendarEvent') {
              const args: any = call.args;
              const result = await createGoogleCalendarEventAPI({
                summary: args.summary,
                description: args.description || userText,
                startDateTime: args.startDateTime,
                endDateTime: args.endDateTime,
                enableMeet: args.enableMeet
              });

              // Save to virtual events DB
              const newVirt: any = {
                id: result.eventId || 'virt_' + Date.now(),
                summary: args.summary,
                description: args.description || userText,
                start: { dateTime: args.startDateTime },
                end: { dateTime: args.endDateTime }
              };
              const currentEvents = loadVirtualEvents();
              currentEvents.unshift(newVirt);
              saveVirtualEvents(currentEvents);

              const formattedStart = new Date(args.startDateTime).toLocaleString('th-TH');
              const formattedEnd = new Date(args.endDateTime).toLocaleString('th-TH');

              responseText = `📅 *บันทึกกิจกรรมนัดหมายสำเร็จแล้วค่ะ!* ${result.isMock ? '(โหมดออฟไลน์จำลอง)' : ''}\n━━━━━━━━━━━━━━━━━━\n📌 กิจกรรม: ${args.summary}\n⏰ เริ่ม: ${formattedStart}\n⏰ สิ้นสุด: ${formattedEnd}`;
              if (result.meetLink) {
                responseText += `\n📹 ลิงก์ประชุม Google Meet: ${result.meetLink}`;
              }
              if (result.htmlLink) {
                responseText += `\n🔗 ลิงก์เข้าสู่ปฏิทิน: ${result.htmlLink}`;
              }
              responseText += `\n━━━━━━━━━━━━━━━━━━`;
            } 
            else if (call.name === 'createGoogleDoc') {
              const args: any = call.args;
              const result = await createGoogleDocAPI(args.title, args.bodyContent);
              responseText = `📄 *สร้าง Google Doc สำเร็จแล้วค่ะ!* ${result.isMock ? '(โหมดออฟไลน์จำลอง)' : ''}\n━━━━━━━━━━━━━━━━━━\n📌 หัวข้อเอกสาร: ${args.title}\n🔗 เข้าชม/แก้ไขเอกสาร: ${result.webViewLink}\n━━━━━━━━━━━━━━━━━━`;
            } 
            else if (call.name === 'createGoogleSheet') {
              const args: any = call.args;
              const result = await createGoogleSheetAPI(args.title, args.headers || []);
              responseText = `📊 *สร้าง Google Sheet สำเร็จแล้วค่ะ!* ${result.isMock ? '(โหมดออฟไลน์จำลอง)' : ''}\n━━━━━━━━━━━━━━━━━━\n📌 ชื่อตาราง: ${args.title}\n🔗 ลิงก์เข้าชมสเปรดชีต: ${result.webViewLink}\n━━━━━━━━━━━━━━━━━━`;
              if (result.spreadsheetId) {
                responseText += `\n💡 Spreadsheet ID สำหรับอ้างอิง: \`${result.spreadsheetId}\``;
              }
            } 
            else if (call.name === 'appendToGoogleSheet') {
              const args: any = call.args;
              const result = await appendToGoogleSheetAPI(args.spreadsheetId, args.rowValues);
              responseText = `📈 *บันทึกข้อมูลแถวใหม่สำเร็จแล้วค่ะ!* ${result.isMock ? '(โหมดออฟไลน์จำลอง)' : ''}\n━━━━━━━━━━━━━━━━━━\n📝 ข้อมูลที่บันทึก: [ ${args.rowValues.join(', ')} ]\n━━━━━━━━━━━━━━━━━━`;
            } 
            else if (call.name === 'uploadFileToDrive') {
              const args: any = call.args;
              const result = await uploadFileToDriveAPI(args.fileName, args.fileContent);
              responseText = `💾 *อัปโหลดไฟล์ไปที่ Google Drive สำเร็จแล้วค่ะ!* ${result.isMock ? '(โหมดออฟไลน์จำลอง)' : ''}\n━━━━━━━━━━━━━━━━━━\n📌 ชื่อไฟล์: ${args.fileName}\n🔗 ลิงก์เข้าชมไฟล์: ${result.webViewLink}\n━━━━━━━━━━━━━━━━━━`;
            }
          } else {
            responseText = geminiResponse.text || 'รับทราบคำสั่งค่ะ!';
          }

          // Reply to LINE
          const replyResponse = await fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${channelAccessToken}`
            },
            body: JSON.stringify({
              replyToken,
              messages: [
                {
                  type: 'text',
                  text: responseText
                }
              ]
            })
          });

          if (!replyResponse.ok) {
            const errBody = await replyResponse.text();
            console.error('Error replying to LINE:', errBody);
          } else {
            console.log('Successfully sent reply to LINE');
          }

        } catch (err: any) {
          console.error('Error processing LINE webhook event:', err);
          try {
            await fetch('https://api.line.me/v2/bot/message/reply', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channelAccessToken}`
              },
              body: JSON.stringify({
                replyToken,
                messages: [
                  {
                    type: 'text',
                    text: `❌ เกิดข้อผิดพลาดในการรันเครื่องมือ Google: ${err.message || err}`
                  }
                ]
              })
            });
          } catch (e) {
            console.error('Failed to send error reply to LINE:', e);
          }
        }
      }
    }

    res.json({ success: true });
  });

  // 2.2. API: AI Calendar Summarizer
  app.post('/api/agent/summarize-calendar', async (req, res) => {
    const { events, agentPersona } = req.body;

    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ success: false, error: 'Events array is required' });
    }

    const personaDescriptions: Record<string, string> = {
      secretary: 'เลขาฯ มืออาชีพ สุภาพ เรียบร้อย ละเอียดรอบคอบ และคอยดูแลตารางงานได้ไร้ที่ติ',
      pm: 'ผู้ช่วยผู้จัดการโครงการ (Project Manager) เน้นความชัดเจน แบ่งงานเป็นขั้นตอน และติดตามความคืบหน้าอย่างเป็นระบบ',
      coach: 'โค้ชสร้างแรงบันดาลใจ (Motivational Coach) ใช้คำพูดเติมพลังบวก กระตุ้นทีม และเปี่ยมไปด้วยพลังขับเคลื่อน',
      admin: 'ผู้ดูแลระบบและประกาศด่วน (System Co-ordinator) ชัดเจน กระชับ ตรงประเด็น ใช้ประกาศแจ้งข่าวสารด่วน',
    };

    const selectedPersona = personaDescriptions[agentPersona] || personaDescriptions.secretary;

    try {
      console.log(`Summarizing ${events.length} Google Calendar events using Gemini with persona "${agentPersona}"`);

      const eventsText = events.map((ev: any, index: number) => {
        const start = ev.start?.dateTime || ev.start?.date || '';
        const end = ev.end?.dateTime || ev.end?.date || '';
        const summary = ev.summary || 'ไม่มีชื่อหัวข้อนัดหมาย';
        const description = ev.description || '';
        return `นัดหมายที่ ${index + 1}:
- หัวข้อ: ${summary}
- เริ่ม: ${start}
- สิ้นสุด: ${end}
- รายละเอียดเพิ่มเติม: ${description}`;
      }).join('\n\n');

      const systemInstruction = `คุณคือ "LINE AI Secretarial Agent" (เลขา AI ส่วนตัว).
หน้าที่ของคุณคือรับตารางการนัดหมายจาก Google Calendar และสร้างข้อความประกาศ/สรุปตารางงานสำหรับส่งไปใน LINE Group อย่างเป็นระเบียบ เรียบร้อย และสวยงาม
บุคลิกหลักของคุณคือ: ${selectedPersona}

กรุณาสรุปนัดหมายที่ส่งมาดังนี้:
1. ภาษาไทยธรรมชาติ สุภาพ เรียบร้อย น่าอ่าน สอดคล้องกับหัวโขน/บุคลิก
2. จัดวางหน้าอย่างประณีต มีหัวข้อหลัก (เช่น 📅 สรุปอัปเดตปฏิทินงานการทำงานทีม) มีจุดกระสุนนำ (bullet points) ย่อหน้า และช่องว่างสายตาที่ดี
3. มีการใช้อิโมจิที่สื่อถึงความร่วมมือ นัดหมาย เวลา และแผนงานอย่างสร้างสรรค์
4. เรียงตามตารางเวลา แสดงช่วงเวลาให้ชัดเจนสะดุดตา

คุณต้องตอบกลับข้อมูลเป็นร่างข้อความภาษาไทยจัดรูปแบบสวยงามแบบ Plain string ที่ผู้ใช้สามารถนำไปส่งต่อได้ทันที`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `นี่คือรายการดึงคิวจาก Google Calendar:\n\n${eventsText}\n\nกรุณาร่างประมวลสรุปตารางเพื่อจัดส่งให้กับกลุ่มแชท LINE เผยแพร่งานอัจฉริยะค่ะ`,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      const draftMessage = response.text || '';

      return res.json({
        success: true,
        draftMessage,
      });

    } catch (err: any) {
      console.error('Gemini calendar summary error:', err);
      return res.status(500).json({ 
        success: false, 
        error: err.message || 'Failed to summarize calendar events.' 
      });
    }
  });

  // 2.3. API: AI Interactive Chat & Research Grounding
  app.post('/api/agent/chat', async (req, res) => {
    const { messages, agentPersona } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, error: 'Messages array is required' });
    }

    const personaDescriptions: Record<string, string> = {
      secretary: 'เลขาฯ มืออาชีพ สุภาพ เรียบร้อย ละเอียดรอบคอบ และคอยช่วยเหลือค้นคว้าข้อมูลสนับสนุนงานอย่างสุขุม',
      pm: 'ผู้ช่วยผู้จัดการโครงการ (Project Manager) เน้นการวางแผน งานเป็นสัดส่วน วิเคราะห์เป้าหมาย และติดตามงานอย่างเฉียบขาด',
      coach: 'โค้ชสร้างแรงบันดาลใจ (Motivational Coach) เติมพลังเชิงบวก ให้คำแนะนำอบอุ่น เพื่อการทำงานร่วมกันอย่างมีความสุข',
      admin: 'ผู้ดูแลระบบและแอดมินประสานงาน คมชัด กระชับ ตรงสิทธิ์ข้อตกลง ดึงสถิติจริงและข้อเท็จจริงอย่างตรงไปตรงมา',
    };

    const selectedPersona = personaDescriptions[agentPersona] || personaDescriptions.secretary;

    try {
      console.log(`AI Chat request received with ${messages.length} messages. Persona: ${agentPersona}`);

      const systemInstruction = `คุณคือ "LINE AI Assistant & Research Secretary" (เลขาผู้ช่วยวิจัยปัญญาประดิษฐ์และโต้ตอบสัจธรรม).
หน้าที่ของคุณคือช่วยโต้ตอบ ให้ข้อมูล ค้นหาข้อมูลล่าสุดบนเว็บจากสถานการณ์รอบมิติ เพื่อให้คำแนะนำที่ดีเยี่ยม และแนะนำร่างข้อความประกาศ, การเตือนภัยนัดหมาย, คำอวยพร หรือโปรเจกต์งานต่างๆ ที่เหมาะสมเพื่อใช้จัดส่ง/กระจายข่าวสารในกลุ่มแชท LINE

คุณต้องตอบสนองภายใต้บุคลิกและน้ำเสียงของบุคลิกภาพนี้: ${selectedPersona}

คำแนะนำของระบบ:
1. เสนอตัวช่วยวิจัย ให้ข้อมูลคำแนะนำแก่ผู้ใช้อย่างตรงประเด็นและมีความสุภาพนอบน้อมในฐานะเลขาฯ/ผู้เชี่ยวชาญภาษาไทยธรรมชาติ โดยอยู่ภายใต้ scope ของงานเลขาฯ, LINE notification, การสื่อสารประชาสัมพันธ์, งานออฟฟิศ หรือโปรเจกต์แผนงาน
2. หากเนื้อหาเกี่ยวข้องกับข่าวสาร ข้อมูลสภาพภูมิอากาศ สุขภาพ เทคโนโลยี ข้อเท็จจริง หรือเรื่องราวที่ต้องอ้างอิงความจริงในปัจจุบัน คุณสามารถสืบค้นข้อมูลล่าสุดจากอินเทอร์เน็ตได้โดยตรง เพื่อความถูกต้องสูงสุด
3. จัดหน้าและเน้นคำสำคัญด้วย Markdown อย่างสวยงาม ทำเป็นย่อหน้า หรือหัวข้อย่อยเพื่อให้อ่านง่าย เพื่อให้ผู้ใช้สามารถอ่านคำแนะนำหรือก๊อปปี้ไปแชร์ต่อในกลุ่มไลน์ได้ทันที
4. มอบข้อเสนอแนะและ "ร่างข้อความแนะนำ" ที่เอาไปโพสต์ลง LINE ได้สะดวกให้ผู้ใช้เอาไปคัดลอกได้ทันที`;

      // Map communication history for Gemini API
      const contents = messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || '';
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

      // Extract research source references
      const sources = groundingChunks.map((chunk: any) => {
        if (chunk.web) {
          return {
            title: chunk.web.title || 'แหล่งอ้างอิงข้อมูลเว็บ',
            uri: chunk.web.uri || ''
          };
        }
        return null;
      }).filter(Boolean);

      return res.json({
        success: true,
        text,
        sources
      });

    } catch (err: any) {
      console.error('Gemini chat execution error:', err);
      return res.status(500).json({ 
        success: false, 
        error: err.message || 'Failed to generate AI response.' 
      });
    }
  });

  // API route 404 fallback & Error handling to ensure they always return JSON
  app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, error: 'API route not found' });
  });

  app.use((err: any, req: any, res: any, next: any) => {
    if (req.originalUrl.startsWith('/api/')) {
      console.error('Unhandled API Error:', err);
      return res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error'
      });
    }
    next(err);
  });

  // 3. SPA Handlers & Dev Server Setup
  if (process.env.NODE_ENV !== 'production') {
    console.log('Mounting Vite dev server middleware in Express...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Serving production static build files from dist...');
    const staticDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(staticDir));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(staticDir, 'index.html'));
    });
  }

  // 4. Start the server on port 3000 (Required by infra, listening on 0.0.0.0)
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 AI Secretarial Agent App Server now running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server start error:', err);
});
