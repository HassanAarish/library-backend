import ErrorResponse from "../utils/errorResponse.js";

const MAX_REPORTED_ISSUES = 5;

const describe = (issues) =>
  issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) =>
      issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    )
    .join("; ");

/**
 * Validate (and clean) the request body with a zod schema before the handler
 * runs. Unknown fields are dropped, strings are trimmed, so services only ever
 * see the fields they expect. Fails with 400 and a readable message.
 *
 * Put it after auth / rate limiting and before inTransaction, so bad input
 * never opens a database transaction.
 *
 * @param {import("zod").ZodType} schema
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});

  if (!result.success) {
    return next(new ErrorResponse(describe(result.error.issues), 400));
  }

  req.body = result.data;
  next();
};

export default validate;
