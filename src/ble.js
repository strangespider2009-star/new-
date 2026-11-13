// Web Bluetooth UART bridge for HM-10-compatible BLE modules.
// This is BLE GATT, not Bluetooth Classic SPP. HC-05 is not supported.
const SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const CHARACTERISTIC_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";

let bleDevice = null;
let bleCharacteristic = null;

export async function connectBLE(onDisconnect = () => {}) {
  if (!window.isSecureContext) {
    throw new Error("Bluetooth requires HTTPS (or localhost).");
  }
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth is unavailable. Use a supported browser such as Chrome on Android.");
  }

  bleDevice = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
    optionalServices: [SERVICE_UUID]
  });

  bleDevice.addEventListener("gattserverdisconnected", () => {
    bleCharacteristic = null;
    onDisconnect();
  });

  const server = await bleDevice.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  bleCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

  if (
    !bleCharacteristic.properties.write &&
    !bleCharacteristic.properties.writeWithoutResponse
  ) {
    throw new Error("The BLE UART characteristic is not writable.");
  }

  return bleDevice.name || "BLE UART device";
}

export async function sendBLECommand(command) {
  if (!bleDevice?.gatt?.connected || !bleCharacteristic) {
    throw new Error("Connect to the BLE module before sending a command.");
  }

  if (!["SUCCESS", "FAIL", "RESET"].includes(command)) {
    throw new Error("Unsupported Arduino command.");
  }

  const payload = new TextEncoder().encode(command + "\n");

  if (
    bleCharacteristic.properties.writeWithoutResponse &&
    !bleCharacteristic.properties.write
  ) {
    await bleCharacteristic.writeValueWithoutResponse(payload);
  } else if (typeof bleCharacteristic.writeValueWithResponse === "function") {
    await bleCharacteristic.writeValueWithResponse(payload);
  } else {
    await bleCharacteristic.writeValue(payload);
  }
}

export function disconnectBLE() {
  if (bleDevice?.gatt?.connected) {
    bleDevice.gatt.disconnect();
  }
  bleCharacteristic = null;
  bleDevice = null;
}
