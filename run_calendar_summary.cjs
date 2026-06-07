const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!lineToken) {
  console.error('Error: LINE_CHANNEL_ACCESS_TOKEN not found in .env');
  process.exit(1);
}

async function run() {
  try {
    // 1. Fetch virtual events
    const eventsRes = await fetch('http://localhost:3000/api/events');
    const eventsData = await eventsRes.json();
    if (!eventsData.success) {
      throw new Error('Failed to fetch events from API');
    }

    const allEvents = eventsData.events || [];
    console.log(`Fetched ${allEvents.length} events total.`);

    // 2. Filter events for "today" (June 5, 2026)
    // We will include events starting between 2026-06-05T00:00:00Z and 2026-06-05T23:59:59Z
    const todayStr = '2026-06-05';
    const todayEvents = allEvents.filter(event => {
      const startDateTime = event.start?.dateTime || event.start?.date || '';
      return startDateTime.startsWith(todayStr);
    });

    console.log(`Filtered ${todayEvents.length} events for today (${todayStr}).`);

    if (todayEvents.length === 0) {
      console.log('No events scheduled for today. Skipping summary broadcast.');
      return;
    }

    // 3. Summarize using local Gemini agent endpoint
    const sumRes = await fetch('http://localhost:3000/api/agent/summarize-calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: todayEvents,
        agentPersona: 'secretary'
      })
    });

    const sumData = await sumRes.json();
    if (!sumData.success) {
      throw new Error('Failed to summarize calendar events: ' + (sumData.error || 'unknown error'));
    }

    const summaryText = sumData.draftMessage;
    console.log('AI Calendar Summary:\n', summaryText);

    // 4. Send to LINE via broadcast proxy
    console.log('Broadcasting summary to LINE Group...');
    const lineRes = await fetch('http://localhost:3000/api/line-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: lineToken,
        message: summaryText,
        apiType: 'messaging_api'
      })
    });

    const lineData = await lineRes.json();
    if (!lineData.success) {
      throw new Error('Failed to broadcast to LINE: ' + (lineData.error || 'unknown error'));
    }

    console.log('Successfully broadcasted calendar summary to LINE!');
  } catch (err) {
    console.error('Error running calendar summary cron action:', err);
  }
}

run();
