import { AuthError } from '../modules/auth/auth.service.js';
import { authorizeRequest } from '../modules/auth/authorization.service.js';

const sendError = (res, error) => res.status(error.statusCode || 401).json({
  success: false,
  code: error.code || 'UNAUTHORIZED',
  message: error.message
});

const authenticate = (req, res, next) => {
  try {
    const payload = authorizeRequest({
      authorizationHeader: req.headers.authorization
    });
    req.auth = payload;
    return next();
  } catch (error) {
    return sendError(res, error instanceof AuthError ? error : new AuthError('Khong the xac thuc nguoi dung', 401));
  }
};

const requireRoles = (...roles) => (req, res, next) => {
  try {
    const payload = authorizeRequest({
      authorizationHeader: req.headers.authorization,
      allowedRoles: roles
    });
    req.auth = payload;
    return next();
  } catch (error) {
    return sendError(res, error instanceof AuthError ? error : new AuthError('Ban khong co quyen truy cap', 403));
  }
};

export {
  authenticate,
  requireRoles
};
