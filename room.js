// room.js
// Small, reusable module for the Couple Booth "room" — a short code
// that lets two people land on the same booth.html session.
//
// The actual room/participant data and live updates now come from
// Supabase (see js/realtime.js). This file just tracks, in this one
// browser tab, which room code is currently "open" — home.html sets
// it when you create/join a booth, booth.js reads it to know which
// room to connect to, and clearRoomCode() is called on Leave Booth.

const ROOM_STORAGE_KEY = "olbRoomCode";

// Builds a random 6-character code, skipping look-alike characters
// (0/O, 1/I) so a shared code is easy to read and retype correctly.
// Used by realtime.js's createRoom() when a new room is made.
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function saveRoomCode(code) {
  localStorage.setItem(ROOM_STORAGE_KEY, code);
}

function getRoomCode() {
  return localStorage.getItem(ROOM_STORAGE_KEY);
}

function clearRoomCode() {
  localStorage.removeItem(ROOM_STORAGE_KEY);
}

// Copies the current room code to the clipboard. Returns a promise
// that resolves to true if a code existed and was copied, or false if
// there was no room code to copy — callers use this to decide whether
// to show "Copied!" feedback.
function copyRoomCode() {
  const code = getRoomCode();
  if (!code) return Promise.resolve(false);

  return navigator.clipboard.writeText(code).then(function () {
    return true;
  });
}
