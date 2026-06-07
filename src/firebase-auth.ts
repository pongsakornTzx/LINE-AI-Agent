import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();

// Request Calendar scopes
provider.addScope('https://www.googleapis.com/auth/calendar.events');
provider.addScope('https://www.googleapis.com/auth/calendar.readonly');

// Add incremental authorization options to make sure scopes are requested properly if needed
provider.setCustomParameters({
  prompt: 'consent'
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        // If user is logged in but token was lost (e.g. reload), we need them to click login to fetch token again,
        // or we handle state gracefully
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google Auth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// --- Google Calendar API Helpers ---

/**
 * Fetch upcoming events from the user's primary calendar
 */
export const listCalendarEvents = async (accessToken: string, maxResults = 10) => {
  const now = new Date().toISOString();
  // We can fetch events from today onwards
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&singleEvents=true&orderBy=startTime&maxResults=${maxResults}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Calendar API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.items || [];
};

/**
 * Create a new event on the user's primary Google Calendar
 */
export interface NewEventData {
  summary: string;
  description?: string;
  startDateTime: string; // ISO String (e.g., "2026-05-31T14:00:00+07:00")
  endDateTime: string;   // ISO String (e.g., "2026-05-31T15:00:00+07:00")
  timeZone?: string;
}

export const createCalendarEvent = async (accessToken: string, event: NewEventData) => {
  const body = {
    summary: event.summary,
    description: event.description,
    start: {
      dateTime: event.startDateTime,
      timeZone: event.timeZone || 'Asia/Bangkok'
    },
    end: {
      dateTime: event.endDateTime,
      timeZone: event.timeZone || 'Asia/Bangkok'
    }
  };

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Calendar API Error: ${response.status} - ${errorText}`);
  }

  return await response.json();
};
