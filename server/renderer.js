const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(
      "ffmpeg",
      args,
      (error, stdout, stderr) => {
        if (error) {
          console.error(stderr);
          reject(error);
          return;
        }

        resolve(stdout);
      }
    );
  });
}

async function createVideo({
  images,
  audio = null,
  output,
  duration = 30
}) {
  if (!images || images.length === 0) {
    throw new Error("No images provided.");
  }

  const workDir = path.dirname(output);

  fs.mkdirSync(workDir, {
    recursive: true
  });

  const sceneDuration =
    duration / images.length;

  const inputArgs = [];

  for (const image of images) {
    inputArgs.push(
      "-loop",
      "1",
      "-t",
      String(sceneDuration),
      "-i",
      image
    );
  }

  /*
   * Every scene becomes a true 1080x1920
   * 9:16 vertical frame.
   *
   * Instead of aggressively cropping the image,
   * we scale it to fit inside the frame and use
   * a blurred version of the same image behind it.
   *
   * This keeps the important subject visible.
   */

  const filters = images.map((_, index) => {

    const background =
      `[${index}:v]` +
      `scale=1080:1920:force_original_aspect_ratio=increase,` +
      `crop=1080:1920,` +
      `boxblur=25:10,` +
      `setsar=1` +
      `[bg${index}]`;

    const foreground =
      `[${index}:v]` +
      `scale=1020:1800:force_original_aspect_ratio=decrease,` +
      `setsar=1` +
      `[fg${index}]`;

    const composite =
      `[bg${index}][fg${index}]` +
      `overlay=(W-w)/2:(H-h)/2,` +
      `setsar=1,` +
      `format=yuv420p` +
      `[v${index}]`;

    return (
      background +
      ";" +
      foreground +
      ";" +
      composite
    );
  });

  const concatInputs =
    images
      .map((_, index) => `[v${index}]`)
      .join("");

  filters.push(
    `${concatInputs}` +
    `concat=n=${images.length}:v=1:a=0[outv]`
  );

  const args = [
    "-y",
    ...inputArgs
  ];

  if (audio) {
    args.push(
      "-i",
      audio
    );
  }

  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[outv]"
  );

  if (audio) {
    args.push(
      "-map",
      `${images.length}:a:0`,
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-t",
      String(duration)
    );
  }

  args.push(
    "-t",
    String(duration),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output
  );

  await runFFmpeg(args);

  return output;
}

module.exports = {
  createVideo
};
