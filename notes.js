// notes.js
// Handles the "Leave a Note" page: submitting a new note, rendering
// the list of notes, deleting a note, and persisting them all to
// localStorage (same pattern as js/booth.js uses for photos).

const NOTES_STORAGE_KEY = "olbNotes";

const noteForm = document.getElementById("noteForm");
const noteFromInput = document.getElementById("noteFrom");
const noteTextInput = document.getElementById("noteText");

const notesGallery = document.getElementById("notesGallery");
const notesEmpty = document.getElementById("notesEmpty");

// Every note gets a unique id so its card can be matched back up for deletion.
let notes = [];
let nextNoteId = 1;

// Reads any previously saved notes back out of localStorage and
// rebuilds their cards, so notes from an earlier visit are still here.
function loadNotesFromStorage() {
  const stored = localStorage.getItem(NOTES_STORAGE_KEY);
  if (!stored) return;

  let savedNotes;
  try {
    savedNotes = JSON.parse(stored);
  } catch (error) {
    // Saved data was corrupted/unreadable — start fresh instead of crashing.
    return;
  }

  notes = savedNotes;
  notes.forEach(renderNoteCard);

  if (notes.length > 0) {
    notesEmpty.style.display = "none";

    // Make sure new notes keep getting fresh ids, continuing on from
    // the highest id that was restored.
    const highestId = Math.max.apply(null, notes.map(function (note) { return note.id; }));
    nextNoteId = highestId + 1;
  }
}

// Saves the current `notes` array to localStorage. Called after every add/delete.
function saveNotesToStorage() {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
}

// Builds one note card (text, optional "from" name, date/time, delete
// button) and inserts it as the first card in the notes grid.
function renderNoteCard(note) {
  const card = document.createElement("div");
  card.className = "note-card";

  card.innerHTML = `
    <span class="note-card-heart">💗</span>
    <p class="note-card-text"></p>
    <div class="note-card-meta">
      <span class="note-card-from"></span>
      <span class="note-card-datetime">${note.dateText} · ${note.timeText}</span>
      <button type="button" class="note-card-delete" title="Delete note">🗑️</button>
    </div>
  `;

  // Set text content (not HTML) so a note can never be mistaken for markup.
  card.querySelector(".note-card-text").textContent = note.text;
  card.querySelector(".note-card-from").textContent = note.from ? note.from : "Anonymous";

  card.querySelector(".note-card-delete").addEventListener("click", function () {
    deleteNote(note.id, card);
  });

  notesGallery.insertBefore(card, notesGallery.firstChild);
}

// Removes a note from both the data array and the page.
function deleteNote(id, cardElement) {
  notes = notes.filter(function (note) {
    return note.id !== id;
  });
  cardElement.remove();

  if (notes.length === 0) {
    notesEmpty.style.display = "block";
  }

  saveNotesToStorage();
}

// Turns the form fields into a new note, adds it to the top of the
// grid, and clears the form for the next one.
noteForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const text = noteTextInput.value.trim();
  if (text === "") return;

  const now = new Date();

  const note = {
    id: nextNoteId++,
    text: text,
    from: noteFromInput.value.trim(),
    dateText: now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    timeText: now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  };

  notes.unshift(note);
  renderNoteCard(note);
  notesEmpty.style.display = "none";
  saveNotesToStorage();

  noteForm.reset();
});

loadNotesFromStorage();
