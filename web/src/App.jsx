import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { api } from './api.js';

const HYD = { lng: 78.36, lat: 17.44 };
const DEFAULT_PICKUP = { lng: 78.34588, lat: 17.450918 };
const DEFAULT_DROP = { lng: 78.3691652, lat: 17.4342597 };

function toLocalInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function roundedDate(minutesFromNow) {
  const date = new Date(Date.now() + minutesFromNow * 60_000);
  date.setMinutes(date.getMinutes() - (date.getMinutes() % 5), 0, 0);
  return date;
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}

function seatsToRelease(booking, raw) {
  const held = booking.seat_count || 1;
  const chosen = Number(raw);
  if (!Number.isInteger(chosen) || chosen < 1) return held;
  return Math.min(chosen, held);
}

export default function App() {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const markers = useRef({});
  const tabRef = useRef('search');
  const clickTargetRef = useRef('pickup');
  const tripGeomRef = useRef(null);
  const [tab, setTab] = useState('search');
  const [role, setRole] = useState('rider');
  const [walk, setWalk] = useState(500);
  const [departAfter, setDepartAfter] = useState(() => toLocalInput(roundedDate(0)));
  const [departBefore, setDepartBefore] = useState(() => toLocalInput(roundedDate(180)));
  const [pickup, setPickup] = useState(DEFAULT_PICKUP);
  const [drop, setDrop] = useState(DEFAULT_DROP);
  const [clickTarget, setClickTarget] = useState('pickup');
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tripGeom, setTripGeom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState({ lng: 78.356, lat: 17.451 });
  const [dest, setDest] = useState({ lng: 78.348, lat: 17.44 });
  const [seats, setSeats] = useState(2);
  const [routeName, setRouteName] = useState('Office hop');
  const [departureAt, setDepartureAt] = useState(() => toLocalInput(roundedDate(45)));
  const [preview, setPreview] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [bookSeats, setBookSeats] = useState(1);
  const [cancelCounts, setCancelCounts] = useState({});
  const [pickupName, setPickupName] = useState('Looking up place…');
  const [dropName, setDropName] = useState('Looking up place…');
  const [originName, setOriginName] = useState('Looking up place…');
  const [destName, setDestName] = useState('Looking up place…');
  const [notice, setNotice] = useState({ seq: 0, tab: 'search', text: '' });
  const noticeSeq = useRef(0);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    clickTargetRef.current = clickTarget;
  }, [clickTarget]);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [HYD.lng, HYD.lat],
      zoom: 13,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('click', (e) => {
      const point = { lng: Number(e.lngLat.lng.toFixed(6)), lat: Number(e.lngLat.lat.toFixed(6)) };
      const current = clickTargetRef.current;
      if (tabRef.current === 'publish') {
        if (current === 'pickup') setOrigin(point);
        else setDest(point);
      } else if (current === 'pickup') {
        setPickup(point);
      } else {
        setDrop(point);
      }
      setClickTarget(current === 'pickup' ? 'drop' : 'pickup');
    });
    map.on('load', () => {
      map.addSource('trip', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'trip-line',
        type: 'line',
        source: 'trip',
        paint: { 'line-color': '#2563eb', 'line-width': 5, 'line-opacity': 0.85 },
      });
      const geom = tripGeomRef.current;
      if (geom?.coordinates) {
        map.getSource('trip').setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: geom, properties: {} }],
        });
      }
    });
    mapObj.current = map;
    return () => map.remove();
  }, []);

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;

    const syncMarker = (id, lngLat, color) => {
      if (!lngLat) {
        markers.current[id]?.remove();
        delete markers.current[id];
        return;
      }
      if (!markers.current[id]) {
        const el = document.createElement('div');
        el.className = `pin pin-${id}`;
        el.style.background = color;
        markers.current[id] = new maplibregl.Marker({ element: el }).setLngLat([lngLat.lng, lngLat.lat]).addTo(map);
      } else {
        markers.current[id].setLngLat([lngLat.lng, lngLat.lat]);
      }
    };

    if (tab === 'publish') {
      syncMarker('pickup', origin, '#16a34a');
      syncMarker('drop', dest, '#dc2626');
    } else {
      syncMarker('pickup', pickup, '#16a34a');
      syncMarker('drop', drop, '#dc2626');
    }
    syncMarker('board', selected?.board, '#2563eb');
    syncMarker('alight', selected?.alight, '#7c3aed');
  }, [pickup, drop, origin, dest, selected, tab]);

  useEffect(() => {
    tripGeomRef.current = tripGeom;
    const map = mapObj.current;
    if (!map?.getSource('trip')) return;
    map.getSource('trip').setData({
      type: 'FeatureCollection',
      features: tripGeom?.coordinates
        ? [{ type: 'Feature', geometry: tripGeom, properties: {} }]
        : [],
    });
  }, [tripGeom]);

  function publishNotice(tabName, text) {
    const seq = noticeSeq.current + 1;
    noticeSeq.current = seq;
    setNotice({ seq, tab: tabName, text });
    return seq;
  }

  useEffect(() => {
    const points = [
      [pickup, setPickupName],
      [drop, setDropName],
      [origin, setOriginName],
      [dest, setDestName],
    ];
    const controllers = points.map(([point, setName]) => {
      const controller = new AbortController();
      setName('Looking up place…');
      fetch(`/v1/places/reverse?lng=${point.lng}&lat=${point.lat}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((data) => setName(data.place?.name || 'Unnamed place'))
        .catch((error) => {
          if (error.name !== 'AbortError') setName('Unnamed place');
        });
      return controller;
    });
    return () => controllers.forEach((controller) => controller.abort());
  }, [pickup, drop, origin, dest]);

  async function search(options = {}) {
    const seq = options.silent ? noticeSeq.current : publishNotice('search', 'Searching…');
    setBusy(true);
    try {
      const data = await api('/v1/search', {
        method: 'POST',
        body: {
          pickup,
          drop,
          maxWalkMeters: Number(walk),
          departAfter: departAfter ? new Date(departAfter).toISOString() : undefined,
          departBefore: departBefore ? new Date(departBefore).toISOString() : undefined,
        },
      });
      if (!options.silent && noticeSeq.current !== seq) return;
      setMatches(data.matches || []);
      setSelected(data.matches?.[0] || null);
      if (!options.silent) {
        setNotice({
          seq,
          tab: 'search',
          text: data.matches?.length ? `Found ${data.matches.length} ride(s)` : 'No matching driver routes',
        });
      }
      if (data.matches?.[0]) await loadTrip(data.matches[0].tripId);
      else setTripGeom(null);
    } catch (error) {
      if (!options.silent && noticeSeq.current === seq) {
        setNotice({ seq, tab: 'search', text: error.message });
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadTrip(id) {
    const data = await api(`/v1/trips/${id}`);
    setTripGeom(data.trip?.geometry || null);
  }

  async function selectMatch(match) {
    setSelected(match);
    try {
      await loadTrip(match.tripId);
    } catch (error) {
      publishNotice('search', error.message);
    }
  }

  async function book(match) {
    const requested = Math.min(Math.max(1, Number(bookSeats) || 1), match.availableSeats);
    const seq = publishNotice('bookings', 'Booking…');
    setBusy(true);
    try {
      const data = await api(`/v1/trips/${match.tripId}/bookings`, {
        method: 'POST',
        body: { pickup, drop, maxWalkMeters: Number(walk), riderId: 'u_rider', seats: requested },
      });
      await search({ silent: true });
      await loadBookings();
      if (noticeSeq.current !== seq) return;
      publishNotice(
        'bookings',
        `Booked ${requested} seat(s) on ${match.routeName}. Seats left: ${data.trip.seatsLeft}`
      );
    } catch (error) {
      if (noticeSeq.current === seq) publishNotice('bookings', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function previewRoute() {
    setBusy(true);
    publishNotice('publish', 'Fetching road path…');
    try {
      const data = await api('/v1/routes/preview', {
        method: 'POST',
        body: { origin, destination: dest },
      });
      setPreview(data);
      setTripGeom(data.lineString);
      publishNotice('publish', `Preview ${data.distanceKm} km · ${data.durationMins} min`);
    } catch (error) {
      publishNotice('publish', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function publishTrip() {
    setBusy(true);
    try {
      const data = await api('/v1/trips', {
        method: 'POST',
        body: {
          origin,
          destination: dest,
          seats: Number(seats),
          routeName,
          driverId: 'u_driver',
          departureAt: new Date(departureAt).toISOString(),
        },
      });
      publishNotice('publish', `Published ${data.trip.routeName}`);
      setTripGeom(data.trip.geometry);
    } catch (error) {
      publishNotice('publish', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadBookings() {
    const data = await api('/v1/bookings?riderId=u_rider');
    setBookings(data.bookings || []);
  }

  async function cancelBooking(id, seats) {
    const seq = publishNotice('bookings', 'Cancelling…');
    setBusy(true);
    try {
      const data = await api(`/v1/bookings/${id}/cancel`, { method: 'POST', body: { seats } });
      await loadBookings();
      if (noticeSeq.current !== seq) return;
      const restored = data.booking.status === 'cancelled'
        ? 'Booking cancelled and seats restored'
        : `Cancelled ${seats} seat(s). ${data.booking.seats} still booked`;
      publishNotice('bookings', restored);
    } catch (error) {
      if (noticeSeq.current === seq) publishNotice('bookings', error.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (tab === 'bookings') loadBookings().catch((error) => publishNotice('bookings', error.message));
  }, [tab]);

  return (
    <div className="app">
      <aside>
        <header>
          <h1>Hyderabad carpool matcher</h1>
          <p className="muted">Demo only — not a taxi service. Click the map to set points.</p>
          <label>
            Act as
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="rider">Rider (Neha)</option>
              <option value="driver">Driver (Arjun)</option>
            </select>
          </label>
          <nav>
            <button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>Search</button>
            <button className={tab === 'publish' ? 'active' : ''} onClick={() => setTab('publish')}>Publish</button>
            <button className={tab === 'bookings' ? 'active' : ''} onClick={() => setTab('bookings')}>Bookings</button>
          </nav>
        </header>

        {tab === 'search' && (
          <section>
            <p>Next map click sets: <strong>{clickTarget}</strong></p>
            <label>
              Pickup walk cap: {walk} m
              <input type="range" min="200" max="1000" step="50" value={walk} onChange={(e) => setWalk(e.target.value)} />
            </label>
            <p className="muted">
              Depart after and before limit which driver departures can match. A ride appears only when the driver leaves inside this window. It does not set your own pickup time.
            </p>
            <div className="time-window">
              <label>
                Depart after
                <input type="datetime-local" value={departAfter} onChange={(e) => setDepartAfter(e.target.value)} />
              </label>
              <label>
                Depart before
                <input type="datetime-local" value={departBefore} onChange={(e) => setDepartBefore(e.target.value)} />
              </label>
            </div>
            <label>
              Seats to book
              <input type="number" min="1" max="8" value={bookSeats} onChange={(e) => setBookSeats(e.target.value)} />
            </label>
            <div className="coords">
              <button type="button" onClick={() => setClickTarget('pickup')}>Pickup · {pickupName}</button>
              <button type="button" onClick={() => setClickTarget('drop')}>Drop · {dropName}</button>
            </div>
            <button className="primary" disabled={busy} onClick={search}>Search rides</button>
            <ul className="results">
              {matches.map((match) => (
                <li key={match.tripId} className={selected?.tripId === match.tripId ? 'selected' : ''}>
                  <button type="button" onClick={() => selectMatch(match)}>
                    <strong>{match.routeName}</strong>
                    <span>{match.driverName} · {match.vehicle}</span>
                    <span>{fmtTime(match.departureTime)} · {match.availableSeats} seat(s)</span>
                    <span>Walk {match.matchDetails.totalDetourMeters} m · share {match.matchDetails.sharedRideDistanceKm} km</span>
                  </button>
                  {role === 'rider' && (
                    <button className="book" disabled={busy} onClick={() => book(match)}>
                      Book {Math.min(Math.max(1, Number(bookSeats) || 1), match.availableSeats)} seat(s)
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'publish' && (
          <section>
            <p>Click map for origin, then destination. Next click: <strong>{clickTarget === 'pickup' ? 'origin' : 'destination'}</strong></p>
            <label>
              Route name
              <input value={routeName} onChange={(e) => setRouteName(e.target.value)} />
            </label>
            <label>
              Departure
              <input type="datetime-local" value={departureAt} onChange={(e) => setDepartureAt(e.target.value)} />
            </label>
            <label>
              Seats
              <input type="number" min="1" max="8" value={seats} onChange={(e) => setSeats(e.target.value)} />
            </label>
            <div className="coords">
              <button type="button" onClick={() => setClickTarget('pickup')}>Origin · {originName}</button>
              <button type="button" onClick={() => setClickTarget('drop')}>Destination · {destName}</button>
            </div>
            <button disabled={busy} onClick={previewRoute}>Preview path</button>
            <button className="primary" disabled={busy || role !== 'driver'} onClick={publishTrip}>
              Publish trip
            </button>
            {role !== 'driver' && <p className="muted">Switch to Driver to publish.</p>}
          </section>
        )}

        {tab === 'bookings' && (
          <section>
            <ul className="results">
              {bookings.map((booking) => (
                <li key={booking.id}>
                  <strong>{booking.route_name}</strong>
                  <span>{booking.driver_name} · {booking.status} · {booking.seat_count || 1} seat(s)</span>
                  <span>{fmtTime(booking.departure_at)}</span>
                  {booking.status === 'confirmed' && (
                    <>
                      <label>
                        Seats to cancel
                        <input
                          type="number"
                          min="1"
                          max={booking.seat_count || 1}
                          value={cancelCounts[booking.id] ?? String(booking.seat_count || 1)}
                          onChange={(e) => setCancelCounts((prev) => ({ ...prev, [booking.id]: e.target.value }))}
                        />
                      </label>
                      <button
                        className="book"
                        disabled={busy}
                        onClick={() => cancelBooking(booking.id, seatsToRelease(booking, cancelCounts[booking.id]))}
                      >
                        Cancel {seatsToRelease(booking, cancelCounts[booking.id])} seat(s)
                      </button>
                    </>
                  )}
                </li>
              ))}
              {bookings.length === 0 && <p className="muted">No bookings yet.</p>}
            </ul>
          </section>
        )}

        <p className={`status ${notice.text.startsWith('No') || notice.text.includes('failed') || notice.text.includes('error') || notice.text.includes('Error') ? 'warn' : ''}`}>
          {notice.tab === tab ? notice.text : ''}
        </p>
      </aside>
      <div className="map-wrap">
        <div ref={mapRef} className="map" />
        <div className="legend">
          <span className="g">Pickup / origin</span>
          <span className="r">Drop / dest</span>
          <span className="b">Board</span>
          <span className="p">Alight</span>
        </div>
      </div>
    </div>
  );
}
