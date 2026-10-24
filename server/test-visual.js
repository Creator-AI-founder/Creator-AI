require("dotenv").config();

const axios = require("axios");
const fs = require("fs");

async function test() {
  const query = "Venus planet";

  const search = await axios.get(
    "https://commons.wikimedia.org/w/api.php",
    {
      params: {
        action: "query",
        generator: "search",
        gsrsearch: `${query} filetype:bitmap`,
        gsrnamespace: 6,
        gsrlimit: 10,
        prop: "imageinfo",
        iiprop: "url|mime|size|width|height",
        format: "json",
        origin: "*"
      },
      headers: {
        "User-Agent": "CreatorAI/1.0"
      },
      timeout: 15000
    }
  );

  const pages = Object.values(
    search.data?.query?.pages || {}
  );

  const image = pages
    .map(p => p.imageinfo?.[0])
    .find(info =>
      info &&
      info.url &&
      ["image/jpeg", "image/png", "image/webp"].includes(
        String(info.mime).toLowerCase()
      )
    );

  if (!image) {
    throw new Error("No usable image found.");
  }

  console.log("REAL IMAGE URL:");
  console.log(image.url);

  const response = await axios.get(image.url, {
    responseType: "arraybuffer",
    timeout: 20000,
    maxContentLength: 25 * 1024 * 1024,
    headers: {
      "User-Agent": "CreatorAI/1.0"
    }
  });

  fs.writeFileSync(
    "/data/data/com.termux/files/home/venus-real.jpg",
    Buffer.from(response.data)
  );

  console.log("Downloaded successfully.");
  console.log(
    "Size:",
    fs.statSync("/data/data/com.termux/files/home/venus-real.jpg").size,
    "bytes"
  );
}

test().catch(err => {
  console.error("TEST FAILED:", err.message);
  process.exit(1);
});
