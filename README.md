# SMART DRIVE GUARD

Responsive educational prototype for a vehicle-access verification project.

## Features
- Email/password account registration and login (owner or driver role)
- Passkey/WebAuthn registration and login using the device's supported user verification (biometric, PIN, or security key)
- Owner dashboard and vehicle registration
- Add drivers and family members; upload sample licence documents
- Owner approval/rejection
- Three-action dummy biometric management: create, edit/enable/disable, delete
- Demonstration access decision: biometric result AND licence expiry check AND owner approval
- Access history
- Responsive layout for laptop and mobile browsers

## Important limitations
- This is an educational demonstration, not a production vehicle security system.
- A browser passkey confirms that the device's configured authenticator approved the user. It does not identify the human by legal name, prove that the authenticator belongs to a particular licence holder, or provide raw fingerprint/face data to the website.
- Dummy biometric profiles are simulated database flags. They are not government biometric records and must be labelled as simulated.
- Licence uploads are stored as demonstration documents. The app does not validate a licence with a government authority.
- HC-05 uses Bluetooth Classic SPP. Normal browser Web Bluetooth does not support HC-05. This repository therefore does not transmit commands to HC-05 or control a real ignition. Use the on-screen result for the demo; for hardware integration use a separate Android Bluetooth bridge or change to compatible BLE hardware.
- Do not connect this prototype to a real vehicle.

## Requirements
- Node.js 20 or newer recommended
- npm
- Chrome/Edge/Firefox current version

## Run locally
```bash
npm install
cp .env.example .env
```
On Windows PowerShell:
```powershell
Copy-Item .env.example .env
```

Then:
```bash
npm run dev
```
Open http://localhost:5173

The backend runs on http://localhost:3001. Vite proxies `/api` and `/uploads`.

## First use
1. Register an account with role `owner`.
2. Register a passkey from the browser/device after signing in (passkey registration UI can be added through the account screen; see note below).
3. Add a vehicle.
4. Create a dummy biometric profile.
5. Add a driver or family member and associate the profile.
6. Approve the driver.
7. Open the verification demonstration, select vehicle and driver, tick the simulated local biometric test, and run the check.

### Passkey setup endpoint
The backend includes WebAuthn registration endpoints. For a complete UI flow, call:
- `POST /api/passkey/register-options` (authenticated)
- `startRegistration({ optionsJSON })` in the browser
- `POST /api/passkey/register-verify` with the returned credential

Passkey sign-in flow:
- `POST /api/passkey/auth-options` with `{ "email": "..." }`
- `startAuthentication({ optionsJSON })`
- `POST /api/passkey/auth-verify` with the credential response

The default demo UI provides password login and passkey sign-in. To register a passkey, add a button after login that runs the registration flow above. This avoids silently enrolling a device without the user's consent.

## Production deployment checklist
Before public deployment:
- Replace the development session secret with a long random secret.
- Use HTTPS and set secure session cookies.
- Configure `RP_ID` to your real domain and `ORIGIN` to your exact HTTPS origin.
- Replace the JSON file database with Firestore/PostgreSQL and use a persistent private file store.
- Add CSRF protection, rate limiting, account recovery, audit logging and strict role-based authorization.
- Add private upload authorization; do not expose licence documents as public static files.
- Add server-side licence verification only through an authorised source.
- Review privacy and data-protection requirements.

## GitHub
Create a new empty repository on GitHub, then:
```bash
git init
git add .
git commit -m "Initial SMART DRIVE GUARD web prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/smart-drive-guard.git
git push -u origin main
```


## Exhibition biometric + BLE demo

This branch adds a **demonstration** verification screen and BLE UART output.

### Verification flow
1. Register a passkey from the signed-in account using **Register passkey**.
2. Create a dummy biometric profile with face and fingerprint enrollment flags enabled.
3. Add a driver, associate that profile, and approve the driver.
4. Open **Verify Biometrics**.
5. Connect to an HM-10-compatible BLE UART module from a supported Web Bluetooth browser.
6. Run the camera face-presence demonstration (or use the clearly labelled simulation buttons if the browser lacks FaceDetector).
7. Complete **Verify with device**. WebAuthn may use fingerprint, face recognition, or device PIN depending on the authenticator. The website does not learn which modality was used and never receives biometric data.
8. Select the vehicle and driver, then choose **Evaluate & send to Arduino**.

The backend requires a recent, server-verified WebAuthn assertion for the device-verification step. That one-time verification expires after two minutes and is consumed by the next access check. The face-presence result is a client-side exhibition signal and is not identity matching.

### BLE hardware
- Use an **HM-10-compatible BLE UART module** with service UUID `FFE0` and writable characteristic UUID `FFE1` (full 128-bit UUIDs are in `src/ble.js`).
- **HC-05 is not compatible with Web Bluetooth** because it uses Bluetooth Classic SPP. Do not try to pair an HC-05 from this browser flow.
- The module must expose a writable UART characteristic. HM-10 clones vary; verify the UUIDs and write properties for your exact board.
- Open `firmware/SmartDriverGuardBLE/SmartDriverGuardBLE.ino` in Arduino IDE and upload it to Arduino UNO.
- BLE TXD -> UNO D10; BLE RXD <- UNO D11 through a 5V-to-3.3V divider; common GND; power the module according to its breakout-board specification.
- Green LED -> D6 through 220 ohm resistor; red LED -> D7 through 220 ohm resistor; passive buzzer -> D8.
- The website sends newline-terminated `SUCCESS`, `FAIL`, or `RESET` commands.

### Browser requirements
Web Bluetooth requires HTTPS (or localhost), a supported browser, and a user gesture to open the device chooser. Chrome on Android is a typical target. iOS Safari does not currently provide the same Web Bluetooth support. Camera access also requires HTTPS (or localhost). The experimental FaceDetector API is not available in every browser, so the screen offers an explicitly simulated face result as a fallback.

### Demonstration limitations
- Camera face presence is not facial identity recognition.
- WebAuthn confirms device user verification but may use fingerprint, face, or PIN; the website cannot force or identify a fingerprint-only modality.
- Dummy biometric profile fields are enrollment flags, not biometric templates.
- This is an educational exhibition prototype. Do not connect it to vehicle ignition, steering, braking, or other safety-critical systems.
