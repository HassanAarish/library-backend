import Category from "../models/Category.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import cache from "../utils/cache.js";

// Categories change rarely but are read often → a good cache-aside target.
const CATEGORY_LIST_PREFIX = "categories:list:";
const CATEGORY_LIST_TTL = 300; // seconds (5 minutes)

// Drop every cached category-list page after any write.
const invalidateCategoryList = () => cache.delByPrefix(CATEGORY_LIST_PREFIX);

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

  const saved = await category.save({ session });
  await invalidateCategoryList();
  return saved;
};

export const getCategories = async (req) => {
  const options = {
    sort: { name: 1 },
    searchFields: ["name", "slug"],
    // If not admin, we hardcode the status filter to 'approved'
    populate: { path: "proposedBy", select: "name email" },
  };

  // Cache-aside keyed by the query params that affect the result set.
  const { page = 1, limit = 10, search = "", status = "" } = req.query;
  const key = `${CATEGORY_LIST_PREFIX}${page}:${limit}:${search}:${status}`;

  return cache.wrap(key, CATEGORY_LIST_TTL, () => helper.paginate(Category, req, options));
};

export const updateCategory = async (categoryId, body, session = null) => {
  const category = await Category.findById(categoryId).session(session);

  if (!category) throw new ErrorResponse("Category not found", 404);

  // If status is being updated, ensure it's a valid enum
  if (body.status && !["approved", "pending", "rejected"].includes(body.status)) {
    throw new ErrorResponse("Invalid status value", 400);
  }

  const updatedCategory = await Category.findByIdAndUpdate(categoryId, body, {
    returnDocument: "after",
    runValidators: true,
    session,
  });

  await invalidateCategoryList();
  return updatedCategory;
};

export const deleteCategory = async (categoryId, session = null) => {
  const category = await Category.findById(categoryId).session(session);
  if (!category) throw new ErrorResponse("Category not found", 404);

  if (category.bookCount > 0) {
    throw new ErrorResponse("Cannot delete category with linked books", 400);
  }

  await category.deleteOne({ session });
  await invalidateCategoryList();
  return true;
};
