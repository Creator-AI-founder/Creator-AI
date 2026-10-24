require("dotenv").config();

const axios = require("axios");
const fs = require("fs");

async function test() {
  const key = process.env.UNSPLASH_ACCESS_KEY;

  if (!key) {
    throw new Error("UNSPLASH_ACCESS_KEY missing");
  }

  const search = await axios.get(
    "https://api.unsplash.com/search/photos",
    {
      params: {
        query: "Venus planet",
        per_page: 3
      },
      headers: {
        Authorization: `Client-ID ${key}`
      },
      timeout: 15000
    }
  );

  const photo = search.data.results[0];

  if (!photo?.urls?.regular) {
    throw new Error("No downloadable Unsplash image found");
  }

  console.log("Selected:", photo.id);
  console.log("Downloading real image...");

  const image = await axios.get(
    photo.urls.regular,
    {
      responseType: "arraybuffer",
      timeout: 20000,
      maxContentLength: 25 * 1024 * 1024
    }
  );

  const output =
    "/data/data/com.termux/files/home/unsplash-test.jpg";

  fs.writeFileSync(
    output,
    Buffer.from(image.data)
  );

  console.log("Downloaded successfully!");
  console.log(
    "File size:",
    fs.statSync(output).size,
    "bytes"
  );
}

test().catch(error => {
  console.error(
    "DOWNLOAD TEST FAILED:",
    error.response?.data || error.message
  );
  process.exit(1);
});
