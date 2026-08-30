// webrtc.js
// Peer-to-peer live camera between the two people in a Couple Booth
// room, using the browser's native RTCPeerConnection — once the two
// browsers are connected, video/audio flows directly between them,
// not through Supabase at all. Supabase Realtime (js/realtime.js) is
// used only as the "signaling channel": a way to pass along the offer,
// the answer, and ICE candidates that RTCPeerConnection needs to find
// a direct path between the two browsers.
//
// A public STUN server (Google's) is included below — this is normal,
// required infrastructure for any RTCPeerConnection (it only helps the
// two browsers discover how to reach each other; it never sees or
// relays the actual video/audio). It is not a video SDK or hosting
// service.

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

// Starts (or waits to start) a WebRTC call over an already-joined
// room channel (the object returned by subscribeToRoom() in
// js/realtime.js). options:
//   roomChannel — the subscribeToRoom() result (for on()/broadcast()).
//   isOfferer — true for whichever of the two people should create
//     the WebRTC offer (the room's creator — see js/booth.js).
//   localStream — this browser's own camera/mic MediaStream.
//   onRemoteStream(stream) — called once the partner's video/audio
//     starts arriving.
//   onStatusChange(status) — called with "connecting", "connected",
//     or "disconnected" as the peer connection's state changes.
//   onError(type) — called with "connection_failed" if the two
//     browsers couldn't establish a connection.
// Returns { stop() } to tear the call down (e.g. on Leave Booth).
function startPeerCall(options) {
  const roomChannel = options.roomChannel;
  const isOfferer = options.isOfferer;
  const localStream = options.localStream;

  let pc = null;
  let readyPingTimer = null;
  let pendingRemoteCandidates = [];
  let remoteDescriptionSet = false;
  let stopped = false;

  function setStatus(status) {
    if (options.onStatusChange) options.onStatusChange(status);
  }

  function createPeerConnection() {
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    localStream.getTracks().forEach(function (track) {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = function (event) {
      if (options.onRemoteStream) options.onRemoteStream(event.streams[0]);
    };

    pc.onicecandidate = function (event) {
      if (event.candidate) {
        roomChannel.broadcast("webrtc-ice-candidate", { candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = function () {
      if (stopped || !pc) return;

      if (pc.connectionState === "connected") {
        setStatus("connected");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        setStatus("disconnected");
      } else if (pc.connectionState === "failed") {
        setStatus("disconnected");
        if (options.onError) options.onError("connection_failed");
      } else {
        setStatus("connecting");
      }
    };
  }

  function flushPendingCandidates() {
    pendingRemoteCandidates.forEach(function (candidate) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(function () {});
    });
    pendingRemoteCandidates = [];
  }

  // Only the offerer calls this, once it hears a "webrtc-ready" ping
  // from the other side (proof their channel is up and listening).
  function makeOffer() {
    if (pc) return; // an offer is already in flight or connected

    setStatus("connecting");
    createPeerConnection();

    pc.createOffer()
      .then(function (offer) {
        return pc.setLocalDescription(offer);
      })
      .then(function () {
        roomChannel.broadcast("webrtc-offer", { sdp: pc.localDescription });
      })
      .catch(function () {
        if (options.onError) options.onError("connection_failed");
      });
  }

  // Only the answerer calls this, on receiving the offerer's offer.
  function handleOffer(data) {
    if (!pc) createPeerConnection();
    setStatus("connecting");

    pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      .then(function () {
        remoteDescriptionSet = true;
        flushPendingCandidates();
        return pc.createAnswer();
      })
      .then(function (answer) {
        return pc.setLocalDescription(answer);
      })
      .then(function () {
        roomChannel.broadcast("webrtc-answer", { sdp: pc.localDescription });
        clearInterval(readyPingTimer);
      })
      .catch(function () {
        if (options.onError) options.onError("connection_failed");
      });
  }

  // Only the offerer calls this, on receiving the answerer's answer.
  function handleAnswer(data) {
    if (!pc) return;

    pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      .then(function () {
        remoteDescriptionSet = true;
        flushPendingCandidates();
      })
      .catch(function () {
        if (options.onError) options.onError("connection_failed");
      });
  }

  function handleIceCandidate(data) {
    if (!data.candidate) return;

    // ICE candidates can arrive before setRemoteDescription() finishes
    // (they're sent as soon as each one is discovered) — queue them
    // until there's a remote description to attach them to.
    if (pc && remoteDescriptionSet) {
      pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(function () {});
    } else {
      pendingRemoteCandidates.push(data.candidate);
    }
  }

  roomChannel.on("webrtc-ready", function () {
    if (isOfferer) makeOffer();
  });
  roomChannel.on("webrtc-offer", function (data) {
    if (!isOfferer) handleOffer(data);
  });
  roomChannel.on("webrtc-answer", function (data) {
    if (isOfferer) handleAnswer(data);
  });
  roomChannel.on("webrtc-ice-candidate", handleIceCandidate);

  setStatus("connecting");

  if (!isOfferer) {
    // Announce readiness so the offerer knows it's safe to send an
    // offer. Supabase broadcasts aren't queued for a channel that
    // isn't joined yet, so this repeats for a bit in case the
    // offerer's own channel connection is still coming up.
    let pingCount = 0;
    roomChannel.broadcast("webrtc-ready", {});
    readyPingTimer = setInterval(function () {
      pingCount += 1;
      roomChannel.broadcast("webrtc-ready", {});
      if (pingCount >= 15) clearInterval(readyPingTimer);
    }, 2000);
  }

  return {
    stop: function () {
      stopped = true;
      clearInterval(readyPingTimer);
      if (pc) {
        pc.close();
        pc = null;
      }
    }
  };
}
