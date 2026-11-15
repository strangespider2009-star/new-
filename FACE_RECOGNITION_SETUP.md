# Face matching and device verification setup

This is an **educational prototype**, not a production biometric authentication system or a vehicle-access controller.

## What each feature actually proves

- **Face matching** uses the camera and `@vladmandic/face-api` to compare a fresh 128-value face descriptor with a locally enrolled template for a selected demo driver. It is not liveness detection and does not prevent photo/video spoofing.
- **Passkey / device verification** uses WebAuthn with `userVerification: "required"`. The authenticator may approve by fingerprint, face, screen lock, or PIN. The website **cannot require or observe fingerprint specifically**.
- The passkey belongs to the **signed-in account**, not necessarily to the **selected driver**. These checks must not be represented as verified driver identity or used to control a real vehicle.
- The server trusts a client-supplied `facePassed` boolean; it is intentionally not a secure identity attestation. Anyone controlling the browser can alter it.

## Run locally (Node.js 20.6+)

```bash
npm install
cp .env.example .env
```

PowerShell: `Copy-Item .env.example .env`

In terminal 1, start the API:
```bash
node --env-file=.env server/index.js
```

In terminal 2, start Vite:
```bash
npm run dev
```

Visit `http://localhost:5173`. The frontend's default development API is `http://localhost:3001`. The backend's default development allowed origin is `http://localhost:5173`.

## Face camera checklist

1. Allow the browser's camera permission on localhost or HTTPS.
2. Make sure `npm run dev` / `npm run build` completes: `scripts/copy-face-models.mjs` copies model files into `public/models`.
3. In browser Developer Tools > Network, confirm that `/models/tiny_face_detector_model-weights_manifest.json`, `/models/face_landmark_68_model-weights_manifest.json`, `/models/face_recognition_model-weights_manifest.json`, and their referenced weight shards load successfully (HTTP 200).
4. Create and select a demonstration driver, select **Start camera**, and enrol one consenting person's face. Keep only one face in the image with good lighting.
5. The local template stays in that exact browser profile. Switching devices, clearing site data, or using private browsing requires a new enrolment.
6. Start the camera again and select **Verify face**. Enrolment and verification are performed locally in the browser.

If `/models` returns 404, check your Render build command: it must invoke the Vite build with its `prebuild` step (for example, `npm ci && npm run build`). Do not deploy only `index.html` without the built `dist` folder.

## Device / passkey checklist

1. On a browser/platform with WebAuthn support, sign in with your password.
2. Select **Register passkey** and complete the authenticator prompt. A device PIN is an acceptable result for this feature, not proof of a fingerprint.
3. Select **Verify with device** and complete the prompt again.
4. The backend verifies a one-time challenge against the registered credential and creates a short-lived demo verification state. If it fails, check the actual response and server logs; don't mark the result as successful on the client.
5. If your goal is to demonstrate a *physical fingerprint sensor*, a website's WebAuthn API is not a fingerprint sensor API. A separate sensor and trusted verification design would be needed; that is outside the scope of the browser prototype.

## Render deployment configuration

### Option A: One Render web service serves API and frontend (simplest)

Build command:
```bash
npm ci && npm run build
```

Start command:
```bash
npm start
```

Set the following **server** environment variables:
```text
NODE_ENV=production
SESSION_SECRET=<long unique random secret>
RP_ID=<your-render-service-hostname-without-https>
ORIGIN=https://<your-render-service-hostname>
FRONTEND_ORIGIN=https://<your-render-service-hostname>
```

The browser frontend automatically uses its own origin for API calls when `VITE_API_URL` is unset. `RP_ID` must match the domain hosting the browser page, **not** a separate API hostname.

### Option B: Separate Render static frontend and API web service

Frontend (static site) build:
```bash
npm ci && npm run build
```

Publish directory: `dist`.

Set the **frontend build-time** environment variable:
```text
VITE_API_URL=https://<your-api-service>.onrender.com
```

Rebuild and redeploy the frontend after setting `VITE_API_URL`. Vite replaces this variable at build time, not at runtime.

On your separate **backend web service**, set:
```text
NODE_ENV=production
SESSION_SECRET=<long unique random secret>
RP_ID=smart-drive-guard-frontend.onrender.com
ORIGIN=https://smart-drive-guard-frontend.onrender.com
FRONTEND_ORIGIN=https://smart-drive-guard-frontend.onrender.com
```

`ORIGIN` is the **exact origin of the website in which WebAuthn runs** (the frontend), not your backend API origin. `RP_ID` is the frontend's hostname without `https://`, slash, or port. If a custom domain is used, update both values appropriately and re-enrol passkeys for the new relying party.

This repository currently uses Express sessions with `SameSite=None; Secure` in production. A cross-site frontend/API arrangement may be blocked by third-party-cookie restrictions. For consistent behavior, prefer a **single same-origin service** or a properly configured same-origin API proxy. The in-memory session store and JSON database are not resilient to restarts or multi-instance deployment. Use a durable session/database design before production.

## Quick browser checks

Open Developer Tools > Network and Console:

- `GET /api/me` should reach the correct API and return JSON. If a login request goes to the frontend's static site or `localhost:3001` from the public site, the `VITE_API_URL` build setting is incorrect.
- Passkey registration options and verification should return successful JSON responses; failures may mean a blocked cookie, an incorrect `RP_ID`/`ORIGIN`, or a mismatch between the credentials and server persistence.
- Model manifests and weight shards should load with HTTP 200 and not return the SPA's `index.html`.
- Clear camera errors can be resolved by granting permissions, closing another app holding the camera, or testing in a supported browser.

## Privacy and security caveats

Only enrol people with informed consent. Face descriptors are biometric information stored unencrypted in browser localStorage; they must not be considered secure or retained after the demonstration. This demo has no liveness assurance, server-verified face result, or driver-bound passkey. The verification outcome is suitable for **on-screen demonstration only** and must not be wired to a vehicle's ignition, locks, brakes, or other safety-critical functions.

## Serial-display limitation

The project has a separate Web Serial / HC-05 demonstration pathway in `src/ble.js`, but browser availability varies. Do not treat serial connection success as proof of identity and do not connect this proof-of-concept to vehicle control.
