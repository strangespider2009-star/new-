/*
  SMART DRIVER GUARD - BLE UART Arduino firmware
  Hardware: Arduino UNO + HM-10-compatible BLE UART module
  IMPORTANT: HC-05 is Bluetooth Classic and cannot be used by Web Bluetooth.

  BLE module UART:
    BLE TXD -> Arduino D10 (SoftwareSerial RX)
    BLE RXD <- Arduino D11 (SoftwareSerial TX) through a 5V-to-3.3V divider
    BLE GND -> Arduino GND
    BLE VCC -> module breakout's specified supply voltage

  Outputs:
    Green LED anode -> D6 through 220 ohm resistor; cathode -> GND
    Red LED anode   -> D7 through 220 ohm resistor; cathode -> GND
    Passive buzzer + -> D8; buzzer - -> GND

  Expected newline-terminated commands: SUCCESS, FAIL, RESET
  This is an exhibition demonstrator only. Do not connect it to vehicle ignition.
*/

#include <SoftwareSerial.h>

SoftwareSerial BLE(10, 11);

const byte GREEN_LED = 6;
const byte RED_LED = 7;
const byte BUZZER = 8;

const int successNotes[] = {523, 659, 784, 1047};
const int successDurations[] = {180, 180, 180, 400};
const int failNotes[] = {880, 660, 880, 660, 880};
const int failDurations[] = {200, 200, 200, 200, 450};

String inputLine;
String currentStatus = "RESET";

void playMelody(const int notes[], const int durations[], byte count) {
  for (byte i = 0; i < count; i++) {
    tone(BUZZER, notes[i], durations[i]);
    delay(durations[i] + 60);
  }
  noTone(BUZZER);
}

void showSuccess() {
  digitalWrite(GREEN_LED, HIGH);
  digitalWrite(RED_LED, LOW);
  Serial.println("AUTHENTICATION SUCCESS - GREEN LED");
  playMelody(successNotes, successDurations, 4);
}

void showFailure() {
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, HIGH);
  Serial.println("AUTHENTICATION FAILED - RED LED");
  playMelody(failNotes, failDurations, 5);
}

void resetOutputs() {
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, LOW);
  noTone(BUZZER);
  Serial.println("RESET - WAITING FOR AUTHENTICATION");
}

void processCommand(String command) {
  command.trim();
  command.toUpperCase();

  if (command == "SUCCESS") {
    if (currentStatus != "SUCCESS") showSuccess();
    currentStatus = "SUCCESS";
  } else if (command == "FAIL") {
    if (currentStatus != "FAIL") showFailure();
    currentStatus = "FAIL";
  } else if (command == "RESET") {
    currentStatus = "RESET";
    resetOutputs();
  } else {
    Serial.print("UNKNOWN COMMAND: ");
    Serial.println(command);
    currentStatus = "FAIL";
    showFailure();
  }
}

void setup() {
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  resetOutputs();

  Serial.begin(9600);
  BLE.begin(9600);
  inputLine.reserve(24);

  Serial.println("SMART DRIVER GUARD BLE READY");
  Serial.println("Waiting for SUCCESS / FAIL / RESET");
}

void loop() {
  while (BLE.available()) {
    const char incoming = static_cast<char>(BLE.read());

    if (incoming == '\n') {
      if (inputLine.length() > 0) processCommand(inputLine);
      inputLine = "";
    } else if (incoming != '\r') {
      if (inputLine.length() < 24) {
        inputLine += incoming;
      } else {
        inputLine = "";
        currentStatus = "FAIL";
        showFailure();
      }
    }
  }
}
