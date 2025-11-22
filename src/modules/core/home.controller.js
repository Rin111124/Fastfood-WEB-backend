const getHomePage = (req, res) => {
  const user = req.session?.user;
  if (user?.role === "admin") {
    return res.redirect("/admin");
  }
  if (user?.role === "staff") {
    return res.redirect("/staff");
  }

  // API-only mode in production/Railway
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    return res.json({
      success: true,
      message: 'FastFood API Server',
      version: '1.0.0',
      endpoints: {
        auth: '/api/auth',
        customer: '/api/customer',
        admin: '/api/admin',
        staff: '/api/staff',
        payment: '/api/payments'
      }
    });
  }

  return res.render("homepage.ejs");
};

export { getHomePage };
