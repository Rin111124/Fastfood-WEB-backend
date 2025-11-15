"use strict";

export const handleMulterError = (err, req, res, next) => {
    if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'Kích thước file vượt quá giới hạn cho phép (5MB)'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Chỉ được phép tải lên 1 ảnh'
            });
        }
        return res.status(400).json({
            success: false,
            message: 'Lỗi khi tải file: ' + err.message
        });
    }
    next(err);
};

export const handleGeneralError = (err, req, res, next) => {
    console.error('Server error:', err);

    // Return appropriate error message
    const statusCode = err.statusCode || 500;
    const message = statusCode === 500
        ? 'Máy chủ đang gặp sự cố, vui lòng thử lại sau'
        : err.message || 'Có lỗi xảy ra';

    res.status(statusCode).json({
        success: false,
        message,
        error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
};