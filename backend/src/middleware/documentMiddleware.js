// middleware/documentMiddleware.js
import multer from "multer";
import cloudinary from "../config/cloudinary.js";

// Memory storage (no local files)
const storage = multer.memoryStorage();
export const upload = multer({ storage });

// Cloudinary upload helper
export const uploadToCloudinary = (file, folder = "workspace_documents") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto",
        folder,
        public_id:
          file.originalname.split(".")[0].replace(/\s+/g, "_") +
          "_" +
          Date.now(),
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      },
    );

    stream.end(file.buffer);
  });
};
