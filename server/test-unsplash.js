require("dotenv").config();
const axios = require("axios");

async function test() {
  const key = process.env.UNSPLASH_ACCESS_KEY;

  if (!key) {
    throw new Error("UNSPLASH_ACCESS_KEY was not loaded from .env");
  }

  const response = await axios.get(
    "https://api.unsplash.com/search/photos",
    {
      params: {
        query: "Venus",
        per_page: 3
      },
      headers: {
        Authorization: `Client-ID ${key}`
      },
      timeout: 15000
    }
  );

  console.log("Unsplash API works!");
  console.log("Results:", response.data.results.length);

  for (const photo of response.data.results) {
    console.log(photo.id);
    console.log(photo.urls?.regular);
  }
}

test().catch(error => {
  console.error(
    "TEST FAILED:",
    error.response?.data || error.message
  );
  process.exit(1);
});
