<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# DT-ACIM Web

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1lGUC5spR0NK_dgpCr7ELisRTBu5CJeGE

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set SoCLaaS environment variables in `.env.local`:
   ```bash
   SOCLAAS_API_KEY="<your_soclaas_api_key>"
   SOCLAAS_URL="https://soclaas-api.comp.nus.edu.sg"
   SOCLAAS_MODEL="qwen3.5:9b"
   ```
3. Run with Vercel functions enabled:
   `npx vercel dev`

For production on Vercel, add the same variables under Project Settings -> Environment Variables. The SoCLaaS key must stay server-side; do not use `VITE_` for it.
