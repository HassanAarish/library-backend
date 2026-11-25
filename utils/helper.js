import ErrorResponse from "./errorResponse.js";

const MAX_PAGE_SIZE = 100;

/**
 * Checks whether all required fields are present and valid.
 *
 * This function checks if the fields provided in the input object are valid (i.e., not undefined, null, or empty).
 * If any required fields are missing or invalid, an error is thrown with a descriptive message.
 * It is useful for validating incoming request data (e.g., for user registration or login).
 *
 * @param {Object} fields - Object containing input data (e.g. req.body)
 * @param {Array<string>} requiredFields - List of required field names
 * @throws {ErrorResponse} - Throws error if any required field is missing
 */
const checkMandatoryFields = (fields, requiredFields) => {
  // Find fields that are missing or invalid
  const missingFields = requiredFields.filter((field) => {
    const value = fields?.[field];

    return (
      value === undefined || // field not provided
      value === null || // field explicitly set to null
      (typeof value === "string" && value.trim() === "") // empty string
    );
  });

  // If at least one required field is missing, throw an error
  if (missingFields.length > 0) {
    throw new ErrorResponse(
      `${missingFields.join(", ")} ${missingFields.length > 1 ? "are" : "is"} required`,
      400,
    );
  }
};

/**
 * Normalize and lowercase an email address.
 *
 * This function trims any leading or trailing spaces from the provided email
 * and converts the email address to lowercase to ensure consistency and avoid
 * case-sensitive issues (e.g., "Example@domain.com" and "example@domain.com" should be treated the same).
 *
 * @param {string} email - The email address to normalize
 * @returns {string} - The normalized email address in lowercase
 */
const lowercaseEmail = (email) => {
  return String(email).trim().toLowerCase();
};

/**
 * Escape user input for safe use inside a RegExp / Mongo $regex, so search text
 * is matched literally (no regex injection or catastrophic backtracking).
 *
 * @param {string} text
 * @returns {string}
 */
const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Return a copy of `source` containing only the listed keys that are defined.
 * Use it to whitelist client-supplied fields before writing them to the DB.
 *
 * @param {Object} source
 * @param {Array<string>} keys
 * @returns {Object}
 */
const pick = (source = {}, keys = []) =>
  keys.reduce((acc, key) => {
    if (source?.[key] !== undefined) acc[key] = source[key];
    return acc;
  }, {});

/**
 * Parse optional `from` / `to` query params into a Mongo date-range filter.
 *
 * @param {string} [from]
 * @param {string} [to]
 * @param {string} [field="createdAt"]
 * @returns {Object} e.g. { createdAt: { $gte, $lte } } or {}
 */
const dateRangeFilter = (from, to, field = "createdAt") => {
  const range = {};

  for (const [op, raw] of [
    ["$gte", from],
    ["$lte", to],
  ]) {
    if (raw === undefined || raw === "") continue;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new ErrorResponse(`Invalid date: ${raw}`, 400);
    }
    range[op] = date;
  }

  return Object.keys(range).length ? { [field]: range } : {};
};

/**
 * Generic Pagination Helper for Mongoose models.
 *
 * Only query params named in `filterFields` become filters — anything else the
 * client sends is ignored, so callers can't filter on hidden fields (tokens,
 * secrets) or override server-side rules. `filters` are applied last and always
 * win (e.g. { status: "published" } on a public listing).
 *
 * @param {mongoose.Model} model - The Mongoose model to query
 * @param {Object} req - The Express request object
 * @param {Object} options - populate, select, sort, searchFields, filterFields, filters
 */
const paginate = async (model, req, options = {}) => {
  const {
    populate,
    select,
    sort = { createdAt: -1 },
    searchFields = [],
    filterFields = [],
    filters: forcedFilters = {},
  } = options;

  // 1. Parse Page and Limit (bounded so one request can't dump a whole collection)
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), MAX_PAGE_SIZE);
  const skip = (page - 1) * limit;

  // 2. Whitelisted filters from the query string (plain strings only)
  const filters = {};
  for (const field of filterFields) {
    const value = req.query[field];
    if (typeof value === "string" && value !== "") {
      filters[field] = value;
    }
  }

  // 3. Handle Global Search (escaped, case-insensitive)
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search && searchFields.length > 0) {
    const pattern = escapeRegex(search);
    filters.$or = searchFields.map((field) => ({
      [field]: { $regex: pattern, $options: "i" },
    }));
  }

  // 4. Server-enforced filters override anything from the client
  Object.assign(filters, forcedFilters);

  // 5. Build Query
  let query = model.find(filters);

  if (sort) {
    query = query.sort(sort);
  }

  if (select) {
    query = query.select(select);
  }

  if (populate) {
    query = query.populate(populate);
  }

  // 6. Execute Query and Count in parallel for performance
  const [results, totalDocs] = await Promise.all([
    query.skip(skip).limit(limit).lean(), // .lean() for faster read-only queries
    model.countDocuments(filters),
  ]);

  return {
    totalDocs,
    page,
    limit,
    totalPages: Math.ceil(totalDocs / limit),
    hasNextPage: page * limit < totalDocs,
    hasPrevPage: page > 1,
    results,
  };
};

export default {
  checkMandatoryFields,
  lowercaseEmail,
  escapeRegex,
  pick,
  dateRangeFilter,
  paginate,
};
