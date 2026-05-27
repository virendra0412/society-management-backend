const Joi = require("joi");

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "production", "test").default("development"),
  PORT: Joi.number().default(5000),

  MONGODB_URI: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default("7d"),

  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000),
  RATE_LIMIT_MAX: Joi.number().default(100),
  AUTH_RATE_LIMIT_MAX: Joi.number().default(10),

  ALLOWED_ORIGINS: Joi.string().default("http://localhost:3000"),
  BCRYPT_SALT_ROUNDS: Joi.number().default(12),
  ESCALATION_THRESHOLD_HOURS: Joi.number().default(72),

  // ── Cloudinary (optional — uploads disabled if not set) ──────────────────
  // Create a free account at https://cloudinary.com → Dashboard → API Keys
  // Leave blank to run the app without image upload support
  CLOUDINARY_CLOUD_NAME: Joi.string().optional().default(""),
  CLOUDINARY_API_KEY:    Joi.string().optional().default(""),
  CLOUDINARY_API_SECRET: Joi.string().optional().default(""),

  // ── Firebase (optional — push notifications disabled if not set) ──────────
  // Firebase Console → Project Settings → Service Accounts → Generate new private key
  FIREBASE_PROJECT_ID:   Joi.string().optional().default(""),
  FIREBASE_CLIENT_EMAIL: Joi.string().optional().default(""),
  // In .env wrap the key in double quotes: FIREBASE_PRIVATE_KEY="-----BEGIN..."
  FIREBASE_PRIVATE_KEY:  Joi.string().optional().default(""),
}).unknown(true);

const { error, value: validatedEnv } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
}

module.exports = {
  env: validatedEnv.NODE_ENV,
  port: validatedEnv.PORT,
  mongoUri: validatedEnv.MONGODB_URI,

  jwt: {
    accessSecret: validatedEnv.JWT_ACCESS_SECRET,
    refreshSecret: validatedEnv.JWT_REFRESH_SECRET,
    accessExpiresIn: validatedEnv.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: validatedEnv.JWT_REFRESH_EXPIRES_IN,
  },

  rateLimit: {
    windowMs: validatedEnv.RATE_LIMIT_WINDOW_MS,
    max: validatedEnv.RATE_LIMIT_MAX,
    authMax: validatedEnv.AUTH_RATE_LIMIT_MAX,
  },

  allowedOrigins: validatedEnv.ALLOWED_ORIGINS.split(",").map((o) => o.trim()),
  bcryptSaltRounds: validatedEnv.BCRYPT_SALT_ROUNDS,
  escalationThresholdHours: validatedEnv.ESCALATION_THRESHOLD_HOURS,

  // ── NEW ──
  cloudinaryConfig: {
    cloudName: validatedEnv.CLOUDINARY_CLOUD_NAME,
    apiKey:    validatedEnv.CLOUDINARY_API_KEY,
    apiSecret: validatedEnv.CLOUDINARY_API_SECRET,
  },

  firebaseConfig: {
    projectId:   validatedEnv.FIREBASE_PROJECT_ID,
    clientEmail: validatedEnv.FIREBASE_CLIENT_EMAIL,
    privateKey:  validatedEnv.FIREBASE_PRIVATE_KEY,
  },
};
