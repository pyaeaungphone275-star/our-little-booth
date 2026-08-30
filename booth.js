// booth.js
// Handles asking for webcam access, showing the live camera feed,
// applying real-time Beauty Mode filters using CSS, and capturing
// photos into Polaroid-style "Recent Memories" cards.

// -----------------------------------------------------------------
// Couple Booth room (real-time, via Supabase — see js/realtime.js)
// and live camera sharing (WebRTC — see js/webrtc.js)
//
// Room-code storage (which room this browser tab currently has open)
// lives in js/room.js. The room/participant data and live "your
// partner joined" updates come from js/realtime.js, which talks to
// Supabase's `rooms`/`room_participants` tables and also carries the
// WebRTC signaling messages js/webrtc.js sends/receives.
//
// The peer video call can only start once BOTH of these are ready:
// this browser's own camera/mic stream, and the joined Realtime
// channel (which tells us who should make the WebRTC offer). Since
// those finish at different times, maybeStartPeerCall() is called
// from both places and only actually starts the call once both have
// arrived.
// -----------------------------------------------------------------

const roomCode = getRoomCode();
let roomChannel = null;
let peerCall = null;
let localStream = null;
let isOfferer = false;
let channelReady = false;

// Reassigned below (only in room mode) to the real implementation.
// Declared out here so the getUserMedia handler further down — which
// runs in both solo and room mode — can always safely call it.
let maybeStartPeerCall = function () {};

if (roomCode) {
  const currentBoothUser = getCurrentUser();

  const remoteCameraBox = document.getElementById("remoteCameraBox");
  const remoteCameraPreview = document.getElementById("remoteCameraPreview");
  const cameraGrid = document.getElementById("cameraGrid");
  const webrtcStatusText = document.getElementById("webrtcStatusText");

  maybeStartPeerCall = function () {
    if (peerCall || !localStream || !channelReady) return;

    cameraGrid.classList.add("dual");
    remoteCameraBox.hidden = false;
    webrtcStatusText.hidden = false;

    peerCall = startPeerCall({
      roomChannel: roomChannel,
      isOfferer: isOfferer,
      localStream: localStream,
      onRemoteStream: function (stream) {
        const remoteVideo = document.createElement("video");
        remoteVideo.srcObject = stream;
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;

        remoteCameraPreview.innerHTML = "";
        remoteCameraPreview.appendChild(remoteVideo);
        remoteCameraPreview.classList.add("camera-active");
      },
      onStatusChange: function (status) {
        if (status === "connecting") {
          webrtcStatusText.textContent = "Connecting...";
        } else if (status === "connected") {
          webrtcStatusText.textContent = "Connected 💗";
        } else {
          webrtcStatusText.textContent = "Disconnected";
          remoteCameraPreview.classList.remove("camera-active");
          remoteCameraPreview.innerHTML = `
            <div class="camera-icon">🌸</div>
            <p>Disconnected</p>
          `;
        }
      },
      onError: function () {
        webrtcStatusText.textContent = "Connection failed — try leaving and rejoining the booth.";
      }
    });
  };

  document.getElementById("roomCodeDisplay").textContent = roomCode;
  document.getElementById("coupleRoomPanel").hidden = false;

  const copyRoomCodeBtn = document.getElementById("copyRoomCodeBtn");
  copyRoomCodeBtn.addEventListener("click", function () {
    copyRoomCode().then(function (wasCopied) {
      if (!wasCopied) return;

      const originalLabel = copyRoomCodeBtn.textContent;
      copyRoomCodeBtn.textContent = "Copied! 💕";
      setTimeout(function () {
        copyRoomCodeBtn.textContent = originalLabel;
      }, 1500);
    });
  });

  document.getElementById("leaveBoothBtn").addEventListener("click", function () {
    if (peerCall) peerCall.stop();
    if (roomChannel) roomChannel.unsubscribe();
    leaveRoom(roomCode).then(function () {
      clearRoomCode();
      window.location.href = "home.html";
    });
  });

  // Best-effort: if this tab is closed or refreshed without clicking
  // "Leave Booth", let the partner's UI know we're gone.
  window.addEventListener("pagehide", function () {
    leaveRoomBeacon(roomCode);
  });

  // The camera/countdown/Beauty Mode/Recent Memories sections stay
  // tucked away in the lobby until "Enter Photo Booth" is clicked, so
  // the room code + waiting state is the first thing you see. (Solo
  // visits to booth.html, with no room code, are unaffected — those
  // sections are never hidden below.)
  const boothLayout = document.querySelector(".booth-layout");
  const beautyPanel = document.querySelector(".beauty-panel");
  const recentMemoriesPanel = document.querySelector(".recent-memories-panel");

  boothLayout.hidden = true;
  beautyPanel.hidden = true;
  recentMemoriesPanel.hidden = true;

  const enterPhotoBoothBtn = document.getElementById("enterPhotoBoothBtn");
  enterPhotoBoothBtn.addEventListener("click", function () {
    boothLayout.hidden = false;
    beautyPanel.hidden = false;
    recentMemoriesPanel.hidden = false;
    boothLayout.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const roomStatusText = document.getElementById("roomStatusText");
  const partnerCard = document.getElementById("partnerCard");
  const partnerStatus = document.getElementById("partnerStatus");
  const roomErrorBanner = document.getElementById("roomErrorBanner");

  function showRoomError(message) {
    roomErrorBanner.textContent = message;
    roomErrorBanner.hidden = false;
  }

  // Redraws the "You / Your Partner" cards and the room-status line
  // from the latest participants list. Called once right after joining,
  // then again every time js/realtime.js pushes a live update.
  function renderParticipants(participants) {
    roomErrorBanner.hidden = true;

    const partnerIsHere = participants.some(function (participant) {
      return participant.user_id !== currentBoothUser.id;
    });

    if (partnerIsHere) {
      partnerCard.classList.remove("waiting");
      partnerStatus.textContent = "💗 Connected";
      roomStatusText.innerHTML = "<span class=\"status-dot\"></span>You're both here! 💗";
    } else {
      partnerCard.classList.add("waiting");
      partnerStatus.textContent = "⏳ Waiting...";
      roomStatusText.innerHTML = "<span class=\"status-dot\"></span>Waiting for your partner...";
    }
  }

  joinRoom(roomCode)
    .then(function (result) {
      renderParticipants(result.participants);
      isOfferer = currentBoothUser.id === result.creatorId;

      roomChannel = subscribeToRoom(roomCode, {
        onParticipants: renderParticipants,
        onConnectionLost: function () {
          roomStatusText.textContent = "💔 Connection lost — reconnecting...";
        },
        onReconnected: function () {
          roomErrorBanner.hidden = true;
          channelReady = true;
          maybeStartPeerCall();
        }
      });
    })
    .catch(function (error) {
      if (error.type === "not_found") {
        showRoomError("This booth doesn't exist anymore 💗");
      } else if (error.type === "room_full") {
        showRoomError("This booth is already full 💗");
      } else {
        showRoomError("Couldn't connect to this booth. Please try again 💗");
      }

      enterPhotoBoothBtn.disabled = true;
    });
}

// Grab the container div where the camera feed (or an error message)
// should be displayed. This matches the id="cameraPreview" in booth.html.
const cameraPreview = document.getElementById("cameraPreview");

// The countdown overlay ("3... 2... 1... 📸 Smile!") sits on top of the
// video and lives inside cameraPreview in the HTML.
const countdownOverlay = document.getElementById("countdownOverlay");

// Take Photo button and the countdown-length dropdown from the controls panel.
const takePhotoBtn = document.getElementById("takePhotoBtn");
const countdownSelect = document.getElementById("countdown");

// The "Recent Memories" grid where captured Polaroids are displayed,
// and the placeholder message shown while it's empty.
const recentMemories = document.getElementById("recentMemories");
const memoriesEmpty = document.getElementById("memoriesEmpty");

// Will hold a reference to the <video> element once the camera is
// ready, so the Beauty Mode sliders (further down) can style it.
let videoElement = null;

// Every captured photo becomes a "memory" object here. Newest first.
let memories = [];

// Gives each memory a unique id so its card, its data, and its
// Download/Retake/Delete buttons can all be matched back up.
let nextMemoryId = 1;

// -----------------------------------------------------------------
// localStorage persistence
//
// localStorage is a small key-value store built into the browser —
// it only holds strings, and it survives page refreshes and the tab
// being closed (until it's cleared). All memories are kept under one
// key as a single JSON string, since JSON.stringify/JSON.parse is how
// a JavaScript array gets turned into text and back. memories.html
// reads this same key to show the full gallery.
// -----------------------------------------------------------------

const MEMORIES_STORAGE_KEY = "olbMemories";

// Saves the current `memories` array to localStorage. Called after
// every add, delete, or caption edit so nothing is lost on refresh.
function saveMemoriesToStorage() {
  localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(memories));
}

// Reads any previously saved memories back out of localStorage and
// rebuilds their Polaroid cards, so photos from an earlier visit are
// still here when the page reloads.
function loadMemoriesFromStorage() {
  const stored = localStorage.getItem(MEMORIES_STORAGE_KEY);
  if (!stored) return;

  let savedMemories;
  try {
    savedMemories = JSON.parse(stored);
  } catch (error) {
    // Saved data was corrupted/unreadable — start fresh instead of crashing.
    return;
  }

  memories = savedMemories;
  memories.forEach(renderMemoryCard);

  if (memories.length > 0) {
    memoriesEmpty.style.display = "none";

    // Make sure new memories keep getting fresh ids, continuing on
    // from the highest id that was restored.
    const highestId = Math.max.apply(null, memories.map(function (memory) { return memory.id; }));
    nextMemoryId = highestId + 1;
  }
}

loadMemoriesFromStorage();

// Ask the browser for permission to use the webcam (and, in a Couple
// Booth room, the microphone too — needed for the live WebRTC call).
// getUserMedia() returns a Promise, so we use .then() for success
// and .catch() for when the user says no (or something goes wrong).
//
// In a room, if audio fails (e.g. no microphone) but video works, we
// fall back to camera-only rather than blocking the whole booth on a
// missing mic — the call still connects, just without sound.
const wantsAudio = !!roomCode;

function requestCameraAndMic() {
  return navigator.mediaDevices.getUserMedia({ video: true, audio: wantsAudio }).catch(function (error) {
    if (!wantsAudio || error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      throw error;
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      // Might just be a missing microphone — try camera-only before giving up.
      return navigator.mediaDevices.getUserMedia({ video: true }).catch(function () {
        throw error;
      });
    }
    throw error;
  });
}

requestCameraAndMic()
  .then(function (stream) {
    // Permission granted! "stream" is the live video (and, in a room,
    // audio) coming from the webcam/mic.
    localStream = stream;

    // Create a <video> element in JavaScript to play that stream.
    videoElement = document.createElement("video");
    videoElement.srcObject = stream;

    // These three settings let the video play immediately, without
    // showing browser controls or requiring the user to press play.
    videoElement.autoplay = true;
    videoElement.muted = true;
    videoElement.playsInline = true;

    // Remove the placeholder icon/text and put the video in its place.
    // (This also removes countdownOverlay from the page, since it was a
    // child of cameraPreview — so we re-attach the same element below.)
    cameraPreview.innerHTML = "";
    cameraPreview.appendChild(videoElement);
    cameraPreview.appendChild(countdownOverlay);

    // Add a class so the CSS can drop the dashed placeholder styling
    // now that a real video feed is showing.
    cameraPreview.classList.add("camera-active");

    // Apply whatever Beauty Mode state/sliders are currently set
    // (Beauty Mode starts OFF, so this just confirms the feed is plain).
    // Note: this is a local-preview-only filter (plain CSS on the
    // <video> element) — it does not affect the raw video sent to your
    // partner over WebRTC.
    updateBeautyFilter();

    // Now that there's a live video feed, photos can actually be taken.
    takePhotoBtn.disabled = false;

    // In a Couple Booth room, this camera/mic stream is also what gets
    // sent to your partner — start (or continue waiting to start) the
    // WebRTC call now that it's ready.
    maybeStartPeerCall();
  })
  .catch(function (error) {
    // Permission was denied, no device was found, or something else
    // went wrong. Show a friendly message instead of a blank/broken preview.
    let message = "Camera unavailable. Please check your device and refresh the page.";

    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      message = "Camera/microphone permission denied. Please allow access and refresh the page.";
    } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      message = "No camera or microphone was found on this device.";
    }

    cameraPreview.innerHTML = `
      <div class="camera-icon">📷</div>
      <p>${message}</p>
    `;
  });

// -----------------------------------------------------------------
// Beauty Mode
//
// Beauty Mode is simulated using CSS filter effects on the <video>
// element — brightness, contrast, saturation, warmth (sepia + hue
// shift), and a light blur standing in for "skin smoothing" and
// "soft glow". This is NOT real AI skin smoothing (no face
// detection or per-pixel retouching) — just a lightweight, natural-
// looking enhancement, as requested.
// -----------------------------------------------------------------

// Grab the Beauty Mode checkbox and the box of sliders it controls.
const enableBeautyMode = document.getElementById("enableBeautyMode");
const beautySliders = document.getElementById("beautySliders");
const lowLightEnhancement = document.getElementById("lowLightEnhancement");

// Grab each individual slider so we can read its value and listen
// for changes.
const skinSmoothSlider = document.getElementById("skinSmooth");
const brightnessSlider = document.getElementById("brightness");
const warmthSlider = document.getElementById("warmth");
const contrastSlider = document.getElementById("contrast");
const saturationSlider = document.getElementById("saturation");
const softGlowSlider = document.getElementById("softGlow");

// -----------------------------------------------------------------
// Apply saved defaults from the Settings page (settings.html /
// js/settings.js), if any were ever set. Beauty Mode being pre-enabled
// also un-disables its sliders, same as toggling the checkbox by hand.
// -----------------------------------------------------------------

const savedDefaultCountdown = localStorage.getItem("olbDefaultCountdown");
if (savedDefaultCountdown) {
  countdownSelect.value = savedDefaultCountdown;
}

if (localStorage.getItem("olbBeautyMode") === "on") {
  enableBeautyMode.checked = true;
  beautySliders.querySelectorAll("input[type='range']").forEach(function (slider) {
    slider.disabled = false;
  });
}

// Builds one CSS filter string from all the slider values and
// applies it to the video — or removes it entirely when Beauty
// Mode is switched off.
function updateBeautyFilter() {
  // No camera feed yet, nothing to style.
  if (!videoElement) return;

  // Beauty Mode OFF: show the plain, unfiltered webcam.
  if (!enableBeautyMode.checked) {
    videoElement.style.filter = "none";
    return;
  }

  // Read the current value of every slider as a number.
  const skinSmooth = Number(skinSmoothSlider.value);
  const brightness = Number(brightnessSlider.value);
  const warmth = Number(warmthSlider.value);
  const contrast = Number(contrastSlider.value);
  const saturation = Number(saturationSlider.value);
  const softGlow = Number(softGlowSlider.value);

  // Brightness slider goes from -50 to 50, so 0 = no change.
  // CSS brightness() is a percentage where 100% = no change.
  let brightnessPercent = 100 + brightness;

  // Contrast and Saturation sliders go from 0 to 100, with 50 as
  // the neutral middle point (which should map to 100% = no change).
  const contrastPercent = 50 + contrast;
  const saturationPercent = 50 + saturation;

  // Warmth slider goes from 0 to 100, with 50 as neutral.
  // Above 50 = warmer (a touch of sepia). Below 50 = cooler
  // (a small hue shift toward blue). This is a simple approximation,
  // not true color-temperature correction.
  const warmthOffset = warmth - 50; // ranges from -50 to 50
  const sepiaPercent = Math.max(0, warmthOffset) * 0.6;
  const hueRotateDeg = warmthOffset * -0.2;

  // Skin Smooth and Soft Glow both use a gentle blur as a
  // lightweight stand-in for real retouching — no AI involved.
  const blurPx = (skinSmooth / 100) * 2 + (softGlow / 100) * 1.5;

  // Soft Glow also lifts brightness slightly, for a hazy "glowing" look.
  brightnessPercent += (softGlow / 100) * 10;

  // Combine every effect into a single filter string.
  videoElement.style.filter =
    `brightness(${brightnessPercent}%) ` +
    `contrast(${contrastPercent}%) ` +
    `saturate(${saturationPercent}%) ` +
    `sepia(${sepiaPercent}%) ` +
    `hue-rotate(${hueRotateDeg}deg) ` +
    `blur(${blurPx}px)`;
}

// Turning Beauty Mode on/off enables or disables all the sliders,
// and immediately updates (or removes) the filter on the video.
enableBeautyMode.addEventListener("change", function () {
  const isEnabled = enableBeautyMode.checked;

  const sliders = beautySliders.querySelectorAll("input[type='range']");
  sliders.forEach(function (slider) {
    slider.disabled = !isEnabled;
  });

  updateBeautyFilter();
});

// Every slider re-runs updateBeautyFilter() as it moves, using the
// "input" event so the preview updates live while dragging, not
// just after letting go.
skinSmoothSlider.addEventListener("input", updateBeautyFilter);
brightnessSlider.addEventListener("input", updateBeautyFilter);
warmthSlider.addEventListener("input", updateBeautyFilter);
contrastSlider.addEventListener("input", updateBeautyFilter);
saturationSlider.addEventListener("input", updateBeautyFilter);
softGlowSlider.addEventListener("input", updateBeautyFilter);

// Low Light Enhancement isn't implemented yet — this is a placeholder
// hook for a future step (e.g. boosting gain/exposure in low light).
function applyLowLightEnhancement(isEnabled) {
  // TODO: brighten/denoise the video feed in low light when isEnabled is true.
}

lowLightEnhancement.addEventListener("change", function () {
  applyLowLightEnhancement(lowLightEnhancement.checked);
});

// -----------------------------------------------------------------
// Photo capture
//
// Take Photo runs a countdown over the live video, then draws the
// current video frame onto a hidden <canvas> to turn it into an
// image. That image becomes a "memory": a Polaroid-style card with
// an auto-added date/time/title, a handwritten-style caption box,
// and Download/Retake/Delete buttons, shown in Recent Memories.
// -----------------------------------------------------------------

// Starts the "3... 2... 1... 📸 Smile!" countdown, then takes the photo.
// Runs when the Take Photo button is clicked.
function startCountdown() {
  // Safety check: nothing to photograph without a live video feed.
  if (!videoElement) return;

  // Read how many seconds to count down from the dropdown (3/5/10).
  let secondsLeft = Number(countdownSelect.value);

  // Disable Take Photo so it can't be clicked again mid-countdown.
  takePhotoBtn.disabled = true;

  // Show the overlay on top of the video and display the first number.
  countdownOverlay.classList.add("active");
  countdownOverlay.textContent = secondsLeft;

  // Tick down once per second.
  const countdownTimer = setInterval(function () {
    secondsLeft--;

    if (secondsLeft > 0) {
      // Still counting down: show the next number (e.g. "2", then "1").
      countdownOverlay.textContent = secondsLeft;
    } else {
      // Reached zero: stop ticking and show the final "Smile!" message.
      clearInterval(countdownTimer);
      countdownOverlay.textContent = "📸 Smile!";

      // Give the user a moment to see "Smile!" before the photo is taken.
      setTimeout(function () {
        countdownOverlay.classList.remove("active");
        capturePhoto();
        takePhotoBtn.disabled = false;
      }, 700);
    }
  }, 1000);
}

// Draws the current video frame onto a hidden canvas, turns it into
// a PNG image, and adds it to Recent Memories as a new Polaroid.
function capturePhoto() {
  if (!videoElement) return;

  // A <canvas> is an invisible drawing surface — perfect for grabbing
  // a single still frame out of a moving video.
  const canvas = document.createElement("canvas");
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  // Draw the current video frame onto the canvas, then read it back
  // out as a PNG data URL (a text string that represents the image).
  const context = canvas.getContext("2d");
  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  const photoDataURL = canvas.toDataURL("image/png");

  addMemory(photoDataURL);
}

// Turns a captured photo into a "memory" object and adds its
// Polaroid card to the top of the Recent Memories grid.
function addMemory(photoDataURL) {
  const now = new Date();

  const memory = {
    id: nextMemoryId++,
    photoDataURL: photoDataURL,
    dateText: now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    timeText: now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    caption: ""
  };

  memories.unshift(memory);
  renderMemoryCard(memory);

  // At least one real memory now exists, so hide the empty-state message.
  memoriesEmpty.style.display = "none";

  saveMemoriesToStorage();
}

// Builds the on-screen Polaroid card for one memory (photo, auto-added
// title/date, editable caption, and its Download/Retake/Delete buttons)
// and inserts it as the first card in the Recent Memories grid.
function renderMemoryCard(memory) {
  const card = document.createElement("div");
  card.className = "polaroid-card";

  card.innerHTML = `
    <img class="polaroid-photo" src="${memory.photoDataURL}" alt="Captured memory">
    <div class="polaroid-bottom">
      <p class="polaroid-title">Our Little Booth 💗</p>
      <p class="polaroid-datetime">${memory.dateText} · ${memory.timeText}</p>
      <textarea class="polaroid-caption" placeholder="Write a memory..." rows="1"></textarea>
      <div class="polaroid-actions">
        <button type="button" class="polaroid-btn download">💾 Download</button>
        <button type="button" class="polaroid-btn retake">🔄 Retake</button>
        <button type="button" class="polaroid-btn delete">🗑️ Delete</button>
      </div>
    </div>
  `;

  // If this card is being restored from a previous visit, put the
  // saved caption text back in the box.
  const captionField = card.querySelector(".polaroid-caption");
  captionField.value = memory.caption;

  // Keep the memory's caption in sync as the user types it...
  captionField.addEventListener("input", function () {
    memory.caption = captionField.value;
  });

  // ...and save it to localStorage once they're done typing, instead
  // of on every single keystroke.
  captionField.addEventListener("blur", function () {
    saveMemoriesToStorage();
  });

  card.querySelector(".download").addEventListener("click", function () {
    downloadMemory(memory);
  });

  // Retake: this memory wasn't the one — remove it and start over.
  card.querySelector(".retake").addEventListener("click", function () {
    deleteMemory(memory.id, card);
    startCountdown();
  });

  card.querySelector(".delete").addEventListener("click", function () {
    deleteMemory(memory.id, card);
  });

  recentMemories.insertBefore(card, recentMemories.firstChild);
}

// Removes a memory from both the data array and the page.
function deleteMemory(id, cardElement) {
  memories = memories.filter(function (memory) {
    return memory.id !== id;
  });
  cardElement.remove();

  // No memories left: bring back the empty-state message.
  if (memories.length === 0) {
    memoriesEmpty.style.display = "block";
  }

  saveMemoriesToStorage();
}

// Builds a filename using the current date and time,
// e.g. "our-little-booth_2026-08-05_14-32-05.png".
function buildPhotoFilename() {
  const now = new Date();

  // Pads single digits with a leading zero (5 -> "05").
  function pad(number) {
    return String(number).padStart(2, "0");
  }

  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  return `our-little-booth_${datePart}_${timePart}.png`;
}

// Draws a rectangle with rounded corners — used as the white
// Polaroid card background when building the downloadable image.
function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

// Composites one memory into a full Polaroid image on a fresh canvas —
// white frame, rounded corners, larger bottom border, the photo, and
// the title/date/caption text baked right into the pixels — so the
// downloaded file looks like a finished Polaroid on its own, without
// needing the page's CSS. Calls onReady(canvas) once it's drawn.
function buildPolaroidCanvas(memory, onReady) {
  const photo = new Image();

  photo.onload = function () {
    const border = 24; // white border on the top/left/right
    const bottomBorder = 120; // larger bottom border for title/date/caption

    const canvas = document.createElement("canvas");
    canvas.width = photo.width + border * 2;
    canvas.height = photo.height + border + bottomBorder;

    const ctx = canvas.getContext("2d");

    // White rounded card as the background.
    drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 24);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // The photo itself, inset by the border.
    ctx.drawImage(photo, border, border, photo.width, photo.height);

    // Title, date/time, and (if present) the caption, centered in the
    // bottom border area below the photo.
    const centerX = canvas.width / 2;
    let textY = photo.height + border + 36;

    ctx.textAlign = "center";
    ctx.fillStyle = "#b06a95";
    ctx.font = "bold 28px Poppins, sans-serif";
    ctx.fillText("Our Little Booth 💗", centerX, textY);

    textY += 28;
    ctx.fillStyle = "#a98ba7";
    ctx.font = "20px Nunito, sans-serif";
    ctx.fillText(`${memory.dateText} · ${memory.timeText}`, centerX, textY);

    const caption = memory.caption.trim();
    if (caption !== "") {
      // Keep the caption to one short line so it can't overflow the card.
      const maxCaptionChars = 40;
      const captionText =
        caption.length > maxCaptionChars ? caption.slice(0, maxCaptionChars - 1) + "…" : caption;

      textY += 34;
      ctx.fillStyle = "#6b4f63";
      ctx.font = "24px Caveat, cursive";
      ctx.fillText(captionText, centerX, textY);
    }

    onReady(canvas);
  };

  photo.src = memory.photoDataURL;
}

// Downloads one memory as a finished Polaroid PNG.
// Runs when a card's Download button is clicked.
function downloadMemory(memory) {
  buildPolaroidCanvas(memory, function (canvas) {
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = buildPhotoFilename();

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// Take Photo starts the countdown; everything after that (capture,
// card creation, download/retake/delete) is wired up per-card above.
takePhotoBtn.addEventListener("click", startCountdown);
