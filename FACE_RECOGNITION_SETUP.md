# Face recognition + HC-05 setup

This branch adds a **local-browser face matching demonstration** and replaces the old BLE GATT transport with Web Serial for an HC-05 Bluetooth Classic serial connection.

## Important limitations

- This is an educational prototype. It is not a production identity-verification system.
- Face descriptors are biometric data. Enrollment requires the person's informed consent. Templates are stored in the current browser profile's localStorage and are not uploaded to the backend. Anyone with access to that browser profile or an injected script may be able to read them.
- The face match result is sent by the browser as a boolean. A user controlling the browser can tamper with it. Do not use this for real vehicle ignition, locks, or any safety-critical access decision.
- WebAuthn verifies the device's configured user verification (biometric or PIN); the website does not receive a fingerprint or face scan.
- HC-05 is Bluetooth Classic SPP, not BLE. This frontend uses Web Serial and therefore requires a supported desktop browser (Chrome/Edge) and a paired serial COM port. It is not the mobile-browser Bluetooth path.
- The Arduino sketch is intended to control an onboard LED for demonstration only.

## 1. Install dependencies

Run in the repository root:

\`\`\`powershell
npm install
\`\`\`

This installs the face model package and refreshes package-lock.json. Keep the refreshed package-lock.json in your commit.

## 2. Build and copy the model files

The \`prebuild\` npm lifecycle script copies the package's pretrained models from \`node_modules/@vladmandic/face-api/model\` into \`public/models\`.

\`\`\`powershell
npm run build
\`\`\`

If the script reports that models are missing, rerun \`npm install\` and check that \`node_modules/@vladmandic/face-api/model\` exists.

## 3. Run the frontend

\`\`\`powershell
npm run dev
\`\`\`

Use a supported browser. Camera access requires HTTPS or localhost. For Web Serial, use Chrome or Edge on Windows.

## 4. Enrol and verify

1. Sign in to Smart Drive Guard.
2. Register a passkey once using the Register passkey control.
3. Add a vehicle and a driver. Ensure the driver has a valid licence expiry date and owner approval.
4. Open Verify Biometrics and select the driver.
5. Ask the person for consent, click Start camera, and position one face clearly in good lighting.
6. Click Enrol selected driver's face. Five samples are captured and averaged into a local descriptor. The camera is stopped after enrollment.
7. Click Start camera again, then Verify face. Three samples are compared with the selected driver's enrolled template.
8. Click Verify with device and complete the WebAuthn prompt.
9. Complete the access evaluation. The server checks the face result, device verification, licence validity and owner approval.

A face template is local to this browser profile. If you switch browser, computer or profile, enrol that driver again. Use Delete enrolment to remove the stored template.

## 5. Pair and connect HC-05

1. Power the Arduino/HC-05 demonstration circuit.
2. Pair HC-05 in Windows Bluetooth settings.
3. Open Device Manager and identify the paired outgoing COM port.
4. Open the HTTPS deployment in Chrome or Edge.
5. On Verify Biometrics, click Connect HC-05 and select the paired COM port in the browser prompt.
6. Evaluate the demonstration. The frontend sends \`SUCCESS\` or \`FAIL\`; Reset sends \`RESET\`.

HC-05 TXD connects to Arduino D10 (SoftwareSerial RX). Arduino D11 (SoftwareSerial TX) must pass through a suitable voltage divider/level shifter before HC-05 RXD. Connect GND to GND. Only power the breakout board from 5V if its board documentation permits it.

## 6. Render

- Frontend build command: \`npm install && npm run build\`
- Frontend publish directory: \`dist\`
- Keep \`VITE_API_URL\` set to the existing backend URL.
- Redeploy the frontend after merging this branch.
- Backend code changed too, so deploy the backend service after merging.
- Ensure model files are generated during the build; the prebuild script copies them before Vite builds.

## 7. Test both outcomes

- Enrol person A, verify person A, and check the face step reports MATCH.
- Try a different consenting tester who is not enrolled for that driver; the step should report NO MATCH.
- Test passkey cancellation, expired licence, unapproved driver, missing template, camera denial, and disconnected HC-05.
- Confirm Arduino receives the expected command and only the onboard LED changes.
- Tune the demonstration threshold only with a balanced set of genuine and non-matching test captures. Do not describe this as secure liveness detection or production face authentication.
