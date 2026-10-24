
require("dotenv").config();
const axios = require("axios");

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const { createVideo } = require("./renderer");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const testAssets = path.join(__dirname, "test-assets");
const outputDir = path.join(__dirname, "outputs");

fs.mkdirSync(testAssets, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        console.error(stderr);
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}

/*
  Select eSpeak voice based on Creator AI language.
*/
function getVoice(language) {
  const lang = String(language || "English").toLowerCase();

  if (lang === "hindi") {
    return "hi";
  }

  if (
    lang === "bangla" ||
    lang === "bengali"
  ) {
    return "bn";
  }

  if (lang === "banglish") {
    // Banglish uses English pronunciation because
    // the text is normally written with English letters.
    return "en-us";
  }

  // Default
  return "en-us";
}


async function createVoice(text, output, language) {
  if (!text || !text.trim()) {
    throw new Error("No voiceover text provided.");
  }

  const lang = String(language || "English").toLowerCase();

  let kokoroLang = "en-us";
  let voice = "af_heart";

  if (lang === "hindi") {
    kokoroLang = "hi";
    voice = "hf_alpha";
  } else if (lang === "bangla" || lang === "bengali") {
    kokoroLang = "en-us";
    voice = "af_heart";
  } else if (lang === "banglish") {
    kokoroLang = "en-us";
    voice = "af_heart";
  }

  const ryk =
    "/data/data/com.termux/files/home/creator-ai/server/kukuryku/target/release/ryk";

  const assetDir =
    "/data/data/com.termux/files/home/creator-ai/server/kukuryku/kokoro-onyx";

  console.log(`Voice language: ${language} → Kokoro voice: ${voice}`);

  await runCommand("env", [
    `KUKURYKU_ASSET_DIR=${assetDir}`,
    `KOKORO_LANG=${kokoroLang}`,
    `KOKORO_VOICE=${voice}`,
    "KOKORO_NO_PLAY=1",
    `KOKORO_WAV=${output}`,
    ryk,
    text
  ]);

  return output;
}

async function fetchWebImage(query, output) {
  const original = String(query || "").trim();

  if (!original) {
    throw new Error("Empty image search query.");
  }

  // Generate progressively broader search queries.
  const queries = [
    original,
    original
      .replace(/\bpassionate\b/gi, "")
      .replace(/\bprofessional\b/gi, "")
      .replace(/\bbeautiful\b/gi, "")
      .replace(/\bcinematic\b/gi, "")
      .replace(/\bphotorealistic\b/gi, "")
      .trim()
  ];

  const words = original
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (words.length > 4) {
    queries.push(words.slice(0, 5).join(" "));
  }

  if (words.length > 3) {
    queries.push(words.slice(0, 4).join(" "));
  }

  // Remove duplicates.
  const searchQueries = [
    ...new Set(
      queries.filter(Boolean)
    )
  ];

  console.log(
    `Searching visual sources for: ${original}`
  );

  const candidates = [];

  async function searchWikimedia(q) {
    try {
      console.log(
        `Searching Wikimedia: ${q}`
      );

      const r = await axios.get(
        "https://commons.wikimedia.org/w/api.php",
        {
          params: {
            action: "query",
            generator: "search",
            gsrsearch: q,
            gsrnamespace: 6,
            gsrlimit: 8,
            prop: "imageinfo",
            iiprop: "url|size|mime",
            iiurlwidth: 1600,
            format: "json",
            origin: "*"
          },
          headers: {
            "User-Agent":
              "CreatorAI/1.0 (educational creator project)"
          },
          timeout: 15000
        }
      );

      const pages =
        Object.values(
          r.data?.query?.pages || {}
        );

      for (const page of pages) {
        const info =
          page.imageinfo?.[0];

        if (!info?.thumburl) continue;

        candidates.push({
          source: "Wikimedia",
          url: info.thumburl,
          width: info.width || 0,
          height: info.height || 0,
          title: page.title || "",
          query: q
        });
      }
    } catch (err) {
      console.log(
        `Wikimedia failed for "${q}": ${err.message}`
      );
    }
  }

  async function searchUnsplash(q) {
    if (!process.env.UNSPLASH_ACCESS_KEY) {
      return;
    }

    try {
      console.log(
        `Searching Unsplash: ${q}`
      );

      const r = await axios.get(
        "https://api.unsplash.com/search/photos",
        {
          params: {
            query: q,
            per_page: 10,
            orientation: "portrait"
          },
          headers: {
            Authorization:
              `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
          },
          timeout: 15000
        }
      );

      for (
        const item of r.data?.results || []
      ) {
        if (!item.urls?.regular) continue;

        candidates.push({
          source: "Unsplash",
          url: item.urls.regular,
          width: item.width || 0,
          height: item.height || 0,
          title:
            item.alt_description ||
            item.description ||
            "",
          id: item.id,
          query: q
        });
      }
    } catch (err) {
      console.log(
        `Unsplash failed for "${q}": ${err.message}`
      );
    }
  }

  const spaceWords =
    /space|nasa|planet|mars|moon|earth|universe|galaxy|astronaut|black hole|solar/i;

  async function searchNASA(q) {
    if (!spaceWords.test(q)) {
      return;
    }

    try {
      console.log(
        `Searching NASA: ${q}`
      );

      const r = await axios.get(
        "https://images-api.nasa.gov/search",
        {
          params: {
            q,
            media_type: "image",
            page_size: 10
          },
          timeout: 15000
        }
      );

      for (
        const item of
          r.data?.collection?.items || []
      ) {
        const data =
          item.data?.[0];

        const image =
          (item.links || []).find(
            x => x.render === "image"
          ) ||
          (item.links || []).find(
            x => x.href
          );

        if (!image?.href) continue;

        candidates.push({
          source: "NASA",
          url: image.href,
          width: 0,
          height: 0,
          title: data?.title || "",
          query: q
        });
      }
    } catch (err) {
      console.log(
        `NASA failed for "${q}": ${err.message}`
      );
    }
  }

  // Try every progressively broader query.
  for (const q of searchQueries) {
    await Promise.all([
      searchWikimedia(q),
      searchUnsplash(q),
      searchNASA(q)
    ]);

    if (candidates.length >= 12) {
      break;
    }
  }

  console.log(
    `Total visual candidates: ${candidates.length}`
  );

  if (!candidates.length) {
    throw new Error(
      `Could not find images for: ${original}`
    );
  }

  // Score candidates by semantic overlap.
  const targetWords =
    original
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);

  const scored =
    candidates.map(item => {
      const text =
        `${item.title || ""} ${item.query || ""}`
          .toLowerCase();

      let score = 0;

      for (const word of targetWords) {
        if (text.includes(word)) {
          score += 10;
        }
      }

      const area =
        (item.width || 0) *
        (item.height || 0);

      if (area > 2000000) {
        score += 4;
      }

      if (
        item.source === "NASA" &&
        spaceWords.test(original)
      ) {
        score += 20;
      }

      if (
        item.source === "Wikimedia" &&
        /football|fifa|stadium|match|championship|mexico|team|history|event/i
          .test(original)
      ) {
        score += 12;
      }

      if (item.source === "Unsplash") {
        score += 5;
      }

      return {
        ...item,
        score
      };
    });

  scored.sort(
    (a, b) => b.score - a.score
  );

  // Try the best candidates first.
  for (
    const item of scored.slice(0, 15)
  ) {
    try {
      console.log(
        `Trying ${item.source}: ${item.title || item.url}`
      );

      const response =
        await axios.get(
          item.url,
          {
            responseType:
              "arraybuffer",
            timeout: 20000,
            maxContentLength:
              15 * 1024 * 1024,
            headers: {
              "User-Agent":
                "CreatorAI/1.0"
            }
          }
        );

      const contentType =
        response.headers[
          "content-type"
        ] || "";

      if (
        !contentType.startsWith(
          "image/"
        )
      ) {
        continue;
      }

      fs.writeFileSync(
        output,
        Buffer.from(
          response.data
        )
      );

      console.log(
        `SELECTED ${item.source} | score ${item.score} | query "${item.query}"`
      );

      return output;
    } catch (err) {
      console.log(
        `Failed ${item.source}: ${err.message}`
      );
    }
  }

  throw new Error(
    `All visual sources failed for: ${original}`
  );
}

async function generateAIImage(prompt, output) {
  return fetchWebImage(
    String(prompt || "documentary photography"),
    output
  );
}

async function generateDirector({
  idea,
  duration,
  style,
  language
}) {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openrouter/free",

        messages: [
          {
            role: "system",
            content: `
You are Creator AI Director V2.

You are a professional short-form video director.

Your job is to turn an idea into a complete production blueprint for a high-quality YouTube Short.

The final video must feel like a professionally edited Short, NOT a slideshow.

Return ONLY valid JSON.
Do not use markdown.
Do not use code fences.
Do not add explanations outside the JSON.

Use exactly this structure:

{
  "title": "short compelling title",
  "hook": "strong opening hook",
  "voiceover": "complete narration",
  "beats": [
    {
      "beat": 1,
      "time": "0-3s",
      "purpose": "hook",
      "visual": "specific visual needed",
      "visual_type": "video",
      "shot": "specific shot description",
      "voiceover": "narration for this beat",
      "caption": "short on-screen caption",
      "edit": "editing instruction",
      "sfx": "sound effect or none"
    }
  ],
  "music": {
    "mood": "music mood",
    "direction": "music direction",
    "intensity": "low/medium/high"
  },
  "editing": {
    "pace": "slow/medium/fast",
    "transitions": "transition direction",
    "captions": "caption style",
    "motion": "camera motion / zoom / movement direction"
  }
}

SELECTED LANGUAGE:
${language}

LANGUAGE RULES:

English:
- Natural modern English.
- Conversational.
- Strong short-form narration.

Hindi:
- Natural spoken Hindi.
- Use Devanagari script.

Bangla:
- Natural spoken Bengali.
- Use Bengali script.

Banglish:
- Bengali language written using English/Roman letters.

The title, hook, voiceover, captions and beat narration must use the selected language.

DURATION:

Target duration:
${duration} seconds.

Keep the narration appropriate for this duration.

Do not make the narration unnecessarily long.

DIRECTING RULES:

1. STRONG HOOK

The first beat must immediately create curiosity, surprise, tension, emotion or a question.

Do not automatically begin with "Did you know?"

2. DYNAMIC BEATS

Do NOT use a fixed number of scenes.

Choose the number of beats based on:
- narration
- topic
- pacing
- visual changes
- information density

The director decides the correct number.

3. EVERY BEAT NEEDS A PURPOSE

Possible purposes:
- hook
- setup
- reveal
- explanation
- escalation
- comparison
- twist
- emotional moment
- payoff
- ending

4. VISUAL-FIRST THINKING

Every beat must have a visual that directly represents what is being said.

BAD:
"beautiful city"

GOOD:
"Dhaka traffic at night from elevated road"

BAD:
"football"

GOOD:
"football striker running toward goal during stadium match"

BAD:
"space"

GOOD:
"Earth viewed from lunar orbit"

5. VISUAL TYPE

Choose the best type:

"video"
"photo"
"graphic"
"map"
"animation"

Prefer VIDEO whenever realistic footage could represent the beat.

Use PHOTO when strong still photography is better.

Use GRAPHIC for:
- statistics
- comparisons
- diagrams
- text-driven moments

Use MAP for:
- geography
- locations
- journeys

Use ANIMATION only when necessary.

6. SHOT

Describe exactly what the camera should show.

Examples:
- "close-up of rotating object"
- "wide shot of stadium crowd"
- "aerial view of city"
- "slow push toward subject"
- "macro shot of surface"
- "archival footage of event"

Do not write AI image-generation prompts.

7. EDITING

Make the Short feel edited.

Possible instructions:
- hard cut
- match cut
- punch-in
- quick zoom
- speed ramp
- whip transition
- beat cut
- J-cut
- L-cut
- flash transition
- freeze frame
- text pop
- subtle camera movement

Do not use complicated effects on every beat.

8. PACING

Do not make every beat the same length.

Use faster cuts for:
- high energy
- information density
- action

Use longer shots for:
- emotional moments
- dramatic reveals
- important visuals

9. CAPTIONS

Captions must be short.

Highlight important words instead of copying the entire narration.

Examples:
"243 DAYS"
"YES, REALLY."
"IT SPINS BACKWARDS"

10. SOUND EFFECTS

Use SFX strategically.

Possible SFX:
- whoosh
- impact
- click
- riser
- bass hit
- camera shutter
- heartbeat
- notification
- crowd
- explosion
- wind

Use "none" when unnecessary.

11. MUSIC

Choose music based on the topic.

Possible moods:
- mysterious documentary
- cinematic tension
- emotional piano
- energetic electronic
- dark ambient
- inspiring orchestral
- playful upbeat

Do not specify copyrighted songs.

12. RETENTION

Build curiosity throughout the Short.

When appropriate:
- introduce a question
- delay the answer
- reveal information progressively
- create contrast
- change visuals before attention drops
- end with a satisfying payoff

13. ENDING

Do not abruptly stop.

End with:
- payoff
- surprising fact
- emotional line
- final reveal
- memorable statement

Use a call-to-action only when it naturally fits.

14. FACTUAL CONTENT

Never invent facts.

If the idea involves factual information, avoid fake statistics and unsupported claims.

15. VISUAL SEARCH QUERIES

The "visual" field must describe the exact subject needed.

Keep it SHORT and search-friendly.

Do NOT include:
- cinematic
- 8k
- ultra realistic
- AI generated
- 9:16
- no watermark
- camera settings
- image-generation instructions

The Visual Engine will use these descriptions to search for real assets.

16. ASSET PRIORITY

The Visual Engine should prioritize:

1. real video footage
2. alternative real video footage
3. high-quality photo
4. graphic/map
5. generated visual as final fallback

17. AVOID REPETITION

Do not repeatedly use the same visual concept unless repetition is intentional.

18. ORIGINALITY

Create an original structure.

Do not copy another creator's script.

19. VIRALITY

Optimize for retention and engagement.

Never guarantee that the video will go viral.

20. PIPELINE

The result must contain actionable information for:

- Visual Engine
- Voice Engine
- Caption Engine
- Editing Engine
- Audio Engine
`
          },

          {
            role: "user",
            content: `
Create a complete production blueprint for this Short.

Duration:
${duration} seconds

Style:
${style}

Language:
${language}

Idea:
${idea}
`
          }
        ],

        temperature: 0.8
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error(data);

    throw new Error(
      data.error?.message ||
      "AI Director request failed."
    );
  }

  let raw =
    data.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error(
      "AI Director returned an empty response."
    );
  }

  raw = String(raw).trim();

  raw = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let result;

  try {
    result = JSON.parse(raw);
  } catch (error) {
    console.error(
      "Invalid Director JSON:",
      raw
    );

    throw new Error(
      "AI Director returned invalid JSON. Try again."
    );
  }

  if (
    !result.title ||
    !result.hook ||
    !result.voiceover ||
    !Array.isArray(result.beats) ||
    result.beats.length === 0
  ) {
    throw new Error(
      "AI Director returned an incomplete production plan."
    );
  }

  return result;
}

/* AI DIRECTOR PLAN */

app.post(
  "/api/generate",
  async (req, res) => {
    try {
      const {
        idea,
        duration = "30 sec",
        style = "Cinematic",
        language = "English"
      } = req.body || {};

      if (!idea || !String(idea).trim()) {
        return res.status(400).json({
          error: "Please provide a video idea."
        });
      }

      console.log(
        `Generating plan: ${idea}`
      );

      const result =
        await generateDirector({
          idea: String(idea).trim(),
          duration,
          style,
          language
        });

      res.json(result);

    } catch (error) {
      console.error(
        "Generate error:",
        error
      );

      res.status(500).json({
        error:
          error.message ||
          "Could not generate the Short plan."
      });
    }
  }
);


/* STATIC VIDEO OUTPUTS */

app.use(
  "/outputs",
  express.static(outputDir)
);


/* FULL VIDEO GENERATION */

app.post(
  "/api/create-video",
  async (req, res) => {
    try {
      const {
        idea,
        duration = "30 sec",
        style = "Cinematic",
        language = "English"
      } = req.body || {};

      if (!idea || !String(idea).trim()) {
        return res.status(400).json({
          error: "Please provide a video idea."
        });
      }

      console.log("");
      console.log("================================");
      console.log("CREATOR AI VIDEO GENERATION");
      console.log("================================");

      /* STEP 1 */

      console.log(
        "1/4 AI Director planning..."
      );

      const result =
        await generateDirector({
          idea: String(idea).trim(),
          duration,
          style,
          language
        });

      /* STEP 2 */

      console.log(
        "2/4 Creating natural voice..."
      );

      const timestamp = Date.now();

      const voiceFile =
        path.join(
          outputDir,
          `voice-${timestamp}.wav`
        );

      const voiceText =
        result.voiceover ||
        (
          Array.isArray(result.scenes)
            ? result.scenes
                .map(scene => scene.voiceover || "")
                .filter(Boolean)
                .join(" ")
            : ""
        );

      if (!voiceText.trim()) {
        throw new Error(
          "AI Director returned no voiceover."
        );
      }

      await createVoice(
        voiceText,
        voiceFile,
        language
      );

      if (!fs.existsSync(voiceFile)) {
        throw new Error(
          "Voiceover file was not created."
        );
      }

      /* STEP 3 */

      console.log(
        "3/4 Preparing real visuals..."
      );

      const visualDir =
        path.join(
          outputDir,
          `visuals-${timestamp}`
        );

      fs.mkdirSync(
        visualDir,
        { recursive: true }
      );

      // Director V2 returns visual beats.
      // Keep compatibility with the older scenes format.
      const rawVisuals =
        Array.isArray(result.beats)
          ? result.beats
          : Array.isArray(result.scenes)
            ? result.scenes
            : [];

      const directorScenes =
        rawVisuals
          .map((item, index) => ({
            ...item,
            visual:
              item.visual ||
              item.visual_prompt ||
              item.image_prompt ||
              item.description ||
              item.shot ||
              item.scene ||
              ""
          }))
          .filter(
            scene =>
              scene &&
              typeof scene.visual === "string" &&
              scene.visual.trim()
          );

      if (directorScenes.length === 0) {
        console.error(
          "Director result received:",
          JSON.stringify(result, null, 2)
        );

        throw new Error(
          "AI Director returned no usable visual beats."
        );
      }

      console.log(
        `Director created ${directorScenes.length} visual scenes.`
      );

      const images = [];

      for (
        let i = 0;
        i < directorScenes.length;
        i++
      ) {
        const scene =
          directorScenes[i];

        const image =
          path.join(
            visualDir,
            `scene${i + 1}.jpg`
          );

        const query =
          scene.visual.trim();

        console.log(
          `Visual ${i + 1}/${directorScenes.length}: ${query}`
        );

        await fetchWebImage(
          query,
          image
        );

        if (!fs.existsSync(image)) {
          throw new Error(
            `Visual ${i + 1} was not created.`
          );
        }

        images.push(image);
      }

      /* STEP 4 */

      console.log(
        "4/4 Rendering final MP4..."
      );

      const durationSeconds =
        parseInt(
          String(duration).replace(/\D/g, ""),
          10
        ) || 30;

      const videoFile =
        path.join(
          outputDir,
          `creator-ai-${timestamp}.mp4`
        );

      await createVideo({
        images,
        audio: voiceFile,
        output: videoFile,
        duration: durationSeconds
      });

      if (!fs.existsSync(videoFile)) {
        throw new Error(
          "Final video was not created."
        );
      }

      console.log(
        "VIDEO COMPLETE:",
        videoFile
      );

      res.json({
        ...result,
        videoUrl:
          `/outputs/${path.basename(videoFile)}`
      });

    } catch (error) {
      console.error(
        "Video generation error:",
        error
      );

      res.status(500).json({
        error:
          error.message ||
          "Could not create the video."
      });
    }
  }
);
const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Creator AI backend running on http://localhost:${PORT}`);
});
