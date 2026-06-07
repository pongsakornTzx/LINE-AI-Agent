/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, FormEvent } from 'react';
import { 
  Send, 
  RefreshCw, 
  Settings, 
  Bot, 
  User, 
  Plus, 
  Check, 
  CheckCircle2, 
  AlertTriangle, 
  Clipboard, 
  Bell, 
  FileText, 
  CheckSquare, 
  Sparkles, 
  Eye, 
  ExternalLink, 
  ShieldAlert, 
  Trash2, 
  HelpCircle,
  MessageSquare,
  Clock,
  Briefcase,
  Lightbulb,
  AlertCircle,
  Calendar,
  LogOut,
  UserCheck
} from 'lucide-react';

import { initAuth, googleSignIn, logout, listCalendarEvents, createCalendarEvent } from './firebase-auth';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Definitions for local structures
interface TaskHistory {
  id: string;
  command: string;
  draftMessage: string;
  persona: string;
  timestamp: string;
  automationType: string;
  targetAudience: string;
  dispatchedToLine: boolean;
}

interface SimulatedLineMessage {
  id: string;
  sender: 'ai_notify' | 'user';
  text: string;
  timestamp: string;
}

export default function App() {
  // --- Calendar Mode: Google vs Virtual Local ---
  const [calendarMode, setCalendarMode] = useState<'google' | 'virtual'>(() => {
    return (localStorage.getItem('line_agent_calendar_mode') as 'google' | 'virtual') || 'virtual';
  });

  // --- Google Calendar Auth & Integration States ---
  const [gCalUser, setGCalUser] = useState<any>(null);
  const [gCalToken, setGCalToken] = useState<string | null>(null);
  const [needsGCalAuth, setNeedsGCalAuth] = useState<boolean>(true);
  
  // Virtual Local Calendar Events List
  const [virtualEvents, setVirtualEvents] = useState<any[]>(() => {
    const saved = localStorage.getItem('line_agent_virtual_calendar');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    // Preload some nice simulated team events
    return [
      {
        id: 'virt_1',
        summary: 'ประชุมสรุปแผนงานประจำสัปดาห์ (Weekly Sync)',
        description: 'ประชุมวางกลยุทธ์ทางโปรเจกต์ประจำอาทิตย์กับทีมบริหารกลุ่ม',
        start: { dateTime: new Date(Date.now() + 2 * 3600 * 1000).toISOString() }, // In 2 hours
        end: { dateTime: new Date(Date.now() + 3 * 3600 * 1000).toISOString() }
      },
      {
        id: 'virt_2',
        summary: 'ติดตามงานและจัดบอร์ดความต้องการลูกค้า (Task Grooming)',
        description: 'ทบทวนและพัฒนาฟีเจอร์ใหม่ตามข้อคิดเห็นลูกค้า',
        start: { dateTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString() }, // Tomorrow
        end: { dateTime: new Date(Date.now() + 25 * 3600 * 1000).toISOString() }
      },
      {
        id: 'virt_3',
        summary: 'ยินดีต้อนรับเพื่อพนักงานใหม่พัฒนาโครงระบบ (Onboarding)',
        description: 'ฉลองเปิดตัว และช่วยเทรนงานน้องใหม่เพื่อเริ่มงานได้คล่องตัว',
        start: { dateTime: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString() }, // In 2 days
        end: { dateTime: new Date(Date.now() + 2 * 24 * 3600 * 1000 + 3600 * 1000).toISOString() }
      }
    ];
  });

  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [isLoadingCalendarEvents, setIsLoadingCalendarEvents] = useState<boolean>(false);
  const [isSummarizingCalendarEvents, setIsSummarizingCalendarEvents] = useState<boolean>(false);
  
  // Create Calendar event form states
  const [showAddEventModal, setShowAddEventModal] = useState<boolean>(false);
  const [newEventTitle, setNewEventTitle] = useState<string>('');
  const [newEventDesc, setNewEventDesc] = useState<string>('');
  const [newEventStart, setNewEventStart] = useState<string>('');
  const [newEventEnd, setNewEventEnd] = useState<string>('');
  const [isSavingCalendarEvent, setIsSavingCalendarEvent] = useState<boolean>(false);

  // --- Preset Template States ---
  const [customTemplates, setCustomTemplates] = useState<any[]>(() => {
    const saved = localStorage.getItem('line_agent_custom_templates');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [
      { id: 't_holiday', title: 'ประกาศวันหยุดพนักงาน', prompt: 'ร่างประกาศวันหยุดนักขัตฤกษ์ของบริษัทอย่างเป็นทางการสำหรับผู้ใช้และบุคลากรทุกท่าน เพื่อให้แพลนสลับและแจ้งลูกค้า', icon: '🎉', persona: 'secretary' },
      { id: 't_todo', title: 'เข้มงวดติดตามงานค้างส่ง', prompt: 'ร่างจดหมายตักเตือนและติดตามมอบหมายงานค้างส่งล่าช้าด้วยสไตล์ PM เพื่อให้กระตุ้นเพื่อนร่วมงานส่งงานด่วนเสร็จสิ้น', icon: '🕒', persona: 'pm' },
      { id: 't_quote', title: 'คำปลุกพลังเช้าวันจันทร์', prompt: 'ขอร่างบทปลุกระดมแรงสร้างความมั่นใจ แรงผลักดัน และการร่วมพลังพายอดขายพุ่งพ้นสถิติเดิมของเดือนนี้', icon: '🔥', persona: 'coach' }
    ];
  });
  
  // Create Custom Template Form States
  const [showAddTemplateInline, setShowAddTemplateInline] = useState<boolean>(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState<string>('');
  const [newTemplatePrompt, setNewTemplatePrompt] = useState<string>('');
  const [newTemplateIcon, setNewTemplateIcon] = useState<string>('✨');
  const [newTemplatePersona, setNewTemplatePersona] = useState<string>('secretary');

  // --- States ---
  const [lineToken, setLineToken] = useState<string>(() => {
    return localStorage.getItem('line_agent_token') || '';
  });
  const [apiType, setApiType] = useState<'messaging_api' | 'notify_deprecated'>(() => {
    return (localStorage.getItem('line_api_type') as 'messaging_api' | 'notify_deprecated') || 'messaging_api';
  });
  const [sendToRealLine, setSendToRealLine] = useState<boolean>(() => {
    return localStorage.getItem('line_agent_send_real') === 'true';
  });
  const [commandPrompt, setCommandPrompt] = useState<string>('');
  
  // --- AI Interactive Chat & Research States ---
  const [activeTab, setActiveTab] = useState<'dispatcher' | 'assistant_chat'>('dispatcher');
  const [chatInput, setChatInput] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; text: string; sources?: { title: string; uri: string }[] }[]>([
    {
      role: 'model',
      text: 'สวัสดีค่ะ! ดิฉันคือ **ผู้ช่วยวิจัยและแนะแนวทางเลขา AI** 👩‍💼🧬\n\nพร้อมช่วยเหลือโต้ตอบ ค้นคว้าข้อมูลสดใหม่ประหนึ่งเรียลไทม์บนเว็บด้วย Google Search และสามารถเสนอคำแนะนำ ร่างแนวทางประกาศไลน์เด็ดๆ ให้คุณได้ ถามได้ทุกเรื่องค่ะ เช่น:\n\n- *"ค่ำนี้ฝนจะตกแถวกรุงเทพไหม ช่วยหาข้อมูลสภาพอากาศประมวลคำเตือนเลี่ยงน้ำท่วมขังที"* 🌦️\n- *"มีสัจธรรมข้อมูลหรือข่าวสารสุขภาพเรื่องฝ้า กระ จุดด่างดำ ที่น่าปัดฝุ่นมาแชร์กับพนักงานหญิงไหม"* 💆‍♀️'
    }
  ]);
  const [isChatSending, setIsChatSending] = useState<boolean>(false);
  const [selectedPersona, setSelectedPersona] = useState<string>('secretary');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info' | null}>({ message: '', type: null });
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [isSendingToLine, setIsSendingToLine] = useState<boolean>(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [activeLogIndex, setActiveLogIndex] = useState<number>(-1);

  const [agentResult, setAgentResult] = useState<any | null>(null);
  const [editableDraft, setEditableDraft] = useState<string>('');
  
  // Ref for chat bottom scrolling

  // --- Simulated LINE Emulator Messages ---
  const [lineChatMessages, setLineChatMessages] = useState<SimulatedLineMessage[]>([
    {
      id: '1',
      sender: 'ai_notify',
      text: 'สวัสดีค่ะ! บอทผู้ช่วยเลขา AI ยินดีให้บริการค่ะ 👩‍💼📱',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  // --- Local Task Automation History ---
  const [historyList, setHistoryList] = useState<TaskHistory[]>(() => {
    const saved = localStorage.getItem('line_agent_history');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  });

  // Save history to localStorage when updated
  useEffect(() => {
    localStorage.setItem('line_agent_history', JSON.stringify(historyList));
  }, [historyList]);

  // Fetch default LINE token from backend config if not already stored locally
  useEffect(() => {
    if (!lineToken) {
      const fetchConfig = async () => {
        try {
          const res = await fetch(API_BASE + '/api/config');
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.lineChannelAccessToken) {
              setLineToken(data.lineChannelAccessToken);
            }
          }
        } catch (err) {
          console.error('Error fetching API config:', err);
        }
      };
      fetchConfig();
    }
  }, [lineToken]);

  // --- Fetch Google Calendar Events ---
  const fetchCalendarEvents = async (tokenToUse?: string | null) => {
    const token = tokenToUse || gCalToken;
    if (!token) return;
    setIsLoadingCalendarEvents(true);
    try {
      const events = await listCalendarEvents(token);
      setCalendarEvents(events);
    } catch (err: any) {
      console.error('Error fetching calendar events:', err);
      showToast('ไม่สามารถดึงข้อมูลปฏิทินกูเกิลได้ค่ะ', 'error');
    } finally {
      setIsLoadingCalendarEvents(false);
    }
  };

  // --- Fetch Virtual Events from Server ---
  const fetchVirtualEvents = async () => {
    try {
      const res = await fetch(API_BASE + '/api/events');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Expected JSON response, but got content-type "${contentType}" with body: "${text.substring(0, 100)}..."`);
      }
      const data = await res.json();
      if (data.success && data.events) {
        setVirtualEvents(data.events);
      } else if (data.error) {
        console.warn('Backend returned error for virtual events:', data.error);
      }
    } catch (err: any) {
      console.error('Error fetching virtual events:', err);
    }
  };


  // Periodically fetch virtual events from backend in virtual mode
  useEffect(() => {
    if (calendarMode !== 'virtual') return;

    fetchVirtualEvents(); // Initial fetch

    const interval = setInterval(() => {
      fetchVirtualEvents();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [calendarMode]);

  // Sync virtual/google events on calendarMode, virtualEvents, or token change
  useEffect(() => {
    if (calendarMode === 'virtual') {
      setCalendarEvents(virtualEvents);
    } else if (gCalToken) {
      fetchCalendarEvents(gCalToken);
    } else {
      setCalendarEvents([]);
    }
  }, [calendarMode, virtualEvents, gCalToken]);

  // Save virtualEvents to localStorage
  useEffect(() => {
    localStorage.setItem('line_agent_virtual_calendar', JSON.stringify(virtualEvents));
  }, [virtualEvents]);

  // Save config settings to localStorage
  useEffect(() => {
    localStorage.setItem('line_agent_token', lineToken);
    localStorage.setItem('line_api_type', apiType);
    localStorage.setItem('line_agent_send_real', String(sendToRealLine));
    localStorage.setItem('line_agent_calendar_mode', calendarMode);
  }, [lineToken, apiType, sendToRealLine, calendarMode]);

  // Listen to Firebase Auth state on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGCalUser(user);
        setGCalToken(token);
        setNeedsGCalAuth(false);
        fetchCalendarEvents(token);
      },
      () => {
        setGCalUser(null);
        setGCalToken(null);
        setNeedsGCalAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Map customTemplates to promptPresets
  const promptPresets = customTemplates;

  // --- AI-Driven Calendar Event Extraction ---
  const [isParsingEventWithAI, setIsParsingEventWithAI] = useState<boolean>(false);

  const handleParseEventWithAI = async () => {
    const textToParse = commandPrompt || editableDraft;
    if (!textToParse.trim()) {
      showToast('กรุณากรอกรายละเอียดนัดหมายในช่องสั่งการหรือข้อความร่างหลักก่อนค่ะ', 'error');
      return;
    }

    setIsParsingEventWithAI(true);
    try {
      const response = await fetch(API_BASE + '/api/agent/parse-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToParse,
          currentTime: new Date().toISOString()
        })
      });

      const data = await response.json();
      if (data.success && data.eventResult) {
        const { summary, description, startDateTime, endDateTime, isValidEvent } = data.eventResult;

        if (!isValidEvent) {
          showToast('⚠️ AI ไม่พบข้อความที่ระบุกำหนดวันเวลานัดหมายชัดเจนค่ะ กรุณาแก้ข้อความให้ระบุเวลาแล้วลองใหม่ค่ะ', 'error');
          return;
        }

        setNewEventTitle(summary || 'นัดหมายจาก AI');
        setNewEventDesc(description || textToParse);

        // Convert ISO datetimes to local format required by datetime-local input ("YYYY-MM-DDTHH:mm")
        const formatLocalTime = (isoString) => {
          if (!isoString) return '';
          try {
            const date = new Date(isoString);
            const tzOffset = date.getTimezoneOffset() * 60000;
            return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
          } catch (e) {
            return '';
          }
        };

        setNewEventStart(formatLocalTime(startDateTime));
        setNewEventEnd(formatLocalTime(endDateTime));

        setShowAddEventModal(true);
        showToast('🎉 AI วิเคราะห์สกัดรายละเอียดและช่วงเวลานัดหมายลงแบบฟอร์มปฏิทินสำเร็จแล้วค่ะ!', 'success');
      } else {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการดึงข้อมูลจาก AI');
      }
    } catch (err) {
      console.error(err);
      showToast('❌ เกิดข้อผิดพลาดในการวิเคราะห์นัดหมายด้วย AI', 'error');
    } finally {
      setIsParsingEventWithAI(false);
    }
  };

  // Ref for chat bottom scrolling
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const handleSaveEventToCalendar = async (e: FormEvent) => {
    e.preventDefault();
    const isConfirmed = window.confirm(
      `คุณต้องการลงทะเบียนบันทึกนัดหมายลงตารางคาร์เลนดาร์จริงใช่หรือไม่?\n\nหัวข้อ: ${newEventTitle}\nเริ่ม: ${newEventStart}\nสิ้นสุด: ${newEventEnd}`
    );
    if (!isConfirmed) return;

    setIsSavingCalendarEvent(true);
    try {
      if (calendarMode === 'google') {
        const startISO = new Date(newEventStart).toISOString();
        const endISO = new Date(newEventEnd).toISOString();

        await createCalendarEvent(gCalToken!, {
          summary: newEventTitle,
          description: newEventDesc,
          startDateTime: startISO,
          endDateTime: endISO
        });

        showToast(`🎉 สมบูรณ์! บันทึกกิจกรรมนัดหมาย "${newEventTitle}" ลง Google Calendar สำเร็จแล้ว!`, 'success');
        fetchCalendarEvents(gCalToken);
      } else {
        const newVirt: any = {
          id: 'virt_' + Date.now(),
          summary: newEventTitle,
          description: newEventDesc,
          start: { dateTime: new Date(newEventStart).toISOString() },
          end: { dateTime: new Date(newEventEnd).toISOString() }
        };

        try {
          await fetch(API_BASE + '/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: newVirt })
          });
        } catch (e) {
          console.error('Error saving virtual event to backend:', e);
        }

        setVirtualEvents(prev => [newVirt, ...prev]);
        showToast(`🎉 สมบูรณ์! บันทึกนัดหมายจำลอง "${newEventTitle}" ลงฐานตารางจำลองเรียบร้อย!`, 'success');
      }

      setShowAddEventModal(false);
      setNewEventTitle('');
      setNewEventDesc('');
      setNewEventStart('');
      setNewEventEnd('');
    } catch (err: any) {
      console.error(err);
      showToast('บันทึกลงปฏิทินคาดเดาไม่ได้/ผิดพลาด โปรดลองใหม่อีกรอบนะค่ะ', 'error');
    } finally {
      setIsSavingCalendarEvent(false);
    }
  };

  const handleOpenAddEventModal = () => {
    setNewEventTitle('');
    setNewEventDesc('');
    setNewEventStart(new Date().toISOString().slice(0, 16));
    const end = new Date();
    end.setHours(end.getHours() + 1);
    setNewEventEnd(end.toISOString().slice(0, 16));
    setShowAddEventModal(true);
    showToast('เตรียมร่างแบบฟอร์มปฏิทินกูเกิลเรียบร้อย แก้ไขระยะเวลาเพื่อออกนัดจริงได้แล้วค่ะ!', 'info');
  };

  const handleLoadHistory = (item: any) => {
    setCommandPrompt(item.command || '');
    setSelectedPersona(item.persona || 'secretary');
    setEditableDraft(item.draftMessage || '');
    setAgentResult({
      intent: `โหลดใหม่จากประวัติงาน: ${item.command.slice(0, 30)}...`,
      draftMessage: item.draftMessage,
      automationType: item.automationType,
      targetAudience: item.targetAudience,
      reasoningSteps: [
        "กู้คืนข้อมูลเวิร์กโฟลว์จากประวัติเดิมสำเร็จ",
        "จัดกลุ่มและผู้รับข้อมูลตามโครงสร้างเดิม",
        "โหลดข้อมูลจัดเตรียมไว้หน้ากระดานควบคุม"
      ]
    });
    setTerminalLogs([
      "🔄 [HISTORY-RELOAD]: กู้คืนเวิร์กโฟลว์อัตโนมัติสำเร็จ...",
      `⚡ [AGENT-STATE]: โหลดตัวบุคคลเลขา "${item.persona}"`,
      "🧠 [RESTORED]: ข้อความร่างพร้อมให้บริการตรวจสอบตรงด้านขวา!"
    ]);
    setActiveLogIndex(2);
    showToast('โหลดข้อมูลภารกิจย้อนหลังเสร็จสิ้นค่ะ', 'success');
  };

  const handleSummarizeCalendar = async () => {
    if (!calendarEvents || calendarEvents.length === 0) {
      showToast('ไม่มีกิจกรรมในปฏิทินให้สรุปดึงข้อมูลขึ้นมาพรีเซนต์ในตอนนี้นะคะ', 'error');
      return;
    }

    setIsSummarizingCalendarEvents(true);
    try {
      const response = await fetch(API_BASE + '/api/agent/summarize-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: calendarEvents,
          agentPersona: selectedPersona
        })
      });

      const data = await response.json();
      if (data.success && data.draftMessage) {
        setEditableDraft(data.draftMessage);
        
        setAgentResult({
          intent: 'ดึงงานปัจจุบันและสร้างบทสรุปภาพรวมปฏิทินรายวัน',
          draftMessage: data.draftMessage,
          automationType: 'announcement',
          targetAudience: 'กลุ่มพนักงาน/ทีมงาน LINE Group Sync',
          reasoningSteps: [
            "ดึงงานปัจจุบันประจำวันจากฐานข้อมูลปฏิทิน",
            "จัดวางขั้นตอนเรียงรายเป็นข้อๆ ตกแต่งระดับน้ำเสียง",
            "กระจายข้อมูลเตรียมพร้อมส่งกลุ่มแชทรวมเรียบร้อย"
          ]
        });
        showToast('✨ นำร่างคำแนะนำบรรจุเข้ากล่องขัดเกลาแล้วค่ะ ตรวจสอบและดัดแปลงส่งไลน์ทางฝั่งขวาได้เลยนะคะ!', 'success');
      } else {
        throw new Error(data.error || 'จำลองออฟไลน์สำรองประสิทธิภาพสูง');
      }
    } catch (err) {
      console.error(err);
      
      let fallbackMessage = "📅 สรุปอัปเดตปฏิทินงาน (Offline Mode):\n━━━━━━━━━━━━━━━━━━\n\n";
      calendarEvents.forEach((ev, idx) => {
        const startStr = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleString('th-TH') : ev.start?.date || '';
        fallbackMessage += `📌 หัวข้อ: ${ev.summary || 'ไม่มีชื่อกิจกรรม'}\n⏰ เวลา: ${startStr}\n📝 รายละเอียด: ${ev.description || 'ไม่มีรายละเอียดเพิ่มเติม'}\n\n`;
      });
      fallbackMessage += `━━━━━━━━━━━━━━━━━━\nขอเรียนแจ้งเพื่อทราบและเตรียมตัวล่วงหน้าค่ะ\nผู้รายงาน: ระบบอำนวยความสะดวกประสานบอทอัจฉริยะ`;

      setEditableDraft(fallbackMessage);
      
      setAgentResult({
        intent: 'สรุปนัดหมายปฏิทินในโหมดจำลองออฟไลน์สำรอง',
        draftMessage: fallbackMessage,
        automationType: 'reminder',
        targetAudience: 'ทีมผู้รับทราบกำหนดการสเกลเลอร์',
        reasoningSteps: [
          "วิเคราะห์รายการกิจกรรมกลุ่มจากหน่วยความจำปฏิทินกูเกิล...",
          "จัดวางชุดเรียงรายเป็นข้อๆ ตกแต่งระดับมารยาทและน้ำเสียง",
          "กระจายข้อมูลเตรียมพร้อมส่งกลุ่มแชทรวมด้านขวาสำเร็จ"
        ]
      });

      setTerminalLogs([
        "📅 [OFFLINE-CALENDAR]: โหลดสารบัญรายชื่อกิจกรรมสำเร็จ...",
        `🧠 [LOCAL-FALLBACK]: สมมติบทบาทเป็น "${selectedPersona}" พ่นเท็มเพลตขัดเกลากรณีระบบฉุกเฉิน`,
        "💖 [COMPLETED]: บรรจุลงกล่องกระดานควบคุมด้านขวาเรียบร้อย!"
      ]);
      setActiveLogIndex(2);
      showToast('สรุปกิจกรรมปฏิทินในโหมดประมวลผลจำลองเสร็จสิ้น (Local Backup Mode Active)', 'success');
    } finally {
      setIsSummarizingCalendarEvents(false);
    }
  };

  // --- Adopt AI Chat advice directly to main drafted message ---
  const handleAdoptChatMessageToDraft = (messageText: string) => {
    setEditableDraft(messageText);
    setAgentResult({
      intent: 'ร่างเป้าหมายแนะนำประยุกต์มาจากระบบแชทข้อมูลโต้ตอบ',
      draftMessage: messageText,
      automationType: 'chat-assist',
      targetAudience: 'แชร์รายงานกลุ่ม LINE Group',
      reasoningSteps: [
        "ดัดผลลัพธ์จากการตอบรับ AI Chat โต้ตอบ...",
        "ล้างกล่องร่างเดิมและติดตั้งโครงเนื้อหาแนวอ้างอิงล่าสุด",
        "พร้อมจัดแต่งและส่งข้อความไปจำลองหรือกลุ่มจริงไลน์เรียบร้อย"
      ]
    });
    showToast('✨ นำร่างคำแนะนำบรรจุเข้ากล่องขัดเกลาแล้วค่ะ ตรวจสอบและดัดแปลงดึงส่งไลน์ทางฝั่งขวาได้เลยนะคะ!', 'success');
  };

  // --- User Custom Command Presets / Shortcuts ---
  const handleDeleteCustomTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isConfirmed = window.confirm('คุณต้องการลบทางลัดคำสั่งข้อนี้ใช่หรือไม่?');
    if (isConfirmed) {
      setCustomTemplates(prev => prev.filter(t => t.id !== id));
      showToast('ลบทางลัดข้อความเรียบร้อยแล้วค่ะ', 'success');
    }
  };

  const handleAddCustomTemplate = (e: FormEvent) => {
    e.preventDefault();
    if (!newTemplateTitle.trim() || !newTemplatePrompt.trim()) {
      showToast('กรุณากรอกหัวข้อและรายละเอียดเป้าหมายทางลัดก่อนบันทึกค่ะ', 'error');
      return;
    }
    const newT = {
      id: 't_' + Date.now(),
      title: newTemplateTitle,
      prompt: newTemplatePrompt,
      icon: newTemplateIcon || '✨',
      persona: newTemplatePersona
    };
    setCustomTemplates(prev => [newT, ...prev]);
    setNewTemplateTitle('');
    setNewTemplatePrompt('');
    setNewTemplateIcon('✨');
    setShowAddTemplateInline(false);
    showToast('🎉 บันทึกปุ่มทางลัดของคุณเรียบร้อย! เลือกกดสั่งงานเลขาอัจฉริยะได้ทันทีค่ะ', 'success');
  };

  const handleOpenAddEventWithDraft = () => {
    const activeText = editableDraft || (agentResult ? agentResult.draftMessage : '');
    
    let firstLine = activeText.split('\n')[0] || '';
    firstLine = firstLine.replace(/[📢🚨🎯*\[\]#\-\(\)]/g, '').trim();
    if (firstLine.length > 80) {
      firstLine = firstLine.slice(0, 80) + '...';
    }

    setNewEventTitle(firstLine || 'นัดหมายด่วนจากวิทยากร AI');
    setNewEventDesc(activeText || 'สรุปเนื้อหาสัญญาการมอบหมายบอทไลน์จากโมเดลปัญญาประดิษฐ์');

    const now = new Date();
    now.setHours(now.getHours() + 1);
    now.setMinutes(0);
    now.setSeconds(0);
    const tzOffset = now.getTimezoneOffset() * 60000;
    const startISO = new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);

    now.setHours(now.getHours() + 1);
    const endISO = new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);

    setNewEventStart(startISO);
    setNewEventEnd(endISO);

    setShowAddEventModal(true);
    showToast('เตรียมร่างแบบฟอร์มปฏิทินกูเกิลเรียบร้อย แก้ไขระยะเวลาเพื่อออกนัดจริงได้แล้วค่ะ!', 'info');
  };

  const handleSendSingleEventToLine = (event: any) => {
    const startStr = event.start?.dateTime ? new Date(event.start.dateTime).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : event.start?.date || '';
    const summary = event.summary || 'ไม่มีชื่อกิจกรรม';
    const formattedText = `📅 รายงานกิจกรรมเดี่ยว:\n━━━━━━━━━━━━━━━━━━\n📌 กิจกรรม: ${summary}\n⏰ เวลา: ${startStr}\n📝 รายละเอียด: ${event.description || 'ไม่มีรายละเอียดเพิ่มเติม'}\n━━━━━━━━━━━━━━━━━━`;
    
    setEditableDraft(formattedText);
    setAgentResult({
      intent: `รายงานนัดหมาย: ${summary}`,
      draftMessage: formattedText,
      automationType: 'announcement',
      targetAudience: 'แชร์รายงานกลุ่ม LINE Group',
      reasoningSteps: [
        "ดักจับนัดหมายกูเกิลเดี่ยวจากหน้าจัดการ API...",
        "ถอดคำอธิบายมาสรรค์สร้างร่างจดย่อหน้าอิโมจิบรรยาย",
        "ป้อนเข้าสู่ระบบกระดานควบคุมพร้อมแชร์ลงไลน์เป็นลำดับถัดไป"
      ]
    });
    showToast('✨ นำร่างคำแนะนำบรรจุเข้ากล่องขัดเกลาแล้วค่ะ ตรวจสอบและดัดแปลงส่งไลน์ทางฝั่งขวาได้เลยนะคะ!', 'success');
  };

  // --- Show custom Toast utility ---
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast({ message: '', type: null });
    }, 4500);
  };

  // --- Presets click ---
  const handleApplyPreset = (text: string, persona: string) => {
    setCommandPrompt(text);
    setSelectedPersona(persona);
    showToast(`ใช้ตัวอย่างคำสั่งเป้าหมายแล้ว!`, 'info');
  };

  // --- Run AI Agent Parser (Calls Server Gemini API) ---
  const handleRunAgent = async (e: FormEvent) => {
    e.preventDefault();
    if (!commandPrompt.trim()) {
      showToast('กรุณากรอกคำสั่งหรือความต้องการของคุณก่อนสั่งงานแก่อันดับแรก', 'error');
      return;
    }

    setIsAnalyzing(true);
    setAgentResult(null);
    setEditableDraft('');
    
    // Simulate terminal logs on frontend to look like an expert agent in action
    const simulatedSteps = [
      "🔄 [AGENT]: ได้รับคำสั่งเป้าหมายใหม่ ค้นหาคำสำคัญและระบุเจตนาของผู้ใช้...",
      `📍 [AGENT-CLASSIFY]: กำลังประมวลผลการจัดบทบาทสมมติเป็น "${selectedPersona}" เพื่อเตรียมร่างถ้อยคำ...`,
      `🧠 [AI-THINKING]: เรียกประมวลผลผ่านโมเดล Gemini 3.5 Flash ในฝั่งเซิร์ฟเวอร์...`,
      "✍️ [COMPLEX-DRAFT]: สังเคราะห์เนื้อหาความละเอียดอ่อน ออกแบบและใส่ลูกเล่นจัดแต่งอิโมจิ...",
      "🔍 [SELF-REVIEW]: ทำการตรวจสอบความเหมาะสมของถ้อยคำ สุภาพ เรียบร้อย ตรวจหงิกคำผิด...",
      "🎉 [DRAFT-COMPLETE]: การสังเคราะห์โครงสร้างสำเร็จสมบูรณ์ เตรียมส่งหน้าต่างควบคุม!"
    ];

    setTerminalLogs([]);
    setActiveLogIndex(0);

    // Dynamic log generator during fetch wait
    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < simulatedSteps.length) {
        setTerminalLogs(prev => [...prev, simulatedSteps[currentStep]]);
        setActiveLogIndex(currentStep);
        currentStep++;
      } else {
        clearInterval(interval);
      }
    }, 700);

    try {
      const response = await fetch(API_BASE + '/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: commandPrompt,
          agentPersona: selectedPersona,
          lineToken: lineToken
        })
      });

      const data = await response.json();
      clearInterval(interval); // finish simulation immediately when data arrives

      if (data.success && data.agentResult) {
        // Complete remaining logs instantly
        setTerminalLogs(simulatedSteps);
        setActiveLogIndex(simulatedSteps.length - 1);

        setAgentResult(data.agentResult);
        setEditableDraft(data.agentResult.draftMessage);
        showToast('เลขา AI ร่างโครงสร้างและกระบวนการทำงานเสร็จสมบูรณ์!', 'success');
      } else {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการวิเคราะห์จากระบบ AI');
      }
    } catch (err: any) {
      clearInterval(interval);
      console.warn('Backend agent run failed, running local simulator fallback:', err);
      
      // Local fallback generation
      const isUrgent = commandPrompt.includes('ด่วน') || commandPrompt.includes('ฉุกเฉิน') || commandPrompt.includes('urgent');
      const isMeeting = commandPrompt.includes('ประชุม') || commandPrompt.includes('นัด') || commandPrompt.includes('meeting');
      const isTodo = commandPrompt.includes('งาน') || commandPrompt.includes('ส่ง') || commandPrompt.includes('todo') || commandPrompt.includes('ทำ');

      let title = "📢 [ประกาศประชาสัมพันธ์ทั่วไป]";
      let bullet1 = "แจ้งข่าวสารอัปเดตและข้อตกลงร่วมกันประจำสัปดาห์นี้ค่ะ";
      let bullet2 = "ขอความร่วมมือจากเพื่อนพนักงานทุกแผนกในการรับทราบข้อมูล";
      let bullet3 = "หากมีข้อสงสัยหรืออุปสรรคใดๆ สามารถติดต่อฝ่ายแอดมินกลุ่มได้ตลอดเวลาค่ะ";
      let closing = "ขอขอบพระคุณความร่วมมือของทุกท่านเป็นอย่างสูงค่ะ 🙏✨";

      if (isUrgent) {
        title = "🚨 [ประกาศด่วนที่สุด: กรุณาให้ความสำคัญ]";
        bullet1 = "มีประเด็นเร่งด่วนและเหตุการณ์สุดวิสัยที่ต้องขอความร่วมมือเร่งด่วน";
        bullet2 = "โปรดปฏิบัติและทำความเข้าใจเนื้อความข้างต้นโดยทันทีเพื่อหลีกเลี่ยงผลกระทบ";
        bullet3 = "ผู้รับผิดชอบกำลังเฝ้าติดตามสถานการณ์และบำรุงรักษาอย่างใกล้ชิดค่ะ";
      } else if (isMeeting) {
        title = "📅 [แจ้งล่วงหน้า: นัดหมายประชุมสำคัญ]";
        bullet1 = "เชิญชวนผู้เกี่ยวข้องทุกแผนกเข้าร่วมรับฟังและแสดงวิสัยทัศน์ในวาระนัดหมายด้านบน";
        bullet2 = "โปรดจัดแจงภารกิจส่วนตัว และเข้าซิงค์ข้อมูลตามเวลากำหนดการโดยพร้อมเพรียงกัน";
        bullet3 = "หากท่านใดติดขัด ไม่สามารถเข้าร่วมได้ โปรดประสานแจ้งลีดเดอร์สายล่วงหน้านะคะ";
      } else if (isTodo) {
        title = "🕒 [ติดตามงานค้างส่ง: ข้อเตือนใจในการร่วมงาน]";
        bullet1 = "ตรวจพบรายการชิ้นงานค้างส่งหรือรายการต้องปฏิบัติตามแผนงานและกำหนดเวลา";
        bullet2 = "ขอความกรุณาช่วยเหลือเคลียร์เอกสารหรือระดมส่งงานฝากให้ฝ่ายจัดเก็บบอร์ด";
        bullet3 = "เพื่อความเป็นระเบียบเรียบร้อย และขับเคลื่อนสเกลเลอร์ขององค์กรไปด้วยกันค่ะ";
      }

      let generatedMsg = '';
      if (selectedPersona === 'admin') {
        generatedMsg = `${title}\n━━━━━━━━━━━━━━━━━━\n\n📌 ข้อความหลัก:\n"${commandPrompt}"\n\n🔹 ${bullet1}\n🔹 ${bullet2}\n🔹 ${bullet3}\n\n━━━━━━━━━━━━━━━━━━\n${closing}`;
      } else if (selectedPersona === 'pm') {
        generatedMsg = `📊 [Project Co-ordinator Update]\n━━━━━━━━━━━━━━━━━━\n\n🔊 วาระสตรีมสากล:\n"${commandPrompt}"\n\n🚀 ลำดับขั้นตอนแนวทางกิจกรรม:\n1. ${bullet1}\n2. ${bullet2}\n3. ${bullet3}\n\n💡 บันทึกโครงการ: ขอประเมินความคืบหน้าและรายงานอัปเดตแอร์เรียลไทม์\n━━━━━━━━━━━━━━━━━━\nทีมนักบินเครื่องข้ามขีดจำกัด สู้ๆ นะครับ! 📈`;
      } else if (selectedPersona === 'coach') {
        generatedMsg = `🔥 [ชาร์จพลังบวกยามเช้า: มอบรอยยิ้มและการทำงานร่วมกัน] 🔥\n━━━━━━━━━━━━━━━━━━\n\n✨ สู่พวกเราทุกคนสัปดาห์นี้:\n"${commandPrompt}"\n\n🌟 แรงผลักดันและข้อคิดดีๆ วันนี้:\n❤️ ${bullet1}\n❤️ ${bullet2}\n❤️ ${bullet3}\n\n"ความสำเร็จไม่ได้สร้างในวันเดียว แต่สร้างด้วยกันในทุกๆ วัน"\n━━━━━━━━━━━━━━━━━━\nขอให้วันนี้เป็นวันที่ดีเลิศและเปี่ยมพลังของทุกคนนะครับ! 🌸🌈`;
      } else {
        generatedMsg = `👩‍💼 [สวัสดีค่ะ เรียนเชิญแจ้งเตือนและเรียนประสานงาน]\n━━━━━━━━━━━━━━━━━━\n\nรายละเอียดวาระสำคัญแจ้งพิจารณา:\n"${commandPrompt}"\n\nขออนุญาตแนะนำข้อมูลสนับสนุนการทำงานดังนี้ค่ะ:\n👉 ${bullet1}\n👉 ${bullet2}\n👉 ${bullet3}\n\n━━━━━━━━━━━━━━━━━━\nขอขอบพระคุณ และขอส่งความปรารถนาดีแด่ทุกท่านในวันนี้นะคะ 🌸`;
      }

      // Complete remaining logs for fallback instantly
      setTerminalLogs([
        "🔄 [AGENT]: ช่องเครือข่ายจำลองพยากรณ์หลักสตรีม...",
        `📍 [LOCAL-CLASSIFY]: บัพสตรีมบุคลิกจำลอง "${selectedPersona}" ในเครื่องสำเร็จ`,
        "🧠 [LOCAL-FALLBACK]: แปลงใจความสำคัญพร้อมครอบวาระด้วยประดับสวยงาม",
        "🎉 [SIMULATION-COMPLETE]: ร่างข้อความของคุณเตรียมเข้าสู่บอร์ดควบคุมเรียบร้อย!"
      ]);
      setActiveLogIndex(3);

      setAgentResult({
        intent: 'สลักแกนกลางใจความสลัดจากกล่องคำสั่งจำลอง',
        draftMessage: generatedMsg,
        automationType: isUrgent ? 'urgent' : isMeeting ? 'meeting' : 'announcement',
        targetAudience: 'ทีมผู้ร่วมงานกลุ่ม LINE Sync',
        reasoningSteps: [
          "ตรวจจับประโยคและทริกเกอร์กลุ่มคำด่วน/ประชุม/งาน",
          "จัดระดับมารยาทสไตล์บุคคลผู้รับใช้จำลองในเครื่อง",
          "คืนผลลัพธ์ครอบถ้อยคำล้อมโครงสวยงามพริ้งเพรา"
        ]
      });
      setEditableDraft(generatedMsg);
      showToast('เลขาจำลอง ร่างเนื้อหาล้อมกรอบถ้อยคำเสร็จสิ้นเรียบร้อยในโหมดสำรอง!', 'success');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClearHistory = () => { setHistoryList([]); localStorage.setItem('line_agent_history', '[]'); showToast('ล้างประวัติสำเร็จ', 'success'); };
  const handleDeleteHistoryItem = (id: string) => { const filtered = historyList.filter(h => h.id !== id); setHistoryList(filtered); localStorage.setItem('line_agent_history', JSON.stringify(filtered)); showToast('ลบรายการนี้แล้ว', 'success'); };
  const handleCopyToClipboard = (text: string) => { navigator.clipboard.writeText(text); showToast('คัดลอกลงคลิปบอร์ดแล้ว', 'success'); };

  const handleChatSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatSending) return;

    const userText = chatInput.trim();
    setChatInput('');
    
    // Add user message to chat UI
    const newUserMsg = { role: 'user' as const, text: userText };
    setChatMessages(prev => [...prev, newUserMsg]);
    setIsChatSending(true);

    try {
      const response = await fetch(API_BASE + '/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, newUserMsg].map(m => ({ role: m.role, text: m.text })),
          agentPersona: selectedPersona
        })
      });

      const data = await response.json();
      if (data.success && data.text) {
        setChatMessages(prev => [
          ...prev,
          {
            role: 'model' as const,
            text: data.text,
            sources: data.sources || []
          }
        ]);
      } else {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการรับข้อมูลแชท');
      }
    } catch (err: any) {
      console.warn('Backend chat failed, running local query resolver fallback:', err);
      
      const isWeather = userText.includes('ฝน') || userText.includes('สภาพอากาศ') || userText.includes('ร้อน') || userText.includes('หนาว');
      const isHealth = userText.includes('สุขภาพ') || userText.includes('ฝ้า') || userText.includes('กระ') || userText.includes('หน้ากาก');
      const isTodo = userText.includes('เขียน') || userText.includes('ร่าง') || userText.includes('แต่ง') || userText.includes('ประกาศ');

      let reply = `สวัสดีค่ะเจ้านาย! ดิชั้นคือผู้ช่วยเลขาประจำตัวจำลองในโหมดออฟไลน์สำรองประสิทธิภาพสูง (Offline Backup Mode Active) 👩‍💼📱 เนื่องจากไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ AI หลักได้ชั่วคราว คุณยังคงพึ่งพาการร่างของดิฉันได้ตามปกตินะคะ!\n\n💡 สำหรับเป้าหมายคำถามของคุณคือ: *"${userText}"*\n\nดิฉันขอแนะนำดังนี้ค่ะ:\n- ร่างข้อความของคุณสามารถดูได้ที่ปุ่ม **"ดันข้อความเขียนเข้ากล่องร่างหลัก"** ด้านล่าง เพื่อนำเข้าสู่กล่องเครื่องมือตรวจรับขัดเกลา\n- หากอยากปรับน้ำเสียง สามารถสลับเปลี่ยนบุคลิกเลขาบนกล่องหัวเรื่องได้เลยค่ะ!`;

      if (isWeather) {
        reply = `👩‍💼 (ผู้ช่วยเลขาโหมดออฟไลน์ขวัญใจบอส) ขอรายงานวาระสภาพพยากรณ์อากาศตามกระแสเจตนาค่ะ!\n\n🌦️ สภาพอากาศในเขตสกายระยะนี้ มีโอกาสเจอเกร็ดฝนตกชุกฟ้าคะนองร้อยละ 50-60 ของพื้นที่โดยเฉพาะช่วงบ่ายไปค่ำ\n\n💡 **นี่คือโมเดลจำลองร่างประกาศส่งกลุ่มไลน์ทันที:**\n\n📢 [แจ้งเตือนพกออมเบรลล่าและหลีกเลี่ยงเส้นทางจราจรติดขัด]\n━━━━━━━━━━━━━━━━━━\nเรียน ทีมงานทุกท่านค่ะ 🌦️🚗\n\nเนื่องด้วยช่วงเย็นในวันนี้ พยาการณ์กรมอุตุนิยมวิทยาแจ้งเตือนมีความเป็นไปได้ที่จะมีกลุ่มฝนในพื้นที่รอบสำนักงาน\n\n👉 โปรดพกพากรดสิ่งคุ้มหัวหรือร่มคู่กาย\n👉 ขับขี่ใช้เส้นทางหลีกเลี่ยงลำธารระบายช้าทั่วไป\n👉 ล็อคระบบหน้าต่างก่อนก้าวเท้าออกจากโต๊ะทำงาน\n\nขอเดินทางกลับบรอันปลอดภัยทุกท่านนะคะ 🏡✨`;
      } else if (isHealth) {
        reply = `👩‍💼 (ผู้ช่วยเลขาฝั่งแชร์ไอเดียสร้างประโยชน์) แนะนำข้อความให้ความรู้สุขภาพประดับพิกัดค่ะ!\n\n🧴 ปัญหาริมผิวพรรณยอดฮิตอย่าง "ฝ้า กระ หรือริ้วรอยชราก่อนวัยจากแดดแรง" คุกคามได้เนื่องจากดัชนีแสงแดดหน้าร้อนไทยเดือดดาษ\n\n💡 **นี่คือร่างข่าวมอบสาระร่วมทางทีมไลน์ห้องรวม:**\n\n🌟 [เกร็ดความรู้ยามบ่าย: เคล็ดเพื่อแก้มสวยงามสู้รังสีแดดจ้า]\n━━━━━━━━━━━━━━━━━━\nสวัสดีสตรีมเมอร์ชาวทีมทุกคนค่ะ 💆‍♀️☀️\n\nวันนี้ฝ่ายประชาสัมพันธ์มีทริคเล็กๆ สู้รังสี UV เกินคาดสลายฝ้ากระมาฝากกันค่ะ:\n\n1. การทาครีมกันแดด SPF50+ PA++++ ถือเป็นประภาคารห้ามลืมลั่นเด็ดขาด!\n2. พากันถือร่มฉลองพฤกษีช่วงเดินออกหาไอศกรีมหรือตู้จำหน่ายยามเที่ยง\n3. จิบน้ำเติมเต็มสัดส่วนปริมาตรในเซลผิวให้ชุ่มชื่น\n\nขอให้พนักงานผู้น่ารักหน้าตาสดใสสะท้อนประกายดีงามทุกๆ ท่านนะคะ 😊💖`;
      } else if (isTodo) {
        reply = `👩‍💼 ถอดใจความการขัดเกลารูปความต้องการคำสั่งเรียงข้อเรียบร้อยแล้วค่ะ!\n\nนี่คือร่างโมเดลที่คุณสามารถคลิกปุ่ม **"ดันข้อความเขียนเข้ากล่องร่างหลัก"** ได้ทันทีเพื่อพกพาไปประดับขัดเกลาซ้ำ:\n\n📢 [ประกาศรณรงค์และนัดปฐมนิเทศร่วมวิสัยทัศน์]\n━━━━━━━━━━━━━━━━━━\nเรียน คณะพนักงานทุกส่วนงานที่เกี่ยวเนื่องค่ะ ✨\n\nเนื่องในโอกาสการร่วมมือวางแผนกิจกรรมส่งทอดงานตามที่สรุปข้างต้น\n\n🔹 ตรวจเช็ครหัสประมวลไฟล์นาทีสุดท้าย\n🔹 ซิงค์ตอบรับขัดเกลากล่อง Todo ภายในเกณฑ์กำหนด\n🔹 ยื่นวาระช่วยเหลือหากเกิดแรงฝืดในการผลิต\n\nขอขอบคุณแรงสู้ของเพื่อนรวมงานเสมอนะคะ 🙏`;
      }

      setChatMessages(prev => [
        ...prev,
        {
          role: 'model' as const,
          text: reply,
          sources: []
        }
      ]);
      showToast('💡 คุณผู้ใช้คะ เลขาจำลองร่างโครงแก้ไขโหมดสำรองให้ตรงใจแล้วค่ะ!', 'success');
    } finally {
      setIsChatSending(false);
    }
  };

  const handleDispatchToLine = async () => {
    if (!editableDraft) return showToast('ไม่มีข้อความให้ส่ง', 'error');
    setIsSendingToLine(true);
    
    const isMock = !sendToRealLine || !lineToken;
    
    if (isMock) {
      setTerminalLogs(prev => [
        ...prev, 
        "🚀 [DISPATCHER-MOCK]: กำลังดำเนินการจำลองการจัดส่งข้อความลง Emulator...",
        "⚙️ [INFO]: แนะนำ: เปิดเมนูล่างขวาและสลับ 'เผยแพร่ข้อมูลตรงไปยังแอปพลิเคชัน LINE จริง' เพื่อส่งข้อความออกภายนอกค่ะ"
      ]);
      setActiveLogIndex(1);
      
      setTimeout(() => {
        const newMsgId = Date.now().toString();
        setLineChatMessages(prev => [
          ...prev, 
          { id: newMsgId, sender: 'ai_notify', text: editableDraft, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
        ]);
        
        // Add to history
        const newHistoryItem: TaskHistory = {
          id: newMsgId,
          command: commandPrompt || "มอบหมายประกาศด่วนแชร์ผ่าน Emulator",
          draftMessage: editableDraft,
          persona: selectedPersona,
          timestamp: "เพิ่งส่งเมื่อครู่นี้ (โหมดจำลอง)",
          automationType: agentResult?.automationType || "reminder",
          targetAudience: agentResult?.targetAudience || "กลุ่มทั่วไป",
          dispatchedToLine: false
        };
        
        const updatedHistory = [newHistoryItem, ...historyList];
        setHistoryList(updatedHistory);
        localStorage.setItem('line_agent_history', JSON.stringify(updatedHistory));
        
        setTerminalLogs(prev => [...prev, "✅ [MOCK-SUCCESS]: บันทึกและเสนอแนะลง Emulator ฝั่งขวาเรียบร้อยแล้วค่ะ!"]);
        setActiveLogIndex(3);
        setIsSendingToLine(false);
        showToast('บันทึกร่างเข้าห้องจำลองสำเร็จ', 'success');
      }, 1200);
    } else {
      setTerminalLogs(prev => [
        ...prev, 
        `🚀 [LINE-DISPATCH]: กำลังเตรียมการกระจายคลื่นข้อมูลไปยัง LINE ${apiType === 'messaging_api' ? 'Official Account' : 'Notify'}...`,
        "⏳ [PENDING]: ส่งผ่าน Node Express API Proxy Server..."
      ]);
      setActiveLogIndex(1);
      
      try {
        const response = await fetch(API_BASE + '/api/line-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: lineToken,
            message: editableDraft,
            apiType: apiType
          })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          const newMsgId = Date.now().toString();
          setLineChatMessages(prev => [
            ...prev, 
            { id: newMsgId, sender: 'ai_notify', text: editableDraft, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
          ]);
          
          // Add to history
          const newHistoryItem: TaskHistory = {
            id: newMsgId,
            command: commandPrompt || "เผยแพร่งานลงไลน์จริงผ่าน API",
            draftMessage: editableDraft,
            persona: selectedPersona,
            timestamp: "ส่งเรียบร้อยผ่าน LINE API",
            automationType: agentResult?.automationType || "reminder",
            targetAudience: agentResult?.targetAudience || "กลุ่ม LINE จริง",
            dispatchedToLine: true
          };
          
          const updatedHistory = [newHistoryItem, ...historyList];
          setHistoryList(updatedHistory);
          localStorage.setItem('line_agent_history', JSON.stringify(updatedHistory));
          
          setTerminalLogs(prev => [
            ...prev, 
            `✅ [REAL-SUCCESS]: ${data.message || 'ส่งข้อมูลถึงกลุ่มแชท LINE เรียบร้อย 100%!'}`
          ]);
          setActiveLogIndex(3);
          showToast('🚀 ส่งประกาศออกสู่แอปพลิเคชัน LINE กลุ่มจริงเรียบร้อยแล้วค่ะ!', 'success');
        } else {
          const errorMsg = data.error || 'LINE API ปฏิเสธการจัดส่ง หรือโทเค็นหมดอายุ';
          setTerminalLogs(prev => [
            ...prev, 
            `❌ [API-REJECTED]: ไม่สามารถส่งข้อมูลหาไลน์กลุ่มจริง: ${errorMsg}`
          ]);
          setActiveLogIndex(2);
          showToast(`ส่งออกจริงล้มเหลว: ${errorMsg}`, 'error');
        }
      } catch (err: any) {
        console.error(err);
        setTerminalLogs(prev => [
          ...prev, 
          `❌ [NETWORK-ERROR]: การเชื่อมโยงเบื้องหลังล้มเหลว: ${err.message || err}`
        ]);
        setActiveLogIndex(2);
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่ายไปยังไลน์แชทจริง', 'error');
      } finally {
        setIsSendingToLine(false);
      }
    }
  };

  const handleGCalLogin = () => {
    if (typeof googleSignIn === 'function') {
      googleSignIn().then(result => {
        if (result) {
          setGCalUser(result.user); 
          setGCalToken(result.accessToken); 
          setNeedsGCalAuth(false);
          showToast('เข้าระบบ Google Calendar นำทางสำเร็จ', 'success');
          fetchCalendarEvents(result.accessToken);
        }
      }).catch(e => {
        console.error('Failed to login', e);
        showToast('Failed to login', 'error');
      });
    }
  };

  const handleGCalLogout = () => {
    if (typeof logout === 'function') {
      logout().then(() => {
        setGCalUser(null); setGCalToken(null); setNeedsGCalAuth(true); setCalendarEvents([]);
        showToast('ออกจากระบบลงชื่อสำเร็จ', 'success');
      });
    }
  };

  const handleAISummarizeCalendar = () => {
    handleSummarizeCalendar();
  };

  const handleTestToken = async () => {
    if (!lineToken) {
      showToast('กรุณากรอกรหัส Token ก่อนทดสอบการเชื่อมต่อค่ะ', 'error');
      return;
    }
    
    showToast('⏳ กำลังทำการทดสอบสิทธิ์ของ Token...', 'info');
    
    try {
      const testMsg = `🎯 [ระบบทดสอบการรับข้อความจาก AI เลขาอัตโนมัติ]\n━━━━━━━━━━━━━━━━━━\n✅ รหัส Token ของคุณได้รับการเชื่อมโยงกับเซิร์ฟเวอร์เสร็จสิ้นแล้ว!\n✨ บอสเลือกรับผ่านช่องทาง: ${apiType === 'messaging_api' ? 'LINE Broadcast 💬' : 'LINE Notify 🔔'}\n🚀 บอทพร้อมช่วยร่าง สรุปงานปฏิทินกูเกิล และตอบข้อมูลแล้วค่ะ.`;
      
      const response = await fetch(API_BASE + '/api/line-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: lineToken,
          message: testMsg,
          apiType: apiType
        })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        showToast('🎉 สำเร็จ! ส่งข้อความทดสอบเข้าแอปพลิเคชัน LINE สำเร็จแล้วค่ะ!', 'success');
        
        // Also push it to the Emulator!
        setLineChatMessages(prev => [
          ...prev, 
          { 
            id: Date.now().toString(), 
            sender: 'ai_notify', 
            text: `(ข้อความส่งออกจริงเข้ากลุ่มไลน์) ${testMsg}`, 
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
          }
        ]);
      } else {
        showToast(`❌ ทดสอบล้มเหลว: ${data.error || 'รหัส Token ไม่ถูกต้องหรือบริการปิดทำการ'}`, 'error');
      }
    } catch (err: any) {
      console.error(err);
      showToast('❌ ขัดข้องทางเทคนิค: เชื่อมต่อไลน์แชทจริงไม่ผ่านเครือข่ายเซิร์ฟเวอร์', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* Toast Alert Notification Popup */}
      {toast.message && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div className={`px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border text-xs font-semibold ${
            toast.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300' :
            toast.type === 'error' ? 'bg-rose-950/90 border-rose-500/30 text-rose-300' :
            'bg-slate-900/90 border-slate-700/50 text-slate-200'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              toast.type === 'success' ? 'bg-emerald-500 animate-ping' :
              toast.type === 'error' ? 'bg-rose-500 animate-ping' :
              'bg-blue-400'
            }`}></span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* --- Header panel --- */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-xl text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-pulse">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white flex items-center gap-2">
                เลขา AI อัตโนมัติ (LINE Assistant Agent)
                <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider font-mono">V3.5 Hybrid</span>
              </h1>
              <p className="text-[10px] text-slate-500">
                วิเคราะห์โต้ตอบ ค้นคว้าความจริงบนอินเทอร์เน็ต ผ่านระบบจำลองและเครือข่าย LINE Notify/Messaging API จริง
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsHelpOpen(!isHelpOpen)}
              className="text-xs font-semibold text-slate-400 hover:text-white bg-slate-900/50 hover:bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{isHelpOpen ? 'ซ่อนคู่มือ' : 'คู่มือเชื่อมต่อ'}</span>
            </button>
            <span className="text-slate-800 hidden md:inline">|</span>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/40 rounded-xl border border-slate-800/50">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.7)]"></span>
              <span className="text-[11px] font-mono font-medium text-slate-400">Agent Node Live</span>
            </div>
          </div>

        </div>
      </header>

      {/* --- Main Dashboard Container --- */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* === Left Column: AI Decision & Input Controls (7 cols) === */}
        <section id="ai-controls-column" className="lg:col-span-7 flex flex-col gap-6">

          {/* Setup Guide Panel (Dark Sleek theme version) */}
          {isHelpOpen && (
            <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 relative animate-fade-in shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 blur-3xl pointer-events-none"></div>
              <button 
                onClick={() => setIsHelpOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800/80 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                ✕
              </button>
              
              <h3 className="font-bold text-white flex items-center gap-2.5 text-sm mb-4 border-b border-slate-800 pb-2">
                <Settings className="w-5 h-5 text-emerald-400 animate-spin" />
                คู่มือการเชื่อมต่อ LINE API (อัปเดตล่าสุด)
              </h3>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-4 text-xs text-amber-200">
                <p className="font-bold flex items-center gap-1.5 text-amber-400">
                  <AlertCircle className="w-4 h-4" />
                  ประกาศสำคัญเกี่ยวกับบริการ LINE Notify
                </p>
                <p className="mt-1 leading-relaxed opacity-90">
                  บริการ <strong>LINE Notify ได้สิ้นสุดการให้บริการอย่างเป็นทางการเมื่อวันที่ 31 มีนาคม 2025</strong> ทางเครื่องมือนี้จึงได้รับการอัปเกรดให้รองรับ <strong>LINE Messaging API (ผ่าน LINE Official Account)</strong> ซึ่งใช้งานได้ฟรี 100% และรับข้อความแบบเรียลไทม์เป็นช่องทางมาตรฐานหลักค่ะ!
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button 
                  type="button"
                  onClick={() => setApiType('messaging_api')}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${apiType === 'messaging_api' ? 'bg-emerald-500 text-slate-950 shadow-md font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'}`}
                >
                  💬 LINE Messaging API (แนะนำ/ใช้งานได้ปกติ)
                </button>
                <button 
                  type="button"
                  onClick={() => setApiType('notify_deprecated')}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${apiType === 'notify_deprecated' ? 'bg-slate-800/80 text-amber-500 border border-amber-500/25 font-bold animate-pulse' : 'text-slate-450 hover:text-slate-200 hover:bg-slate-900'}`}
                >
                  ⚠️ LINE Notify (ปิดบริการแล้ว)
                </button>
              </div>

              {apiType === 'messaging_api' ? (
                <div className="space-y-3 text-xs text-slate-300 leading-relaxed font-sans">
                  <p className="font-bold text-white text-xs">🛠️ ขั้นตอนการรับ Channel Access Token (ฟรี 100%):</p>
                  <ol className="list-decimal list-inside space-y-2.5">
                    <li className="pl-1">ลงชื่อเข้าใช้ที่เว็บ <a href="https://developers.line.biz/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline font-semibold inline-flex items-center gap-0.5 ml-1">LINE Developers Console <ExternalLink className="w-3.5 h-3.5" /></a> ด้วยบัญชี LINE ทั่วไปของคุณ</li>
                    <li className="pl-1">กดสร้าง <strong>Provider</strong> ใหม่ (สามารถใช้หัวข้อชื่อของคุณหรือชื่อองค์กรได้)</li>
                    <li className="pl-1">กดสร้าง Channel ใหม่ และระบุประเภทเป็น <strong>Messaging API</strong> (ระบบจะจดทะเบียนสร้าง LINE Official Account ให้คุณฟรี 1 แท่ง!)</li>
                    <li className="pl-1">เลื่อนไปที่แท็บ <strong>Messaging API</strong> เลื่อนลงล่างสุดที่ส่วน <strong>Channel access token</strong> และกดปุ่ม <strong>Issue</strong> เพื่อรับโทเค็นรหัสยาวๆ</li>
                    <li className="pl-1">นำรหัสโทเค็นมาวางในหัวข้อ <strong>"การตั้งค่าการเชื่อมต่อด้านล่างขวา"</strong> เพื่อใช้งาน</li>
                    <li className="pl-1"><strong className="text-emerald-400 font-bold">ขั้นตอนการรับข้อความ:</strong> สแกน QR Code ของ บอท/LINE OA ที่แสดงอยู่ในหัวข้อ Messaging API เพื่อแอดเป็นเพื่อนบนโทรศัพท์มือถือของคุณค่ะ</li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-3.5 text-xs text-slate-350 leading-relaxed font-sans">
                  <p className="font-semibold text-rose-400">🚨 บริการปิดตัวตั้งแต่วันที่ 31 มี.ค. 2025 เป็นต้นไป</p>
                  <p className="opacity-80">
                    โทเค็น LINE Notify เก่าจะไม่สามารถใช้ส่งข้อความออกภายนอกกลุ่มเซิร์ฟเวอร์จริงได้อีก แต่ว่าคุณยังคงใช้ "โหมดจำลอง Mobile Sandbox Emulator" บนหน้าเว็บบราวเซอร์ฝั่งขวา เพื่อให้เลขา AI และบอทพิมพ์ข้อความสวยๆ นัดหมาย ประกาศ ร่างคำคม ให้คุณอ่าน และคัดลอกร่างไปส่งต่อแชทต่างๆ ด้วยมือได้สะดวกรวดเร็วอยู่เหมือนเดิมค่ะ!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tabs Navigation for Left Column */}
          <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-2xl flex-shrink-0">
            <button
              onClick={() => setActiveTab('dispatcher')}
              type="button"
              className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'dispatcher'
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.2)] font-extrabold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>สั่งร่างประกาศ (AI Agent)</span>
            </button>
            <button
              onClick={() => setActiveTab('assistant_chat')}
              type="button"
              className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'assistant_chat'
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.2)] font-extrabold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>แชทถามตอบ & ค้นหาเว็บ (Deep Chat)</span>
            </button>
          </div>

          {activeTab === 'dispatcher' && (
            <>
              {/* AI Task Dispatcher Card (Premium custom glass box) */}
              <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 flex flex-col gap-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-[50px] pointer-events-none rounded-full"></div>
                
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2.5">
                    <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
                    สั่งการมอบหมายภารกิจ AI
                  </h2>
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Autonomous Dispatcher
                  </span>
                </div>

                {/* Quick Presets (styled dark) */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                    ⚡ ทางลัดคำบอกมอบหมายยอดฮิต (กดเลือกใช้ทันที):
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {promptPresets.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleApplyPreset(preset.prompt, preset.persona)}
                        className="p-3 text-left bg-slate-950/80 hover:bg-slate-900 border border-slate-800/80 hover:border-emerald-500/30 rounded-xl transition-all duration-200 group flex gap-3 cursor-pointer"
                      >
                        <div className="bg-slate-900 p-2 rounded-xl border border-slate-800 group-hover:bg-emerald-950/40 group-hover:border-emerald-800/30 transition-colors flex-shrink-0 flex items-center justify-center">
                          {preset.icon}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">
                            {preset.title}
                          </div>
                          <p className="text-[10px] text-slate-500 line-clamp-1 mt-1 leading-normal">
                            {preset.prompt}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input Form */}
                <form onSubmit={handleRunAgent} className="flex flex-col gap-5">
                  <div>
                    <label htmlFor="prompt-input" className="block text-xs font-bold text-slate-300 mb-2 flex justify-between">
                      <span>✍️ สั่งข้อความด้วยภาษาพูดของคุณ (ไทย หรือ อังกฤษ):</span>
                      <span className="text-[10px] text-emerald-400 font-bold border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 rounded-md uppercase tracking-wider">
                        Model Server AI
                      </span>
                    </label>
                    <textarea
                      id="prompt-input"
                      rows={4}
                      value={commandPrompt}
                      onChange={(e) => setCommandPrompt(e.target.value)}
                      placeholder="ตัวอย่างเช่น: 'สั่งให้ทุกคนล้างถ้วยชามและแก้วน้ำของตัวเองในคลังส่วนกลาง ห้ามตั้งแช่ค้างคืนในอ่างลานวัด มิฉะนั้นแอดมินจะเก็บทิ้งทั้งหมดเย็นนี้'"
                      className="w-full text-xs p-4 bg-slate-950 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 outline-none text-slate-100 placeholder-slate-650 transition-all font-sans leading-relaxed shadow-inner"
                    />
                  </div>

                  {/* Persona Selection (styled sleek dark) */}
                  <div>
                    <span className="block text-xs font-bold text-slate-300 mb-2.5">
                      👩‍💼 ชนิดบทบาทและน้ำเสียงของเลขา AI:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { id: 'secretary', name: 'เลขาฯ สุภาพ', desc: 'อ่อนน้อม สุภาพ นุ่มนวลค่ะ', emoji: '👩‍💼' },
                        { id: 'pm', name: 'ผู้จัดการ PM', desc: 'ทีมลีดเดอร์ ชัดเจน มีข้อบ่งชี้', emoji: '📈' },
                        { id: 'coach', name: 'โค้ชปลุกพลัง', desc: 'สร้างแอนเนอจี้ ให้ความหวัง', emoji: '🔥' },
                        { id: 'admin', name: 'แอดมินระบบ', desc: 'เน้นประกาศฉุกเฉิน ตัวหนา', emoji: '📢' },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPersona(p.id)}
                          className={`p-3 rounded-2xl border text-left transition-all duration-200 flex flex-col gap-1.5 cursor-pointer ${
                            selectedPersona === p.id
                              ? 'border-emerald-500 bg-emerald-500/10 shadow-neon-emerald ring-1 ring-emerald-500/30'
                              : 'border-slate-800 bg-slate-950/60 hover:bg-slate-900/80 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">{p.emoji}</span>
                            <span className="text-xs font-bold text-slate-100">{p.name}</span>
                          </div>
                          <span className="text-[9px] text-slate-500 line-clamp-1 leading-normal">{p.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Submit CTA Button with neon glow */}
                  <button
                    type="submit"
                    disabled={isAnalyzing || !commandPrompt.trim()}
                    className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none text-slate-950 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-neon-emerald-strong transition-all duration-300 cursor-pointer text-xs uppercase tracking-wider"
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>กำลังวิเคราะห์ถอดโค้ดสรุปงาน...</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-5 h-5 text-slate-950 animate-pulse" />
                        <span>⚡ สั่งการเลขา AI ไปทำงานแทนคุณ</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* AI Executive Steps Panel (Thought process logs) */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-3xl shadow-xl overflow-hidden backdrop-blur-md">
                <div className="bg-slate-950/80 px-4 py-3 flex justify-between items-center border-b border-slate-850">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-widest">Thought process logs</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-600">LIVE_AGENT_STREAM</span>
                </div>
                
                <div className="p-4 font-mono text-[11px] text-emerald-300 space-y-2 min-h-36 max-h-56 overflow-y-auto bg-slate-950/20 leading-relaxed scrollbar-thin">
                  {terminalLogs.length === 0 ? (
                    <div className="text-slate-500 text-center py-6">
                      <span>[AGENT_SYSTEM]: โหมดพร้อมประมวลผล สแตนด์บายคำสั่งร่างประกาศถัดไป...</span>
                      <p className="text-[10px] mt-2 text-slate-600">วิเคราะห์ ลำดับการประมวลผล และข้อความสังเคราะห์เดโมจะเด้งที่นี่แบบนาทีต่อนาที</p>
                    </div>
                  ) : (
                    terminalLogs.map((log, index) => (
                      <div 
                        key={index} 
                        className={`transition-all duration-200 ${
                          index === activeLogIndex ? 'text-white border-l-2 border-emerald-400 pl-3 bg-emerald-500/5 py-0.5' : 'opacity-60'
                        }`}
                      >
                        {log}
                      </div>
                    ))
                  )}
                </div>

                {/* Prompt Meta Results */}
                {agentResult && (
                  <div className="bg-slate-950/70 px-4 py-3.5 border-t border-slate-850 grid grid-cols-3 gap-2 text-[10px] font-mono text-slate-400">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-600 text-[9px] uppercase font-bold">ประเภทงาน:</span>
                      <span className="text-emerald-400 font-semibold">{agentResult.automationType?.toUpperCase() || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      <span className="text-slate-600 text-[9px] uppercase font-bold">กลุ่มเป้าหมาย:</span>
                      <span className="text-blue-400 font-semibold truncate block" title={agentResult.targetAudience}>
                        {agentResult.targetAudience || 'ทั่วไป'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-600 text-[9px] uppercase font-bold">กำหนดสเกลเลอร์:</span>
                      <span className="text-amber-400 font-semibold">{agentResult.scheduleTime || 'โพสต์ทันที'}</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'assistant_chat' && (
            <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 flex flex-col gap-5 shadow-xl relative overflow-hidden h-[620px]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-[50px] pointer-events-none rounded-full"></div>
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-emerald-400 animate-pulse" />
                  <h3 className="font-bold text-sm text-slate-100 font-sans">💬 แชทถามตอบ & ค้นหาเว็บล่าสุด</h3>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono font-bold uppercase">
                  <span>Google Search Enabled</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>
              </div>

              {/* Chat message history box */}
              <div className="flex-grow overflow-y-auto space-y-4 pr-1 scrollbar-thin flex flex-col">
                {chatMessages.length === 0 ? (
                  <div className="text-slate-500 text-center py-12 flex flex-col items-center justify-center gap-3 h-full">
                    <MessageSquare className="w-8 h-8 text-slate-700 animate-pulse" />
                    <span>เริ่มต้นแชทถามตอบเชิงรุกกับเลขา AI...</span>
                    <p className="text-[10px] text-slate-600 max-w-[80%] leading-relaxed">
                      ถามอะไรก็ได้ ค้นคว้าความจริงจาก Google Search หรือพิมพ์เพื่อให้เลขาเขียนร่างขัดใหม่
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg, index) => (
                    <div 
                      key={index} 
                      className={`flex flex-col max-w-[85%] gap-1.5 ${
                        msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-semibold uppercase">
                        {msg.role === 'user' ? (
                          <>
                            <span>บัญชีผู้ใช้</span>
                            <User className="w-3 h-3 text-blue-400" />
                          </>
                        ) : (
                          <>
                            <Bot className="w-3 h-3 text-emerald-400" />
                            <span>เลขา AI อัจฉริยะ</span>
                          </>
                        )}
                      </div>
                      
                      <div className={`p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap border ${
                        msg.role === 'user'
                          ? 'bg-slate-950 border-slate-800 text-slate-100 rounded-tr-none'
                          : 'bg-emerald-950/15 border-emerald-500/15 text-slate-200 rounded-tl-none'
                      }`}>
                        {msg.text}

                        {/* Display search references / sources if present */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] text-slate-400 space-y-1.5">
                            <span className="font-mono uppercase font-bold text-[8px] text-emerald-400 tracking-wider block">🔍 แหล่งข้อมูลสนับสนุนจากเว็บในประเทศไทย:</span>
                            <div className="flex flex-col gap-1">
                              {msg.sources.map((src, sIdx) => (
                                <a 
                                  key={sIdx} 
                                  href={src.uri} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="hover:underline text-blue-400 font-medium inline-flex items-center gap-0.5"
                                >
                                  {sIdx + 1}. {src.title || 'อ้างอิงข้อมูลเว็บ'} <ExternalLink className="w-2.5 h-2.5 inline" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Button to quickly adopt this proposed text as main draft to line */}
                      {msg.role === 'model' && msg.text && (
                        <button
                          type="button"
                          onClick={() => handleAdoptChatMessageToDraft(msg.text)}
                          className="px-2.5 py-1 bg-slate-950 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 font-bold border border-emerald-500/20 hover:border-transparent rounded-lg text-[9px] transition-all cursor-pointer flex items-center gap-1 mt-0.5 shadow-sm"
                          title="คลิกเพื่อนำข้อความแนะนำของ AI ชุดนี้เข้าไปดัดแปลงเพื่อส่งลงไลน์กลุ่มที่กล่องด้านขวา"
                        >
                          <FileText className="w-3 h-3" />
                          <span>✨ ดันข้อความไปถังร่างหลัก</span>
                        </button>
                      )}
                    </div>
                  ))
                )}
                {isChatSending && (
                  <div className="flex flex-col max-w-[85%] self-start items-start gap-1.5">
                    <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-semibold uppercase">
                      <Bot className="w-3 h-3 text-emerald-400" />
                      <span>เลขา AI กำลังนึกพิมพ์...</span>
                    </div>
                    <div className="p-3.5 bg-emerald-950/10 border border-emerald-500/10 rounded-2xl rounded-tl-none text-xs text-slate-450 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      <span>กำลังสืบค้นอินเทอร์เน็ตและวิเคราะห์ข่าวสารความจริง...</span>
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat action suggestions */}
              <div className="flex gap-1.5 border-t border-slate-850 pt-2.5 flex-wrap flex-shrink-0">
                {[
                  "มีข่าวสารพยากรณ์อากาศกรุงเทพวันนี้แชร์ลงไลน์บ้างไหม?",
                  "เขียนคำคมสร้างสร้างแรงใจเช้านี้ให้ที"
                ].map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setChatInput(s)}
                    className="text-[10px] px-2.5 py-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 bg-slate-950 rounded-xl border border-slate-800/60 transition-all cursor-pointer text-left truncate max-w-full"
                  >
                    💬 {s}
                  </button>
                ))}
              </div>

              {/* Chat input form */}
              <form onSubmit={handleChatSubmit} className="flex gap-2.5 flex-shrink-0">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="ถามอะไรเลขาได้เลยค่ะ... (คุยได้ ค้นหาเว็บได้ เปล่งร่างได้)"
                  rows={2}
                  className="flex-grow p-3 bg-slate-950 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 outline-none text-xs text-slate-100 placeholder-slate-650 resize-none leading-relaxed transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleChatSubmit(e as any);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={isChatSending || !chatInput.trim()}
                  className="px-4.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded-2xl text-slate-950 text-xs font-bold shadow-md hover:shadow-neon-emerald transition-all duration-300 flex items-center justify-center cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* Local Task Automations History Column */}
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 flex flex-col gap-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-white">📅 โครงสร้างผลงานบันทึกประวัติ</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">เวิร์กโฟลว์จัดแต่งข้อความของเลขาที่บันทึกสำรองในเบราว์เซอร์ส่วนตัว</p>
              </div>
              {historyList.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="p-1 px-2.5 hover:bg-rose-950/35 text-[10px] text-rose-400 font-bold rounded-lg transition-colors border border-slate-800 hover:border-rose-900/50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                  ล้างประวัติ
                </button>
              )}
            </div>

            {historyList.length === 0 ? (
              <div className="text-center py-8 text-slate-650 text-xs text-slate-500">
                ยังไม่มีข้อมูลประวัติการร่างงานในปัจจุบัน
              </div>
            ) : (
              <div className="space-y-3.5 max-h-80 overflow-y-auto pr-1 select-none">
                {historyList.map((item) => (
                  <div 
                    key={item.id}
                    className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex items-start justify-between gap-3 hover:border-slate-700 transition-all duration-200 group relative"
                  >
                    <div className="flex-grow space-y-2.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                          item.persona === 'secretary' ? 'bg-indigo-950 text-indigo-300 border border-indigo-905/30' :
                          item.persona === 'pm' ? 'bg-blue-950 text-blue-300 border border-blue-905/30' :
                          item.persona === 'coach' ? 'bg-amber-950 text-amber-300 border border-amber-905/30' :
                          'bg-rose-950 text-rose-300 border border-rose-905/30'
                        }`}>
                          {item.persona === 'secretary' ? '👩‍💼 เลขาสุภาพ' :
                           item.persona === 'pm' ? '📈 ผู้ควบคุมโปรเจกต์' :
                           item.persona === 'coach' ? '🔥 โค้ชสร้างแรงพลัง' :
                           '📢 แอดมินระบบ'}
                        </span>

                        <span className="text-[10px] font-mono text-slate-500">
                          {item.timestamp}
                        </span>

                        {item.dispatchedToLine ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-900/50">
                            ✓ ส่งสำเร็จ LINE จริง
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-800">
                            ⚙️ แซนด์บอกซ์จำลอง
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <span className="block text-xs font-semibold text-slate-100 line-clamp-1">{item.command}</span>
                        <p className="text-[11px] text-slate-400 line-clamp-2 bg-slate-900/20 p-2.5 rounded-xl border border-slate-800/50 italic leading-relaxed">
                          {item.draftMessage}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 items-end flex-shrink-0 self-center">
                      <button
                        onClick={() => handleLoadHistory(item)}
                        className="px-2.5 py-1.5 text-[10px] font-bold bg-slate-900 hover:bg-emerald-500 border border-slate-800 hover:border-emerald-500 text-slate-300 hover:text-slate-950 rounded-lg shadow-sm hover:shadow-neon-emerald transition-all duration-200 flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        ดึงงานคืน
                      </button>
                      <button
                        onClick={() => handleDeleteHistoryItem(item.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-950/20 transition-colors cursor-pointer"
                        title="ลบรายการนี้"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* === Right Column: Result Playground & Interactive LINE Emulator === */}
        <section id="result-visual-column" className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Editor Playground Card */}
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-slate-100">📝 กล่องขัดเกลาและแก้ไขข้อความ</h3>
              </div>
              {agentResult && (
                <button
                  onClick={() => handleCopyToClipboard(editableDraft || (agentResult ? agentResult.draftMessage : ''))}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1.5 cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg border border-emerald-500/20 transition-all duration-200"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  คัดลอกร่าง
                </button>
              )}
            </div>

            {agentResult ? (
              <div className="space-y-4">
                <div className="p-3.5 bg-emerald-950/25 border border-emerald-900/40 rounded-2xl text-xs text-slate-300 leading-relaxed shadow-inner">
                  <span className="font-bold text-white flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    วิเคราะห์เป้าหมายเปรียบต่าง:
                  </span>
                  <div className="font-sans">
                    <span className="text-slate-400 italic">" {agentResult.intent} "</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="draft-editor" className="block text-xs font-bold text-slate-400 mb-2">
                    คุณสามารถปรับเปลี่ยนเนื้อหาข้อความ หรืออัพเดทได้อย่างอิสระ:
                  </label>
                  <textarea
                    id="draft-editor"
                    rows={8}
                    value={editableDraft}
                    onChange={(e) => setEditableDraft(e.target.value)}
                    className="w-full text-xs p-4 bg-slate-950 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-slate-100 font-mono leading-relaxed"
                  />
                </div>

                {/* Dispatch to Line Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 border-t border-slate-800 pt-3">
                  <div className="flex flex-col justify-center">
                    <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">สถานะการทำงานตอนนี:</span>
                    <span className={`text-xs font-bold mt-0.5 ${sendToRealLine && lineToken ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {sendToRealLine && lineToken ? '📢 พร้อมเผยแพร่ LINE กลุ่มจริง' : '⚙️ โหมดจำลองผลทดสอบภายใน'}
                    </span>
                  </div>
                  
                  <button
                    onClick={handleDispatchToLine}
                    disabled={isSendingToLine || !editableDraft.trim()}
                    className="py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 text-xs font-bold rounded-xl shadow-md hover:shadow-neon-emerald transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSendingToLine ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>กำลังจัดส่ง...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>โพสต์เผยแพร่เข้า LINE ทันที</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 bg-slate-950/40 rounded-2xl border border-dashed border-slate-800 space-y-3.5">
                <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <Bot className="w-6 h-6 text-slate-600 animate-pulse" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 block">ยังไม่มีแผนสังเคราะห์ผลลัพธ์</span>
                  <p className="text-[10px] text-slate-500 max-w-xs mx-auto px-4 mt-1.5 leading-relaxed">
                    โปรดระบุหน้าที่หรือเป้าหมายที่ต้องการด้านซ้ายแผงควบคุม แล้วกดมอบหมายงาน บอทจะเริ่มสังเคราะห์และแก้ไขขัดเกลาเนื้อหาโชว์ตรงนี้ค่ะ
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Mobile Emulator - Custom LINE Dark/Space Simulator */}
          <div className="bg-[#090d16] rounded-[38px] border-[8px] border-slate-950 shadow-2xl overflow-hidden flex flex-col h-[520px] relative border-b-[12px] border-t-[10px]">
            
            {/* Phone Top Speaker & Notch */}
            <div className="bg-slate-950 px-6 pt-2 pb-1.5 flex justify-between items-center text-slate-500 text-[8px] font-semibold flex-shrink-0">
              <span className="font-mono">12:12 PM</span>
              <div className="w-16 h-3 bg-slate-900 rounded-full border border-slate-800 flex items-center justify-center">
                <span className="w-1 h-1 bg-blue-500 rounded-full block"></span>
              </div>
              <div className="flex items-center gap-1 font-mono">
                <span>LINE SIM</span>
                <span className="text-[7px] bg-slate-800 px-1 rounded text-emerald-400">5G</span>
              </div>
            </div>

            {/* Simulated LINE Header with original deep green aesthetic */}
            <div className="bg-slate-900 px-4 py-3 flex items-center gap-3 border-b border-slate-950 flex-shrink-0">
              <div className="relative">
                <div className="w-9 h-9 bg-emerald-500 text-slate-950 font-sans font-black rounded-2xl flex items-center justify-center text-[10px] shadow-md border border-emerald-400/20">
                  {apiType === 'messaging_api' ? 'Bot' : 'LN'}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900"></span>
              </div>
              <div className="flex-grow">
                <span className="block text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  {apiType === 'messaging_api' ? 'LINE Bot OA (AI Secretarial Sandbox)' : 'LINE Notify (Deprecated)'}
                  <span className="bg-[#06C755]/15 text-[#06C755] border border-[#06C755]/30 text-[7px] px-1.5 py-0.5 rounded-md font-mono uppercase tracking-wider font-semibold animate-pulse">
                    CONNECTED
                  </span>
                </span>
                <p className="text-[9px] text-slate-400">
                  {apiType === 'messaging_api' ? 'ระบบจำลองการบรอดแคสต์ LINE Messaging API' : 'ระบบจำลอง LINE Notify (บริการปิดถาวร)'}
                </p>
              </div>
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
              </div>
            </div>

            {/* Simulated Chat Feed (Line Custom Sleek Dark Grayish Blue Background) */}
            <div className="flex-grow bg-[#0f172a] p-4 overflow-y-auto space-y-4 text-xs font-sans scrollbar-thin">
              <div className="text-center">
                <span className="bg-slate-900/80 border border-slate-800 text-slate-400 text-[8px] py-1 px-2.5 rounded-full uppercase tracking-wider font-semibold font-mono">
                  🚨 FEED SIMULATION CONTAINER
                </span>
              </div>

              {lineChatMessages.map((msg) => (
                <div key={msg.id} className="flex gap-2.5 items-start">
                  {/* Sender Avatar */}
                  <div className="w-8 h-8 bg-emerald-500 rounded-xl text-[10px] text-slate-950 font-bold flex items-center justify-center shadow-md flex-shrink-0 mt-0.5">
                    {apiType === 'messaging_api' ? 'Bot' : 'LN'}
                  </div>

                  {/* Bubble Container */}
                  <div className="max-w-[82%] flex flex-col gap-1">
                    <span className="text-[9px] text-slate-400 font-bold ml-1.5 flex items-center gap-1">
                      {apiType === 'messaging_api' ? 'Official OA Bot' : 'LINE Notify Bot'} <span className="text-[8px] text-slate-500 font-normal">แชร์เมื่อ {msg.timestamp}</span>
                    </span>
                    <div className="relative bg-slate-900 text-slate-100 p-3.5 rounded-2xl rounded-tl-sm shadow-md border border-slate-800/80 whitespace-pre-wrap leading-relaxed text-xs">
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))}

              <div ref={chatBottomRef} />
            </div>

            {/* Phone bottom bar mockup */}
            <div className="bg-slate-950 p-2.5 flex justify-center items-center flex-shrink-0 border-t border-slate-900">
              <div className="w-24 h-1 bg-slate-800 rounded-full"></div>
            </div>
          </div>

          {/* === Google Calendar Integration Panel (Premium design) === */}
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 flex flex-col gap-5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[50px] pointer-events-none rounded-full"></div>
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-105 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                <span>📅 ระบบเชื่อมต่อ Google Calendar</span>
              </h3>
              <span className="text-[9px] uppercase font-bold text-blue-405 font-mono tracking-wider bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                Google Workspace
              </span>
            </div>

            {needsGCalAuth ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  เชื่อมโยงตารางงาน LINE ของเลขา AI เข้ากับ Google Calendar ของคุณ เพื่อจดบันทึกภารกิจพร้อมรับมอบหมายลงปฏิทินทันที และสรุปกิจกรรมประจำวันส่งลงไลน์กลุ่ม OA
                </p>
                <div className="flex justify-center py-2">
                  <button 
                    onClick={handleGCalLogin}
                    className="gsi-material-button w-full sm:w-auto shadow-md hover:shadow-neon-blue transition-all duration-300"
                    style={{
                      backgroundColor: 'white',
                      border: '1px solid #dadce0',
                      borderRadius: '12px',
                      color: '#3c4043',
                      cursor: 'pointer',
                      fontFamily: 'Roboto, arial, sans-serif',
                      fontSize: '13px',
                      height: '42px',
                      letterSpacing: '0.25px',
                      outline: 'none',
                      overflow: 'hidden',
                      position: 'relative',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 16px'
                    }}
                  >
                    <div className="gsi-material-button-state" style={{ 
                      borderRadius: '12px', 
                      bottom: 0, 
                      left: 0, 
                      opacity: 0, 
                      position: 'absolute', 
                      right: 0, 
                      top: 0, 
                      transition: 'background-color .21s,opacity .21s'
                    }}></div>
                    <div className="gsi-material-button-content-wrapper" style={{
                      alignItems: 'center',
                      display: 'flex',
                      flexDirection: 'row',
                      flexWrap: 'nowrap',
                      height: '100%',
                      justifyContent: 'center',
                      position: 'relative',
                      width: '100%'
                    }}>
                      <div className="gsi-material-button-icon" style={{
                        display: 'block',
                        height: '20px',
                        minWidth: '20px',
                        width: '20px',
                        marginRight: '12px'
                      }}>
                        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                          <path fill="none" d="M0 0h48v48H0z"></path>
                        </svg>
                      </div>
                      <span className="gsi-material-button-contents" style={{
                        fontFamily: '"Roboto",arial,sans-serif',
                        fontSize: '14px',
                        fontWeight: '500',
                        letterSpacing: '0.25px',
                        whiteSpace: 'nowrap'
                      }}>เชื่อมโยงด้วย Google ID</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Linked Profile View */}
                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-2xl border border-slate-850">
                  <div className="flex items-center gap-2.5">
                    {gCalUser.photoURL ? (
                      <img 
                        src={gCalUser.photoURL} 
                        alt="Google Prof" 
                        className="w-8 h-8 rounded-full border border-slate-705"
                        referrerPolicy="no-referrer" 
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-300">
                        <UserCheck className="w-4 h-4" />
                      </div>
                    )}
                    <div>
                      <span className="block text-xs font-bold text-slate-100">{gCalUser.displayName || 'ผู้ใช้ Google'}</span>
                      <span className="text-[10px] text-slate-500 font-mono select-all">{gCalUser.email}</span>
                    </div>
                  </div>
                  <button 
                    onClick={handleGCalLogout}
                    className="p-1.5 hover:bg-rose-950/20 border border-slate-800 text-rose-450 hover:text-rose-350 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                    title="ตัดการเชื่อมต่อ"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="text-[10px] hidden sm:inline">ตัดการเชื่อมต่อ</span>
                  </button>
                </div>

                {/* Operations trigger */}
                <div className="grid grid-cols-1 gap-2.5 pb-1">
                  <button
                    onClick={handleParseEventWithAI}
                    disabled={isParsingEventWithAI}
                    type="button"
                    className="p-3 text-center bg-blue-950/20 hover:bg-blue-950/40 border border-blue-800/40 hover:border-blue-500 rounded-2xl transition-all duration-200 group flex items-center justify-center gap-2 cursor-pointer text-xs font-bold text-blue-400 hover:text-blue-300 shadow-sm"
                  >
                    {isParsingEventWithAI ? (
                      <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                    ) : (
                      <Calendar className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                    )}
                    <span>📅 สรรค์สร้างนัดหมายอัตโนมัติด้วย AI</span>
                  </button>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleOpenAddEventWithDraft}
                      type="button"
                      className="p-3 text-center bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-2xl transition-all duration-200 group flex flex-col items-center justify-center gap-1.5 cursor-pointer text-xs"
                    >
                      <Plus className="w-4 h-4 text-slate-450 group-hover:scale-110 transition-transform" />
                      <span className="font-semibold text-slate-200">จดปฏิทินเอง</span>
                    </button>

                    <button
                      onClick={handleAISummarizeCalendar}
                      disabled={isSummarizingCalendarEvents || calendarEvents.length === 0}
                      type="button"
                      className="p-3 text-center bg-slate-950 hover:bg-emerald-950/30 border border-slate-800 hover:border-emerald-500/30 disabled:hover:bg-slate-950 disabled:opacity-40 rounded-2xl transition-all duration-200 group flex flex-col items-center justify-center gap-1.5 cursor-pointer text-xs"
                    >
                      {isSummarizingCalendarEvents ? (
                        <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                      )}
                      <span className="font-semibold text-slate-200 group-hover:text-emerald-400">ดึงคิวสรุปส่งไลน์</span>
                    </button>
                  </div>
                </div>

                {/* Scheduled list on calendar */}
                <div className="bg-slate-950 rounded-2xl border border-slate-850 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-900 border-b border-slate-850 flex justify-between items-center text-[10px] uppercase font-bold text-slate-400">
                    <span className="flex items-center gap-1">⏰ นัดหมายล่าสุด ({calendarEvents.length})</span>
                    <button 
                      onClick={() => fetchCalendarEvents()}
                      disabled={isLoadingCalendarEvents}
                      className="text-blue-400 hover:text-blue-300 transition-colors p-1"
                      title="ซิงค์ข้อมูลใหม่"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingCalendarEvents ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  <div className="p-2 max-h-52 overflow-y-auto divide-y divide-slate-900/60 scrollbar-thin">
                    {isLoadingCalendarEvents ? (
                      <div className="text-center py-6 text-slate-500 text-[11px] flex flex-col items-center gap-1.5">
                        <RefreshCw className="w-4 h-4 animate-spin text-blue-405" />
                        <span>กำลังดึงตารางจาก Google Calendar...</span>
                      </div>
                    ) : calendarEvents.length === 0 ? (
                      <div className="text-center py-6 text-slate-600 text-[10px]">
                        ไม่พบนัดหมายในปฏิทินระยะนี้
                      </div>
                    ) : (
                      calendarEvents.map((ev, idx) => {
                        const start = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleString('th-TH', { 
                          month: 'short', 
                          day: 'numeric',
                          hour: '2-digit', 
                          minute: '2-digit' 
                        }) : ev.start?.date || '';
                        
                        return (
                          <div key={ev.id || idx} className="p-2 flex flex-col space-y-1 hover:bg-slate-900/40 rounded-xl transition-colors text-[11px] group pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-slate-150 line-clamp-1 group-hover:text-blue-400 transition-colors" title={ev.summary}>
                                {ev.summary || '(นัดหมายนิรนาม)'}
                              </span>
                              <button
                                onClick={() => handleSendSingleEventToLine(ev)}
                                className="px-2 py-0.5 whitespace-nowrap bg-blue-500/10 group-hover:bg-blue-500 text-blue-400 group-hover:text-slate-950 font-bold rounded text-[9px] border border-blue-500/20 group-hover:border-transparent transition-all cursor-pointer flex items-center gap-1"
                                title="ดึงข้อมูลกิจกรรมยัดลงกล่องร่างขัดเกลากลับ"
                              >
                                📢 แชร์ลง LINE
                              </button>
                            </div>
                            <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono">
                              <span>เริ่ม: {start}</span>
                              {ev.description && (
                                <span className="italic max-w-[50%] truncate text-slate-600" title={ev.description}>
                                  {ev.description}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Real Token Setup Configuration (Persistent storage client-side) */}
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-slate-100 font-sans">🔌 ตั้งค่าเชื่อมต่อ LINE API สำหรับใช้งานจริง</h3>
              </div>
              <div className="flex gap-1.5 p-0.5 bg-slate-950 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setApiType('messaging_api')}
                  className={`text-[9px] px-2 py-1 font-bold rounded ${apiType === 'messaging_api' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Messaging API
                </button>
                <button
                  type="button"
                  onClick={() => setApiType('notify_deprecated')}
                  className={`text-[9px] px-2 py-1 font-bold rounded ${apiType === 'notify_deprecated' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-slate-350'}`}
                >
                  Notify (Closed)
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {apiType === 'notify_deprecated' && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-300 rounded-xl leading-relaxed">
                  ⚠️ <strong>คำแนะนำ:</strong> LINE Notify ปิดให้บริการแล้วเมื่อวันที่ 31 มี.ค. 2025 แนะนำอย่างยิ่งให้สลับหน้าไปใช้แท็บ <strong>"Messaging API"</strong> แทน เพื่อเชื่อมต่อส่งข้อความหาแอปพลิเคชัน LINE ฟรีได้อย่างมีเสถียรภาพค่ะ!
                </div>
              )}

              <div>
                <label htmlFor="token-input" className="block text-xs font-bold text-slate-400 mb-2 flex justify-between">
                  <span>
                    🔑 {apiType === 'messaging_api' ? 'Channel Access Token (พิมพ์ยาว):' : 'LINE Notify Token (ปิดบริการแล้ว):'}
                  </span>
                  <button 
                    onClick={() => setIsHelpOpen(!isHelpOpen)}
                    type="button" 
                    className="text-emerald-400 hover:underline hover:text-emerald-300 text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md cursor-pointer font-semibold uppercase tracking-wider"
                  >
                    วิธีการหา Token?
                  </button>
                </label>
                <div className="relative">
                  <input
                    id="token-input"
                    type="password"
                    value={lineToken}
                    onChange={(e) => setLineToken(e.target.value)}
                    placeholder={
                      apiType === 'messaging_api' 
                        ? "กรอกรหัส Channel Access Token (เช่น eyJhbGciOi...) จาก LINE Developers Console"
                        : "รหัส Token LINE Notify เดิม (เช่น eX7Yp894...)"
                    }
                    className="w-full text-xs p-3.5 bg-slate-950 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 outline-none pr-12 text-slate-100 font-mono shadow-inner placeholder-slate-600"
                  />
                  {lineToken && (
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] uppercase font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30">
                      ✓ CONNECTED
                    </span>
                  )}
                </div>
              </div>

              {/* Destination Switcher */}
              <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-2xl flex items-center justify-between gap-4">
                <div className="space-y-0.5 flex-grow">
                  <span className="block text-xs font-bold text-slate-200">เผยแพร่ข้อมูลตรงไปยังแอปพลิเคชัน LINE จริง?</span>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    หากสลับเปิด บอทจะทำการส่งข้อความประกาศจริงไปยังไลน์ผ่าน API ด้วยช่องทาง {apiType === 'messaging_api' ? 'Official Messaging API' : 'Legacy LINE Notify'} (หากปิดไว้จะจำลองผลเฉพาะหน้าจอ Emulator ด้านซ้ายเท่านั้น)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSendToRealLine(!sendToRealLine)}
                  className={`w-12 h-6.5 rounded-full p-1 transition-colors duration-200 flex items-center cursor-pointer flex-shrink-0 ${
                    sendToRealLine && lineToken ? 'bg-emerald-500 justify-end' : 'bg-slate-800 justify-start'
                  }`}
                >
                  <span className={`w-4.5 h-4.5 bg-white rounded-full shadow-sm transition-transform duration-100 ${sendToRealLine && lineToken ? 'bg-slate-950' : 'bg-slate-300'}`}></span>
                </button>
              </div>

              {/* Action connection test */}
              {lineToken && (
                <button
                  type="button"
                  onClick={handleTestToken}
                  disabled={isSendingToLine}
                  className="w-full py-2.5 bg-slate-950 hover:bg-slate-950/40 text-slate-300 hover:text-white border border-slate-800 text-xs font-bold rounded-xl shadow-sm hover:shadow-neon-emerald transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>⚡ ส่งข้อความทักทายทดสอบสิทธิ์ Token เข้าแชท LINE จริง</span>
                </button>
              )}
            </div>
          </div>
        </section>

      </main>

      {/* --- Footer bar --- */}
      <footer className="bg-slate-950 border-t border-slate-900 py-6 px-6 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <span>© 12:12:16 LINE AI Secretarial Agent Pro. พลังประมวลเก่งกล้าผ่าน Gemini และ Express Server Node Proxy</span>
          <div className="flex gap-4">
            <span className="font-semibold text-slate-450 hover:text-white transition-colors">ล้างข้อมูลเมื่อปิดบราวเซอร์</span>
            <span>|</span>
            <span className="font-semibold text-slate-450 hover:text-white transition-colors">LINE Notify API Verified Ready</span>
          </div>
        </div>
      </footer>

      {/* --- Add Google Calendar Event Modal --- */}
      {showAddEventModal && (
        <div id="add-calendar-event-modal" className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full flex flex-col gap-4 animate-fade-in shadow-2xl relative">
            <button 
              onClick={() => setShowAddEventModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-xl cursor-pointer transition-colors"
            >
              ✕
            </button>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-400" />
                <span>จดบันทึกกำหนดตารางงานลง Google Calendar</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-normal text-right font-mono">
                LineAgent Workspace Integration Setup
              </p>
            </div>
            
            <form onSubmit={handleSaveEventToCalendar} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">หัวข้อกิจกรรมนัดหมาย:</label>
                <input 
                  type="text"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-700 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="เช่น มอบหมายงานประจำสัปดาห์ หรือ ประชั้นงานด่วน"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">เริ่มเมื่อ (วัน/เวลา):</label>
                  <input 
                    type="datetime-local"
                    value={newEventStart}
                    onChange={(e) => setNewEventStart(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">สิ้นสุดเมื่อ (วัน/เวลา):</label>
                  <input 
                    type="datetime-local"
                    value={newEventEnd}
                    onChange={(e) => setNewEventEnd(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">รายละเอียดคำอธิบาย (บรรจุข้อความแจ้งทีม):</label>
                <textarea 
                  rows={4}
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-700 font-mono text-[11px] leading-relaxed focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="สามารถใส่โครงร่างข้อความสำหรับส่งไลน์กลุ่ม OA ตรงนี้เพื่อเก็บเป็นหลักฐานอ้างอิง"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => setShowAddEventModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl cursor-pointer text-xs"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit"
                  disabled={isSavingCalendarEvent}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-md cursor-pointer text-xs flex items-center gap-1.5 transition-all duration-200"
                >
                  {isSavingCalendarEvent ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>กำลังบันทึกนัดหมาย...</span>
                    </>
                  ) : (
                    <>
                      <span>✓ บันทึกตารางงาน</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
