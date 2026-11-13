# Face Recognition + HC-05 Setup

This branch adds a local-browser face matching demonstration and replaces the old BLE GATT transport with Web Serial for an HC-05 Bluetooth Classic serial connection.

## Important limitations

- This is an educational prototype, not a production identity-verification system.
- Face descriptors are biometric data. Enrollment requires informed consent.
- Templates are stored in the current browser profile's localStorage and are not uploaded to the backend.
- Anyone with access to that browser profile or an injected script may be able to read them.
- The face match result is sent by the browser as a boolean. A user controlling the browser can tamper with it.
- Do not use this for real vehicle ignition, locks, or safety-critical access decisions.
- WebAuthn verifies the device's configured user verification (biometric or PIN). The website does not receive a fingerprint or face scan.
- HC-05 is Bluetooth Classic SPP, not BLE.
- This frontend uses Web Serial and requires a supported desktop browser such as Chrome or Edge.
- The Arduino sketch is intended to control an onboard LED for demonstration only.

## 1. Install dependencies

Run in the repository root:

```powershell
npm install
