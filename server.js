import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'khadi.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// Migrations
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  rewards INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(owner_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  t INTEGER NOT NULL,
  points INTEGER NOT NULL,
  reason TEXT,
  FOREIGN KEY(student_id) REFERENCES students(id)
);
`)

const app = express()
app.use(cors())
app.use(express.json())

// Serve static frontend
app.use(express.static(__dirname))

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing token' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// Bootstrap: if no users, allow first-time registration
app.post('/api/bootstrap/register', (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c
  if (count > 0) return res.status(400).json({ error: 'Already initialized' })
  const password_hash = bcrypt.hashSync(password, 10)
  const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, password_hash)
  const token = signToken({ uid: info.lastInsertRowid, email })
  return res.json({ token })
})

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })
  const ok = bcrypt.compareSync(password, user.password_hash)
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
  const token = signToken({ uid: user.id, email: user.email })
  res.json({ token })
})

// Students APIs
app.get('/api/students', auth, (req, res) => {
  const uid = req.user.uid
  const students = db.prepare('SELECT * FROM students WHERE owner_id = ? ORDER BY id DESC').all(uid)
  const withHistory = students.map((s) => {
    const history = db.prepare('SELECT t, points, reason FROM history WHERE student_id = ? ORDER BY t ASC LIMIT 64').all(s.id)
    return { ...s, history }
  })
  res.json(withHistory)
})

app.post('/api/students', auth, (req, res) => {
  const uid = req.user.uid
  const { name } = req.body || {}
  if (!name) return res.status(400).json({ error: 'Name required' })
  const info = db.prepare('INSERT INTO students (owner_id, name, points, rewards) VALUES (?, ?, 0, 0)').run(uid, name)
  const studentId = info.lastInsertRowid
  db.prepare('INSERT INTO history (student_id, t, points, reason) VALUES (?, ?, ?, ?)').run(studentId, Date.now(), 0, 'Student created')
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId)
  res.status(201).json({ ...student, history: [{ t: Date.now(), points: 0, reason: 'Student created' }] })
})

app.delete('/api/students/:id', auth, (req, res) => {
  const uid = req.user.uid
  const id = Number(req.params.id)
  const s = db.prepare('SELECT * FROM students WHERE id = ? AND owner_id = ?').get(id, uid)
  if (!s) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM history WHERE student_id = ?').run(id)
  db.prepare('DELETE FROM students WHERE id = ?').run(id)
  res.json({ ok: true })
})

app.post('/api/students/:id/adjust', auth, (req, res) => {
  const REWARD_THRESHOLD = 1000
  const uid = req.user.uid
  const id = Number(req.params.id)
  const { delta, reason } = req.body || {}
  if (!Number.isInteger(delta) || Math.abs(delta) > 100000) {
    return res.status(400).json({ error: 'Invalid delta' })
  }
  const s = db.prepare('SELECT * FROM students WHERE id = ? AND owner_id = ?').get(id, uid)
  if (!s) return res.status(404).json({ error: 'Not found' })

  const before = s.points
  let after = Math.max(0, before + delta)

  // Rewards calculation
  let rewards = s.rewards
  if (after >= REWARD_THRESHOLD && after > before) {
    const beforeRewards = Math.floor(before / REWARD_THRESHOLD)
    const afterRewards = Math.floor(after / REWARD_THRESHOLD)
    const newlyEarned = afterRewards - beforeRewards
    if (newlyEarned > 0) rewards += newlyEarned
  }

  db.prepare('UPDATE students SET points = ?, rewards = ? WHERE id = ?').run(after, rewards, id)
  db.prepare('INSERT INTO history (student_id, t, points, reason) VALUES (?, ?, ?, ?)').run(id, Date.now(), after % REWARD_THRESHOLD, reason || 'Point adjustment')
  const updated = db.prepare('SELECT * FROM students WHERE id = ?').get(id)
  const history = db.prepare('SELECT t, points, reason FROM history WHERE student_id = ? ORDER BY t ASC LIMIT 64').all(id)
  res.json({ ...updated, history })
})

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`Khadi's Classroom server running on http://localhost:${PORT}`)
})


