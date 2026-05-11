import { v2 as cloudinary } from "cloudinary";
import { PassThrough } from "stream";
import ErrorResponse from "../utils/errorResponse.js";

const uploadFileToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const isImage = file.mimetype.startsWith("image");
    const isVideo = file.mimetype.startsWith("video");
    const isAudio = file.mimetype.startsWith("audio");
    const isDocx =
      file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const resourceType = isImage
      ? "image"
      : isVideo || isAudio
        ? "video"
        : "auto";

    const uploadOptions = {
      resource_type: resourceType,
      folder: "library",
      use_filename: true,
      unique_filename: true,
      format: isDocx ? "docx" : undefined,
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) reject(error);
        else
          resolve({
            name: file.originalname,
            url: result.secure_url,
            public_id: result.public_id,
          });
      }
    );

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
