import asyncHandler from "../middlewares/asyncHandler.js";
import helper from "../utils/helper.js";
import * as categoryService from "../services/Category.Service.js";

export const createCategory = asyncHandler(async (req, res) => {
  const session = req.transaction;

  helper.checkMandatoryFields(req.body, ["name"]);

  await categoryService.createCategory(req.body, req.userID, req.role, session);

  return res.status(201).json({
    success: true,
    message: req.role === "admin" ? "Category created." : "Category requested successfully.",
  });
});

export const getCategories = asyncHandler(async (req, res) => {
  const result = await categoryService.getCategories(req);

  return res.status(200).json({
    success: true,
    data: result,
  });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const session = req.transaction;
  const result = await categoryService.updateCategory(req.params.categoryId, req.body, session);

  return res.status(200).json({
    success: true,
    message: "Category updated successfully.",
    data: result,
  });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const session = req.transaction;
  await categoryService.deleteCategory(req.params.categoryId, session);

  return res.status(200).json({
    success: true,
    message: "Category deleted successfully.",
  });
});
