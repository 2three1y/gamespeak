# GameSpeak

Pick or paste a game screenshot and hear its on-screen text bubbles, top to bottom. Built for VoiceOver and keyboards.

Live: https://2three1y.github.io/gamespeak/

## What it does
- Choose, paste (Control or Command plus V) or drop a screenshot.
- Finds the text, groups it into lines and bubbles, and reads it in order.
- Next line, previous line, repeat, read all, stop. Keys: N, P, R, A, Escape.
- Describe layout mode (key L): says how many text areas there are and where they sit, like "top right, small label, maybe a score" or "bottom center, dialogue box".
- Cleans OCR garbage like continue arrows, and turns ALL CAPS game text into normal sentences.
- Let VoiceOver read the lines instead of the speech voice.
- A built-in sample scene works in every browser.

## The honest gap
Reading text from a picture needs OCR. No browser OCR library (like Tesseract.js) is in the starred repos, so GameSpeak uses the browser's built-in text detector (the Shape Detection API's TextDetector). Most browsers, including iPhone Safari, don't ship it yet. Until they do, the sample works everywhere, and you can paste text from iPhone Live Text (Photos, then Copy All).

## Credits
Idea from GameOCRTTS by MrFlapstaart (AGPL-3.0). No code was copied, so GameSpeak is MIT. See CREDITS.md.

## License
MIT, Carter (2three1y).
