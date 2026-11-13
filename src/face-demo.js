// Exhibition demo: detects whether a face is present in the camera frame.
// It does NOT identify a person or compare their face with an enrolled identity.
export async function detectFacePresence(videoElement) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access is unavailable. Use HTTPS and allow camera permission.");
  }

  if (!("FaceDetector" in window)) {
    throw new Error("This browser does not support the experimental FaceDetector API. Use the clearly labelled simulated face result for the exhibition demo.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false
  });

  try {
    videoElement.srcObject = stream;
    await videoElement.play();

    const detector = new window.FaceDetector({
      fastMode: true,
      maxDetectedFaces: 1
    });

    // Give the camera a short window to find a face.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const faces = await detector.detect(videoElement);
      if (faces.length > 0) return true;
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    return false;
  } finally {
    stream.getTracks().forEach(track => track.stop());
    videoElement.srcObject = null;
  }
}
