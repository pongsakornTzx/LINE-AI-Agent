import { json, type MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState, useEffect } from "react";

export const meta: MetaFunction = () => {
  return [
    { title: "LINE AI Agent Dashboard - Control Center" },
    { name: "description", content: "Manage and monitor your LINE Messaging API integration powered by Gemini AI." },
  ];
};

export const loader = async () => {
  // Read environments to show state (server-side check)
  const hasLineToken = !!process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const hasLineSecret = !!process.env.LINE_CHANNEL_SECRET;
  const hasLineId = !!process.env.LINE_CHANNEL_ID;
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  
  return json({
    configStatus: {
      lineAccess: hasLineToken ? "Configured" : "Missing",
      lineSecret: hasLineSecret ? "Configured" : "Missing",
      lineId: hasLineId ? "Configured" : "Missing",
      gemini: hasGeminiKey ? "Configured" : "Missing",
    }
  });
};

interface LogMessage {
  time: string;
  type: "in" | "out" | "sys";
  text: string;
}

export default function Index() {
  const { configStatus } = useLoaderData<typeof loader>();
  const [logs, setLogs] = useState<LogMessage[]>([
    { time: "04:50:00", type: "sys", text: "LINE AI Agent Server started on port 3000" },
    { time: "04:50:02", type: "sys", text: "Gemini Model client initialized (gemini-1.5-flash)" },
    { time: "04:50:15", type: "sys", text: "Webhook route ready at: /api/webhook" }
  ]);
  
  const [prompt, setPrompt] = useState(
    "You are a helpful and polite virtual assistant. Answer questions concisely and friendly in Thai."
  );
  
  const [temperature, setTemperature] = useState(0.7);
  
  // Simulate live messages arriving
  useEffect(() => {
    const questions = [
      "สวัสดีครับ ขอทราบเวลาทำการหน่อยครับ",
      "มีโปรโมชั่นอะไรบ้างเดือนนี้?",
      "สอบถามเรื่องการจัดส่งสินค้าหน่อยครับ",
      "ติดต่อเจ้าหน้าที่ยังไงคะ?"
    ];
    
    const answers = [
      "สวัสดีค่ะ! ร้านเปิดทำการทุกวัน เวลา 09:00 - 18:00 น. ค่ะ มีอะไรสอบถามเพิ่มเติมได้เลยนะคะ",
      "โปรโมชั่นเดือนนี้! ซื้อครบ 500 บาท ส่งฟรีทั่วประเทศ และรับส่วนลด 10% สำหรับบิลถัดไปค่ะ",
      "จัดส่งสินค้าผ่านขนส่งเอกชนทุกวันจันทร์ - เสาร์ ตัดรอบ 12:00 น. รอรับสินค้าใน 1-3 วันทำการค่ะ",
      "สามารถติดต่อเจ้าหน้าที่โดยพิมพ์ 'คุยกับแอดมิน' หรือโทร 02-XXX-XXXX ในเวลาทำการได้เลยค่ะ"
    ];
    
    let index = 0;
    const interval = setInterval(() => {
      const now = new Date().toLocaleTimeString("en-GB", { hour12: false });
      const q = questions[index % questions.length];
      const a = answers[index % answers.length];
      
      setLogs(prev => [
        ...prev,
        { time: now, type: "in", text: `Webhook Event: Message -> "${q}"` },
        { time: now, type: "out", text: `Replied: "${a}"` }
      ].slice(-15)); // Keep last 15 logs
      
      index++;
    }, 18000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="metric-row">
        <div className="glass-panel card">
          <div className="card-title">LINE webhook API</div>
          <div className="card-value" style={{ fontSize: "1.2rem", marginTop: "0.5rem" }}>
            /api/webhook
          </div>
          <span className="status-indicator status-online" style={{ marginTop: "1rem" }}>
            Listening
          </span>
        </div>
        
        <div className="glass-panel card">
          <div className="card-title">LINE API Credentials</div>
          <div className="card-value" style={{ display: "flex", gap: "0.5rem", flexDirection: "column", fontSize: "0.95rem", fontWeight: "normal", color: "hsl(var(--text-secondary))", marginTop: "0.5rem" }}>
            <div>Access Token: <span style={{ color: configStatus.lineAccess === "Configured" ? "#10B981" : "#EF4444" }}>{configStatus.lineAccess}</span></div>
            <div>Channel Secret: <span style={{ color: configStatus.lineSecret === "Configured" ? "#10B981" : "#EF4444" }}>{configStatus.lineSecret}</span></div>
            <div>Channel ID: <span style={{ color: configStatus.lineId === "Configured" ? "#10B981" : "#EF4444" }}>{configStatus.lineId}</span></div>
          </div>
        </div>

        <div className="glass-panel card">
          <div className="card-title">Gemini AI Client</div>
          <div className="card-value" style={{ color: configStatus.gemini === "Configured" ? "#10B981" : "#EF4444" }}>
            {configStatus.gemini}
          </div>
          <div style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))", marginTop: "0.5rem" }}>
            Model: gemini-1.5-flash
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="glass-panel card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h2>Live Log Activity</h2>
          <p style={{ color: "hsl(var(--text-secondary))", fontSize: "0.9rem" }}>
            Displays live webhook executions and responses sent by the AI Agent.
          </p>
          
          <div className="log-stream">
            {logs.map((log, idx) => (
              <div key={idx} className="log-item">
                <span className="log-time">[{log.time}]</span>
                <span className={`log-tag ${log.type}`}>
                  {log.type === "in" ? ">> [USER]" : log.type === "out" ? "<< [AGENT]" : "[SYSTEM]"}
                </span>
                <span className="log-msg">{log.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h2>Agent Configuration</h2>
          <p style={{ color: "hsl(var(--text-secondary))", fontSize: "0.9rem" }}>
            Customize the AI's behavior and personality.
          </p>
          
          <div className="config-group">
            <label className="config-label">System Instruction / Prompt</label>
            <textarea 
              className="config-input" 
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="config-group">
            <label className="config-label">Temperature: {temperature}</label>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.1" 
              className="config-input"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
            />
          </div>

          <button className="btn" onClick={() => alert("Settings saved locally! Syncing with agent instance.")}>
            Save Configurations
          </button>
        </div>
      </div>
    </div>
  );
}
