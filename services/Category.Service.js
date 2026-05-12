import Category from "../models/Category.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";

export const createCategory = async (body, userId, role, session = null) => {
  const { name, description } = body;

  // Check if category already exists (case-insensitive)
  const existing = await Category.findOne({
    name: { $regex: new RegExp(`^${name}$`, "i") },
  }).session(session);

  if (existing) {
    throw new ErrorResponse("This category already exists.", 400);
  }

  const category = new Category({
    name,
    description,
    proposedBy: userId,
    status: role === "admin" ? "approved" : "pending",
  });

  return await category.save({ session });
};

export const getCategories = async (req) => {
  const options = {
    sort: { name: 1 },
    searchFields: ["name", "slug"],
    // If not admin, we hardcode the status filter to 'approved'
    populate: { path: "proposedBy", select: "name email" },
  };

  return await helper.paginate(Category, req, options);
};

export const updateCategory = async (categoryId, body, session = null) => {
  const category = await Category.findById(categoryId).session(session);

  if (!category) throw new ErrorResponse("Category not found", 404);

  // If status is being updated, ensure it's a valid enum
  if (
    body.status &&
    !["approved", "pending", "rejected"].includes(body.status)
  ) {
    throw new ErrorResponse("Invalid status value", 400);
  }

  const updatedCategory = await Category.findByIdAndUpdate(categoryId, body, {
    returnDocument: "after",
    runValidators: true,
    session,
  });

  return updatedCategory;
};

export const deleteCategory = async (categoryId, session = null) => {
  const category = await Category.findById(categoryId).session(session);
  if (!category) throw new ErrorResponse("Category not found", 404);

  if (category.bookCount > 0) {
    throw new ErrorResponse("Cannot delete category with linked books", 400);
  }

  await category.deleteOne({ session });
  return true;
};
