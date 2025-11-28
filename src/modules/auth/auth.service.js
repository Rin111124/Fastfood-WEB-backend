// Thay thế hàm register trong auth.service.js

const register = async (payload) => {
  console.log('[register] Starting registration process');

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

  console.log('[register] Validated input, checking existing user');

  const existingUser = await User.unscoped().findOne({
    where: {
      [Op.or]: [
        { username: normalizedUsername },
        { email: normalizedEmail }
      ]
    }
  });

  if (existingUser) {
    console.log('[register] User found:', {
      username: existingUser.username,
      email: existingUser.email,
      emailVerified: !!existingUser.email_verified_at
    });

    // ✅ KIỂM TRA: Nếu user đã tồn tại NHƯNG CHƯA VERIFY EMAIL
    if (!existingUser.email_verified_at) {
      console.log('[register] User exists but email not verified, sending new verification email');

      try {
        // Gửi lại email verification
        const emailVerification = await requestEmailVerification({
          userId: existingUser.user_id,
          ip: payload.ip,
          userAgent: payload.userAgent
        });

        console.log('[register] Verification email sent:', {
          sent: emailVerification.sent,
          hasToken: !!emailVerification.token,
          hasUrl: !!emailVerification.verifyUrl
        });

        // ✅ TẠO ERROR OBJECT với đầy đủ thông tin
        const error = new AuthError(
          'Tai khoan da ton tai nhung chua duoc xac thuc. Email xac thuc da duoc gui lai.',
          409,
          'EMAIL_NOT_VERIFIED',
          {
            email: existingUser.email === normalizedEmail
              ? 'Email da duoc su dung nhung chua xac thuc'
              : undefined,
            username: existingUser.username === normalizedUsername
              ? 'Ten dang nhap da ton tai nhung chua xac thuc'
              : undefined
          }
        );

        // ✅ QUAN TRỌNG: Thêm các properties cần thiết cho controller
        error.requiresVerification = true;
        error.user = sanitizeUser(existingUser);
        error.emailVerification = emailVerification;

        console.log('[register] Throwing EMAIL_NOT_VERIFIED error with verification data');
        throw error;
      } catch (verificationError) {
        // Nếu gửi email thất bại, vẫn throw error nhưng không có emailVerification
        console.error('[register] Failed to send verification email:', verificationError);

        if (verificationError instanceof AuthError && verificationError.code === 'EMAIL_NOT_VERIFIED') {
          // Đã là error chúng ta throw ở trên
          throw verificationError;
        }

        // Lỗi khác khi gửi email
        const error = new AuthError(
          'Tai khoan da ton tai nhung chua duoc xac thuc. Khong the gui lai email xac thuc.',
          409,
          'EMAIL_NOT_VERIFIED',
          {
            email: existingUser.email === normalizedEmail
              ? 'Email da duoc su dung nhung chua xac thuc'
              : undefined,
            username: existingUser.username === normalizedUsername
              ? 'Ten dang nhap da ton tai nhung chua xac thuc'
              : undefined
          }
        );
        error.requiresVerification = true;
        error.user = sanitizeUser(existingUser);
        throw error;
      }
    }

    // User đã tồn tại VÀ đã verify - lỗi thông thường
    console.log('[register] User exists and already verified');

    if (existingUser.username === normalizedUsername) {
      throw new AuthError('Ten dang nhap da ton tai', 409, 'USERNAME_TAKEN', {
        username: 'Ten dang nhap da ton tai'
      });
    }
    throw new AuthError('Email da duoc su dung', 409, 'EMAIL_TAKEN', {
      email: 'Email da duoc su dung'
    });
  }

  // Tạo user mới như bình thường
  console.log('[register] Creating new user');

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

  console.log('[register] New user created, sending verification email');

  const emailVerification = await requestEmailVerification({
    userId: newUser.user_id,
    ip: payload.ip,
    userAgent: payload.userAgent
  });

  console.log('[register] Registration complete');

  return {
    user: sanitizeUser(newUser),
    requiresEmailVerification: true,
    emailVerification
  };
};
