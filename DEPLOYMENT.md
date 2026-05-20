# Free Deployment Guide

## Frontend: Vercel

1. Push this project to GitHub.
2. Go to Vercel.
3. Import the `client` folder as the frontend app.
4. Add environment variable:

```txt
VITE_SERVER_URL=https://YOUR-RENDER-SERVER.onrender.com
```

5. Deploy.

## Backend: Render

1. Go to Render.
2. New Web Service.
3. Select the GitHub repo.
4. Root directory:

```txt
server
```

5. Build command:

```bash
npm install
```

6. Start command:

```bash
npm start
```

7. Add environment variable:

```txt
CLIENT_ORIGIN=https://YOUR-VERCEL-APP.vercel.app
```

8. Deploy.

## Important note

Render free tier may sleep after inactivity. The first request after sleeping may take 30-60 seconds.
