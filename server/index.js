
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from "@simplewebauthn/server";

// --------------------------------------------------
// INITIAL CONFIGURATION
// --------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === "production";

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ||
  "https://smart-drive-guard-frontend.onrender.com";

const RP_ID = process.env.RP_ID || "localhost";
const ORIGIN = process.env.ORIGIN || "http://localhost:5173";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  (isProduction ? "" : "development-only-change-this-secret");

if (isProduction && !SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be configured in production.");
}

if (isProduction && (!process.env.RP_ID || !process.env.ORIGIN)) {
  throw new Error("RP_ID and ORIGIN must be configured in production.");
}

if (isProduction) {
  app.set("trust proxy", 1);
}

// --------------------------------------------------
// CORS MIDDLEWARE
// --------------------------------------------------

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && origin === FRONTEND_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );

    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    if (origin && origin !== FRONTEND_ORIGIN) {
      return res.sendStatus(403);
    }

    return res.sendStatus(204);
  }

  next();
});

// --------------------------------------------------
// DATABASE AND UPLOAD DIRECTORIES
// --------------------------------------------------

const DATA_DIR = process.env.DATA_DIR || __dirname;

fs.mkdirSync(DATA_DIR, { recursive: true });

const DATA_FILE = path.join(DATA_DIR, "data.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      {
        users: [],
        vehicles: [],
        drivers: [],
        biometrics: [],
        logs: []
      },
      null,
      2
    )
  );
}

const readDB = () => {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
};

const writeDB = (db) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
};

const id = () => crypto.randomUUID();

// --------------------------------------------------
// BODY PARSING
// --------------------------------------------------

app.use(express.json({ limit: "1mb" }));

// --------------------------------------------------
// SESSION CONFIGURATION
// UPDATED: CROSS-ORIGIN SESSION COOKIE
// --------------------------------------------------

app.use(
  session({
    name: "sdg.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

// --------------------------------------------------
// UPLOAD CONFIGURATION
// --------------------------------------------------

app.use("/uploads", express.static(UPLOAD_DIR));

const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "application/pdf"
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only JPG, PNG or PDF files are allowed.")
      );
    }

    cb(null, true);
  }
});

// --------------------------------------------------
// AUTHENTICATION HELPERS
// --------------------------------------------------

function currentUser(req) {
  if (!req.session.userId) {
    return null;
  }

  return (
    readDB().users.find(
      (user) => user.id === req.session.userId
    ) || null
  );
}

function requireAuth(req, res, next) {
  try {
    const user = currentUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Please sign in."
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function publicUser(user) {
  const {
    passwordHash,
    passkeys,
    ...safeUser
  } = user;

  return safeUser;
}

function ownerOnly(req, res, next) {
  if (req.user.role !== "owner") {
    return res.status(403).json({
      error: "Owner permission required."
    });
  }

  next();
}

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: "SMART DRIVE GUARD API"
  });
});

// --------------------------------------------------
// USER REGISTRATION
// --------------------------------------------------

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      role
    } = req.body || {};

    if (
      !name ||
      !email ||
      !password ||
      !["owner", "driver"].includes(role)
    ) {
      return res.status(400).json({
        error: "Enter name, email, password and role."
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        error: "Password must contain at least 8 characters."
      });
    }

    const db = readDB();

    if (
      db.users.some(
        (user) =>
          user.email.toLowerCase() ===
          String(email).toLowerCase()
      )
    ) {
      return res.status(409).json({
        error: "Email already registered."
      });
    }

    const user = {
      id: id(),
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      role,
      passwordHash: await bcrypt.hash(password, 12),
      passkeys: [],
      createdAt: new Date().toISOString()
    };

    db.users.push(user);
    writeDB(db);

    req.session.userId = user.id;

    req.session.save((error) => {
      if (error) {
        console.error("Registration session error:", error);

        return res.status(500).json({
          error: "Account created, but session could not be saved. Please sign in."
        });
      }

      res.status(201).json({
        user: publicUser(user)
      });
    });

  } catch (error) {
    console.error("Registration error:", error);
    next(error);
  }
});

// --------------------------------------------------
// USER LOGIN
// --------------------------------------------------

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const {
      email,
      password
    } = req.body || {};

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    const user = readDB().users.find(
      (u) => u.email === normalizedEmail
    );

    if (
      !user ||
      !(await bcrypt.compare(
        password || "",
        user.passwordHash
      ))
    ) {
      return res.status(401).json({
        error: "Incorrect email or password."
      });
    }

    req.session.userId = user.id;

    req.session.save((error) => {
      if (error) {
        console.error("Login session error:", error);

        return res.status(500).json({
          error: "Could not save login session."
        });
      }

      res.json({
        user: publicUser(user)
      });
    });

  } catch (error) {
    console.error("Login error:", error);
    next(error);
  }
});

// --------------------------------------------------
// LOGOUT
// UPDATED: MATCH COOKIE SETTINGS
// --------------------------------------------------

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error);

      return res.status(500).json({
        error: "Could not log out."
      });
    }

    res.clearCookie("sdg.sid", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax"
    });

    res.json({ ok: true });
  });
});

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------

app.get("/api/me", (req, res) => {
  const user = currentUser(req);

  res.json({
    user: user ? publicUser(user) : null
  });
});

// --------------------------------------------------
// PASSKEY REGISTRATION OPTIONS
// --------------------------------------------------

app.post(
  "/api/passkey/register-options",
  requireAuth,
  async (req, res) => {
    try {
      const options = await generateRegistrationOptions({
        rpName: "SMART DRIVE GUARD",
        rpID: RP_ID,
        userName: req.user.email,
        userDisplayName: req.user.name,
        userID: new Uint8Array(Buffer.from(req.user.id)),
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required"
        },
        excludeCredentials: (
          req.user.passkeys || []
        ).map((p) => ({
          id: p.id,
          transports: p.transports
        }))
      });

      req.session.regChallenge = options.challenge;

      res.json(options);

    } catch (error) {
      console.error("Passkey options error:", error);

      res.status(500).json({
        error: "Could not generate passkey options."
      });
    }
  }
);

// --------------------------------------------------
// PASSKEY REGISTRATION VERIFICATION
// --------------------------------------------------

app.post(
  "/api/passkey/register-verify",
  requireAuth,
  async (req, res) => {
    try {
      const verification = await verifyRegistrationResponse({
        response: req.body,
        expectedChallenge: req.session.regChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true
      });

      if (
        !verification.verified ||
        !verification.registrationInfo
      ) {
        return res.status(400).json({
          error: "Passkey registration was not verified."
        });
      }

      const info = verification.registrationInfo;
      const db = readDB();

      const user = db.users.find(
        (u) => u.id === req.user.id
      );

      if (!user) {
        return res.status(404).json({
          error: "User not found."
        });
      }

      user.passkeys ||= [];

      user.passkeys.push({
        id: info.credential.id,
        publicKey: Buffer.from(
          info.credential.publicKey
        ).toString("base64"),
        counter: info.credential.counter,
        transports: req.body.response?.transports || []
      });

      writeDB(db);

      delete req.session.regChallenge;

      res.json({ verified: true });

    } catch (error) {
      console.error("Passkey verification error:", error);

      res.status(400).json({
        error: error.message || "Could not register passkey."
      });
    }
  }
);

// --------------------------------------------------
// PASSKEY LOGIN OPTIONS
// --------------------------------------------------

app.post("/api/passkey/auth-options", async (req, res) => {
  try {
    const email = String(
      req.body.email || ""
    ).trim().toLowerCase();

    const user = readDB().users.find(
      (u) => u.email === email
    );

    if (!user || !(user.passkeys || []).length) {
      return res.status(404).json({
        error: "No passkey registered for this account. Sign in with password and register one first."
      });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: user.passkeys.map((p) => ({
        id: p.id,
        transports: p.transports
      })),
      userVerification: "required"
    });

    req.session.authChallenge = options.challenge;
    req.session.passkeyUserId = user.id;

    res.json(options);

  } catch (error) {
    console.error("Passkey login options error:", error);

    res.status(500).json({
      error: "Could not generate authentication options."
    });
  }
});

// --------------------------------------------------
// PASSKEY LOGIN VERIFICATION
// --------------------------------------------------

app.post("/api/passkey/auth-verify", async (req, res) => {
  try {
    const db = readDB();

    const user = db.users.find(
      (u) => u.id === req.session.passkeyUserId
    );

    if (!user) {
      return res.status(401).json({
        error: "Passkey account not found."
      });
    }

    const credential = (user.passkeys || []).find(
      (p) => p.id === req.body.id
    );

    if (!credential) {
      return res.status(401).json({
        error: "Unknown passkey."
      });
    }

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: req.session.authChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.id,
        publicKey: new Uint8Array(
          Buffer.from(credential.publicKey, "base64")
        ),
        counter: credential.counter,
        transports: credential.transports
      },
      requireUserVerification: true
    });

    if (!verification.verified) {
      return res.status(401).json({
        error: "Passkey verification failed."
      });
    }

    credential.counter =
      verification.authenticationInfo.newCounter;

    writeDB(db);

    req.session.userId = user.id;

    delete req.session.authChallenge;
    delete req.session.passkeyUserId;

    req.session.save((error) => {
      if (error) {
        console.error("Passkey session error:", error);

        return res.status(500).json({
          error: "Could not save passkey login session."
        });
      }

      res.json({
        user: publicUser(user),
        verified: true
      });
    });

  } catch (error) {
    console.error("Passkey login verification error:", error);

    res.status(400).json({
      error: error.message || "Passkey verification failed."
    });
  }
});

// --------------------------------------------------
// DEVICE BIOMETRIC STEP
// --------------------------------------------------

app.post(
  "/api/demo/device-auth-options",
  requireAuth,
  async (req, res) => {
    try {
      const passkeys = req.user.passkeys || [];

      if (!passkeys.length) {
        return res.status(400).json({
          error: "No passkey is registered. Use Register passkey first."
        });
      }

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials: passkeys.map((p) => ({
          id: p.id,
          transports: p.transports
        })),
        userVerification: "required"
      });

      req.session.demoDeviceChallenge = options.challenge;
      req.session.demoDeviceUserId = req.user.id;

      res.json(options);

    } catch (error) {
      console.error("Device auth options error:", error);

      res.status(500).json({
        error: error.message || "Could not start device verification."
      });
    }
  }
);

// --------------------------------------------------
// DEVICE BIOMETRIC VERIFICATION
// --------------------------------------------------

app.post(
  "/api/demo/device-auth-verify",
  requireAuth,
  async (req, res) => {
    try {
      if (
        !req.session.demoDeviceChallenge ||
        req.session.demoDeviceUserId !== req.user.id
      ) {
        return res.status(400).json({
          error: "Device verification expired. Start the verification again."
        });
      }

      const db = readDB();

      const user = db.users.find(
        (u) => u.id === req.user.id
      );

      const credential = (user?.passkeys || []).find(
        (p) => p.id === req.body.id
      );

      if (!credential) {
        return res.status(401).json({
          error: "Unknown device passkey."
        });
      }

      const verification = await verifyAuthenticationResponse({
        response: req.body,
        expectedChallenge: req.session.demoDeviceChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(
            Buffer.from(credential.publicKey, "base64")
          ),
          counter: credential.counter,
          transports: credential.transports
        },
        requireUserVerification: true
      });

      if (!verification.verified) {
        return res.status(401).json({
          error: "Device verification failed."
        });
      }

      credential.counter =
        verification.authenticationInfo.newCounter;

      writeDB(db);

      req.session.demoDeviceVerifiedAt = Date.now();
      req.session.demoDeviceVerifiedUserId = req.user.id;

      delete req.session.demoDeviceChallenge;
      delete req.session.demoDeviceUserId;

      req.session.save((error) => {
        if (error) {
          console.error("Device session error:", error);

          return res.status(500).json({
            error: "Could not save device verification."
          });
        }

        res.json({ verified: true });
      });

    } catch (error) {
      console.error("Device verification error:", error);

      res.status(400).json({
        error: error.message || "Device verification failed."
      });
    }
  }
);

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

app.get("/api/dashboard", requireAuth, (req, res) => {
  const db = readDB();

  const vehicles = db.vehicles.filter(
    (v) => v.ownerId === req.user.id
  );

  const drivers = db.drivers.filter(
    (d) =>
      d.ownerId === req.user.id ||
      d.userId === req.user.id
  );

  const biometrics =
    req.user.role === "owner"
      ? db.biometrics.filter(
          (b) => b.ownerId === req.user.id
        )
      : [];

  const logs = db.logs
    .filter(
      (l) =>
        l.ownerId === req.user.id ||
        l.userId === req.user.id
    )
    .slice(-20)
    .reverse();

  res.json({
    vehicles,
    drivers,
    biometrics,
    logs
  });
});

// --------------------------------------------------
// VEHICLE MANAGEMENT
// --------------------------------------------------

app.post(
  "/api/vehicles",
  requireAuth,
  ownerOnly,
  (req, res) => {
    const {
      vehicleName,
      registration
    } = req.body || {};

    if (!vehicleName) {
      return res.status(400).json({
        error: "Vehicle name is required."
      });
    }

    const db = readDB();

    const vehicle = {
      id: id(),
      vehicleName,
      registration: registration || "DEMO-REG",
      ownerId: req.user.id,
      bluetoothName: "HC-05",
      createdAt: new Date().toISOString()
    };

    db.vehicles.push(vehicle);
    writeDB(db);

    res.json({ vehicle });
  }
);

// --------------------------------------------------
// DRIVER MANAGEMENT
// --------------------------------------------------

app.post(
  "/api/drivers",
  requireAuth,
  ownerOnly,
  upload.single("licence"),
  (req, res) => {
    const {
      name,
      email,
      phone,
      licenceNumber,
      expiryDate,
      relationship,
      biometricProfileId,
      vehicleId,
      kind
    } = req.body;

    if (
      !name ||
      !licenceNumber ||
      !expiryDate ||
      !vehicleId
    ) {
      return res.status(400).json({
        error: "Complete the required driver and licence fields."
      });
    }

    const db = readDB();

    const vehicle = db.vehicles.find(
      (v) =>
        v.id === vehicleId &&
        v.ownerId === req.user.id
    );

    if (!vehicle) {
      return res.status(400).json({
        error: "Select one of your vehicles."
      });
    }

    const profile = db.biometrics.find(
      (b) =>
        b.id === biometricProfileId &&
        b.ownerId === req.user.id
    );

    const driver = {
      id: id(),
      ownerId: req.user.id,
      vehicleId,
      name,
      email: email || "",
      phone: phone || "",
      licenceNumber,
      expiryDate,
      relationship: relationship || "",
      kind: kind === "family" ? "family" : "driver",
      licenceFile: req.file
        ? `/uploads/${req.file.filename}`
        : null,
      biometricProfileId: profile?.id || null,
      ownerApproved: false,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    db.drivers.push(driver);
    writeDB(db);

    res.json({ driver });
  }
);

// --------------------------------------------------
// DRIVER APPROVAL
// --------------------------------------------------

app.patch(
  "/api/drivers/:id/approval",
  requireAuth,
  ownerOnly,
  (req, res) => {
    const db = readDB();

    const driver = db.drivers.find(
      (d) =>
        d.id === req.params.id &&
        d.ownerId === req.user.id
    );

    if (!driver) {
      return res.status(404).json({
        error: "Driver not found."
      });
    }

    driver.ownerApproved = Boolean(req.body.approved);

    driver.status = driver.ownerApproved
      ? "approved"
      : "rejected";

    writeDB(db);

    res.json({ driver });
  }
);

// --------------------------------------------------
// DELETE DRIVER
// --------------------------------------------------

app.delete(
  "/api/drivers/:id",
  requireAuth,
  ownerOnly,
  (req, res) => {
    const db = readDB();

    db.drivers = db.drivers.filter(
      (d) =>
        !(
          d.id === req.params.id &&
          d.ownerId === req.user.id
        )
    );

    writeDB(db);

    res.json({ ok: true });
  }
);

// --------------------------------------------------
// BIOMETRIC DEMO MANAGEMENT
// --------------------------------------------------

app.post(
  "/api/biometrics",
  requireAuth,
  ownerOnly,
  (req, res) => {
    const {
      profileName,
      fingerprintRegistered,
      faceRegistered,
      simulatedMatch
    } = req.body || {};

    if (!profileName) {
      return res.status(400).json({
        error: "Profile name is required."
      });
    }

    const db = readDB();

    const profile = {
      id: id(),
      ownerId: req.user.id,
      profileName,
      fingerprintRegistered: !!fingerprintRegistered,
      faceRegistered: !!faceRegistered,
      simulatedMatch: !!simulatedMatch,
      status: "active",
      createdAt: new Date().toISOString()
    };

    db.biometrics.push(profile);
    writeDB(db);

    res.json({ profile });
  }
);

// --------------------------------------------------
// UPDATE BIOMETRIC PROFILE
// --------------------------------------------------

app.patch(
  "/api/biometrics/:id",
  requireAuth,
  ownerOnly,
  (req, res) => {
    const db = readDB();

    const profile = db.biometrics.find(
      (p) =>
        p.id === req.params.id &&
        p.ownerId === req.user.id
    );

    if (!profile) {
      return res.status(404).json({
        error: "Profile not found."
      });
    }

    for (const key of [
      "profileName",
      "fingerprintRegistered",
      "faceRegistered",
      "simulatedMatch",
      "status"
    ]) {
      if (key in req.body) {
        profile[key] = req.body[key];
      }
    }

    writeDB(db);

    res.json({ profile });
  }
);

// --------------------------------------------------
// DELETE BIOMETRIC PROFILE
// --------------------------------------------------

app.delete(
  "/api/biometrics/:id",
  requireAuth,
  ownerOnly,
  (req, res) => {
    const db = readDB();

    db.biometrics = db.biometrics.filter(
      (p) =>
        !(
          p.id === req.params.id &&
          p.ownerId === req.user.id
        )
    );

    writeDB(db);

    res.json({ ok: true });
  }
);

// --------------------------------------------------
// DEMONSTRATION ACCESS CHECK
// --------------------------------------------------

app.post(
  "/api/access/check",
  requireAuth,
  async (req, res) => {
    const {
      driverId,
      vehicleId,
      facePassed
    } = req.body || {};

    const db = readDB();

    const driver = db.drivers.find(
      (d) =>
        d.id === driverId &&
        d.ownerId === req.user.id
    );

    const vehicle = db.vehicles.find(
      (v) =>
        v.id === vehicleId &&
        v.ownerId === req.user.id
    );

    const deviceVerificationPassed = Boolean(
      req.session.demoDeviceVerifiedAt &&
      req.session.demoDeviceVerifiedUserId === req.user.id &&
      Date.now() - req.session.demoDeviceVerifiedAt <= 120000
    );

    delete req.session.demoDeviceVerifiedAt;
    delete req.session.demoDeviceVerifiedUserId;

    const faceResult = facePassed === true;

    // Face matching runs locally in the browser for this educational demo.
    // A client-supplied boolean is not cryptographic proof and must never
    // be used as the sole authorization check for a real vehicle.
    const biometricResult = faceResult && deviceVerificationPassed;

    const licenceResult =
      !!driver &&
      new Date(driver.expiryDate + "T23:59:59") >= new Date();

    const ownerApproval = !!driver?.ownerApproved;

    const granted =
      !!vehicle &&
      biometricResult &&
      licenceResult &&
      ownerApproval;

    const log = {
      id: id(),
      ownerId: req.user.id,
      driverId,
      vehicleId,
      faceResult,
      deviceVerificationPassed,
      biometricResult,
      licenceResult,
      ownerApproval,
      accessGranted: granted,
      createdAt: new Date().toISOString()
    };

    db.logs.push(log);
    writeDB(db);

    req.session.save((error) => {
      if (error) {
        console.error("Access check session error:", error);

        return res.status(500).json({
          error: "Could not save access check session."
        });
      }

      res.json({
        faceResult,
        deviceVerificationPassed,
        biometricResult,
        licenceResult,
        ownerApproval,
        accessGranted: granted,
        biometricChecks: {
          faceResult,
          deviceVerificationPassed
        },
        logic: [
          biometricResult,
          licenceResult,
          ownerApproval
        ]
      });
    });
  }
);

// --------------------------------------------------
// API NOT FOUND HANDLER
// --------------------------------------------------

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API endpoint not found."
  });
});

// --------------------------------------------------
// SERVE FRONTEND BUILD IF PRESENT
// --------------------------------------------------

const DIST_DIR = path.join(__dirname, "..", "dist");

if (fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  app.use(express.static(DIST_DIR));

  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

// --------------------------------------------------
// GLOBAL ERROR HANDLER
// --------------------------------------------------

app.use((err, _req, res, _next) => {
  console.error("Server error:", err);

  if (res.headersSent) {
    return;
  }

  res.status(err.status || 500).json({
    error: err.message || "Internal server error."
  });
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `SMART DRIVE GUARD API listening on port ${PORT}`
  );

  console.log(
    `Allowed frontend origin: ${FRONTEND_ORIGIN}`
  );
});
