import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { api } from './api.js';

const HYD = { lng: 78.36, lat: 17.44 };
const DEFAULT_PICKUP = { lng: 78.34588, lat: 17.450918 };
const DEFAULT_DROP = { lng: 78.3691652, lat: 17.4342597 };

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
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
  const [pickup, setPickup] = useState(DEFAULT_PICKUP);
  const [drop, setDrop] = useState(DEFAULT_DROP);
  const [clickTarget, setClickTarget] = useState('pickup');
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tripGeom, setTripGeom] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState({ lng: 78.356, lat: 17.451 });
  const [dest, setDest] = useState({ lng: 78.348, lat: 17.44 });
  const [seats, setSeats] = useState(2);
  const [routeName, setRouteName] = useState('Office hop');
  const [departureAt, setDepartureAt] = useState(() => {
    const d = new Date(Date.now() + 45 * 60 * 1000);
    d.setMinutes(d.getMinutes() - (d.getMinutes() % 5), 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [preview, setPreview] = useState(null);
  const [bookings, setBookings] = useState([]);

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

  async function search() {
    setBusy(true);
    setStatus('Searching…');
    try {
      const data = await api('/v1/search', {
        method: 'POST',
        body: { pickup, drop, maxWalkMeters: Number(walk) },
      });
      setMatches(data.matches || []);
      setSelected(data.matches?.[0] || null);
      setStatus(data.matches?.length ? `Found ${data.matches.length} ride(s)` : 'No matching driver routes');
      if (data.matches?.[0]) await loadTrip(data.matches[0].tripId);
      else setTripGeom(null);
    } catch (error) {
      setStatus(error.message);
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
      setStatus(error.message);
    }
  }

  async function book(match) {
    setBusy(true);
    try {
      const data = await api(`/v1/trips/${match.tripId}/bookings`, {
        method: 'POST',
        body: { pickup, drop, maxWalkMeters: Number(walk), riderId: 'u_rider' },
      });
      setStatus(`Booked ${match.routeName}. Seats left: ${data.trip.seatsLeft}`);
      await search();
      await loadBookings();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function previewRoute() {
    setBusy(true);
    setStatus('Fetching road path…');
    try {
      const data = await api('/v1/routes/preview', {
        method: 'POST',
        body: { origin, destination: dest },
      });
      setPreview(data);
      setTripGeom(data.lineString);
      setStatus(`Preview ${data.distanceKm} km · ${data.durationMins} min`);
    } catch (error) {
      setStatus(error.message);
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
      setStatus(`Published ${data.trip.routeName}`);
      setTripGeom(data.trip.geometry);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadBookings() {
    const data = await api('/v1/bookings?riderId=u_rider');
    setBookings(data.bookings || []);
  }

  async function cancelBooking(id) {
    setBusy(true);
    try {
      await api(`/v1/bookings/${id}/cancel`, { method: 'POST' });
      setStatus('Booking cancelled, seat restored');
      await loadBookings();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (tab === 'bookings') loadBookings().catch((error) => setStatus(error.message));
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
            <div className="coords">
              <button type="button" onClick={() => setClickTarget('pickup')}>Pickup {pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)}</button>
              <button type="button" onClick={() => setClickTarget('drop')}>Drop {drop.lat.toFixed(4)}, {drop.lng.toFixed(4)}</button>
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
                    <button className="book" disabled={busy} onClick={() => book(match)}>Book seat</button>
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
              <button type="button" onClick={() => setClickTarget('pickup')}>Origin {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}</button>
              <button type="button" onClick={() => setClickTarget('drop')}>Dest {dest.lat.toFixed(4)}, {dest.lng.toFixed(4)}</button>
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
                  <span>{booking.driver_name} · {booking.status}</span>
                  <span>{fmtTime(booking.departure_at)}</span>
                  {booking.status === 'confirmed' && (
                    <button className="book" disabled={busy} onClick={() => cancelBooking(booking.id)}>Cancel</button>
                  )}
                </li>
              ))}
              {bookings.length === 0 && <p className="muted">No bookings yet.</p>}
            </ul>
          </section>
        )}

        <p className={`status ${status.startsWith('No') || status.includes('failed') || status.includes('error') || status.includes('Error') ? 'warn' : ''}`}>
          {status}
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
