import Category from "../models/Category.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import cache from "../utils/cache.js";
import { audit } from "../utils/audit.js";
import { notify, notifyAdmins } from "./Notification.Service.js";

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

  if (role !== "admin") {
    notifyAdmins({
      type: "category.proposed",
      title: "New category suggestion",
      message: `A reader suggested the category "${saved.name}".`,
      data: { categoryId: saved._id },
    });
  }

  return saved;
};

/** The categories this user suggested, with their review status. */
export const getMySuggestions = (req) =>
  helper.paginate(Category, req, {
    sort: { createdAt: -1 },
    filterFields: ["status"],
    filters: { proposedBy: req.userID },
    select: "name slug description status reviewNote createdAt updatedAt",
  });

export const getCategories = async (req, role) => {
  const isAdmin = role === "admin";

  const options = {
    sort: { name: 1 },
    searchFields: ["name", "slug"],
    // Admins may filter by any status; everyone else only ever sees approved ones.
    filterFields: isAdmin ? ["status"] : [],
    filters: isAdmin ? {} : { status: "approved" },
    // Who suggested a category is only shown to the admin (the list is public).
    ...(isAdmin
      ? { populate: { path: "proposedBy", select: "name email" } }
      : { select: "-proposedBy -reviewNote" }),
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
  const previousStatus = category.status;

  // Optional message to the reader who suggested it (e.g. why it was rejected).
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;
  if (note) changes.reviewNote = note;

  // Saving the document (not findByIdAndUpdate) so the slug hook runs on rename.
  category.set(changes);
  const updatedCategory = await category.save({ session });

  await invalidateCategoryList();

  audit("admin.category.update", {
    target: { type: "Category", id: category._id },
    metadata: { before, after: changes },
  });

  // Tell the reader who suggested it how it went.
  const decided = ["approved", "rejected"].includes(category.status);
  if (decided && category.status !== previousStatus && category.proposedBy) {
    const approved = category.status === "approved";
    notify(category.proposedBy, {
      type: approved ? "category.approved" : "category.rejected",
      title: approved ? "Category suggestion approved" : "Category suggestion not added",
      message: approved
        ? `Thanks! "${category.name}" is now a category in the library.${note ? ` ${note}` : ""}`
        : `We won't be adding "${category.name}" as a category for now.${note ? ` Reason: ${note}` : ""}`,
      data: { categoryId: category._id },
    });
  }

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
