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
app.use(express.static('.'))

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
      .from('app_users')
      .select('*', { count: 'exact', head: true })
    
    if (count > 0) return res.status(400).json({ error: 'Already initialized' })
    
    const password_hash = bcrypt.hashSync(password, 10)
    
    // Use service role key for bootstrap registration to bypass RLS
    const serviceSupabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey)
    
    const { data, error } = await serviceSupabase
      .from('app_users')
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
    // Use service role key for login to bypass RLS
    const serviceSupabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey)
    
    const { data: user, error } = await serviceSupabase
      .from('app_users')
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

app.post('/api/students', auth, async (req, res) => {
  const uid = req.user.uid
  const { name } = req.body || {}
  if (!name) return res.status(400).json({ error: 'Name required' })
  
  try {
    const { data: student, error } = await supabase
      .from('students')
      .insert([{ owner_id: uid, name, points: 0, rewards: 0 }])
      .select()
      .single()
    
    if (error) throw error
    
    // Add initial history entry
    await supabase
      .from('history')
      .insert([{ student_id: student.id, t: Date.now(), points: 0, reason: 'Student created' }])
    
    res.status(201).json({ ...student, history: [{ t: Date.now(), points: 0, reason: 'Student created' }] })
  } catch (error) {
    console.error('Create student error:', error)
    res.status(500).json({ error: 'Failed to create student' })
  }
})

app.delete('/api/students/:id', auth, async (req, res) => {
  const uid = req.user.uid
  const id = req.params.id
  
  try {
    // Check if student belongs to user
    const { data: student, error: checkError } = await supabase
      .from('students')
      .select('id')
      .eq('id', id)
      .eq('owner_id', uid)
      .single()
    
    if (checkError || !student) return res.status(404).json({ error: 'Not found' })
    
    // Delete student (history will be deleted automatically due to CASCADE)
    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    
    res.json({ ok: true })
  } catch (error) {
    console.error('Delete student error:', error)
    res.status(500).json({ error: 'Failed to delete student' })
  }
})

app.post('/api/students/:id/adjust', auth, async (req, res) => {
  const REWARD_THRESHOLD = 10
  const uid = req.user.uid
  const id = req.params.id
  const { delta, reason } = req.body || {}
  
  if (!Number.isInteger(delta) || Math.abs(delta) > 100000) {
    return res.status(400).json({ error: 'Invalid delta' })
  }
  
  try {
    // Get current student data
    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('*')
      .eq('id', id)
      .eq('owner_id', uid)
      .single()
    
    if (fetchError || !student) return res.status(404).json({ error: 'Not found' })
    
    const before = student.points
    let after = Math.max(0, before + delta)
    
    // Rewards calculation
    let rewards = student.rewards
    if (after >= REWARD_THRESHOLD && after > before) {
      const beforeRewards = Math.floor(before / REWARD_THRESHOLD)
      const afterRewards = Math.floor(after / REWARD_THRESHOLD)
      const newlyEarned = afterRewards - beforeRewards
      if (newlyEarned > 0) rewards += newlyEarned
    }
    
    // Update student
    const { data: updated, error: updateError } = await supabase
      .from('students')
      .update({ points: after, rewards })
      .eq('id', id)
      .select()
      .single()
    
    if (updateError) throw updateError
    
    // Add history entry
    await supabase
      .from('history')
      .insert([{ student_id: id, t: Date.now(), points: after % REWARD_THRESHOLD, reason: reason || 'Point adjustment' }])
    
    // Get updated history
    const { data: history } = await supabase
      .from('history')
      .select('t, points, reason')
      .eq('student_id', id)
      .order('t', { ascending: true })
      .limit(64)
    
    res.json({ ...updated, history: history || [] })
  } catch (error) {
    console.error('Adjust points error:', error)
    res.status(500).json({ error: 'Failed to adjust points' })
  }
})

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`Khadi's Classroom server running on http://localhost:${PORT}`)
})
