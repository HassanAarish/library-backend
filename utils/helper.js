import ErrorResponse from "./errorResponse.js";

const assertBoolean = (value, field) => {
  if (typeof value !== "boolean") {
    throw new ErrorResponse(`${field} must be a boolean value`, 400);
  }
};

const assertNonEmptyString = (value, fieldName) => {
  if (value === undefined || value === null) {
    throw new ErrorResponse(`${fieldName} is required`, 400);
  }

  if (typeof value !== "string") {
    throw new ErrorResponse(`${fieldName} must be a string`, 400);
  }

  if (value.trim().length === 0) {
    throw new ErrorResponse(`${fieldName} cannot be empty`, 400);
  }
};

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
      400
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

export default {
  assertBoolean,
  assertNonEmptyString,
  checkMandatoryFields,
  lowercaseEmail,
};
