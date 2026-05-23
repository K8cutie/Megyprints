# Megy Prints — Album Builder Website

A pastel-themed online album-building website where customers can upload photos, choose templates, auto-generate album layouts, customize pages, and submit orders for printing.

---

## Quick Start (Docker — Recommended for Presentation)

### Option 1: Docker Compose (Easiest)

```bash
# Clone or extract the project, then:
docker compose up --build

# Open browser to http://localhost:3000
```

### Option 2: Docker Run

```bash
# Build the image
docker build -t megy-prints .

# Run the container
docker run -d -p 3000:80 --name megy-prints megy-prints

# Open browser to http://localhost:3000
```

### Option 3: Pre-built Image

If you have the pre-built image:

```bash
docker load -i megy-prints.tar

docker run -d -p 3000:80 --name megy-prints megy-prints
```

To save the image for sharing:
```bash
docker save megy-prints > megy-prints.tar
```

---

## Manual Development Setup

```bash
# Install dependencies
npm install --legacy-peer-deps

# Run dev server
npm run dev

# Build for production
npm run build
```

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Landing page with hero, features, how-it-works, templates preview, testimonials |
| Templates | `/#/templates` | Browse all 6 album templates with category filters |
| Builder | `/#/builder` | Core app — upload photos, pick template, edit album, preview |
| Order | `/#/order` | Select materials/size, see live price, submit order |
| About | `/#/about` | Business story, values, process timeline |
| Contact | `/#/contact` | Contact form, FAQ |

---

## Editing Pricing

Open `src/pages/Order.tsx` and edit the `PRICE_CONFIG` object:

```typescript
const PRICE_CONFIG = {
  basePrice: 500,
  materials: { matte: 0, glossy: 150, hardbound: 300, premium: 600 },
  sizes: { '8x8': 0, '8x10': 200, a4: 350 },
  perPagePrice: 15,
  extras: { goldFoil: 150, rushProcessing: 250 },
}
```

---

## Project Structure

```
src/
  components/     # Navbar, Footer, Layout (shared)
  pages/          # Home, Templates, Builder, Order, About, Contact
  builder/        # Builder sub-modules (types, state, auto-layout, etc.)
public/           # Generated images (album covers, materials, testimonials)
```

---

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v3 + shadcn/ui
- GSAP + Framer Motion (animations)
- Lucide React (icons)

---

## Stopping the Container

```bash
docker compose down

# Or if using docker run:
docker stop megy-prints && docker rm megy-prints
```

---

## Deploy to GitHub Pages (Free Hosting)

This app is ready to deploy to **GitHub Pages** for free. Follow these steps:

### 1. Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `megy-prints-album-builder`
3. Set to **Public**
4. Do NOT initialize with README
5. Click **Create repository**

### 2. Push the Code

```bash
# In the project folder:
git init
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/megy-prints-album-builder.git
git push -u origin main
```

### 3. Enable GitHub Pages

1. On your GitHub repo, click **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. The workflow (`.github/workflows/deploy.yml`) is already included — it will auto-deploy

### 4. Your Live URL

```
https://YOUR_USERNAME.github.io/megy-prints-album-builder/
```

**Every push to `main` automatically rebuilds and redeploys.**

---

## License

Private — Megy Prints Business Use
