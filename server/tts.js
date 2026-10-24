const { execFile } = require("child_process");

function generateSpeech(text) {
  return new Promise((resolve, reject) => {
    execFile(
      "termux-tts-speak",
      ["-r", "1.0", "-p", "1.0", text],
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      }
    );
  });
}

module.exports = {
  generateSpeech
};
