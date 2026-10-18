const $ = id => document.getElementById(id);
const state = { token: 'demo-alice', resources: [], resource: '', selected: null, generation: 0, key: null, payload: null, busy: false };
const time = date => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
const day = date => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' }).format(new Date(date));
function dubaiDate(date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
const tomorrow = dubaiDate(new Date(Date.now() + 86400000));
$('date').value = tomorrow;
$('date').min = dubaiDate(new Date());
$('date').max = dubaiDate(new Date(Date.now() + 29 * 86400000));

async function api(path, options = {}, token = state.token) {
  const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error?.message || 'Request failed.');
    error.code = body.error?.code;
    throw error;
  }
  return body;
}

function notice(message, error = false) { $('notice').textContent = message; $('notice').className = error ? 'notice error' : 'notice success'; }
function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function resetSelection() {
  state.selected = null;
  state.key = null;
  state.payload = null;
  $('reserve').disabled = true;
  $('summary').textContent = 'Choose an hour above';
}

function lockControls(locked) {
  $('account').disabled = locked;
  $('date').disabled = locked;
  $('refresh').disabled = locked;
  for (const button of document.querySelectorAll('.room, .slot, .reservation .text-button')) {
    if (locked) { button.dataset.wasDisabled = String(button.disabled); button.disabled = true; }
    else if (button.dataset.wasDisabled !== undefined) {
      button.disabled = button.dataset.wasDisabled === 'true';
      delete button.dataset.wasDisabled;
    }
  }
}

// Original schematic drawings. Static, trusted SVG; API content is added with textContent.
function roomDrawing(id) {
  const wrapper = element('span', 'room-drawing');
  wrapper.setAttribute('aria-hidden', 'true');
  const walls = '<path d="M25 91V15h110v76H104M25 91h48"/><path class="door" d="M73 91V66a25 25 0 0 1 25 25"/><path class="dimension" d="M25 7h110M25 4v6m110-6v6M17 15v76m-3-76h6m-6 76h6"/><path d="M46 15v3h67v-3"/>';
  const focus = '<rect class="furniture" x="54" y="39" width="52" height="24" rx="2"/><path d="M60 33v-5h12v5m16 0v-5h12v5M60 69v5h12v-5m16 0v5h12v-5"/><path d="M30 23h12v12H30zM36 25v8m-4-4h8"/>';
  const boardroom = '<rect class="furniture" x="45" y="38" width="70" height="25" rx="8"/><path d="M49 32v-6h10v6m4 0v-6h10v6m4 0v-6h10v6m4 0v-6h10v6M49 69v6h10v-6m4 0v6h10v-6m4 0v6h10v-6m4 0v6h10v-6M39 44h-5v13h5m82-13h5v13h-5"/><path d="M129 35v32"/>';
  const podcast = '<rect class="furniture" x="57" y="32" width="46" height="38" rx="13"/><circle cx="80" cy="24" r="6"/><circle cx="80" cy="79" r="6"/><path d="M66 42l10 4m18 14-10-4M73 44l3 2-2 4m13 8-3-2 2-4"/><path d="M29 24v8m0 7v8m0 7v8m0 7v8m102-53v8m0 7v8m0 7v8m0 7v8"/>';
  const south = '<rect class="furniture" x="50" y="38" width="60" height="26" rx="2"/><path d="M56 32v-6h12v6m24 0v-6h12v6M56 70v6h12v-6m24 0v6h12v-6M44 45h-6v12h6m72-12h6v12h-6"/>';
  const drawing = id === 'boardroom' ? boardroom : id === 'podcast-studio' ? podcast : id === 'south-room' ? south : focus;
  wrapper.innerHTML = `<svg class="room-plan" viewBox="0 0 160 105">${walls}${drawing}</svg>`;
  return wrapper;
}

function renderRooms() {
  $('rooms').replaceChildren();
  $('room-count').textContent = `${state.resources.length} spaces`;
  for (const [index, resource] of state.resources.entries()) {
    const button = element('button', `room${state.resource === resource.id ? ' selected' : ''}`);
    button.setAttribute('aria-pressed', String(state.resource === resource.id));
    button.title = resource.description;
    const top = element('span', 'room-topline');
    top.append(element('span', 'room-index', `ROOM / ${String(index + 1).padStart(2, '0')}`), element('span', 'selection-mark', '✓'));
    const info = element('span', 'room-info');
    info.append(element('strong', '', resource.name), element('small', '', `UP TO ${resource.capacity} PEOPLE`));
    button.append(top, roomDrawing(resource.id), info);
    button.addEventListener('click', () => { state.resource = resource.id; resetSelection(); renderRooms(); load().catch(error => notice(error.message, true)); });
    $('rooms').append(button);
  }
  $('selected-room-name').textContent = state.resources.find(resource => resource.id === state.resource)?.name || 'Choose a room';
}

function renderSlots(occupied) {
  $('slots').replaceChildren();
  if (!$('date').value) { resetSelection(); return; }
  for (let hour = 9; hour < 18; hour++) {
    const start = new Date(`${$('date').value}T${String(hour).padStart(2, '0')}:00:00+04:00`).getTime();
    const end = start + 3600000;
    const unavailable = !Number.isFinite(start) || start <= Date.now() || end > Date.now() + 30 * 86400000 || occupied.some(slot => slot.starts_at < end && slot.ends_at > start);
    const selected = state.selected?.start === start;
    const button = element('button', `slot${selected ? ' selected' : ''}`);
    button.append(element('span', 'slot-time', time(start)), element('span', 'slot-state', unavailable ? 'Unavailable' : selected ? 'Selected' : 'Open ↗'));
    button.setAttribute('aria-label', `${time(start)} to ${time(end)}, ${unavailable ? 'unavailable' : selected ? 'selected' : 'open'}`);
    button.disabled = unavailable;
    button.title = unavailable ? 'Unavailable' : `${time(start)}–${time(end)}`;
    button.setAttribute('aria-pressed', String(state.selected?.start === start));
    button.addEventListener('click', () => {
      state.selected = { start, end };
      state.key = crypto.randomUUID();
      state.payload = { resourceId: state.resource, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
      renderSlots(occupied);
      $('reserve').disabled = false;
      $('summary').textContent = `${day(start)} / ${time(start)}–${time(end)}`;
    });
    $('slots').append(button);
  }
}

function renderBookings(bookings) {
  $('bookings').replaceChildren();
  if (!bookings.length) {
    const empty = element('div', 'empty-reservation');
    const sketch = element('span');
    sketch.setAttribute('aria-hidden', 'true');
    sketch.innerHTML = '<svg class="empty-calendar" viewBox="0 0 46 46"><path d="M7 11h29v29H7zM7 19h29M15 6v10m13-10v10M13 25h5m5 0h5m-15 7h5"/><path d="M32 32l4 4 7-8"/></svg>';
    empty.append(sketch, element('p', 'empty-title', 'A clear calendar.'), element('p', 'empty-copy', 'Pick a room and an open hour. Your reservation will be waiting right here.'));
    $('bookings').append(empty);
  }
  for (const booking of bookings.slice(-12).reverse()) {
    const item = element('article', `reservation${booking.status === 'cancelled' ? ' is-cancelled' : ''}`);
    const head = element('div', 'reservation-head');
    head.append(element('strong', '', booking.resource_name), element('span', 'reservation-date', day(booking.starts_at)));
    item.append(head, element('p', '', `${time(booking.starts_at)} — ${time(booking.ends_at)}`));
    const bottom = element('div', 'reservation-bottom');
    bottom.append(element('span', `badge ${booking.status}`, booking.status));
    if (booking.status === 'confirmed') {
      const button = element('button', 'text-button', 'Cancel');
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await api(`/api/bookings/${booking.id}/cancel`, { method: 'POST' }); notice('Reservation cancelled. The time is available again.'); await load(); }
        catch (error) { notice(error.message, true); button.disabled = false; }
      });
      bottom.append(button);
    }
    item.append(bottom); $('bookings').append(item);
  }
}

function renderActivity(events) {
  $('activity').replaceChildren();
  if (!events.length) $('activity').append(element('p', 'activity-empty', 'Nothing to note. Your first booking starts the story.'));
  for (const event of events.slice(0, 5)) {
    const node = element('div', 'event', event.action === 'created' ? 'Reservation confirmed' : 'Reservation cancelled');
    const timestamp = element('time', '', `${day(event.created_at)} / ${time(event.created_at)}`);
    timestamp.dateTime = new Date(event.created_at).toISOString();
    node.append(timestamp);
    $('activity').append(node);
  }
}

async function load(accountChanged = false) {
  const generation = ++state.generation;
  const token = state.token;
  resetSelection();
  $('reserve').disabled = true;
  $('slots').replaceChildren(element('p', 'muted loading-slots', 'Checking the room register…'));
  if (accountChanged) { $('rooms').replaceChildren(); $('bookings').replaceChildren(); $('activity').replaceChildren(); }
  const [resources, bookings, events, actor] = await Promise.all([api('/api/resources', {}, token), api('/api/bookings', {}, token), api('/api/activity', {}, token), api('/api/me', {}, token)]);
  if (generation !== state.generation) return;
  state.resources = resources;
  if (!resources.some(room => room.id === state.resource)) state.resource = resources[0]?.id || '';
  $('workspace').textContent = actor.organizationId === 'north' ? 'North Studio' : 'South Studio';
  renderRooms(); renderBookings(bookings); renderActivity(events);
  const occupied = state.resource ? await api(`/api/resources/${state.resource}/availability`, {}, token) : [];
  if (generation !== state.generation) return;
  renderSlots(occupied);
}

$('account').addEventListener('change', () => { state.token = $('account').value; notice('Demo account changed. Reservations and rooms are scoped to this account.'); load(true).catch(error => notice(error.message, true)); });
$('date').addEventListener('change', () => load().catch(error => notice(error.message, true)));
$('refresh').addEventListener('click', () => load().catch(error => notice(error.message, true)));
$('reserve').addEventListener('click', async () => {
  if (!state.payload || state.busy) return;
  const payload = state.payload;
  const key = state.key;
  state.busy = true;
  lockControls(true);
  $('reserve').disabled = true;
  $('reserve').textContent = 'Reserving…';
  try {
    const result = await api('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(payload) });
    notice(result.replayed ? 'Your reservation was already saved. No duplicate was created.' : 'Space reserved. You’re all set.');
    await load();
  } catch (error) {
    notice(error.message, true);
    if (error.code) { await load().catch(() => {}); }
    // On network failure keep the same key and payload for a safe retry.
  } finally {
    state.busy = false;
    lockControls(false);
    $('reserve').textContent = 'Reserve this space ↗';
    $('reserve').disabled = !state.payload;
  }
});
load(true).catch(error => notice(error.message, true));
