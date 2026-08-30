// realtime.js
// Talks to Supabase's REST API (PostgREST) and Realtime WebSocket
// directly — no SDK, matching how js/supabase.js talks to GoTrue with
// plain fetch(). This is the real backend for the Couple Booth room:
// a `rooms` row marks a room as existing, a `room_participants` row
// marks someone as currently in it, and a WebSocket subscription to
// Postgres changes on that table is how "your partner joined" reaches
// the browser live, without polling or a page refresh.

// -----------------------------------------------------------------
// REST helpers
// -----------------------------------------------------------------

function realtimeHeaders(extra) {
  const session = getSession();
  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: "Bearer " + (session ? session.accessToken : SUPABASE_ANON_KEY)
  };
  return Object.assign(headers, extra || {});
}

// Attaches a typed `.type` to an Error so callers can tell "room not
// found" and "room full" apart from a generic connection problem.
function realtimeError(type, message) {
  const error = new Error(message);
  error.type = type;
  return error;
}

function getParticipants(code) {
  return fetch(
    SUPABASE_URL + "/rest/v1/room_participants?room_code=eq." + encodeURIComponent(code) +
      "&select=user_id,display_name&order=joined_at.asc",
    { headers: realtimeHeaders() }
  ).then(function (response) {
    if (!response.ok) throw realtimeError("error", "Couldn't reach this booth's room list.");
    return response.json();
  });
}

// Adds (or refreshes) the signed-in user's own row in room_participants.
// Uses PostgREST's upsert (insert ... on conflict do update) so calling
// this again — e.g. on a page refresh — doesn't fail as a duplicate.
function addParticipant(code, currentUser) {
  console.log("[ROOM] Adding creator as participant...", { room_code: code, user_id: currentUser.id });

  return fetch(SUPABASE_URL + "/rest/v1/room_participants?on_conflict=room_code,user_id", {
    method: "POST",
    headers: realtimeHeaders({ Prefer: "resolution=merge-duplicates" }),
    body: JSON.stringify({
      room_code: code,
      user_id: currentUser.id,
      display_name: currentUser.displayName || currentUser.email
    })
  }).then(function (response) {
    if (response.ok) {
      console.log("[ROOM] Participant insert result: ok", response.status);
      return;
    }

    return response.json().catch(function () { return null; }).then(function (body) {
      console.error("[ROOM] Participant insert result: FAILED", {
        status: response.status,
        message: body && body.message,
        details: body && body.details,
        hint: body && body.hint,
        code: body && body.code,
        raw: body
      });
      throw realtimeError("error", "Couldn't join this booth. Please try again.");
    });
  });
}

// -----------------------------------------------------------------
// Room creation
// -----------------------------------------------------------------

// Creates a new room with a fresh code, then joins it as the creator.
// Room codes are 6 characters from a ~1.3 billion-code space, so a
// collision with an existing room is extremely unlikely — attempt is
// just a safety cap so a freak collision retries instead of looping forever.
function createRoom(attempt) {
  attempt = attempt || 1;
  const currentUser = getCurrentUser();
  console.log("[ROOM] Current user:", currentUser);

  if (!currentUser || !currentUser.id) {
    console.error("[ROOM] No signed-in user available — cannot create a room.");
    return Promise.reject(realtimeError("error", "Couldn't create a booth. Please try again."));
  }

  const code = generateRoomCode();
  console.log("[ROOM] Generated room code:", code, "(attempt " + attempt + ")");
  console.log("[ROOM] Creating room...");

  return fetch(SUPABASE_URL + "/rest/v1/rooms", {
    method: "POST",
    headers: realtimeHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ room_code: code, creator_id: currentUser.id })
  }).then(function (response) {
    if (response.ok) {
      console.log("[ROOM] Room insert result: ok", response.status);
      return addParticipant(code, currentUser).then(function () {
        console.log("[ROOM] Room created successfully:", code);
        return code;
      });
    }

    return response.json().catch(function () { return null; }).then(function (body) {
      console.error("[ROOM] Room insert result: FAILED", {
        status: response.status,
        message: body && body.message,
        details: body && body.details,
        hint: body && body.hint,
        code: body && body.code,
        raw: body
      });

      // 23505 = unique_violation (room_code already taken) — PostgREST also
      // returns plain HTTP 409 for this. Either way, retry with a new code.
      if (response.status === 409 || (body && body.code === "23505")) {
        if (attempt >= 5) throw realtimeError("error", "Couldn't create a booth. Please try again.");
        return createRoom(attempt + 1);
      }

      throw realtimeError("error", "Couldn't create a booth. Please try again.");
    });
  });
}

// -----------------------------------------------------------------
// Room joining
// -----------------------------------------------------------------

// Verifies the room exists and isn't already full (2 people, not
// counting a reload of someone already in it), then joins it.
// Resolves with { roomCode, participants, creatorId } — creatorId lets
// the caller (js/webrtc.js) decide who creates the WebRTC offer vs.
// the answer, without needing any extra negotiation. Rejects with an
// Error whose `.type` is "not_found", "room_full", or "error".
function joinRoom(code) {
  const currentUser = getCurrentUser();
  let creatorId = null;

  return fetch(
    SUPABASE_URL + "/rest/v1/rooms?room_code=eq." + encodeURIComponent(code) + "&select=room_code,creator_id",
    { headers: realtimeHeaders() }
  )
    .then(function (response) {
      if (!response.ok) throw realtimeError("error", "Couldn't reach this booth. Please try again.");
      return response.json();
    })
    .then(function (rooms) {
      if (rooms.length === 0) {
        throw realtimeError("not_found", "That booth code doesn't exist.");
      }
      creatorId = rooms[0].creator_id;
      return getParticipants(code);
    })
    .then(function (participants) {
      const alreadyIn = participants.some(function (participant) {
        return participant.user_id === currentUser.id;
      });

      if (!alreadyIn && participants.length >= 2) {
        throw realtimeError("room_full", "This booth is already full.");
      }

      return addParticipant(code, currentUser);
    })
    .then(function () {
      return getParticipants(code);
    })
    .then(function (participants) {
      return { roomCode: code, participants: participants, creatorId: creatorId };
    });
}

// Removes the signed-in user's own participant row. Used for an
// explicit "Leave Booth" click.
function leaveRoom(code) {
  const currentUser = getCurrentUser();
  if (!currentUser) return Promise.resolve();

  return fetch(
    SUPABASE_URL + "/rest/v1/room_participants?room_code=eq." + encodeURIComponent(code) +
      "&user_id=eq." + currentUser.id,
    { method: "DELETE", headers: realtimeHeaders() }
  ).catch(function () {
    // Best-effort — nothing useful to do if this fails.
  });
}

// Same as leaveRoom(), but fire-and-forget with `keepalive: true` so it
// can be safely called from a "pagehide" handler when the tab is
// closing and won't wait around for a response.
function leaveRoomBeacon(code) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  fetch(
    SUPABASE_URL + "/rest/v1/room_participants?room_code=eq." + encodeURIComponent(code) +
      "&user_id=eq." + currentUser.id,
    { method: "DELETE", headers: realtimeHeaders(), keepalive: true }
  ).catch(function () {});
}

// -----------------------------------------------------------------
// Live updates (Supabase Realtime over a plain WebSocket)
//
// Supabase Realtime speaks the Phoenix Channels protocol: connect a
// WebSocket, send a "phx_join" message naming which Postgres rows to
// watch, then listen for "postgres_changes" messages as rows change.
// A "phoenix" heartbeat keeps the connection alive; an unexpected
// close triggers a simple reconnect after a short delay.
// -----------------------------------------------------------------

// Subscribes to INSERT/UPDATE/DELETE on this room's participants, and
// also opens up the same channel for "broadcast" messages — small,
// not-saved-to-the-database pings used by js/webrtc.js to pass along
// WebRTC offers/answers/ICE candidates between the two browsers.
//
// handlers:
//   onParticipants(participants) — called with the fresh list whenever
//     someone joins or leaves (and once right after connecting).
//   onConnectionLost() — called if the socket drops unexpectedly.
//   onReconnected() — called once the socket rejoins successfully.
// Returns:
//   on(eventName, callback) — run callback(data) when a broadcast of
//     that event name arrives from the other person in the room.
//   broadcast(eventName, data) — send a broadcast to the other person.
//   unsubscribe() — close the connection and stop retrying.
function subscribeToRoom(code, handlers) {
  const topic = "realtime:booth-room-" + code;
  const broadcastListeners = {};

  let socket = null;
  let joinRef = null;
  let msgRef = 0;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let closedByCaller = false;

  function nextRef() {
    msgRef += 1;
    return String(msgRef);
  }

  function connect() {
    const session = getSession();
    if (!session) return;

    const wsUrl =
      SUPABASE_URL.replace("https://", "wss://") +
      "/realtime/v1/websocket?apikey=" + SUPABASE_ANON_KEY + "&vsn=1.0.0";

    socket = new WebSocket(wsUrl);

    socket.onopen = function () {
      joinRef = nextRef();
      socket.send(JSON.stringify({
        topic: topic,
        event: "phx_join",
        payload: {
          config: {
            broadcast: { self: false },
            presence: { key: "" },
            postgres_changes: [
              { event: "*", schema: "public", table: "room_participants", filter: "room_code=eq." + code }
            ]
          },
          access_token: session.accessToken
        },
        ref: joinRef
      }));

      heartbeatTimer = setInterval(function () {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: nextRef() }));
        }
      }, 25000);
    };

    socket.onmessage = function (messageEvent) {
      let message;
      try {
        message = JSON.parse(messageEvent.data);
      } catch (error) {
        return;
      }

      if (message.event === "phx_reply" && message.ref === joinRef) {
        if (message.payload && message.payload.status === "ok") {
          if (handlers.onReconnected) handlers.onReconnected();
          getParticipants(code).then(handlers.onParticipants).catch(function () {});
        } else if (handlers.onConnectionLost) {
          handlers.onConnectionLost();
        }
        return;
      }

      if (message.event === "postgres_changes") {
        getParticipants(code).then(handlers.onParticipants).catch(function () {});
        return;
      }

      if (message.event === "broadcast" && message.payload) {
        const listeners = broadcastListeners[message.payload.event];
        if (listeners) {
          listeners.forEach(function (listener) {
            listener(message.payload.payload);
          });
        }
      }
    };

    socket.onclose = function () {
      clearInterval(heartbeatTimer);
      if (closedByCaller) return;

      if (handlers.onConnectionLost) handlers.onConnectionLost();
      reconnectTimer = setTimeout(connect, 3000);
    };

    socket.onerror = function () {
      // socket.onclose fires right after and handles the reconnect.
    };
  }

  connect();

  return {
    on: function (eventName, callback) {
      if (!broadcastListeners[eventName]) broadcastListeners[eventName] = [];
      broadcastListeners[eventName].push(callback);
    },

    broadcast: function (eventName, data) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        topic: topic,
        event: "broadcast",
        payload: { type: "broadcast", event: eventName, payload: data },
        ref: nextRef()
      }));
    },

    unsubscribe: function () {
      closedByCaller = true;
      clearInterval(heartbeatTimer);
      clearTimeout(reconnectTimer);

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ topic: topic, event: "phx_leave", payload: {}, ref: nextRef() }));
      }
      if (socket) socket.close();
    }
  };
}
