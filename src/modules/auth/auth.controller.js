import { AuthError, login, register } from './auth.service.js';

const loginHandler = async (req, res) => {
  try {
    const { identifier, username, email, password } = req.body || {};
    const data = await login({ identifier, username, email, password });

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    const statusCode = error instanceof AuthError ? error.statusCode : 500;

    return res.status(statusCode).json({
      success: false,
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error instanceof AuthError ? error.message : 'Dang nhap that bai',
      ...(error?.errors ? { errors: error.errors } : {}),
      ...(statusCode >= 500 && process.env.NODE_ENV === 'development'
        ? { detail: error.message }
        : {})
    });
  }
};

const signupHandler = async (req, res) => {
  try {
    const data = await register(req.body || {});

    return res.status(201).json({
      success: true,
      data
    });
  } catch (error) {
    const statusCode = error instanceof AuthError ? error.statusCode : 500;

    return res.status(statusCode).json({
      success: false,
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error instanceof AuthError ? error.message : 'Dang ky that bai',
      ...(error?.errors ? { errors: error.errors } : {}),
      ...(statusCode >= 500 && process.env.NODE_ENV === 'development'
        ? { detail: error.message }
        : {})
    });
  }
};

export {
  loginHandler,
  signupHandler
};
