const RefreshTokens = require('../models/RefreshTokens');

async function upsertRefreshToken(userId, email, refreshToken) {
  const maxAttempts = 4;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Use replaceOne with upsert to avoid creating multiple docs with partial/null keys
      await RefreshTokens.replaceOne(
        { userId },
        { userId, email, refreshToken, createdAt: new Date() },
        { upsert: true }
      );
      return;
    } catch (err) {
      lastErr = err;
      if (err && err.code === 11000) {
        // Duplicate key: try to clean conflicting documents that don't belong to this user
        console.warn(`E11000 on refresh token upsert (attempt ${attempt}), cleaning conflicts and retrying`);
        try {
          // Remove any documents that have the same refreshToken but a different userId
          await RefreshTokens.deleteMany({ $or: [ { refreshToken, userId: { $ne: userId } }, { email, userId: { $ne: userId } } ] });
        } catch (cleanupErr) {
          console.error('Cleanup error during refresh token upsert recovery', cleanupErr);
        }

        // small jitter before retrying to reduce races
        await new Promise(res => setTimeout(res, 50 + Math.floor(Math.random() * 150)));
        continue;
      }

      // For other errors, rethrow
      throw err;
    }
  }

  // If we exhausted retries, attempt last-ditch safe replace: delete any docs for this userId then insert
  try {
    await RefreshTokens.deleteMany({ userId });
    await RefreshTokens.create({ userId, email, refreshToken });
    return;
  } catch (finalErr) {
    console.error('Final attempt failed for refresh token upsert', finalErr, 'lastErr:', lastErr);
    throw finalErr || lastErr;
  }
}

module.exports = { upsertRefreshToken };
