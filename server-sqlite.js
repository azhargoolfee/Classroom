import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'

const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('Connected to Supabase:', supabaseUrl)
console.log('Environment:', process.env.NODE_ENV || 'development')

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
app.post('/api/bootstrap/register', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  
  try {
    // Check if any users exist
    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
    
    if (count > 0) return res.status(400).json({ error: 'Already initialized' })
    
    const password_hash = bcrypt.hashSync(password, 10)
    const { data, error } = await supabase
      .from('users')
      .insert([{ email, password_hash }])
      .select()
      .single()
    
    if (error) throw error
    
    const token = signToken({ uid: data.id, email })
    return res.json({ token })
  } catch (error) {
    console.error('Bootstrap registration error:', error)
    return res.status(500).json({ error: 'Registration failed' })
  }
})

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()
    
    if (error || !user) return res.status(401).json({ error: 'Invalid credentials' })
    
    const ok = bcrypt.compareSync(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    
    const token = signToken({ uid: user.id, email: user.email })
    res.json({ token })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Students APIs
app.get('/api/students', auth, async (req, res) => {
  const uid = req.user.uid
  
  try {
    const { data: students, error } = await supabase
      .from('students')
      .select('*')
      .eq('owner_id', uid)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    const withHistory = await Promise.all(students.map(async (s) => {
      const { data: history } = await supabase
        .from('history')
        .select('t, points, reason')
        .eq('student_id', s.id)
        .order('t', { ascending: true })
        .limit(64)
      
      return { ...s, history: history || [] }
    }))
    
    res.json(withHistory)
  } catch (error) {
    console.error('Get students error:', error)
    res.status(500).json({ error: 'Failed to fetch students' })
  }
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
  const REWARD_THRESHOLD = 10
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


