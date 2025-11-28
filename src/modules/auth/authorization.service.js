import * as authService from './auth.service.js';

const extractBearerToken = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') {
    throw new authService.AuthError('Thieu header Authorization', 401, 'AUTH_HEADER_REQUIRED');
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new authService.AuthError('Dinh dang Authorization khong hop le', 401, 'INVALID_AUTH_HEADER');
  }

  return token.trim();
};

const ensureRoleAllowed = (role, allowedRoles = []) => {
  if (!allowedRoles.length) return true;
  if (allowedRoles.includes(role)) return true;
  throw new authService.AuthError('Ban khong co quyen truy cap tai nguyen nay', 403, 'FORBIDDEN');
};

const authorizeRequest = ({ authorizationHeader, allowedRoles = [] }) => {
  const token = extractBearerToken(authorizationHeader);
  const payload = authService.verifyAccessToken(token);
  const normalizedPayload = {
    ...payload,
    user_id: payload?.user_id ?? payload?.sub
  };
  ensureRoleAllowed(normalizedPayload.role, allowedRoles);
  return normalizedPayload;
};

export {
  authorizeRequest,
  ensureRoleAllowed,
  extractBearerToken
};
