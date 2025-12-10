import fs from "fs";
import path from "path";

const isApiOnlyMode = () => {
  const nodeEnv = (process.env.NODE_ENV || "development").toLowerCase();
  return (
    nodeEnv === "production" ||
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_ID) ||
    String(process.env.API_ONLY || "").toLowerCase() === "true"
  );
};

const hasHomepageView = (app) => {
  const viewsDir = app?.get("views") || path.join(process.cwd(), "views");
  return fs.existsSync(path.join(viewsDir, "homepage.ejs"));
};

const getHomePage = (req, res) => {
  const user = req.session?.user;
  if (user?.role === "admin") {
    return res.redirect("/admin");
  }
  if (user?.role === "staff") {
    return res.redirect("/staff");
  }

  const apiInfo = {
    success: true,
    message: "FastFood API Server",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      customer: "/api/customer",
      admin: "/api/admin",
      staff: "/api/staff",
      payment: "/api/payments"
    }
  };

  const apiOnly = isApiOnlyMode();
  const canRenderView = hasHomepageView(req.app);

  if (apiOnly || !canRenderView) {
    return res.json(apiInfo);
  }

  return res.render("homepage.ejs");
};

export { getHomePage };
