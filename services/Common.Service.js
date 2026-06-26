import { v2 as cloudinary } from "cloudinary";
import { PassThrough } from "stream";
import ErrorResponse from "../utils/errorResponse.js";

const uploadFileToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const isImage = file.mimetype.startsWith("image");
    const isVideo = file.mimetype.startsWith("video");
    const isAudio = file.mimetype.startsWith("audio");
    const isDocx =
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const resourceType = isImage ? "image" : isVideo || isAudio ? "video" : "auto";

    const uploadOptions = {
      resource_type: resourceType,
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
        });
    });

    const bufferStream = new PassThrough();
    bufferStream.end(file.buffer);
    bufferStream.pipe(uploadStream);
  });
};

export const uploadFiles = async (files) => {
  if (!files || files.length === 0) {
    throw new ErrorResponse("No files provided", 400);
  }
  return await Promise.all(files.map((file) => uploadFileToCloudinary(file)));
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
 * Delete one or more previously-uploaded assets from Cloudinary by public_id.
 * Accepts a single id or an array. Cloudinary reports "ok" / "not found" per id
 * (a missing asset is not treated as an error).
 */
export const removeFiles = async (publicIds) => {
  const ids = (Array.isArray(publicIds) ? publicIds : [publicIds]).filter(Boolean);

  if (ids.length === 0) {
    throw new ErrorResponse("No public_id provided", 400);
  }

  const results = await Promise.all(ids.map((id) => cloudinary.uploader.destroy(id)));

  return ids.map((id, i) => ({ public_id: id, result: results[i]?.result }));
};
