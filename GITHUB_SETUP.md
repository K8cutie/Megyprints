# Deploying Megy Prints to GitHub Pages

This guide walks you through deploying the Megy Prints Album Builder to GitHub Pages for free hosting.

---

## Prerequisites

1. A **GitHub account** (free at [github.com](https://github.com))
2. **Git** installed on your computer

---

## Step 1: Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. **Repository name**: `megy-prints-album-builder`
3. Set to **Public** (required for free GitHub Pages)
4. Do NOT initialize with README, .gitignore, or license
5. Click **Create repository**

---

## Step 2: Push Your Code to GitHub

Open a terminal in the project folder and run:

```bash
# Initialize git (if not already done)
git init

# Add all files
git add -A

# Commit
git commit -m "Initial commit - Megy Prints Album Builder"

# Connect to your GitHub repo (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/megy-prints-album-builder.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** (top tab)
3. In the left sidebar, click **Pages**
4. Under **Source**, select **GitHub Actions**
5. That's it — the workflow file (`.github/workflows/deploy.yml`) is already in your repo

---

## Step 4: Automatic Deployment

Every time you push to the `main` branch, GitHub Actions will:
1. Install Node.js 20
2. Install npm dependencies
3. Build the project
4. Copy public assets (images, fabric.js) to dist
5. Deploy to GitHub Pages

**To trigger your first deployment:**
```bash
git push origin main
```

Then go to **Actions** tab in your GitHub repo to watch the build. After it completes (about 2-3 minutes), your site will be live.

---

## Your Live URL

After deployment, your site will be at:

```
https://YOUR_USERNAME.github.io/megy-prints-album-builder/
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Updating Your Site

Whenever you make changes:

```bash
git add -A
git commit -m "Your change description"
git push origin main
```

GitHub Actions will automatically rebuild and redeploy. Check the **Actions** tab to see the status.

---

## File Structure Reference

```
megy-prints-album-builder/
  .github/workflows/deploy.yml    # Auto-deploy workflow
  .gitignore                      # Files Git should ignore
  public/                         # Static assets (images, fabric.js)
    album-*.jpg                   # Theme cover images
    bg-*.jpg                      # Theme background textures
    fabric.min.js                 # Fabric.js canvas library
  src/                            # React source code
  index.html                      # Entry HTML
  vite.config.ts                  # Build config (base: './')
  package.json                    # Dependencies
```

---

## Troubleshooting

### Build fails in GitHub Actions
- Check the **Actions** tab for error logs
- Make sure `package-lock.json` is committed
- Verify Node.js 20 is specified in the workflow

### Site shows blank page
- Ensure `vite.config.ts` has `base: './'`
- Check that `fabric.min.js` is in `public/` folder
- Verify `public/` assets are being copied in the workflow

### Images not loading
- Theme images must be in `public/` folder (not `src/assets/`)
- References should be like `/album-wedding.jpg` not relative paths

### Changes not appearing
- GitHub Pages can take 1-2 minutes to update after deployment
- Clear browser cache and refresh
- Check the deployed commit hash in the Actions log

---

## Custom Domain (Optional)

If you want a custom domain (e.g., `albums.megyprints.com`):

1. In repo **Settings > Pages**, add your custom domain
2. Create a `CNAME` file in the `public/` folder with your domain
3. Configure DNS with your domain provider (A record to GitHub IPs)

Full guide: [docs.github.com/pages/configuring-a-custom-domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)

---

## Need Help?

If you get stuck:
1. Check the **Actions** tab in your GitHub repo for build errors
2. Open an issue on your GitHub repo with the error message
3. Make sure all files from this project are committed and pushed
