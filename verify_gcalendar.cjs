const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const credPath = path.resolve(__dirname, 'google-service-account.json');
if (!fs.existsSync(credPath)) {
  console.error('google-service-account.json not found!');
  process.exit(1);
}

const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
const oauth2 = new google.auth.OAuth2(
  credentials.client_id,
  credentials.client_secret
);
oauth2.setCredentials({ refresh_token: credentials.refresh_token });

const calendar = google.calendar({ version: 'v3', auth: oauth2 });

async function verify() {
  console.log('Testing connection to Google Calendar API...');
  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      maxResults: 5,
      timeMin: (new Date()).toISOString()
    });
    console.log('Success! Connection established.');
    console.log('Upcoming events:');
    if (res.data.items && res.data.items.length > 0) {
      res.data.items.forEach(item => {
        console.log(`- ${item.summary || 'No Title'} (${item.start.dateTime || item.start.date})`);
      });
    } else {
      console.log('No upcoming events found.');
    }
  } catch (err) {
    console.error('Error connecting to Google Calendar:', err.message);
    process.exit(1);
  }
}

verify();
