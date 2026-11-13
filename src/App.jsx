import React, { useEffect, useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { connectBLE, sendBLECommand, disconnectBLE } from "./ble.js";
import { detectFacePresence } from "./face-demo.js";

const api = async (url, options = {}) => {
  const res = await fetch(url, { credentials: "include", ...options, headers: options.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};
const post = (url, body) => api(url, { method: "POST", body: JSON.stringify(body) });

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [menu, setMenu] = useState(false);
  const [data, setData] = useState({ vehicles: [], drivers: [], biometrics: [], logs: [] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const me = await api("/api/me"); setUser(me.user);
    if (me.user) setData(await api("/api/dashboard"));
  }
  useEffect(() => { refresh().catch(e => setError(e.message)); }, []);
  async function act(fn) {
    setError(""); setNotice(""); setBusy(true);
    try { await fn(); await refresh(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!user) return <Auth onDone={refresh} />;
  const nav = [
    ["dashboard", "Dashboard", "▦"], ["vehicles", "My Vehicle", "🚘"],
    ["drivers", "Manage Drivers", "♙"], ["family", "Family Members", "♧"],
    ["biometrics", "Manage Dummy Biometrics", "◎"], ["verify", "Verify Biometrics", "◉"], ["history", "Access History", "◷"]
  ];
  return <div className="shell">
    <header className="topbar">
      <button className="menuBtn" onClick={() => setMenu(!menu)}>☰</button>
      <div className="brand"><span className="brandMark">SG</span><span>SMART DRIVE <b>GUARD</b></span></div>
      <div className="topRight"><span className="userTag">{user.name} · {user.role}</span><button className="ghost" onClick={() => act(async () => {
        const options = await post("/api/passkey/register-options", {});
        const credential = await startRegistration({ optionsJSON: options });
        await post("/api/passkey/register-verify", credential);
        setNotice("Passkey registered on this device.");
      })}>Register passkey</button><button className="ghost" onClick={() => act(async () => { await post("/api/auth/logout", {}); setUser(null); })}>Logout</button></div>
    </header>
    {menu && <div className="drawerBackdrop" onClick={() => setMenu(false)}><aside className="drawer" onClick={e => e.stopPropagation()}><h3>Navigation</h3>{nav.map(n => <button key={n[0]} className={page===n[0]?"navItem active":"navItem"} onClick={() => {setPage(n[0]);setMenu(false);}}>{n[2]}　{n[1]}</button>)}</aside></div>}
    <main className="main">
      <div className="welcome"><div><div className="eyebrow">VEHICLE ACCESS MANAGEMENT</div><h1>{nav.find(n=>n[0]===page)?.[1] || "Dashboard"}</h1><p>Manage authorised drivers and demonstration verification.</p></div><span className="online"><i/> SYSTEM ONLINE</span></div>
      {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
      {page==="dashboard" && <Dashboard data={data} user={user} setPage={setPage} />}
      {page==="vehicles" && <Vehicles data={data} act={act} />}
      {page==="drivers" && <Drivers data={data} act={act} kind="driver" />}
      {page==="family" && <Drivers data={data} act={act} kind="family" />}
      {page==="biometrics" && <Biometrics data={data} act={act} />}
      {page==="history" && <History data={data} />}
      {page==="verify" && <Verify data={data} act={act} setNotice={setNotice} user={user} />}
      <footer>SMART DRIVE GUARD · Educational prototype · Not for controlling a real vehicle</footer>
    </main>
  </div>;
}

function Auth({ onDone }) {
  const [mode,setMode]=useState("register"), [name,setName]=useState("Demo Owner"), [email,setEmail]=useState("owner@example.com"), [password,setPassword]=useState("DemoPass123!"), [role,setRole]=useState("owner"), [error,setError]=useState(""), [busy,setBusy]=useState(false);
  async function submit(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const url=mode==="register"?"/api/auth/register":"/api/auth/login";
      await post(url, mode==="register"?{name,email,password,role}:{email,password});
      await onDone();
    } catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  async function passkeyLogin() {
    setError(""); setBusy(true);
    try {
      const options=await post("/api/passkey/auth-options",{email});
      const response=await startAuthentication({optionsJSON:options});
      await post("/api/passkey/auth-verify",response);
      await onDone();
    } catch(e) {setError(e.message || "Passkey login failed.");} finally {setBusy(false);}
  }
  return <div className="authPage"><div className="authCard"><div className="logoLarge">SG</div><div className="eyebrow center">SMART DRIVE GUARD</div><h1>{mode==="register"?"Create your account":"Welcome back"}</h1><p className="muted">Secure vehicle access management</p>
    <form onSubmit={submit}>
      {mode==="register" && <><label>Full name<input value={name} onChange={e=>setName(e.target.value)} required /></label><label>Account type<select value={role} onChange={e=>setRole(e.target.value)}><option value="owner">Vehicle owner</option><option value="driver">Driver</option></select></label></>}
      <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength="8" required /></label>
      {error && <div className="alert error">{error}</div>}
      <button className="primary full" disabled={busy}>{busy?"Please wait…":mode==="register"?"Create account":"Sign in"}</button>
    </form>
    <button className="secondary full" disabled={busy} onClick={passkeyLogin}>Sign in with passkey / device biometrics</button>
    <p className="switch">{mode==="register"?"Already registered?":"New to Smart Drive Guard?"} <button onClick={()=>setMode(mode==="register"?"login":"register")}>{mode==="register"?"Sign in":"Create account"}</button></p>
    <small className="muted">Passkeys require HTTPS (or localhost) and a compatible device/browser. Register a passkey after signing in.</small>
  </div></div>;
}

function Dashboard({data,user,setPage}) {
  return <><div className="stats"><Stat n={data.vehicles.length} label="Vehicles"/><Stat n={data.drivers.length} label="Drivers & family"/><Stat n={data.biometrics.length} label="Dummy profiles"/><Stat n={data.logs.filter(x=>x.accessGranted).length} label="Demo approvals"/></div>
    <div className="grid2"><section className="panel heroPanel"><div className="eyebrow">ACCESS CONTROL</div><h2>Verification overview</h2><p className="muted">Face camera demonstration AND device verification AND licence validity AND owner approval.</p><div className="logic"><span>FACE DEMO</span><b>AND</b><span>DEVICE VERIFY</span><b>AND</b><span>LICENCE</span><b>AND</b><span>OWNER APPROVAL</span></div><button className="primary" onClick={()=>setPage("verify")}>Open verification demo</button></section>
    <section className="panel"><h2>Quick actions</h2><div className="quick"><button onClick={()=>setPage("vehicles")}>＋ Add vehicle</button><button onClick={()=>setPage("drivers")}>＋ Add driver</button><button onClick={()=>setPage("family")}>＋ Add family member</button><button onClick={()=>setPage("biometrics")}>◎ Manage dummy biometrics</button></div></section></div>
    <section className="panel"><h2>Recent activity</h2>{data.logs.length?data.logs.slice(0,5).map(l=><div className="listRow" key={l.id}><span>{l.accessGranted?"✓":"×"}　Access check</span><span className={l.accessGranted?"good":"bad"}>{l.accessGranted?"GRANTED":"DENIED"}</span></div>):<p className="muted">No verification events yet.</p>}</section>
  </>;
}
function Stat({n,label}) {return <div className="stat"><strong>{n}</strong><span>{label}</span></div>;}

function Vehicles({data,act}) {
  const [vehicleName,setName]=useState("Demo Car"),[registration,setReg]=useState("DEMO-001");
  return <div className="grid2"><section className="panel"><h2>Register vehicle</h2><form onSubmit={e=>{e.preventDefault();act(()=>post("/api/vehicles",{vehicleName,registration}));}}><label>Vehicle name<input value={vehicleName} onChange={e=>setName(e.target.value)} required/></label><label>Registration (demo)<input value={registration} onChange={e=>setReg(e.target.value)}/></label><button className="primary">Add vehicle</button></form></section><section className="panel"><h2>My vehicles</h2>{data.vehicles.map(v=><div className="listRow" key={v.id}><span><b>{v.vehicleName}</b><small>{v.registration} · {v.bluetoothName}</small></span><span className="pill">Registered</span></div>)}{!data.vehicles.length&&<p className="muted">No vehicles added.</p>}</section></div>;
}

function Drivers({data,act,kind}) {
  const [form,setForm]=useState({name:"",email:"",phone:"",licenceNumber:"",expiryDate:"",relationship:"",biometricProfileId:"",vehicleId:"",kind});
  const change=e=>setForm({...form,[e.target.name]:e.target.value});
  async function submit(e) {
    e.preventDefault(); const fd=new FormData(); Object.entries(form).forEach(([k,v])=>fd.append(k,v));
    const file=e.target.licence.files[0]; if(file)fd.append("licence",file);
    await act(()=>api("/api/drivers",{method:"POST",body:fd}));
    setForm({...form,name:"",email:"",phone:"",licenceNumber:"",expiryDate:""});
    e.target.reset();
  }
  const list=data.drivers.filter(d=>d.kind===kind);
  return <div className="grid2"><section className="panel"><h2>{kind==="family"?"Add family member":"Add authorised driver"}</h2><form onSubmit={submit}>
    <label>Full name<input name="name" value={form.name} onChange={change} required/></label><label>Email<input name="email" type="email" value={form.email} onChange={change}/></label><label>Phone (optional)<input name="phone" value={form.phone} onChange={change}/></label>
    {kind==="family"&&<label>Relationship<input name="relationship" value={form.relationship} onChange={change} placeholder="e.g. Parent, sibling"/></label>}
    <label>Driving licence number (demo)<input name="licenceNumber" value={form.licenceNumber} onChange={change} required/></label><label>Licence expiry date<input type="date" name="expiryDate" value={form.expiryDate} onChange={change} required/></label>
    <label>Vehicle<select name="vehicleId" value={form.vehicleId} onChange={change} required><option value="">Select vehicle</option>{data.vehicles.map(v=><option value={v.id} key={v.id}>{v.vehicleName}</option>)}</select></label>
    <label>Dummy biometric profile<select name="biometricProfileId" value={form.biometricProfileId} onChange={change}><option value="">Select profile</option>{data.biometrics.map(b=><option value={b.id} key={b.id}>{b.profileName}</option>)}</select></label>
    <label>Licence file (sample only)<input type="file" name="licence" accept=".pdf,.png,.jpg,.jpeg"/></label>
    <button className="primary">Submit for owner approval</button>
  </form></section><section className="panel"><h2>{kind==="family"?"Family members":"Drivers"} ({list.length})</h2>{list.map(d=><div className="person" key={d.id}><div><b>{d.name}</b><small>{d.licenceNumber} · Expires {d.expiryDate}</small><span className="pill">{d.status}</span></div><div className="actions"><button className="mini goodBtn" onClick={()=>act(()=>api(`/api/drivers/${d.id}/approval`,{method:"PATCH",body:JSON.stringify({approved:true})}))}>Approve</button><button className="mini dangerBtn" onClick={()=>act(()=>api(`/api/drivers/${d.id}/approval`,{method:"PATCH",body:JSON.stringify({approved:false})}))}>Reject</button><button className="mini" onClick={()=>act(()=>api(`/api/drivers/${d.id}`,{method:"DELETE"}))}>Delete</button></div></div>)}{!list.length&&<p className="muted">No records yet.</p>}</section></div>;
}

function Biometrics({data,act}) {
  const [profileName,setName]=useState("Demo Biometric 01"),[fp,setFp]=useState(true),[face,setFace]=useState(true),[match,setMatch]=useState(true);
  return <div className="grid2"><section className="panel"><h2>Add dummy biometric profile</h2><p className="muted">These are simulated flags for your project demonstration, not actual biometric templates.</p><form onSubmit={e=>{e.preventDefault();act(()=>post("/api/biometrics",{profileName,fingerprintRegistered:fp,faceRegistered:face,simulatedMatch:match}));}}><label>Profile name<input value={profileName} onChange={e=>setName(e.target.value)} required/></label><label className="check"><input type="checkbox" checked={fp} onChange={e=>setFp(e.target.checked)}/> Fingerprint marked registered</label><label className="check"><input type="checkbox" checked={face} onChange={e=>setFace(e.target.checked)}/> Face marked registered</label><label className="check"><input type="checkbox" checked={match} onChange={e=>setMatch(e.target.checked)}/> Simulated match passes</label><button className="primary">Save dummy profile</button></form></section><section className="panel"><h2>Manage profiles</h2>{data.biometrics.map(p=><div className="person" key={p.id}><div><b>{p.profileName}</b><small>Fingerprint: {p.fingerprintRegistered?"Yes":"No"} · Face: {p.faceRegistered?"Yes":"No"} · Match: {p.simulatedMatch?"Pass":"Fail"}</small><span className="pill">{p.status}</span></div><div className="actions"><button className="mini" onClick={()=>act(()=>api(`/api/biometrics/${p.id}`,{method:"PATCH",body:JSON.stringify({status:p.status==="active"?"disabled":"active"})}))}>{p.status==="active"?"Disable":"Enable"}</button><button className="mini dangerBtn" onClick={()=>act(()=>api(`/api/biometrics/${p.id}`,{method:"DELETE"}))}>Delete</button></div></div>)}{!data.biometrics.length&&<p className="muted">No dummy profiles created.</p>}</section></div>;
}

function Verify({data,setNotice,user}) {
  const [vehicleId,setVehicle]=useState(data.vehicles[0]?.id||"");
  const [driverId,setDriver]=useState("");
  const [bleState,setBleState]=useState("disconnected");
  const [bleName,setBleName]=useState("");
  const [faceState,setFaceState]=useState("pending");
  const [deviceVerified,setDeviceVerified]=useState(false);
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);
  const [message,setMessage]=useState("");
  const videoRef=React.useRef(null);

  useEffect(() => () => disconnectBLE(), []);

  async function connectHardware() {
    setMessage("");
    try {
      const name=await connectBLE(() => {
        setBleState("disconnected");
        setBleName("");
        setMessage("BLE module disconnected. No further commands can be sent.");
      });
      setBleName(name);
      setBleState("connected");
      setMessage("Connected to " + name + ".");
    } catch(error) {
      setBleState("disconnected");
      setMessage(error.message);
    }
  }

  async function runCameraFaceDemo() {
    setMessage("");
    setFaceState("checking");
    try {
      const found=await detectFacePresence(videoRef.current);
      setFaceState(found ? "passed" : "failed");
      setMessage(found
        ? "A face was detected by the camera. This is face-presence detection, not identity matching."
        : "No face was detected. Try again with your face clearly visible.");
    } catch(error) {
      setFaceState("unsupported");
      setMessage(error.message);
    }
  }

  async function verifyDevice() {
    setBusy(true);
    setMessage("");
    try {
      const options=await post("/api/demo/device-auth-options",{});
      const credential=await startAuthentication({optionsJSON:options});
      const response=await post("/api/demo/device-auth-verify",credential);
      setDeviceVerified(!!response.verified);
      setMessage("Device user verification completed. The device may have used fingerprint, face recognition, or PIN.");
    } catch(error) {
      setDeviceVerified(false);
      setMessage(error.message || "Device verification was not completed.");
    } finally {
      setBusy(false);
    }
  }

  async function registerDevicePasskey() {
    setBusy(true);
    setMessage("");
    try {
      const options=await post("/api/passkey/register-options",{});
      const credential=await startRegistration({optionsJSON:options});
      await post("/api/passkey/register-verify",credential);
      setMessage("Passkey registered. Now complete device verification.");
    } catch(error) {
      setMessage(error.message || "Passkey registration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runAccessCheck() {
    setBusy(true);
    setMessage("");
    try {
      const response=await post("/api/access/check",{
        vehicleId,
        driverId,
        facePassed: faceState === "passed"
      });
      setResult(response);
      setDeviceVerified(false);

      const command=response.accessGranted ? "SUCCESS" : "FAIL";
      if (bleState === "connected") {
        try {
          await sendBLECommand(command);
          setMessage("Access decision: " + command + " command sent to " + bleName + ".");
        } catch(error) {
          setBleState("disconnected");
          setMessage("Access decision recorded, but Bluetooth transmission failed: " + error.message);
        }
      } else {
        setMessage("Access decision recorded. Connect the BLE module to transmit " + command + " to Arduino.");
      }

      setFaceState("pending");
      setNotice(response.accessGranted ? "All demonstration access checks passed." : "Access denied. At least one required check failed.");
    } catch(error) {
      setMessage(error.message || "Could not complete access check.");
    } finally {
      setBusy(false);
    }
  }

  async function resetDemo() {
    setResult(null);
    setFaceState("pending");
    setDeviceVerified(false);
    setMessage("New verification session started.");
    if (bleState === "connected") {
      try {
        await sendBLECommand("RESET");
        setMessage("Arduino reset. Ready for a new verification session.");
      } catch(error) {
        setBleState("disconnected");
        setMessage("Could not send RESET: " + error.message);
      }
    }
  }

  const facePassed=faceState==="passed";
  const canCheck=!!vehicleId && !!driverId && facePassed && deviceVerified && !busy;

  return <div className="verifyLayout">
    <section className="panel">
      <div className="verifyHeader">
        <div><div className="eyebrow">BIOMETRIC ACCESS GATE</div><h2>Verify your biometrics</h2></div>
        <span className={bleState==="connected"?"connection connected":"connection"}>{bleState==="connected"?"BLE CONNECTED":"BLE DISCONNECTED"}</span>
      </div>
      <p className="muted">Complete the two exhibition checks, then the server evaluates licence validity and owner approval before sending the final result to Arduino.</p>

      <div className="blePanel">
        <div><b>Arduino Bluetooth connection</b><small>{bleState==="connected" ? "Connected device: "+bleName : "Connect to an HM-10-compatible BLE UART module."}</small></div>
        <button className="secondary" onClick={connectHardware} disabled={busy || bleState==="connected"}>{bleState==="connected"?"Connected":"Connect BLE module"}</button>
        {bleState==="connected" && <button className="mini" onClick={()=>{disconnectBLE();setBleState("disconnected");setBleName("");}}>Disconnect</button>}
      </div>

      <label>Vehicle<select value={vehicleId} onChange={e=>setVehicle(e.target.value)}><option value="">Select vehicle</option>{data.vehicles.map(v=><option value={v.id} key={v.id}>{v.vehicleName}</option>)}</select></label>
      <label>Driver<select value={driverId} onChange={e=>setDriver(e.target.value)}><option value="">Select driver</option>{data.drivers.map(d=><option value={d.id} key={d.id}>{d.name}</option>)}</select></label>

      <div className="verificationStep">
        <div className="stepTitle"><span className="stepNumber">01</span><div><b>Facial verification demonstration</b><small>Camera face-presence check — not identity recognition</small></div><strong className={facePassed?"good":faceState==="failed"?"bad":""}>{faceState==="passed"?"PASS":faceState==="failed"?"FAIL":faceState==="checking"?"CHECKING":"PENDING"}</strong></div>
        <video ref={videoRef} className="cameraPreview" autoPlay playsInline muted />
        <div className="stepActions">
          <button className="secondary" onClick={runCameraFaceDemo} disabled={busy || faceState==="checking"}>Start camera check</button>
          <button className="mini" onClick={()=>{setFaceState("passed");setMessage("Simulated face check marked PASS for the exhibition.");}}>Simulate PASS</button>
          <button className="mini" onClick={()=>{setFaceState("failed");setMessage("Simulated face check marked FAIL.");}}>Simulate FAIL</button>
        </div>
        <small className="muted">If FaceDetector is unavailable in your browser, use the clearly labelled simulation buttons for the exhibition. No face images are uploaded or stored.</small>
      </div>

      <div className="verificationStep">
        <div className="stepTitle"><span className="stepNumber">02</span><div><b>Device biometric verification</b><small>WebAuthn passkey — fingerprint, face, or device PIN depending on your device</small></div><strong className={deviceVerified?"good":""}>{deviceVerified?"VERIFIED":"PENDING"}</strong></div>
        <div className="stepActions">
          <button className="secondary" onClick={verifyDevice} disabled={busy}>Verify with device</button>
          <button className="mini" onClick={registerDevicePasskey} disabled={busy}>Register passkey</button>
        </div>
        <small className="muted">Register a passkey once on this account. The browser/device performs verification; the website never receives fingerprint or face data.</small>
      </div>

      <div className="stepActions finalActions">
        <button className="primary" onClick={runAccessCheck} disabled={!canCheck}>Evaluate & send to Arduino</button>
        <button className="mini" onClick={resetDemo} disabled={busy}>Reset session</button>
      </div>

      {message && <div className="alert success">{message}</div>}
      {result && <div className="result">
        <h3 className={result.accessGranted?"good":"bad"}>{result.accessGranted?"ACCESS GRANTED":"ACCESS DENIED"}</h3>
        <div className="listRow">Face camera demo <b className={result.biometricChecks?.faceResult?"good":"bad"}>{result.biometricChecks?.faceResult?"PASS":"FAIL"}</b></div>
        <div className="listRow">Device verification <b className={result.biometricChecks?.deviceVerificationPassed?"good":"bad"}>{result.biometricChecks?.deviceVerificationPassed?"PASS":"FAIL"}</b></div>
        <div className="listRow">Combined biometrics <b className={result.logic[0]?"good":"bad"}>{result.logic[0]?"PASS":"FAIL"}</b></div>
        <div className="listRow">Licence validity <b className={result.logic[1]?"good":"bad"}>{result.logic[1]?"PASS":"FAIL"}</b></div>
        <div className="listRow">Owner approval <b className={result.logic[2]?"good":"bad"}>{result.logic[2]?"PASS":"FAIL"}</b></div>
        <p className="muted">Decision logic: Face AND Device Verification AND Licence AND Owner Approval.</p>
      </div>}
    </section>
    <aside className="panel infoPanel">
      <h2>How the system works</h2>
      <ol>
        <li>Website checks camera face presence for the exhibition demo.</li>
        <li>WebAuthn asks the device to verify its enrolled user.</li>
        <li>Server checks the driver's licence date and owner approval.</li>
        <li>Website sends SUCCESS or FAIL over BLE UART.</li>
        <li>Arduino plays the matching melody and lights the LED.</li>
      </ol>
      <p className="muted">This is a classroom prototype, not a production identity or vehicle-security system.</p>
    </aside>
  </div>;
}
function History({data}) {return <section className="panel"><h2>Access history</h2>{data.logs.map(l=><div className="listRow" key={l.id}><span>{new Date(l.createdAt).toLocaleString()}</span><b className={l.accessGranted?"good":"bad"}>{l.accessGranted?"GRANTED":"DENIED"}</b></div>)}{!data.logs.length&&<p className="muted">No access history yet.</p>}</section>;}
