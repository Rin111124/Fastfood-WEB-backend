import coreRoutes from "../../modules/core/web.routes.js";
import initAdminRoutes from "../../modules/admin/admin.web.routes.js";
import initStaffRoutes from "../../modules/staff/staff.web.routes.js";

const initWebRoutes = (app) => {
  coreRoutes(app);
  initAdminRoutes(app);
  initStaffRoutes(app);
  return app;
};

export default initWebRoutes;
