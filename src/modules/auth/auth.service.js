import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import db from '../../models/index.js';

const { User, sequelize } = db;
const DEFAULT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const TOKEN_ISSUER = process.env.JWT_ISSUER || 'fatfood-api';
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
const MIN_PASSWORD_LENGTH = Number(process.env.MIN_PASSWORD_LENGTH || 8);

const getModelRoles = () => {
  const values = User?.rawAttributes?.role?.values;
  if (Array.isArray(values) && values.length) {
    return values;
  }
  return ['customer', 'admin', 'staff', 'shipper'];
};

const MODEL_ROLES = getModelRoles();
const SIGNUP_ALLOWED_ROLES = (process.env.SIGNUP_ALLOWED_ROLES || 'customer,staff')
  .split(',')
  .map((role) => role.trim().toLowerCase())
  .filter(Boolean)
  .filter((role, index, self) => self.indexOf(role) === index && MODEL_ROLES.includes(role));

const getModelGenders = () => {
  const values = User?.rawAttributes?.gender?.values;
  if (Array.isArray(values) && values.length) {
    return values;
  }
  return ['male', 'female', 'other', 'unknown'];
};

const MODEL_GENDERS = getModelGenders();

class AuthError extends Error {
  constructor(message, statusCode = 400, code = 'AUTH_ERROR', errors) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
    if (errors && typeof errors === 'object') {
      this.errors = errors;
    }
    Error.captureStackTrace?.(this, AuthError);
  }
}

const ensureJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AuthError('Thieu cau hinh JWT_SECRET', 500, 'JWT_SECRET_MISSING');
  }
  return secret;
};

const sanitizeUser = (userInstance) => {
  if (!userInstance) return null;
  const plainUser = userInstance.get({ plain: true });
  delete plainUser.password;
  return plainUser;
};

const normalizeEmail = (email) => {
  if (!email || typeof email !== 'string') {
    throw new AuthError('Email khong hop le', 422, 'EMAIL_INVALID');
  }
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    throw new AuthError('Email khong hop le', 422, 'EMAIL_INVALID');
  }
  if (normalized.length > 150) {
    throw new AuthError('Email khong duoc vuot qua 150 ky tu', 422, 'EMAIL_TOO_LONG');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized)) {
    throw new AuthError('Email khong hop le', 422, 'EMAIL_INVALID');
  }
  return normalized;
};

const normalizeUsername = (username) => {
  if (!username || typeof username !== 'string') {
    throw new AuthError('Ten dang nhap khong hop le', 422, 'USERNAME_INVALID');
  }
  const normalized = username.trim();
  if (normalized.length < 3) {
    throw new AuthError('Ten dang nhap phai co it nhat 3 ky tu', 422, 'USERNAME_TOO_SHORT');
  }
  if (normalized.length > 100) {
    throw new AuthError('Ten dang nhap khong duoc vuot qua 100 ky tu', 422, 'USERNAME_TOO_LONG');
  }
  return normalized;
};

const normalizeRole = (role) => {
  const fallbackRole = SIGNUP_ALLOWED_ROLES[0] || MODEL_ROLES[0] || 'customer';
  if (!role) return fallbackRole;
  const normalized = String(role).trim().toLowerCase();
  if (!MODEL_ROLES.includes(normalized)) {
    throw new AuthError('Vai tro khong hop le', 422, 'ROLE_INVALID');
  }
  if (SIGNUP_ALLOWED_ROLES.length && !SIGNUP_ALLOWED_ROLES.includes(normalized)) {
    throw new AuthError('Vai tro nay khong duoc phep tu dang ky', 403, 'ROLE_FORBIDDEN');
  }
  return normalized;
};

const normalizeGender = (gender) => {
  if (!gender) return 'unknown';
  const normalized = String(gender).trim().toLowerCase();
  switch (normalized) {
    case 'male':
    case 'nam':
      return 'male';
    case 'female':
    case 'nu':
      return 'female';
    case 'other':
    case 'khac':
    case 'non-binary':
    case 'nonbinary':
      return 'other';
    case 'unknown':
    case 'prefer-not':
    case 'prefer_not':
    case 'prefer not':
      return 'unknown';
    default:
      return MODEL_GENDERS.includes(normalized) ? normalized : 'other';
  }
};

const ensurePassword = (password) => {
  if (!password || typeof password !== 'string') {
    throw new AuthError('Vui long nhap mat khau', 422, 'PASSWORD_REQUIRED');
  }
  const trimmed = password.trim();
  if (!trimmed) {
    throw new AuthError('Vui long nhap mat khau', 422, 'PASSWORD_REQUIRED');
  }
  if (trimmed.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Mat khau phai co it nhat ${MIN_PASSWORD_LENGTH} ky tu`, 422, 'PASSWORD_TOO_SHORT');
  }
  if (trimmed.length > 255) {
    throw new AuthError('Mat khau khong duoc vuot qua 255 ky tu', 422, 'PASSWORD_TOO_LONG');
  }
  return trimmed;
};

const ensureLoginPassword = (password) => {
  if (!password || typeof password !== 'string') {
    throw new AuthError('Vui long nhap mat khau', 422, 'PASSWORD_REQUIRED');
  }
  const trimmed = password.trim();
  if (!trimmed) {
    throw new AuthError('Vui long nhap mat khau', 422, 'PASSWORD_REQUIRED');
  }
  if (trimmed.length > 255) {
    throw new AuthError('Mat khau khong duoc vuot qua 255 ky tu', 422, 'PASSWORD_TOO_LONG');
  }
  return trimmed;
};

const normalizeFullName = (fullName) => {
  if (!fullName || typeof fullName !== 'string') {
    throw new AuthError('Vui long nhap ho ten day du', 422, 'FULL_NAME_REQUIRED');
  }
  const normalized = fullName.trim();
  if (normalized.length < 2) {
    throw new AuthError('Ho ten phai co it nhat 2 ky tu', 422, 'FULL_NAME_TOO_SHORT');
  }
  if (normalized.length > 120) {
    throw new AuthError('Ho ten khong duoc vuot qua 120 ky tu', 422, 'FULL_NAME_TOO_LONG');
  }
  return normalized;
};

const normalizePhoneNumber = (phoneNumber) => {
  if (phoneNumber === undefined || phoneNumber === null) {
    return null;
  }
  if (typeof phoneNumber !== 'string') {
    throw new AuthError('So dien thoai khong hop le', 422, 'PHONE_INVALID');
  }
  const trimmed = phoneNumber.trim();
  if (!trimmed) {
    return null;
  }
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length < 8 || digitsOnly.length > 20) {
    throw new AuthError('So dien thoai phai co tu 8 den 20 chu so', 422, 'PHONE_INVALID');
  }
  const allowedPattern = /^[0-9+\-()\s]+$/;
  if (!allowedPattern.test(trimmed)) {
    throw new AuthError('So dien thoai khong hop le', 422, 'PHONE_INVALID');
  }
  if (trimmed.length > 20) {
    throw new AuthError('So dien thoai khong duoc vuot qua 20 ky tu', 422, 'PHONE_INVALID');
  }
  return trimmed;
};

const normalizeAddress = (address) => {
  if (address === undefined || address === null) {
    return null;
  }
  if (typeof address !== 'string') {
    throw new AuthError('Dia chi khong hop le', 422, 'ADDRESS_INVALID');
  }
  const normalized = address.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > 255) {
    throw new AuthError('Dia chi khong duoc vuot qua 255 ky tu', 422, 'ADDRESS_TOO_LONG');
  }
  return normalized;
};

const validateLoginInput = ({ identifier, username, email, password } = {}) => {
  const errors = {};

  const trimmedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
  const trimmedUsername = typeof username === 'string' ? username.trim() : '';
  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  const sanitizedIdentifier = trimmedIdentifier || trimmedUsername || trimmedEmail;

  if (!sanitizedIdentifier) {
    errors.identifier = 'Vui long nhap ten dang nhap hoac email';
    if (typeof username !== 'undefined') {
      errors.username = 'Vui long nhap ten dang nhap';
    }
    if (typeof email !== 'undefined') {
      errors.email = 'Vui long nhap email';
    }
  }

  let sanitizedPassword;
  try {
    sanitizedPassword = ensureLoginPassword(password);
  } catch (error) {
    if (error instanceof AuthError) {
      errors.password = error.message;
    } else {
      throw error;
    }
  }

  if (Object.keys(errors).length) {
    throw new AuthError('Du lieu dang nhap khong hop le', 422, 'LOGIN_VALIDATION_FAILED', errors);
  }

  return {
    identifier: sanitizedIdentifier,
    password: sanitizedPassword
  };
};

const validateSignupInput = ({
  username,
  password,
  email,
  fullName,
  full_name,
  phoneNumber,
  phone_number,
  gender,
  role,
  address
} = {}) => {
  const errors = {};

  let normalizedUsername;
  try {
    normalizedUsername = normalizeUsername(username);
  } catch (error) {
    if (error instanceof AuthError) {
      errors.username = error.message;
    } else {
      throw error;
    }
  }

  let normalizedEmail;
  try {
    normalizedEmail = normalizeEmail(email);
  } catch (error) {
    if (error instanceof AuthError) {
      errors.email = error.message;
    } else {
      throw error;
    }
  }

  let sanitizedPassword;
  try {
    sanitizedPassword = ensurePassword(password);
  } catch (error) {
    if (error instanceof AuthError) {
      errors.password = error.message;
    } else {
      throw error;
    }
  }

  const rawFullName = typeof fullName === 'string'
    ? fullName
    : (typeof full_name === 'string' ? full_name : '');

  let normalizedFullName;
  try {
    normalizedFullName = normalizeFullName(rawFullName);
  } catch (error) {
    if (error instanceof AuthError) {
      errors.fullName = error.message;
    } else {
      throw error;
    }
  }

  const rawPhoneNumber = typeof phoneNumber === 'string'
    ? phoneNumber
    : (typeof phone_number === 'string' ? phone_number : '');

  let normalizedPhone;
  if (!rawPhoneNumber.trim()) {
    errors.phoneNumber = 'Vui long nhap so dien thoai';
  } else {
    try {
      normalizedPhone = normalizePhoneNumber(rawPhoneNumber);
    } catch (error) {
      if (error instanceof AuthError) {
        errors.phoneNumber = error.message;
      } else {
        throw error;
      }
    }
  }

  let normalizedRole;
  if (!role || !String(role).trim()) {
    errors.role = 'Vui long chon vai tro';
  } else {
    try {
      normalizedRole = normalizeRole(role);
    } catch (error) {
      if (error instanceof AuthError) {
        errors.role = error.message;
      } else {
        throw error;
      }
    }
  }

  const rawGender = gender;
  if (!rawGender || !String(rawGender).trim()) {
    errors.gender = 'Vui long chon gioi tinh';
  }
  const normalizedGender = normalizeGender(rawGender);

  let normalizedAddress;
  try {
    normalizedAddress = normalizeAddress(address);
  } catch (error) {
    if (error instanceof AuthError) {
      errors.address = error.message;
    } else {
      throw error;
    }
  }

  if (Object.keys(errors).length) {
    throw new AuthError('Du lieu dang ky khong hop le', 422, 'SIGNUP_VALIDATION_FAILED', errors);
  }

  return {
    username: normalizedUsername,
    password: sanitizedPassword,
    email: normalizedEmail,
    fullName: normalizedFullName,
    phoneNumber: normalizedPhone,
    gender: normalizedGender,
    role: normalizedRole,
    address: normalizedAddress
  };
};

const issueAuthResponse = (userInstance) => {
  const payload = {
    sub: userInstance.user_id,
    role: userInstance.role,
    username: userInstance.username
  };

  const accessToken = jwt.sign(payload, ensureJwtSecret(), {
    expiresIn: DEFAULT_EXPIRES_IN,
    issuer: TOKEN_ISSUER
  });

  return {
    tokenType: 'Bearer',
    accessToken,
    expiresIn: DEFAULT_EXPIRES_IN,
    user: sanitizeUser(userInstance)
  };
};

const resolveIdentifierQuery = (rawIdentifier) => {
  if (!rawIdentifier || typeof rawIdentifier !== 'string') {
    throw new AuthError('Vui long nhap ten dang nhap hoac email', 422, 'IDENTIFIER_REQUIRED');
  }

  const identifier = rawIdentifier.trim();
  if (!identifier) {
    throw new AuthError('Vui long nhap ten dang nhap hoac email', 422, 'IDENTIFIER_REQUIRED');
  }

  return {
    normalized: identifier,
    whereClause: {
      [Op.or]: [
        { username: identifier },
        { email: identifier.toLowerCase() }
      ]
    }
  };
};

const login = async ({ identifier, username, email, password }) => {
  const {
    identifier: sanitizedIdentifier,
    password: sanitizedPassword
  } = validateLoginInput({ identifier, username, email, password });

  const { whereClause } = resolveIdentifierQuery(sanitizedIdentifier);
  const user = await User.unscoped().findOne({ where: whereClause });

  if (!user) {
    throw new AuthError('Sai thong tin dang nhap', 401, 'INVALID_CREDENTIALS', {
      identifier: 'Sai thong tin dang nhap',
      username: 'Sai thong tin dang nhap',
      email: 'Sai thong tin dang nhap',
      password: 'Sai thong tin dang nhap'
    });
  }

  const isPasswordValid = await bcrypt.compare(sanitizedPassword, user.password);
  if (!isPasswordValid) {
    throw new AuthError('Sai thong tin dang nhap', 401, 'INVALID_CREDENTIALS', {
      identifier: 'Sai thong tin dang nhap',
      username: 'Sai thong tin dang nhap',
      email: 'Sai thong tin dang nhap',
      password: 'Sai thong tin dang nhap'
    });
  }

  if (user.status && user.status !== 'active') {
    throw new AuthError(
      user.status === 'locked'
        ? 'Tai khoan cua ban da bi khoa, vui long lien he quan tri vien'
        : 'Tai khoan cua ban dang tam ngung su dung',
      403,
      'ACCOUNT_DISABLED',
      { status: user.status }
    );
  }

  return issueAuthResponse(user);
};

const register = async (payload) => {
  const {
    username: normalizedUsername,
    password: sanitizedPassword,
    email: normalizedEmail,
    fullName: normalizedFullName,
    phoneNumber: normalizedPhone,
    gender: normalizedGender,
    role: normalizedRole,
    address: normalizedAddress
  } = validateSignupInput(payload);

  const existingUser = await User.unscoped().findOne({
    where: {
      [Op.or]: [
        { username: normalizedUsername },
        { email: normalizedEmail }
      ]
    }
  });

  if (existingUser) {
    if (existingUser.username === normalizedUsername) {
      throw new AuthError('Ten dang nhap da ton tai', 409, 'USERNAME_TAKEN', {
        username: 'Ten dang nhap da ton tai'
      });
    }
    throw new AuthError('Email da duoc su dung', 409, 'EMAIL_TAKEN', {
      email: 'Email da duoc su dung'
    });
  }

  const hashedPassword = await bcrypt.hash(sanitizedPassword, SALT_ROUNDS);

  const newUser = await sequelize.transaction(async (transaction) => {
    return User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      role: normalizedRole,
      full_name: normalizedFullName,
      phone_number: normalizedPhone,
      gender: normalizedGender,
      address: normalizedAddress
    }, { transaction });
  });

  return issueAuthResponse(newUser);
};

const verifyAccessToken = (token) => {
  if (!token) {
    throw new AuthError('Thieu access token', 401, 'TOKEN_REQUIRED');
  }

  try {
    return jwt.verify(token, ensureJwtSecret(), { issuer: TOKEN_ISSUER });
  } catch (error) {
    throw new AuthError('Access token khong hop le hoac da het han', 401, 'INVALID_TOKEN');
  }
};

export {
  AuthError,
  login,
  register,
  verifyAccessToken,
  sanitizeUser
};
