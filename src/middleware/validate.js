import { ZodError } from "zod";

const formatZodIssues = (issues = []) =>
  issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));

const buildValidator =
  (schema, source = "body") =>
  (req, res, next) => {
    try {
      const parsed = schema.parse(req[source] || {});
      req[source] = parsed;
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(422).json({
          success: false,
          message: "Invalid request data",
          errors: formatZodIssues(error.issues)
        });
      }
      return next(error);
    }
  };

const validateBody = (schema) => buildValidator(schema, "body");
const validateQuery = (schema) => buildValidator(schema, "query");
const validateParams = (schema) => buildValidator(schema, "params");

export { validateBody, validateQuery, validateParams };
