# Khadi's Classroom

Colorful classroom points tracker with optional backend for login and shared data.

## Quick start

1. Install Node.js 18+.
2. Install deps:
   ```bash
   npm install
   ```
3. Create a `.env` (optional):
   ```bash
   echo "JWT_SECRET=change-me-please" > .env
   ```
4. Start the server:
   ```bash
   npm run start
   ```
5. Open `http://localhost:3000/login.html` to bootstrap the first admin or login.

## Deploy

### Render (one-click-ish)

1. Push this folder to a Git repo (GitHub).
2. Create a new Web Service on Render.
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Environment: `PORT=3000`, `JWT_SECRET=<generate-strong-secret>`, optionally `DB_PATH=/var/data/khadi.db`
   - Add a persistent Disk (e.g., 1 GB) and mount it to `/var/data`.
3. After deploy, open `/login.html` to bootstrap the first admin.

### Railway (fast and simple)

1. `railway up` or create a new project from your GitHub repo.
2. Set variables: `PORT=3000`, `JWT_SECRET=<secret>`, `DB_PATH=/data/khadi.db`.
3. Add a volume mounted at `/data` so your SQLite DB persists.
4. Visit `/login.html` to bootstrap.

### Docker

Build and run locally with Docker:
```bash
docker build -t khadi-classroom .
docker run -it --rm -p 3000:3000 -e JWT_SECRET=change-me -e DB_PATH=/data/khadi.db -v $(pwd)/data:/data khadi-classroom
```


## Scripts

- `npm run start` – start Express + SQLite API and serve static frontend
- `npm run dev` – same but with auto-reload via nodemon

## API Overview

- `POST /api/bootstrap/register` – first-user registration (only works if no users exist)
- `POST /api/login` – email + password → `{ token }`
- `GET /api/students` – list students (auth)
- `POST /api/students` – `{ name }` add student (auth)
- `POST /api/students/:id/adjust` – `{ delta }` add/subtract points (auth)
- `DELETE /api/students/:id` – remove student (auth)

Reward threshold is 1000 points; crossing it increments the `rewards` counter and progress wraps modulo 1000.


