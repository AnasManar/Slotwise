# Slotwise — The booking desk

## Apply this update to your existing VS Code project

1. Stop the running server with Ctrl+C.
2. Extract the updated archive into a separate folder.
3. Copy its three `public/` files into your existing project's `public/` folder:
   - `index.html`
   - `style.css`
   - `app.js`
4. Copy `tests/api.test.ts` into your existing `tests/` folder. Its page-content assertion now checks the new heading.
5. In your existing project, run `npm test`, then `npm start`.
6. Open http://localhost:3000 and hard-refresh with Command+Shift+R on macOS.

The server reads the static assets when it starts, so a server restart is required.

## Design direction

A studio reservation desk with the restraint of a printed room register: warm paper, charcoal ink and a single rust accent. Serif headings sit beside compact monospaced scheduling information. Straight rules and a clear left-to-right sequence organize the work.

Original SVG room sketches give the room selector a visual identity. Each is an illustration, not a measured floor plan or a claim about a real building. The brand mark is drawn from two overlapping doorways. A reservation slip and a small activity ledger carry the same visual language through successful, empty and cancelled states.

## How the frontend is organized

- `public/index.html`: page structure, navigation and all labeled controls.
- `public/style.css`: color and typography tokens, layout, component styles, responsive breakpoints and reduced-motion handling.
- `public/app.js`: trusted static room drawings and DOM rendering alongside the booking requests.

Dynamic API values are inserted with `textContent`. The few SVG strings used with `innerHTML` are fixed drawings maintained in the source, not user or API content.

## Review in your browser

Check the default empty state, create a reservation, cancel it, switch from Alice to Bob, then switch to Carol. Try desktop and a narrow mobile window. Tab through the room choices, date field, available hours and reservation button.

The design uses system fonts with explicit serif, sans-serif and monospaced fallbacks. Appearance will vary slightly across operating systems. No external font or image download is required.
