import { v2 as cloudinary } from "cloudinary";
import { PassThrough } from "stream";
import Asset from "../models/Asset.Model.js";
import ErrorResponse from "../utils/errorResponse.js";
import { audit } from "../utils/audit.js";

const uploadFileToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const isImage = file.mimetype.startsWith("image");
    const isDocx =
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const uploadOptions = {
      resource_type: isImage ? "image" : "auto",
      folder: "library",
      use_filename: true,
      unique_filename: true,
      format: isDocx ? "docx" : undefined,
    };

    const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) reject(error);
      else
        resolve({
          name: file.originalname,
          url: result.secure_url,
          public_id: result.public_id,
          resourceType: result.resource_type,
          format: result.format,
          bytes: result.bytes,
          mimetype: file.mimetype,
        });
    });

    const bufferStream = new PassThrough();
    bufferStream.end(file.buffer);
    bufferStream.pipe(uploadStream);
  });
};

/**
 * Upload files to Cloudinary and record each one as an Asset owned by `userId`.
 * All-or-nothing: if any upload or the ownership write fails, every file that
 * did reach Cloudinary is destroyed again.
 */
export const uploadFiles = async (files, userId) => {
  if (!files || files.length === 0) {
    throw new ErrorResponse("No files provided", 400);
  }

  const settled = await Promise.allSettled(files.map((file) => uploadFileToCloudinary(file)));
  const uploaded = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);

  const destroyUploaded = () =>
    Promise.all(
      uploaded.map((f) =>
        cloudinary.uploader.destroy(f.public_id, { resource_type: f.resourceType }).catch(() => {}),
      ),
    );

  const failure = settled.find((r) => r.status === "rejected");
  if (failure) {
    await destroyUploaded();
    throw failure.reason;
  }

  try {
    await Asset.insertMany(uploaded.map((f) => ({ ...f, owner: userId })));
  } catch (err) {
    await destroyUploaded();
    throw err;
  }

  audit("upload.created", {
    metadata: {
      files: uploaded.map(({ public_id, name, mimetype, bytes }) => ({
        public_id,
        name,
        mimetype,
        bytes,
      })),
    },
  });

  return uploaded.map(({ name, url, public_id }) => ({ name, url, public_id }));
};

/**
 * Upload a REMOTE image (e.g. a Google/Facebook avatar URL) to Cloudinary and
 * return our standard { url, public_id }. Cloudinary fetches the URL server-side,
 * so a temporary/expiring provider URL becomes a permanent owned asset.
 */
export const uploadFromUrl = async (url, folder = "library/avatars") => {
  const result = await cloudinary.uploader.upload(url, {
    folder,
    resource_type: "image",
  });
  return { url: result.secure_url, public_id: result.public_id };
};

/**
 * Delete one or more previously-uploaded assets from Cloudinary by public_id,
 * along with their Asset records. Accepts a single id or an array. No ownership
 * check — internal use only; requests from clients go through removeOwnedFiles.
 * Cloudinary reports "ok" / "not found" per id (a missing asset is not an error).
 */
export const removeFiles = async (publicIds) => {
  const ids = (Array.isArray(publicIds) ? publicIds : [publicIds]).filter(Boolean).map(String);

  if (ids.length === 0) {
    throw new ErrorResponse("No public_id provided", 400);
  }

  // Non-image files (PDF/EPUB/DOCX) must be destroyed with their real resource type.
  const assets = await Asset.find({ public_id: { $in: ids } })
    .select("public_id resourceType")
    .lean();
  const typeById = new Map(assets.map((a) => [a.public_id, a.resourceType]));

  const results = await Promise.all(
    ids.map((id) =>
      cloudinary.uploader.destroy(id, { resource_type: typeById.get(id) || "image" }),
    ),
  );

  await Asset.deleteMany({ public_id: { $in: ids } });

  return ids.map((id, i) => ({ public_id: id, result: results[i]?.result }));
};

/**
 * Client-facing delete: a user may only remove files they uploaded themselves.
 * Admins may remove anything.
 */
export const removeOwnedFiles = async (publicIds, userId, role) => {
  const ids = (Array.isArray(publicIds) ? publicIds : [publicIds]).filter(Boolean).map(String);

  if (ids.length === 0) {
    throw new ErrorResponse("No public_id provided", 400);
  }

  if (role !== "admin") {
    const owned = await Asset.countDocuments({ public_id: { $in: ids }, owner: userId });

    if (owned !== new Set(ids).size) {
      audit("upload.remove", {
        outcome: "failure",
        metadata: { reason: "not_owner", publicIds: ids },
      });
      throw new ErrorResponse("You can only remove files you uploaded.", 403);
    }
  }

  const results = await removeFiles(ids);

  audit("upload.remove", { metadata: { publicIds: ids } });

  return results;
};

/**
 * Look up an uploaded asset and make sure it belongs to `userId`. Used before
 * attaching an upload to a record (profile picture, book file, …) so a user
 * can't claim someone else's file.
 *
 * @param {string} publicId
 * @param {string} userId
 * @param {{ mimePrefix?: string }} [options] - e.g. "image/" to require an image.
 *   (Checked on the mimetype: Cloudinary stores PDFs as resource type "image" too.)
 * @returns {Promise<Object>} the Asset (lean)
 */
export const getOwnedAsset = async (publicId, userId, { mimePrefix } = {}) => {
  const asset = await Asset.findOne({ public_id: String(publicId), owner: userId }).lean();

  if (!asset) {
    audit("upload.claim", {
      outcome: "failure",
      metadata: { reason: "not_owner", public_id: publicId },
    });
    throw new ErrorResponse("Uploaded file not found. Please upload it again.", 400);
  }

  if (mimePrefix && !asset.mimetype?.startsWith(mimePrefix)) {
    throw new ErrorResponse("This file type isn't allowed here.", 400);
  }

  return asset;
};
