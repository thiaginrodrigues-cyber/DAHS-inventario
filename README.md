<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/eb1afb46-5a52-4c7a-b0c9-0f2b099c23ff

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Automatic deploy with GitHub Actions (Vercel)

This project is configured with a workflow in `.github/workflows/deploy-vercel.yml`.
Every push to `main` will:

1. install dependencies (`npm ci`)
2. run type checks (`npm run lint`)
3. run production build (`npm run build`)
4. deploy to Vercel production

### Required GitHub secrets

In your GitHub repository, go to **Settings > Secrets and variables > Actions** and create:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### How to get Vercel IDs

Run in your local project after logging in to Vercel:

`vercel link`

Then open `.vercel/project.json` to get:

- `orgId` -> `VERCEL_ORG_ID`
- `projectId` -> `VERCEL_PROJECT_ID`

## Automatic deploy with GitHub Actions (Firebase Hosting)

This project now also includes `.github/workflows/deploy-firebase.yml`.
Every push to `main` will validate the project and deploy to Firebase Hosting.

### Required GitHub secret for Firebase

In **Settings > Secrets and variables > Actions**, create:

- `FIREBASE_SERVICE_ACCOUNT`

Use the full JSON of a Google Cloud Service Account with Firebase Hosting deploy permissions for project `ai-studio-applet-webapp-673a1`.
