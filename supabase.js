// supabase.js
// Talks directly to Supabase Auth's REST API (GoTrue) using plain
// fetch() calls — no SDK/build step needed, just the project URL and
// public anon key below.
//
// SUPABASE_ANON_KEY is the public "anon" key — it's safe to ship in
// frontend code (it only grants what your Supabase Row Level Security
// policies allow). NEVER put a service-role key here or anywhere in
// frontend code.
const SUPABASE_URL = "https://flaxniwhgvakhrrcimfa.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_56L8_2BZCdaykpDB3QXr2w_Flfep-5C";

// -----------------------------------------------------------------
// Session storage
//
// The session (access token, refresh token, and the signed-in user's
// id/email/display name) is saved as one JSON blob in localStorage —
// the same pattern this app already uses for memories/notes/settings.
// The password itself is never stored anywhere, only sent once over
// HTTPS to Supabase when logging in or signing up.
// -----------------------------------------------------------------

const SESSION_STORAGE_KEY = "olbSession";

function saveSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function getSession() {
  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch (error) {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

// Returns { id, email, displayName } for the signed-in user, or null.
function getCurrentUser() {
  const session = getSession();
  return session ? session.user : null;
}

// Builds the { accessToken, refreshToken, user } shape saved above out
// of a raw Supabase Auth API response.
function buildSessionFromResponse(data) {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      displayName: (data.user.user_metadata && data.user.user_metadata.display_name) || ""
    }
  };
}

// Turns Supabase's raw error payload into a short, friendly message.
// Supabase's exact wording can vary a little between API versions, so
// this checks for a few key words rather than an exact string match.
function friendlyAuthError(data) {
  const code = (data && (data.code || data.error_code || data.error)) || "";
  const message = (data && (data.msg || data.error_description || data.message)) || "";
  const combined = (code + " " + message).toLowerCase();

  if (combined.indexOf("already") !== -1 && (combined.indexOf("registered") !== -1 || combined.indexOf("exists") !== -1)) {
    return "An account with that email already exists 💗";
  }

  if (combined.indexOf("password") !== -1 &&
      (combined.indexOf("short") !== -1 || combined.indexOf("weak") !== -1 ||
       combined.indexOf("least") !== -1 || combined.indexOf("characters") !== -1)) {
    return "Please choose a stronger password (at least 6 characters) 💗";
  }

  if (combined.indexOf("invalid login credentials") !== -1 || combined.indexOf("invalid_grant") !== -1) {
    return "That email or password doesn't look right 💗";
  }

  if (combined.indexOf("email") !== -1 && (combined.indexOf("invalid") !== -1 || combined.indexOf("valid") !== -1)) {
    return "Please enter a valid email address 💗";
  }

  return message || "Something went wrong. Please try again 💗";
}

// -----------------------------------------------------------------
// Public API
// -----------------------------------------------------------------

// Creates a new account. Resolves with the raw Supabase response —
// if email confirmation is off in the dashboard, it includes a session
// (and this function saves it immediately); if confirmation is on,
// there's no session yet and the caller should tell the user to check
// their email.
function signUp(email, password, displayName) {
  return fetch(SUPABASE_URL + "/auth/v1/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      email: email,
      password: password,
      data: { display_name: displayName }
    })
  }).then(function (response) {
    return response.json().then(function (data) {
      if (!response.ok) {
        throw new Error(friendlyAuthError(data));
      }
      if (data.access_token) {
        saveSession(buildSessionFromResponse(data));
      }
      return data;
    });
  });
}

// Logs an existing user in and saves the session on success.
function logIn(email, password) {
  return fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ email: email, password: password })
  }).then(function (response) {
    return response.json().then(function (data) {
      if (!response.ok) {
        throw new Error(friendlyAuthError(data));
      }
      saveSession(buildSessionFromResponse(data));
      return data;
    });
  });
}

// Clears the local session immediately, and best-effort tells Supabase
// to invalidate the token server-side too (logout still "works" from
// this browser's point of view even if that request fails).
function logOut() {
  const session = getSession();
  clearSession();

  if (!session) return Promise.resolve();

  return fetch(SUPABASE_URL + "/auth/v1/logout", {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + session.accessToken
    }
  }).catch(function () {
    // Ignore network errors — the user is already logged out locally.
  });
}

// Call at the very top of a protected page (home.html, booth.html,
// memories.html, settings.html): sends the visitor to login.html if
// there's no local session. This only checks whether a session exists
// locally — it does not verify the token is still valid with Supabase,
// so it's a UX guard, not real server-side security.
function requireAuth() {
  if (!getSession()) {
    window.location.href = "login.html";
  }
}

// Call at the top of login.html: sends an already-signed-in visitor
// straight to home.html instead of showing the login form again.
function redirectIfAuthed() {
  if (getSession()) {
    window.location.href = "home.html";
  }
}
