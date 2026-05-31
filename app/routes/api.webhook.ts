import { type ActionFunctionArgs, json } from "@remix-run/node";
import crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Signature verification helper
function verifySignature(body: string, channelSecret: string, signature: string): boolean {
  const hash = crypto
    .createHmac("SHA256", channelSecret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

export const loader = async () => {
  return json({ status: "Webhook is active. Send POST requests from LINE Developers Console." }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const channelId = process.env.LINE_CHANNEL_ID;

  if (!channelSecret || !geminiApiKey) {
    console.error("Missing configuration env variables.");
    return json({ error: "Internal Configuration Error" }, { status: 500 });
  }

  if (!channelAccessToken && channelId) {
    try {
      const tokenResponse = await fetch("https://api.line.me/v2/oauth/accessToken", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: channelId,
          client_secret: channelSecret,
        }),
      });
      if (tokenResponse.ok) {
        const tokenData = (await tokenResponse.json()) as any;
        channelAccessToken = tokenData.access_token;
      } else {
        const tokenErr = await tokenResponse.text();
        console.error("Failed to fetch short-lived LINE access token:", tokenErr);
      }
    } catch (err) {
      console.error("Error fetching LINE token:", err);
    }
  }

  if (!channelAccessToken) {
    console.error("No LINE Channel Access Token available.");
    return json({ error: "No LINE Channel Access Token" }, { status: 500 });
  }

  // Get raw body as text for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!signature) {
    return json({ error: "Missing signature header" }, { status: 401 });
  }

  // Verify signature to secure the endpoint
  if (!verifySignature(rawBody, channelSecret, signature)) {
    console.error("Signature verification failed.");
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  let data;
  try {
    data = JSON.parse(rawBody);
  } catch (err) {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = data.events || [];
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  
  // Set up the AI model with system instruction
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: "You are a helpful and polite virtual assistant. Answer questions concisely and friendly in Thai.",
  });

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userText = event.message.text;
      const replyToken = event.replyToken;

      try {
        // Generate content using Gemini
        const aiResult = await model.generateContent(userText);
        const aiResponseText = aiResult.response.text() || "ขออภัยด้วยค่ะ ฉันไม่สามารถประมวลผลคำตอบได้ในขณะนี้";

        // Send reply to LINE API
        const replyResponse = await fetch("https://api.line.me/v2/bot/message/reply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${channelAccessToken}`
          },
          body: JSON.stringify({
            replyToken: replyToken,
            messages: [
              {
                type: "text",
                text: aiResponseText.trim()
              }
            ]
          })
        });

        if (!replyResponse.ok) {
          const errorData = await replyResponse.text();
          console.error("LINE Reply API error:", errorData);
        }
      } catch (err) {
        console.error("Error processing event:", err);
      }
    }
  }

  return json({ success: true }, { status: 200 });
};
