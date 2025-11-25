<div align="center">
<img width="1200" height="475" alt="GHBanner" src="[https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6](https://i.imgur.com/0hSekFn.png)" />
</div>

# Bird Game 3

A 3D bird flying game built with React Three Fiber and Three.js.

## Run Locally

**Prerequisites:**  Node.js (v18 or higher)

1. Install dependencies:
   ```bash
   yarn install
   ```
2. Run the app:
   ```bash
   yarn dev
   ```

The application will be available at `http://localhost:3000`

## Building for Production

```bash
yarn build
```

The built files will be in the `dist` directory.

## Deploying to Vercel

### Option 1: Via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

### Option 2: Via Vercel Dashboard

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com)
3. Vercel will automatically detect the project settings from `vercel.json`
4. Deploy!

The project is configured with:
- Build Command: `yarn build`
- Output Directory: `dist`
- Install Command: `yarn install`

## Tech Stack

- React 18
- TypeScript
- Vite
- Three.js
- React Three Fiber
- React Three Drei
- Tailwind CSS
