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

const drive = google.drive({ version: 'v3', auth: oauth2 });

async function verify() {
  console.log('Testing connection to Google Drive API...');
  try {
    const res = await drive.files.list({
      pageSize: 5,
      fields: 'files(id, name, mimeType)',
      orderBy: 'createdTime desc'
    });
    console.log('Success! Connection established.');
    console.log('Recent Files:');
    res.data.files.forEach(file => {
      console.log(`- Name: "${file.name}" (ID: ${file.id}, MIME: ${file.mimeType})`);
    });
  } catch (err) {
    console.error('Error connecting to Google Drive:', err.message);
  }
}

verify();
