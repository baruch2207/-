# Use Ori's Simli face

The code you sent looks like the Face ID of Ori's face in Simli. A Face ID is not a password, so it is fine that it appeared in chat.

## What will change
- Save it on the server as Ori's face for Simli.
- The staff Simli test page will show Ori's face (made from his photo) instead of the sample face. The "sample face" warning will go away.
- Nothing is sent to Simli and nothing is charged until you press "▶ התחל סשן בדיקה" yourself.

## Not in this step
- Smoother, more natural speech and putting the live Ori on the main patient screen. That comes next, after you confirm Ori's face shows up.

## Technical details
- Store `SIMLI_FACE_ID` as a server secret. `resolveFaceId` already accepts UUIDs, so no code changes are needed.
- Check through `getSimliStatus` that `faceIdConfigured` is true. This makes no request to Simli.
- In roadmap.md, mark the Face ID task as done.
