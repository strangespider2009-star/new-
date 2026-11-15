
import React, { useEffect, useState } from "react";
import {
  startRegistration,
  startAuthentication
} from "@simplewebauthn/browser";

import {
  connectBLE,
  sendBLECommand,
  disconnectBLE
} from "./ble.js";

import {
  startFaceCamera,
  stopFaceCamera,
  enrollFace,
  recognizeFace,
  hasFaceTemplate,
  deleteFaceTemplate
} from "./face-demo.js";

// =====================================================
// API CONFIGURATION
// =====================================================

// Local development runs the API on :3001. In production, default to
// same-origin requests (Express can serve dist). Separate static frontend
// deployments must set VITE_API_URL at build time.
const API_BASE = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? window.location.origin : "http://localhost:3001")
).replace(/\/+$/, "");

const api = async (url, options = {}) => {
  const headers = options.body instanceof FormData
    ? (options.headers || {})
    : {
        "Content-Type": "application/json",
        ...(options.headers || {})
      };

  const res = await fetch(`${API_BASE}${url}`, {
    credentials: "include",
    ...options,
    headers
  });

  let data = {};

  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
};

const post = (url, body) =>
  api(url, {
    method: "POST",
    body: JSON.stringify(body)
  });

// =====================================================
// MAIN APPLICATION
// =====================================================

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [page, setPage] = useState("dashboard");
  const [menu, setMenu] = useState(false);

  const [data, setData] = useState({
    vehicles: [],
    drivers: [],
    biometrics: [],
    logs: []
  });

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // ---------------------------------------------------
  // LOAD DASHBOARD DATA
  // ---------------------------------------------------

  async function loadDashboard() {
    const dashboard = await api("/api/dashboard");

    setData({
      vehicles: dashboard.vehicles || [],
      drivers: dashboard.drivers || [],
      biometrics: dashboard.biometrics || [],
      logs: dashboard.logs || []
    });
  }

  // ---------------------------------------------------
  // CHECK EXISTING LOGIN SESSION
  // ---------------------------------------------------

  async function refresh() {
    const me = await api("/api/me");

    setUser(me.user || null);

    if (me.user) {
      await loadDashboard();
    } else {
      setData({
        vehicles: [],
        drivers: [],
        biometrics: [],
        logs: []
      });
    }

    return me.user;
  }

  useEffect(() => {
    let active = true;

    async function initializeApp() {
      try {
        const me = await api("/api/me");

        if (!active) return;

        setUser(me.user || null);

        if (me.user) {
          try {
            const dashboard = await api("/api/dashboard");

            if (!active) return;

            setData({
              vehicles: dashboard.vehicles || [],
              drivers: dashboard.drivers || [],
              biometrics: dashboard.biometrics || [],
              logs: dashboard.logs || []
            });
          } catch (e) {
            if (active) {
              setError(
                "Dashboard loading failed: " + e.message
              );
            }
          }
        }
      } catch (e) {
        if (active) {
          setError(e.message || "Could not check login session.");
          setUser(null);
        }
      } finally {
        if (active) {
          setAuthChecking(false);
        }
      }
    }

    initializeApp();

    return () => {
      active = false;
    };
  }, []);

  // ---------------------------------------------------
  // LOGIN / REGISTER SUCCESS
  // ---------------------------------------------------

  async function handleAuthenticated(authenticatedUser) {
    // Update authentication state immediately.
    setUser(authenticatedUser);
    setError("");
    setNotice("");
    setPage("dashboard");

    // Load dashboard separately.
    try {
      await loadDashboard();
    } catch (e) {
      setError(
        "Login successful, but dashboard loading failed: " +
        e.message
      );
    }
  }

  // ---------------------------------------------------
  // GENERAL ACTION HANDLER
  // ---------------------------------------------------

  async function act(fn) {
    setError("");
    setNotice("");
    setBusy(true);

    try {
      await fn();

      // Refresh data without interrupting the session.
      try {
        await loadDashboard();
      } catch (e) {
        setError("Data refresh failed: " + e.message);
      }
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------
  // INITIAL AUTHENTICATION SCREEN
  // ---------------------------------------------------

  if (authChecking) {
    return (
      <div className="authPage">
        <div className="authCard">
          <div className="logoLarge">SG</div>
          <h2>SMART DRIVE GUARD</h2>
          <p className="muted">Checking your login session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth onDone={handleAuthenticated} />;
  }

  // ===================================================
  // NAVIGATION
  // ===================================================

  const nav = [
    ["dashboard", "Dashboard", "▦"],
    ["vehicles", "My Vehicle", "🚘"],
    ["drivers", "Manage Drivers", "♙"],
    ["family", "Family Members", "♧"],
    ["biometrics", "Manage Dummy Biometrics", "◎"],
    ["verify", "Verify Biometrics", "◉"],
    ["history", "Access History", "◷"]
  ];

  // ===================================================
  // MAIN DASHBOARD UI
  // ===================================================

  return (
    <div className="shell">

      <header className="topbar">

        <button
          className="menuBtn"
          onClick={() => setMenu(!menu)}
        >
          ☰
        </button>

        <div className="brand">
          <span className="brandMark">SG</span>
          <span>SMART DRIVE <b>GUARD</b></span>
        </div>

        <div className="topRight">

          <span className="userTag">
            {user.name} · {user.role}
          </span>

          <button
            className="ghost"
            onClick={() =>
              act(async () => {
                const options = await post(
                  "/api/passkey/register-options",
                  {}
                );

                const credential = await startRegistration({
                  optionsJSON: options
                });

                await post(
                  "/api/passkey/register-verify",
                  credential
                );

                setNotice("Passkey registered on this device.");
              })
            }
          >
            Register passkey
          </button>

          <button
            className="ghost"
            onClick={async () => {
              try {
                await post("/api/auth/logout", {});
                setUser(null);
                setData({
                  vehicles: [],
                  drivers: [],
                  biometrics: [],
                  logs: []
                });
                setPage("dashboard");
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Logout
          </button>

        </div>
      </header>

      {menu && (
        <div
          className="drawerBackdrop"
          onClick={() => setMenu(false)}
        >
          <aside
            className="drawer"
            onClick={e => e.stopPropagation()}
          >
            <h3>Navigation</h3>

            {nav.map(n => (
              <button
                key={n[0]}
                className={
                  page === n[0]
                    ? "navItem active"
                    : "navItem"
                }
                onClick={() => {
                  setPage(n[0]);
                  setMenu(false);
                }}
              >
                {n[2]}　{n[1]}
              </button>
            ))}
          </aside>
        </div>
      )}

      <main className="main">

        <div className="welcome">

          <div>
            <div className="eyebrow">
              VEHICLE ACCESS MANAGEMENT
            </div>

            <h1>
              {nav.find(n => n[0] === page)?.[1] || "Dashboard"}
            </h1>

            <p>
              Manage authorised drivers and demonstration verification.
            </p>
          </div>

          <span className="online">
            <i /> SYSTEM ONLINE
          </span>

        </div>

        {error && (
          <div className="alert error">
            {error}
          </div>
        )}

        {notice && (
          <div className="alert success">
            {notice}
          </div>
        )}

        {page === "dashboard" && (
          <Dashboard
            data={data}
            user={user}
            setPage={setPage}
          />
        )}

        {page === "vehicles" && (
          <Vehicles data={data} act={act} />
        )}

        {page === "drivers" && (
          <Drivers data={data} act={act} kind="driver" />
        )}

        {page === "family" && (
          <Drivers data={data} act={act} kind="family" />
        )}

        {page === "biometrics" && (
          <Biometrics data={data} act={act} />
        )}

        {page === "history" && (
          <History data={data} />
        )}

        {page === "verify" && (
          <Verify
            data={data}
            act={act}
            setNotice={setNotice}
            user={user}
          />
        )}

        <footer>
          SMART DRIVE GUARD · Educational prototype · Not for controlling a real vehicle
        </footer>

      </main>
    </div>
  );
}

// =====================================================
// AUTHENTICATION COMPONENT
// =====================================================

function Auth({ onDone }) {

  const [mode, setMode] = useState("register");

  const [name, setName] = useState("Demo Owner");
  const [email, setEmail] = useState("owner@example.com");
  const [password, setPassword] = useState("DemoPass123!");
  const [role, setRole] = useState("owner");

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // ---------------------------------------------------
  // LOGIN AND REGISTRATION
  // ---------------------------------------------------

  async function submit(e) {
    e.preventDefault();

    setError("");
    setBusy(true);

    try {
      const url =
        mode === "register"
          ? "/api/auth/register"
          : "/api/auth/login";

      const result = await post(
        url,
        mode === "register"
          ? { name, email, password, role }
          : { email, password }
      );

      if (!result.user) {
        throw new Error(
          "Authentication succeeded but no user was returned."
        );
      }

      // Send authenticated user directly to App.
      await onDone(result.user);

    } catch (e) {
      setError(e.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------
  // PASSKEY LOGIN
  // ---------------------------------------------------

  async function passkeyLogin() {
    setError("");
    setBusy(true);

    try {
      const options = await post(
        "/api/passkey/auth-options",
        { email }
      );

      const response = await startAuthentication({
        optionsJSON: options
      });

      const result = await post(
        "/api/passkey/auth-verify",
        response
      );

      if (!result.user) {
        const me = await api("/api/me");

        if (!me.user) {
          throw new Error("Passkey authentication failed.");
        }

        await onDone(me.user);
      } else {
        await onDone(result.user);
      }

    } catch (e) {
      setError(e.message || "Passkey login failed.");
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------
  // AUTH UI
  // ---------------------------------------------------

  return (
    <div className="authPage">

      <div className="authCard">

        <div className="logoLarge">SG</div>

        <div className="eyebrow center">
          SMART DRIVE GUARD
        </div>

        <h1>
          {mode === "register"
            ? "Create your account"
            : "Welcome back"}
        </h1>

        <p className="muted">
          Secure vehicle access management
        </p>

        <form onSubmit={submit}>

          {mode === "register" && (
            <>
              <label>
                Full name

                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </label>

              <label>
                Account type

                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                >
                  <option value="owner">Vehicle owner</option>
                  <option value="driver">Driver</option>
                </select>
              </label>
            </>
          )}

          <label>
            Email address

            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>

          <label>
            Password

            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength="8"
              required
            />
          </label>

          {error && (
            <div className="alert error">
              {error}
            </div>
          )}

          <button
            className="primary full"
            disabled={busy}
          >
            {busy
              ? "Please wait..."
              : mode === "register"
                ? "Create account"
                : "Sign in"}
          </button>

        </form>

        <button
          className="secondary full"
          disabled={busy}
          onClick={passkeyLogin}
        >
          Sign in with passkey / device biometrics
        </button>

        <p className="switch">
          {mode === "register"
            ? "Already registered?"
            : "New to Smart Drive Guard?"}

          {" "}

          <button
            disabled={busy}
            onClick={() => {
              setError("");
              setMode(
                mode === "register" ? "login" : "register"
              );
            }}
          >
            {mode === "register" ? "Sign in" : "Create account"}
          </button>
        </p>

        <small className="muted">
          Passkeys require HTTPS (or localhost) and a compatible
          device/browser. Register a passkey after signing in.
        </small>

      </div>
    </div>
  );
}

// =====================================================
// DASHBOARD
// =====================================================

function Dashboard({ data, user, setPage }) {

  return (
    <>
      <div className="stats">

        <Stat
          n={data.vehicles.length}
          label="Vehicles"
        />

        <Stat
          n={data.drivers.length}
          label="Drivers & family"
        />

        <Stat
          n={data.biometrics.length}
          label="Dummy profiles"
        />

        <Stat
          n={data.logs.filter(x => x.accessGranted).length}
          label="Demo approvals"
        />

      </div>

      <div className="grid2">

        <section className="panel heroPanel">

          <div className="eyebrow">
            ACCESS CONTROL
          </div>

          <h2>Verification overview</h2>

          <p className="muted">
            Face camera demonstration AND device verification
            AND licence validity AND owner approval.
          </p>

          <div className="logic">
            <span>FACE DEMO</span>
            <b>AND</b>
            <span>DEVICE VERIFY</span>
            <b>AND</b>
            <span>LICENCE</span>
            <b>AND</b>
            <span>OWNER APPROVAL</span>
          </div>

          <button
            className="primary"
            onClick={() => setPage("verify")}
          >
            Open verification demo
          </button>

        </section>

        <section className="panel">

          <h2>Quick actions</h2>

          <div className="quick">

            <button onClick={() => setPage("vehicles")}>
              ＋ Add vehicle
            </button>

            <button onClick={() => setPage("drivers")}>
              ＋ Add driver
            </button>

            <button onClick={() => setPage("family")}>
              ＋ Add family member
            </button>

            <button onClick={() => setPage("biometrics")}>
              ◎ Manage dummy biometrics
            </button>

          </div>

        </section>

      </div>

      <section className="panel">

        <h2>Recent activity</h2>

        {data.logs.length ? (
          data.logs.slice(0, 5).map(l => (
            <div className="listRow" key={l.id}>

              <span>
                {l.accessGranted ? "✓" : "×"}　Access check
              </span>

              <span className={l.accessGranted ? "good" : "bad"}>
                {l.accessGranted ? "GRANTED" : "DENIED"}
              </span>

            </div>
          ))
        ) : (
          <p className="muted">
            No verification events yet.
          </p>
        )}

      </section>
    </>
  );
}

function Stat({ n, label }) {
  return (
    <div className="stat">
      <strong>{n}</strong>
      <span>{label}</span>
    </div>
  );
}

// =====================================================
// VEHICLES
// =====================================================

function Vehicles({ data, act }) {

  const [vehicleName, setName] = useState("Demo Car");
  const [registration, setReg] = useState("DEMO-001");

  return (
    <div className="grid2">

      <section className="panel">

        <h2>Register vehicle</h2>

        <form
          onSubmit={e => {
            e.preventDefault();

            act(() =>
              post("/api/vehicles", {
                vehicleName,
                registration
              })
            );
          }}
        >

          <label>
            Vehicle name

            <input
              value={vehicleName}
              onChange={e => setName(e.target.value)}
              required
            />
          </label>

          <label>
            Registration (demo)

            <input
              value={registration}
              onChange={e => setReg(e.target.value)}
            />
          </label>

          <button className="primary">
            Add vehicle
          </button>

        </form>

      </section>

      <section className="panel">

        <h2>My vehicles</h2>

        {data.vehicles.map(v => (
          <div className="listRow" key={v.id}>

            <span>
              <b>{v.vehicleName}</b>
              <small>
                {v.registration} · {v.bluetoothName}
              </small>
            </span>

            <span className="pill">
              Registered
            </span>

          </div>
        ))}

        {!data.vehicles.length && (
          <p className="muted">No vehicles added.</p>
        )}

      </section>

    </div>
  );
}

// =====================================================
// DRIVERS AND FAMILY MEMBERS
// =====================================================

function Drivers({ data, act, kind }) {

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    licenceNumber: "",
    expiryDate: "",
    relationship: "",
    biometricProfileId: "",
    vehicleId: "",
    kind
  });

  const change = e => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };

  async function submit(e) {
    e.preventDefault();

    const fd = new FormData();

    Object.entries(form).forEach(([k, v]) => {
      fd.append(k, v);
    });

    const file = e.target.licence.files[0];

    if (file) {
      fd.append("licence", file);
    }

    await act(() =>
      api("/api/drivers", {
        method: "POST",
        body: fd
      })
    );

    setForm({
      ...form,
      name: "",
      email: "",
      phone: "",
      licenceNumber: "",
      expiryDate: ""
    });

    e.target.reset();
  }

  const list = data.drivers.filter(d => d.kind === kind);

  return (
    <div className="grid2">

      <section className="panel">

        <h2>
          {kind === "family"
            ? "Add family member"
            : "Add authorised driver"}
        </h2>

        <form onSubmit={submit}>

          <label>
            Full name
            <input
              name="name"
              value={form.name}
              onChange={change}
              required
            />
          </label>

          <label>
            Email
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={change}
            />
          </label>

          <label>
            Phone (optional)
            <input
              name="phone"
              value={form.phone}
              onChange={change}
            />
          </label>

          {kind === "family" && (
            <label>
              Relationship
              <input
                name="relationship"
                value={form.relationship}
                onChange={change}
                placeholder="e.g. Parent, sibling"
              />
            </label>
          )}

          <label>
            Driving licence number (demo)
            <input
              name="licenceNumber"
              value={form.licenceNumber}
              onChange={change}
              required
            />
          </label>

          <label>
            Licence expiry date
            <input
              type="date"
              name="expiryDate"
              value={form.expiryDate}
              onChange={change}
              required
            />
          </label>

          <label>
            Vehicle

            <select
              name="vehicleId"
              value={form.vehicleId}
              onChange={change}
              required
            >
              <option value="">Select vehicle</option>

              {data.vehicles.map(v => (
                <option value={v.id} key={v.id}>
                  {v.vehicleName}
                </option>
              ))}
            </select>
          </label>

          <label>
            Dummy biometric profile

            <select
              name="biometricProfileId"
              value={form.biometricProfileId}
              onChange={change}
            >
              <option value="">Select profile</option>

              {data.biometrics.map(b => (
                <option value={b.id} key={b.id}>
                  {b.profileName}
                </option>
              ))}
            </select>
          </label>

          <label>
            Licence file (sample only)

            <input
              type="file"
              name="licence"
              accept=".pdf,.png,.jpg,.jpeg"
            />
          </label>

          <button className="primary">
            Submit for owner approval
          </button>

        </form>

      </section>

      <section className="panel">

        <h2>
          {kind === "family" ? "Family members" : "Drivers"}
          {" "}({list.length})
        </h2>

        {list.map(d => (
          <div className="person" key={d.id}>

            <div>
              <b>{d.name}</b>

              <small>
                {d.licenceNumber} · Expires {d.expiryDate}
              </small>

              <span className="pill">
                {d.status}
              </span>
            </div>

            <div className="actions">

              <button
                className="mini goodBtn"
                onClick={() =>
                  act(() =>
                    api(`/api/drivers/${d.id}/approval`, {
                      method: "PATCH",
                      body: JSON.stringify({ approved: true })
                    })
                  )
                }
              >
                Approve
              </button>

              <button
                className="mini dangerBtn"
                onClick={() =>
                  act(() =>
                    api(`/api/drivers/${d.id}/approval`, {
                      method: "PATCH",
                      body: JSON.stringify({ approved: false })
                    })
                  )
                }
              >
                Reject
              </button>

              <button
                className="mini"
                onClick={() =>
                  act(() =>
                    api(`/api/drivers/${d.id}`, {
                      method: "DELETE"
                    })
                  )
                }
              >
                Delete
              </button>

            </div>

          </div>
        ))}

        {!list.length && (
          <p className="muted">No records yet.</p>
        )}

      </section>

    </div>
  );
}

// =====================================================
// DUMMY BIOMETRICS
// =====================================================

function Biometrics({ data, act }) {

  const [profileName, setName] = useState("Demo Biometric 01");
  const [fp, setFp] = useState(true);
  const [face, setFace] = useState(true);
  const [match, setMatch] = useState(true);

  return (
    <div className="grid2">

      <section className="panel">

        <h2>Add dummy biometric profile</h2>

        <p className="muted">
          These are simulated flags for your project demonstration,
          not actual biometric templates.
        </p>

        <form
          onSubmit={e => {
            e.preventDefault();

            act(() =>
              post("/api/biometrics", {
                profileName,
                fingerprintRegistered: fp,
                faceRegistered: face,
                simulatedMatch: match
              })
            );
          }}
        >

          <label>
            Profile name

            <input
              value={profileName}
              onChange={e => setName(e.target.value)}
              required
            />
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={fp}
              onChange={e => setFp(e.target.checked)}
            />
            Fingerprint marked registered
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={face}
              onChange={e => setFace(e.target.checked)}
            />
            Face marked registered
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={match}
              onChange={e => setMatch(e.target.checked)}
            />
            Simulated match passes
          </label>

          <button className="primary">
            Save dummy profile
          </button>

        </form>

      </section>

      <section className="panel">

        <h2>Manage profiles</h2>

        {data.biometrics.map(p => (
          <div className="person" key={p.id}>

            <div>
              <b>{p.profileName}</b>

              <small>
                Fingerprint: {p.fingerprintRegistered ? "Yes" : "No"}
                {" · "}
                Face: {p.faceRegistered ? "Yes" : "No"}
                {" · "}
                Match: {p.simulatedMatch ? "Pass" : "Fail"}
              </small>

              <span className="pill">
                {p.status}
              </span>
            </div>

            <div className="actions">

              <button
                className="mini"
                onClick={() =>
                  act(() =>
                    api(`/api/biometrics/${p.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        status: p.status === "active"
                          ? "disabled"
                          : "active"
                      })
                    })
                  )
                }
              >
                {p.status === "active" ? "Disable" : "Enable"}
              </button>

              <button
                className="mini dangerBtn"
                onClick={() =>
                  act(() =>
                    api(`/api/biometrics/${p.id}`, {
                      method: "DELETE"
                    })
                  )
                }
              >
                Delete
              </button>

            </div>

          </div>
        ))}

        {!data.biometrics.length && (
          <p className="muted">No dummy profiles created.</p>
        )}

      </section>

    </div>
  );
}

// =====================================================
// VERIFICATION DEMONSTRATION
// =====================================================

function Verify({ data, setNotice }) {
  const [vehicleId, setVehicle] = useState(data.vehicles[0]?.id || "");
  const [driverId, setDriver] = useState("");
  const [serialState, setSerialState] = useState("disconnected");
  const [serialName, setSerialName] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [faceState, setFaceState] = useState("pending");
  const [deviceState, setDeviceState] = useState("pending");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const videoRef = React.useRef(null);
  const selectedDriver = data.drivers.find(d => d.id === driverId);
  const enrolled = driverId ? hasFaceTemplate(driverId) : false;

  useEffect(() => {
    return () => {
      stopFaceCamera(videoRef.current);
      disconnectBLE();
    };
  }, []);

  async function connectHardware() {
    setMessage("");
    try {
      const name = await connectBLE(() => {
        setSerialState("disconnected");
        setSerialName("");
        setMessage("HC-05 serial connection disconnected.");
      });
      setSerialName(name);
      setSerialState("connected");
      setMessage("Connected to " + name + ".");
    } catch (error) {
      setSerialState("disconnected");
      setMessage(error.message || "Could not connect to HC-05.");
    }
  }

  async function startCamera() {
    setMessage("");
    try {
      await startFaceCamera(videoRef.current);
      setCameraActive(true);
      setMessage("Camera started. Position one face clearly in the frame.");
    } catch (error) {
      setCameraActive(false);
      setMessage(error.message || "Could not start camera.");
    }
  }

  function stopCamera() {
    stopFaceCamera(videoRef.current);
    setCameraActive(false);
  }

  async function enrollSelectedFace() {
    if (!driverId) {
      setMessage("Select a driver before enrolling a face.");
      return;
    }
    if (!cameraActive) {
      setMessage("Start the camera before enrolling.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await enrollFace(videoRef.current, driverId);
      setFaceState("pending");
      setMessage("Face template enrolled locally for " + (selectedDriver?.name || "the selected driver") + ". It was not uploaded to the server.");
    } catch (error) {
      setMessage(error.message || "Face enrollment failed.");
    } finally {
      stopCamera();
      setBusy(false);
    }
  }

  async function runFaceRecognition() {
    if (!driverId) {
      setMessage("Select a driver before face verification.");
      return;
    }
    if (!enrolled) {
      setFaceState("failed");
      setMessage("No face template is enrolled for this driver on this browser. Enroll the face first.");
      return;
    }
    if (!cameraActive) {
      setMessage("Start the camera before verifying the face.");
      return;
    }
    setBusy(true);
    setFaceState("checking");
    setMessage("");
    try {
      const match = await recognizeFace(videoRef.current, driverId);
      setFaceState(match.matched ? "passed" : "failed");
      setMessage(
        match.matched
          ? "Face matched the locally enrolled template. Demo distance: " + match.distance
          : "Face did not match the enrolled template. Demo distance: " + match.distance
      );
    } catch (error) {
      setFaceState("failed");
      setMessage(error.message || "Face recognition failed.");
    } finally {
      stopCamera();
      setBusy(false);
    }
  }

  async function verifyDevice() {
    setBusy(true);
    setDeviceState("checking");
    setMessage("");
    try {
      const options = await post("/api/demo/device-auth-options", {});
      const credential = await startAuthentication({ optionsJSON: options });
      const response = await post("/api/demo/device-auth-verify", credential);
      if (!response.verified) {
        throw new Error("The device did not complete verification.");
      }
      setDeviceState("passed");
      setMessage("Device user verification completed. The device may have used its configured biometric or PIN.");
    } catch (error) {
      setDeviceState("failed");
      setMessage(error.message || "Device verification was not completed.");
    } finally {
      setBusy(false);
    }
  }

  async function registerDevicePasskey() {
    setBusy(true);
    setMessage("");
    try {
      const options = await post("/api/passkey/register-options", {});
      const credential = await startRegistration({ optionsJSON: options });
      const response = await post("/api/passkey/register-verify", credential);
      if (!response.verified) {
        throw new Error("Passkey registration was not verified by the server.");
      }
      setDeviceState("pending");
      setMessage("Passkey registered. Now run device verification.");
    } catch (error) {
      setMessage(error.message || "Passkey registration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runAccessCheck() {
    setBusy(true);
    setMessage("");
    try {
      const response = await post("/api/access/check", {
        vehicleId,
        driverId,
        facePassed: faceState === "passed"
      });
      setResult(response);
      const command = response.accessGranted ? "SUCCESS" : "FAIL";
      if (serialState === "connected") {
        try {
          await sendBLECommand(command);
          setMessage("Final result " + command + " was sent to " + serialName + ".");
        } catch (error) {
          setSerialState("disconnected");
          setMessage("Decision was recorded, but HC-05 transmission failed: " + error.message);
        }
      } else {
        setMessage("Decision was recorded. Connect the HC-05 serial port to send " + command + " to Arduino.");
      }
      setNotice(response.accessGranted
        ? "All demonstration checks passed."
        : "Access denied. One or more required checks failed.");
    } catch (error) {
      setMessage(error.message || "Could not complete the access check.");
    } finally {
      setBusy(false);
    }
  }

  async function resetDemo() {
    setResult(null);
    setFaceState("pending");
    setDeviceState("pending");
    setMessage("New verification session started.");
    if (serialState === "connected") {
      try {
        await sendBLECommand("RESET");
        setMessage("Arduino demonstration reset.");
      } catch (error) {
        setSerialState("disconnected");
        setMessage("Could not send RESET: " + error.message);
      }
    }
  }

  const faceComplete = faceState === "passed" || faceState === "failed";
  const deviceComplete = deviceState === "passed" || deviceState === "failed";
  const canCheck = !!vehicleId && !!driverId && faceComplete && deviceComplete && !busy;

  return (
    <div className="verifyLayout">
      <section className="panel">
        <div className="verifyHeader">
          <div>
            <div className="eyebrow">BIOMETRIC ACCESS GATE</div>
            <h2>Face recognition and device verification</h2>
          </div>
          <span className={serialState === "connected" ? "connection connected" : "connection"}>
            {serialState === "connected" ? "HC-05 CONNECTED" : "HC-05 DISCONNECTED"}
          </span>
        </div>

        <p className="muted">
          Enrol an authorised driver's face locally, compare a fresh camera capture, verify the registered passkey, then send a demonstration result to the Arduino LED.
        </p>

        <div className="blePanel">
          <div>
            <b>Arduino Uno + HC-05 serial connection</b>
            <small>
              {serialState === "connected"
                ? "Connected device: " + serialName
                : "Pair HC-05 in Windows first. Use Chrome or Edge on HTTPS."}
            </small>
          </div>
          <button className="secondary" onClick={connectHardware} disabled={busy || serialState === "connected"}>
            {serialState === "connected" ? "Connected" : "Connect HC-05"}
          </button>
          {serialState === "connected" && (
            <button className="mini" onClick={() => {
              disconnectBLE();
              setSerialState("disconnected");
              setSerialName("");
            }}>Disconnect</button>
          )}
        </div>

        <label>
          Vehicle
          <select value={vehicleId} onChange={e => setVehicle(e.target.value)}>
            <option value="">Select vehicle</option>
            {data.vehicles.map(v => <option value={v.id} key={v.id}>{v.vehicleName}</option>)}
          </select>
        </label>

        <label>
          Driver
          <select value={driverId} onChange={e => {
            setDriver(e.target.value);
            setFaceState("pending");
            setDeviceState("pending");
            setResult(null);
            setMessage("");
          }}>
            <option value="">Select driver</option>
            {data.drivers.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}
          </select>
        </label>

        <div className="verificationStep">
          <div className="stepTitle">
            <span className="stepNumber">01</span>
            <div>
              <b>Facial identity recognition</b>
              <small>
                {enrolled ? "A local face template exists for this driver on this browser." : "No local face template found for the selected driver."}
              </small>
            </div>
            <strong className={faceState === "passed" ? "good" : faceState === "failed" ? "bad" : ""}>
              {faceState === "passed" ? "MATCH" : faceState === "failed" ? "NO MATCH" : faceState === "checking" ? "CHECKING" : "PENDING"}
            </strong>
          </div>

          <video
            ref={videoRef}
            className="cameraPreview"
            style={{ display: cameraActive ? "block" : "none" }}
            autoPlay
            playsInline
            muted
          />

          <div className="stepActions">
            <button className="secondary" onClick={startCamera} disabled={busy || cameraActive || !driverId}>
              Start camera
            </button>
            <button className="secondary" onClick={enrollSelectedFace} disabled={busy || !cameraActive || !driverId}>
              Enrol selected driver's face
            </button>
            <button className="primary" onClick={runFaceRecognition} disabled={busy || !cameraActive || !driverId || !enrolled}>
              Verify face
            </button>
            <button className="mini" onClick={stopCamera} disabled={!cameraActive || busy}>Stop camera</button>
            <button className="mini dangerBtn" onClick={() => {
              if (driverId) {
                deleteFaceTemplate(driverId);
                setFaceState("pending");
                setMessage("The local face template was deleted from this browser.");
              }
            }} disabled={!driverId || !enrolled || busy}>Delete enrolment</button>
          </div>

          <small className="muted">
            Face templates stay in this browser's local storage and are not uploaded. Anyone using this browser profile may be able to access local browser data; this is a classroom prototype, not secure biometric storage. Enrol only with the person's informed consent.
          </small>
        </div>

        <div className="verificationStep">
          <div className="stepTitle">
            <span className="stepNumber">02</span>
            <div>
              <b>Device passkey verification</b>
              <small>WebAuthn requests device user verification: biometric or device PIN, depending on device settings.</small>
            </div>
            <strong className={deviceState === "passed" ? "good" : deviceState === "failed" ? "bad" : ""}>
              {deviceState === "passed" ? "VERIFIED" : deviceState === "failed" ? "FAILED" : deviceState === "checking" ? "CHECKING" : "PENDING"}
            </strong>
          </div>
          <div className="stepActions">
            <button className="secondary" onClick={verifyDevice} disabled={busy || deviceState === "passed"}>Verify with device</button>
            <button className="mini" onClick={registerDevicePasskey} disabled={busy}>Register passkey</button>
          </div>
          <small className="muted">
            Register a passkey once while signed in. The website receives the cryptographic credential result, not your face or fingerprint scan.
          </small>
        </div>

        <div className="stepActions finalActions">
          <button className="primary" onClick={runAccessCheck} disabled={!canCheck}>
            Evaluate &amp; send result to Arduino
          </button>
          <button className="mini" onClick={resetDemo} disabled={busy}>Reset session</button>
        </div>

        {message && <div className="alert success">{message}</div>}

        {result && (
          <div className="result">
            <h3 className={result.accessGranted ? "good" : "bad"}>
              {result.accessGranted ? "DEMO APPROVED" : "DEMO REJECTED"}
            </h3>
            <div className="listRow">
              Face recognition
              <b className={result.biometricChecks?.faceResult ? "good" : "bad"}>
                {result.biometricChecks?.faceResult ? "PASS" : "FAIL"}
              </b>
            </div>
            <div className="listRow">
              Device verification
              <b className={result.biometricChecks?.deviceVerificationPassed ? "good" : "bad"}>
                {result.biometricChecks?.deviceVerificationPassed ? "PASS" : "FAIL"}
              </b>
            </div>
            <div className="listRow">
              Licence validity
              <b className={result.logic?.[1] ? "good" : "bad"}>
                {result.logic?.[1] ? "PASS" : "FAIL"}
              </b>
            </div>
            <div className="listRow">
              Owner approval
              <b className={result.logic?.[2] ? "good" : "bad"}>
                {result.logic?.[2] ? "PASS" : "FAIL"}
              </b>
            </div>
            <p className="muted">All checks must pass for the demonstration to send SUCCESS. Otherwise it sends FAIL.</p>
          </div>
        )}
      </section>

      <aside className="panel infoPanel">
        <h2>System flow</h2>
        <ol>
          <li>Enrol the driver's face with consent on this browser.</li>
          <li>Compare a new camera capture with the local template.</li>
          <li>Verify the passkey using the device.</li>
          <li>The server checks the driver's licence and owner approval.</li>
          <li>The browser sends SUCCESS or FAIL to the Arduino over HC-05 serial.</li>
        </ol>
        <p className="muted">
          This project sends a result to an onboard LED for demonstration only. Do not connect it to vehicle ignition, locks or other safety-critical systems. Client-side face matching can be tampered with and is not production authentication.
        </p>
      </aside>
    </div>
  );
}

// =====================================================
// ACCESS HISTORY
// =====================================================

function History({ data }) {

  return (
    <section className="panel">

      <h2>Access history</h2>

      {data.logs.map(l => (
        <div className="listRow" key={l.id}>

          <span>
            {new Date(l.createdAt).toLocaleString()}
          </span>

          <b className={l.accessGranted ? "good" : "bad"}>
            {l.accessGranted ? "GRANTED" : "DENIED"}
          </b>

        </div>
      ))}

      {!data.logs.length && (
        <p className="muted">
          No access history yet.
        </p>
      )}

    </section>
  );
}
