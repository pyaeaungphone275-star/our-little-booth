// settings.js
// Handles the Settings page: reading saved preferences back into the
// controls on load, saving each one to localStorage as it's changed
// (same auto-save pattern as js/notes.js), and the confirm-then-clear
// flow for wiping saved memories.

const THEME_KEY = "olbTheme";
const COUNTDOWN_KEY = "olbDefaultCountdown";
const BEAUTY_MODE_KEY = "olbBeautyMode";
const ANIMATIONS_KEY = "olbAnimations";
const SOUND_EFFECTS_KEY = "olbSoundEffects";
const MEMORIES_STORAGE_KEY = "olbMemories";

// -----------------------------------------------------------------
// Appearance: Theme
// -----------------------------------------------------------------

const themePinkBtn = document.getElementById("themePinkBtn");
const themeLavenderBtn = document.getElementById("themeLavenderBtn");
const themeButtons = [themePinkBtn, themeLavenderBtn];

// Highlights the button matching the given theme and applies it live
// (the <html data-theme> attribute the lavender CSS rules key off of).
function setTheme(theme) {
  themeButtons.forEach(function (button) {
    button.classList.toggle("active", button.dataset.themeValue === theme);
  });

  if (theme === "lavender") {
    document.documentElement.setAttribute("data-theme", "lavender");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }

  localStorage.setItem(THEME_KEY, theme);
}

themePinkBtn.addEventListener("click", function () {
  setTheme("pink");
});

themeLavenderBtn.addEventListener("click", function () {
  setTheme("lavender");
});

setTheme(localStorage.getItem(THEME_KEY) === "lavender" ? "lavender" : "pink");

// -----------------------------------------------------------------
// Photo Booth: default countdown + Beauty Mode
// -----------------------------------------------------------------

const defaultCountdown = document.getElementById("defaultCountdown");
const defaultBeautyMode = document.getElementById("defaultBeautyMode");

const savedCountdown = localStorage.getItem(COUNTDOWN_KEY);
if (savedCountdown) {
  defaultCountdown.value = savedCountdown;
}

defaultCountdown.addEventListener("change", function () {
  localStorage.setItem(COUNTDOWN_KEY, defaultCountdown.value);
});

defaultBeautyMode.checked = localStorage.getItem(BEAUTY_MODE_KEY) === "on";

defaultBeautyMode.addEventListener("change", function () {
  localStorage.setItem(BEAUTY_MODE_KEY, defaultBeautyMode.checked ? "on" : "off");
});

// -----------------------------------------------------------------
// Experience: Animations + Sound Effects
// -----------------------------------------------------------------

const animationsToggle = document.getElementById("animationsToggle");
const soundEffectsToggle = document.getElementById("soundEffectsToggle");

animationsToggle.checked = localStorage.getItem(ANIMATIONS_KEY) !== "off";

animationsToggle.addEventListener("change", function () {
  const isOn = animationsToggle.checked;
  localStorage.setItem(ANIMATIONS_KEY, isOn ? "on" : "off");

  if (isOn) {
    document.documentElement.removeAttribute("data-animations");
  } else {
    document.documentElement.setAttribute("data-animations", "off");
  }
});

// No sound effects exist anywhere in the app yet, so this just persists
// the preference for a future feature to read.
soundEffectsToggle.checked = localStorage.getItem(SOUND_EFFECTS_KEY) === "on";

soundEffectsToggle.addEventListener("change", function () {
  localStorage.setItem(SOUND_EFFECTS_KEY, soundEffectsToggle.checked ? "on" : "off");
});

// -----------------------------------------------------------------
// Memories: Clear Local Memories (confirm before deleting)
// -----------------------------------------------------------------

const clearMemoriesBtn = document.getElementById("clearMemoriesBtn");
const clearMemoriesConfirm = document.getElementById("clearMemoriesConfirm");
const confirmClearBtn = document.getElementById("confirmClearBtn");
const cancelClearBtn = document.getElementById("cancelClearBtn");
const clearMemoriesSuccess = document.getElementById("clearMemoriesSuccess");

clearMemoriesBtn.addEventListener("click", function () {
  clearMemoriesConfirm.hidden = false;
  clearMemoriesSuccess.hidden = true;
});

cancelClearBtn.addEventListener("click", function () {
  clearMemoriesConfirm.hidden = true;
});

confirmClearBtn.addEventListener("click", function () {
  localStorage.removeItem(MEMORIES_STORAGE_KEY);
  clearMemoriesConfirm.hidden = true;
  clearMemoriesSuccess.hidden = false;
});
