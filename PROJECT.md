# Our Little Booth 💗

## Vision

Our Little Booth is a cozy virtual photo booth designed for two people in a long-distance relationship.

The goal is to create a warm, thoughtful experience where couples can log in, take cute photos together, and save memories.

The project should feel soft, romantic, and minimalist.

---

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript

Future:
- Supabase (authentication + storage)
- WebRTC (live camera)

---

## Design

Theme:
- Pastel pink
- Cream
- White
- Lavender accents

Fonts:
- Poppins
- Nunito

Style:
- Rounded corners
- Soft shadows
- Glassmorphism
- Floating hearts
- Smooth animations

---

## Pages

Landing Page

Login

Home

Photo Booth

Gallery (future)

---

## Online Couple Sessions

The Couple Booth room (Create a Booth / Join a Booth, the room code, the
"Your Partner" waiting card) is currently only a **local prototype**.
Room codes are generated in the browser and saved to `localStorage`
(see `js/room.js`) — there is no real server, account, or network
connection between the two people yet.

Future technology, to replace this local prototype with a real online
session:
- Supabase Authentication
- Supabase Realtime
- WebRTC

`js/room.js` is written so this swap only has to happen in one place —
each function there is marked with a `TODO` showing where the real
backend call will go.

---

## Rules

Keep the code simple.

No React.

No Bootstrap.

No Tailwind.

Explain changes before writing code.

Only work on one feature at a time.