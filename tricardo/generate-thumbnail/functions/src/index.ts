import {onObjectFinalized} from "firebase-functions/v2/storage";
import {getStorage} from "firebase-admin/storage";

import {initializeApp} from "firebase-admin/app";
import {logger} from "firebase-functions";
// const logger = require("firebase-functions/logger");
import {spawn} from "child-process-promise";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";

const THUMB_PREFIX = "thumb_";
const THUMB_MAX_WIDTH = 320;
const THUMB_MAX_HEIGHT = 520;

initializeApp();

exports.optimizemedia = onObjectFinalized({cpu: 2},
    async (event) => {
      const fileBucket = event.data.bucket;
      const filePath = event.data.name || "";
      const fileName = !filePath ? "" : path.basename(filePath);
      const contentType = event.data.contentType || "";

      if (!contentType.startsWith("image/")) {
        return logger.log("This is not an image");
      }
      if (fileName.startsWith(THUMB_PREFIX)) {
        return logger.log("Already a Thumbnail");
      }

      const tempFilePath = path.join(os.tmpdir(), fileName);
      const bucket = getStorage().bucket(fileBucket);
      await bucket.file(filePath).download({destination: tempFilePath});
      logger.log("Image downloaded locally to", tempFilePath);

      const metadata = {
        "contentType": contentType,
        "Cache-control": "public,max-age=3600",
      };

      try {
        const foo = await spawn("convert",
            ["--version"], {capture: ["stdout"]});
        logger.log("Convert --version:", foo.stdout);

        await spawn("convert", [
          tempFilePath,
          "-thumbnail",
          `${THUMB_MAX_WIDTH}x${THUMB_MAX_HEIGHT}>`,
          tempFilePath,
        ], {
          capture: ["stdout", "stderr"],
        });
        logger.log("Thumbnail created at", tempFilePath);
      } catch (e) {
        logger.error("At spawn convert error", e);
        return;
      }

      const thumbFileName = `thumb_${fileName}`;
      const thumbFilePath = path.join(path.dirname(filePath), thumbFileName);

      await bucket.upload(tempFilePath, {
        destination: thumbFilePath,
        metadata: metadata,
      });
      await fs.unlink(tempFilePath);
    }
);
