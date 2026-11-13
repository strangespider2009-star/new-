// HC-05 uses Bluetooth Classic SPP, not BLE GATT.
// Web Serial communicates with the paired serial COM port.

let serialPort = null;
let serialWriter = null;
let disconnectHandler = null;

export async function connectBLE(onDisconnect = () => {}) {
  if (!window.isSecureContext) {
    throw new Error(
      "Serial access requires HTTPS (or localhost)."
    );
  }

  if (!("serial" in navigator)) {
    throw new Error(
      "Web Serial is unavailable. Use Chrome or Edge on a supported desktop computer."
    );
  }

  if (serialPort) {
    throw new Error(
      "A serial device is already connected. Disconnect it first."
    );
  }

  const port = await navigator.serial.requestPort();

  await port.open({
    baudRate: 9600
  });

  if (!port.writable) {
    await port.close();

    throw new Error(
      "The selected serial port is not writable."
    );
  }

  serialPort = port;
  serialWriter = port.writable.getWriter();

  disconnectHandler = event => {
    if (event.port === port) {
      serialWriter = null;
      serialPort = null;
      onDisconnect();
    }
  };

  navigator.serial.addEventListener(
    "disconnect",
    disconnectHandler
  );

  return "HC-05 serial port";
}

export async function sendBLECommand(command) {
  if (!serialPort || !serialWriter) {
    throw new Error(
      "Connect the paired HC-05 serial port first."
    );
  }

  if (!["SUCCESS", "FAIL", "RESET"].includes(command)) {
    throw new Error(
      "Unsupported Arduino command."
    );
  }

  const payload = new TextEncoder().encode(
    command + "\n"
  );

  await serialWriter.write(payload);
}

export async function disconnectBLE() {
  const port = serialPort;
  const writer = serialWriter;

  serialPort = null;
  serialWriter = null;

  if (disconnectHandler) {
    navigator.serial?.removeEventListener(
      "disconnect",
      disconnectHandler
    );

    disconnectHandler = null;
  }

  if (writer) {
    try {
      writer.releaseLock();
    } catch {}
  }

  if (port) {
    try {
      await port.close();
    } catch {}
  }
}
