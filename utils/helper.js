import ErrorResponse from "./errorResponse.js";

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
    const value = fields[field];

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
  return email.trim().toLowerCase();
};

/**
 * Generic Pagination Helper for Mongoose models.
 * @param {mongoose.Model} model - The Mongoose model to query
 * @param {Object} req - The Express request object
 * @param {Object} options - Configuration for populate, select, and sort
 */
const paginate = async (model, req, options = {}) => {
  const { populate, select, sort = { createdAt: -1 }, searchFields = [] } = options;

  // 1. Parse Page and Limit
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // 2. Extract and separate Search from Filters
  const queryObj = { ...req.query };
  const excludedFields = ["page", "limit", "sort", "fields", "search"];
  excludedFields.forEach((el) => delete queryObj[el]);

  // 3. Handle Global Search (Regex)
  let filters = { ...queryObj };

  if (req.query.search && searchFields?.length > 0) {
    filters.$or = searchFields.map((field) => ({
      [field]: { $regex: req.query.search, $options: "i" }, // "i" for case-insensitive
    }));
  }

  // 4. Build Query
  let query = model.find(filters);

  // Apply Sorting
  if (sort) {
    query = query.sort(sort);
  }

  // Apply Select (Field limiting)
  if (select) {
    query = query.select(select);
  }

  // Apply Populate (Important for Category/User refs)
  if (populate) {
    query = query.populate(populate);
  }

  // 4. Execute Query and Count in parallel for performance
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
  paginate,
};
