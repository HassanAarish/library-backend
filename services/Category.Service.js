import Category from "../models/Category.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import cache from "../utils/cache.js";
import { audit } from "../utils/audit.js";

// Categories change rarely but are read often → a good cache-aside target.
const CATEGORY_LIST_PREFIX = "categories:list:";
const CATEGORY_LIST_TTL = 300; // seconds (5 minutes)

const EDITABLE_FIELDS = ["name", "description", "status"];

// Drop every cached category-list page after any write.
const invalidateCategoryList = () => cache.delByPrefix(CATEGORY_LIST_PREFIX);

export const createCategory = async (body, userId, role, session = null) => {
  const { name, description } = body;

  // Check if category already exists (case-insensitive, literal match)
  const existing = await Category.findOne({
    name: { $regex: `^${helper.escapeRegex(String(name).trim())}$`, $options: "i" },
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

  audit(role === "admin" ? "category.create" : "category.propose", {
    target: { type: "Category", id: saved._id },
    metadata: { name },
  });

  return saved;
};

export const getCategories = async (req, role) => {
  const isAdmin = role === "admin";

  const options = {
    sort: { name: 1 },
    searchFields: ["name", "slug"],
    // Admins may filter by any status; everyone else only ever sees approved ones.
    filterFields: isAdmin ? ["status"] : [],
    filters: isAdmin ? {} : { status: "approved" },
    populate: { path: "proposedBy", select: isAdmin ? "name email" : "name" },
  };

  // Cache-aside keyed by everything that affects the result set.
  const { page = 1, limit = 10, search = "" } = req.query;
  const status = isAdmin ? req.query.status || "" : "approved";
  const key = `${CATEGORY_LIST_PREFIX}${isAdmin ? "admin" : "user"}:${page}:${limit}:${search}:${status}`;

  return cache.wrap(key, CATEGORY_LIST_TTL, () => helper.paginate(Category, req, options));
};

export const updateCategory = async (categoryId, body, session = null) => {
  const category = await Category.findById(categoryId).session(session);

  if (!category) throw new ErrorResponse("Category not found", 404);

  // If status is being updated, ensure it's a valid enum
  if (body.status && !["approved", "pending", "rejected"].includes(body.status)) {
    throw new ErrorResponse("Invalid status value", 400);
  }

  const changes = helper.pick(body, EDITABLE_FIELDS);
  const before = helper.pick(category.toObject(), Object.keys(changes));

  // Saving the document (not findByIdAndUpdate) so the slug hook runs on rename.
  category.set(changes);
  const updatedCategory = await category.save({ session });

  await invalidateCategoryList();

  audit("admin.category.update", {
    target: { type: "Category", id: category._id },
    metadata: { before, after: changes },
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
  await invalidateCategoryList();

  audit("admin.category.delete", {
    target: { type: "Category", id: category._id },
    metadata: { name: category.name },
  });

  return true;
};
