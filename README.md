# Production Workspace demo

This is a React/Vite prototype using synthetic records and browser-local storage.
It includes a delivery dashboard, request effort estimates, file tasks, operator ranking,
an active timer with a guard against starting another timer, and related defect reports.
Role selection demonstrates interface behavior. Sign-in, shared data, live capacity and
forecast recalculation are outside this sample-data build.

## Try the deployment build

Unzip Localization_Tracking_Cloudflare_Pages_Demo.zip, then open index.html to test it offline.
To share a test link, upload that same ZIP with Cloudflare Pages Direct Upload. The ZIP has
index.html at its root and requires no build settings, service keys, or environment variables.

## Edit the source

From the extracted source directory, run npm ci and npm run dev. Run npm run build to build
the dist folder. You can also upload dist to Cloudflare Pages. Keep the test on synthetic data.

## Deploy to GitHub Pages

Publish from the main branch using the /docs folder in Settings > Pages. The
compiled demo is at docs/index.html. After editing the source, run npm run build
and replace docs/index.html and docs/assets with the contents of dist. Keep
docs/.nojekyll and commit the updated deployment files.
