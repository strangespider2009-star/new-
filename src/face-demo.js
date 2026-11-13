import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "/models";

const STORAGE_PREFIX =
  "smart-drive-guard-face-v1:";

const SAMPLE_COUNT = 5;
const VERIFY_SAMPLE_COUNT = 3;

// Educational demonstration threshold only.
// This is not a production-security threshold.
const DEMO_MATCH_THRESHOLD = 0.5;

let modelsPromise = null;

export async function loadFaceModels() {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(
        MODEL_URL
      ),

      faceapi.nets.faceLandmark68Net.loadFromUri(
        MODEL_URL
      ),

      faceapi.nets.faceRecognitionNet.loadFromUri(
        MODEL_URL
      )
    ]).catch(error => {
      modelsPromise = null;

      throw new Error(
        "Could not load face-recognition models. Check that /models contains the model manifests and weight files. " +
        error.message
      );
    });
  }

  await modelsPromise;
}

export async function startFaceCamera(videoElement) {
  if (
    !window.isSecureContext ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    throw new Error(
      "Camera access requires HTTPS (or localhost) and a supported browser."
    );
  }

  if (!videoElement) {
    throw new Error(
      "Camera preview element is unavailable."
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 640 },
      height: { ideal: 480 }
    },
    audio: false
  });

  try {
    videoElement.srcObject = stream;

    await videoElement.play();

    await loadFaceModels();

    return stream;
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());

    videoElement.srcObject = null;

    throw error;
  }
}

export function stopFaceCamera(videoElement) {
  const stream = videoElement?.srcObject;

  if (stream?.getTracks) {
    stream.getTracks().forEach(track => track.stop());
  }

  if (videoElement) {
    videoElement.srcObject = null;
  }
}

async function captureDescriptor(videoElement) {
  if (
    !videoElement ||
    !videoElement.srcObject ||
    videoElement.readyState < 2
  ) {
    throw new Error(
      "Camera is not ready. Start the camera and wait for the preview."
    );
  }

  const detection = await faceapi
    .detectSingleFace(
      videoElement,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.5
      })
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    throw new Error(
      "No clear face was detected. Improve lighting, face the camera and try again."
    );
  }

  return Array.from(detection.descriptor);
}

function averageDescriptors(descriptors) {
  if (!descriptors.length) {
    throw new Error(
      "No face samples were captured."
    );
  }

  const length = descriptors[0].length;

  const average = new Array(length).fill(0);

  for (const descriptor of descriptors) {
    if (descriptor.length !== length) {
      throw new Error(
        "Face descriptor format mismatch."
      );
    }

    for (let i = 0; i < length; i += 1) {
      average[i] += descriptor[i] / descriptors.length;
    }
  }

  return average;
}

function storageKey(driverId) {
  return (
    STORAGE_PREFIX +
    encodeURIComponent(String(driverId))
  );
}

export function hasFaceTemplate(driverId) {
  if (!driverId) return false;

  try {
    return Boolean(
      localStorage.getItem(storageKey(driverId))
    );
  } catch {
    return false;
  }
}

export async function enrollFace(videoElement, driverId) {
  if (!driverId) {
    throw new Error(
      "Select a driver before enrolling a face."
    );
  }

  await loadFaceModels();

  const samples = [];

  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    samples.push(
      await captureDescriptor(videoElement)
    );

    if (i < SAMPLE_COUNT - 1) {
      await new Promise(resolve =>
        setTimeout(resolve, 450)
      );
    }
  }

  const template = {
    version: 1,
    driverId: String(driverId),
    descriptor: averageDescriptors(samples),
    enrolledAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(
      storageKey(driverId),
      JSON.stringify(template)
    );
  } catch {
    throw new Error(
      "Could not save the local face template. Check browser storage permissions."
    );
  }

  return {
    enrolled: true,
    sampleCount: samples.length
  };
}

export async function recognizeFace(videoElement, driverId) {
  if (!driverId) {
    throw new Error(
      "Select a driver before face verification."
    );
  }

  await loadFaceModels();

  let template;

  try {
    template = JSON.parse(
      localStorage.getItem(storageKey(driverId)) || "null"
    );
  } catch {
    throw new Error(
      "The local face template is unreadable. Enrol the face again."
    );
  }

  if (
    !template ||
    template.version !== 1 ||
    !Array.isArray(template.descriptor)
  ) {
    throw new Error(
      "No valid face template is enrolled for this driver in this browser."
    );
  }

  const samples = [];

  for (let i = 0; i < VERIFY_SAMPLE_COUNT; i += 1) {
    samples.push(
      await captureDescriptor(videoElement)
    );

    if (i < VERIFY_SAMPLE_COUNT - 1) {
      await new Promise(resolve =>
        setTimeout(resolve, 350)
      );
    }
  }

  const current = averageDescriptors(samples);

  const distance = faceapi.euclideanDistance(
    current,
    template.descriptor
  );

  return {
    matched:
      Number.isFinite(distance) &&
      distance <= DEMO_MATCH_THRESHOLD,

    distance: Number.isFinite(distance)
      ? Number(distance.toFixed(4))
      : null,

    threshold: DEMO_MATCH_THRESHOLD
  };
}

export function deleteFaceTemplate(driverId) {
  if (!driverId) return;

  try {
    localStorage.removeItem(
      storageKey(driverId)
    );
  } catch {
    throw new Error(
      "Could not delete the local face template."
    );
  }
}
