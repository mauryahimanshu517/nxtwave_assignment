const bcrypt = require('bcryptjs');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const userRepo = require('../../repositories/userRepository');
const orgRepo = require('../../repositories/organizationRepository');
const refreshRepo = require('../../repositories/refreshTokenRepository');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../../utils/jwt');
const parseDuration = require('../../utils/parseDuration');

const BCRYPT_ROUNDS = 10;

const accessPayload = (user) => ({
  sub: user.id,
  organizationId: user.organizationId,
  role: user.role,
  email: user.email,
});

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  organizationId: user.organizationId,
  createdAt: user.createdAt,
});

async function issueTokens(user) {
  const accessToken = signAccessToken(accessPayload(user));
  const refreshToken = signRefreshToken({ sub: user.id });
  await refreshRepo.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + parseDuration(env.jwt.refreshExpiresIn)),
  });
  return { accessToken, refreshToken };
}

async function register({ organizationName, name, email, password }) {
  if (await userRepo.findByEmail(email)) {
    throw AppError.conflict('A user with this email already exists');
  }

  const org = await orgRepo.create({ name: organizationName });
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await userRepo.create({
    organizationId: org.id,
    name,
    email,
    passwordHash,
    role: 'ADMIN',
  });

  const tokens = await issueTokens(user);
  logger.info('auth.register', { userId: user.id, organizationId: org.id });
  return { user: publicUser(user), ...tokens };
}

async function login({ email, password }) {
  const user = await userRepo.findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    logger.warn('auth.login_failed', { email });
    throw AppError.unauthorized('Invalid email or password');
  }
  const tokens = await issueTokens(user);
  logger.info('auth.login', { userId: user.id });
  return { user: publicUser(user), ...tokens };
}

async function refresh({ refreshToken }) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }

  const stored = await refreshRepo.findByHash(hashToken(refreshToken));
  if (!stored) throw AppError.unauthorized('Refresh token not recognised');

  if (stored.revokedAt) {
    await refreshRepo.revokeAllForUser(stored.userId);
    logger.warn('auth.refresh_replay', { userId: stored.userId });
    throw AppError.unauthorized('Refresh token has been revoked');
  }
  if (stored.expiresAt.getTime() <= Date.now()) {
    throw AppError.unauthorized('Refresh token expired');
  }

  const user = await userRepo.findById(payload.sub);
  if (!user) throw AppError.unauthorized('User no longer exists');

  const newAccess = signAccessToken(accessPayload(user));
  const newRefresh = signRefreshToken({ sub: user.id });
  const newRecord = await refreshRepo.create({
    userId: user.id,
    tokenHash: hashToken(newRefresh),
    expiresAt: new Date(Date.now() + parseDuration(env.jwt.refreshExpiresIn)),
  });

  const won = await refreshRepo.revokeIfActive(stored.id, newRecord.id);
  if (!won) {
    await refreshRepo.hardDelete(newRecord.id);
    throw AppError.unauthorized('Refresh token has already been used');
  }

  logger.info('auth.refresh', { userId: user.id });
  return { accessToken: newAccess, refreshToken: newRefresh };
}

async function logout({ refreshToken }) {
  const stored = await refreshRepo.findByHash(hashToken(refreshToken));
  if (stored && !stored.revokedAt) {
    await refreshRepo.revoke(stored.id);
    logger.info('auth.logout', { userId: stored.userId });
  }
  return { success: true };
}

module.exports = { register, login, refresh, logout };
