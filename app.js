// Khadi's Classroom - Points Manager
// Data model in localStorage:
// students: Array<{ id: string, name: string, points: number, rewards: number, history: Array<{ t: number, points: number }> }>

;(function () {
  const API_BASE = ''
  const STORAGE_KEY = 'khadis-classroom:v1:students'
  const REWARD_THRESHOLD = 1000

  /** @type {HTMLDivElement} */ const studentsList = document.getElementById('studentsList')
  /** @type {HTMLFormElement} */ const addStudentForm = document.getElementById('addStudentForm')
  /** @type {HTMLInputElement} */ const studentNameInput = document.getElementById('studentName')
  /** @type {HTMLTemplateElement} */ const studentCardTemplate = document.getElementById('studentCardTemplate')
  /** @type {HTMLDivElement} */ const toast = document.getElementById('toast')
  const totalStudentsEl = document.getElementById('totalStudents')
  const totalPointsEl = document.getElementById('totalPoints')
  const totalRewardsEl = document.getElementById('totalRewards')

  const rewardModal = document.getElementById('rewardModal')
  const rewardTitle = document.getElementById('rewardTitle')
  const rewardMessage = document.getElementById('rewardMessage')
  const modalOk = document.getElementById('modalOk')
  const closeModal = document.getElementById('closeModal')
  const loginLink = document.getElementById('loginLink')
  const logoutBtn = document.getElementById('logoutBtn')

  const reasonModal = document.getElementById('reasonModal')
  const reasonInput = document.getElementById('reasonInput')
  const reasonCancel = document.getElementById('reasonCancel')
  const reasonConfirm = document.getElementById('reasonConfirm')
  const closeReasonModal = document.getElementById('closeReasonModal')

  const historyModal = document.getElementById('historyModal')
  const historyList = document.getElementById('historyList')
  const closeHistoryModal = document.getElementById('closeHistoryModal')

  // Check if all required elements exist
  if (!reasonModal || !reasonInput || !reasonCancel || !reasonConfirm || !closeReasonModal) {
    console.error('Missing reason modal elements')
  }
  if (!historyModal || !historyList || !closeHistoryModal) {
    console.error('Missing history modal elements')
  }

  let pendingAdjustment = null

  const uid = () => Math.random().toString(36).slice(2, 10)

  function getToken() {
    return localStorage.getItem('kc:token')
  }

  function isAuthed() {
    return Boolean(getToken())
  }

  async function api(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {})
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(API_BASE + path, { ...options, headers })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`)
    return data
  }

  async function loadStudents() {
    if (!isAuthed()) {
      // Fallback to local storage for unauthenticated preview
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      } catch (e) {
        console.error('Failed to load students', e)
        return []
      }
    }
    return await api('/api/students')
  }

  async function saveStudents(students) {
    // Only used for unauthenticated preview mode
    localStorage.setItem(STORAGE_KEY, JSON.stringify(students))
  }

  function showToast(message) {
    toast.textContent = message
    toast.classList.add('show')
    setTimeout(() => toast.classList.remove('show'), 1600)
  }

  function showRewardModal(student) {
    rewardTitle.textContent = `Reward Unlocked! 🎉`
    rewardMessage.textContent = `${student.name} reached ${REWARD_THRESHOLD} points and earned a reward! 🏆`
    rewardModal.classList.remove('hidden')
  }

  function syncAuthUI() {
    if (loginLink && logoutBtn) {
      if (isAuthed()) {
        loginLink.style.display = 'none'
        logoutBtn.style.display = ''
      } else {
        loginLink.style.display = ''
        logoutBtn.style.display = 'none'
      }
    }
  }

  function hideRewardModal() {
    rewardModal.classList.add('hidden')
  }

  function showReasonModal(studentId, delta) {
    if (!reasonModal || !reasonInput) {
      console.error('Reason modal elements not found')
      return
    }
    pendingAdjustment = { studentId, delta }
    reasonInput.value = ''
    reasonModal.classList.remove('hidden')
    reasonInput.focus()
  }

  function hideReasonModal() {
    if (!reasonModal) return
    reasonModal.classList.add('hidden')
    pendingAdjustment = null
  }

  function showHistoryModal(student) {
    if (!historyModal || !historyList) {
      console.error('History modal elements not found')
      return
    }
    historyList.innerHTML = ''
    const history = student.history || []
    
    if (history.length === 0) {
      historyList.innerHTML = '<p style="text-align: center; color: var(--muted);">No history yet</p>'
    } else {
      history.forEach((entry, index) => {
        const item = document.createElement('div')
        item.className = 'history-item'
        
        const prevPoints = index > 0 ? history[index - 1].points : 0
        const change = entry.points - prevPoints
        const changeText = change > 0 ? `+${change}` : change < 0 ? `${change}` : '0'
        
        item.innerHTML = `
          <div>
            <div class="history-points">${entry.points} pts</div>
            <div class="history-reason">${entry.reason || 'No reason given'}</div>
          </div>
          <div>
            <div class="history-points">${changeText}</div>
            <div class="history-time">${new Date(entry.t).toLocaleString()}</div>
          </div>
        `
        historyList.appendChild(item)
      })
    }
    
    historyModal.classList.remove('hidden')
  }

  function hideHistoryModal() {
    if (!historyModal) return
    historyModal.classList.add('hidden')
  }

  async function render() {
    const students = await loadStudents()
    // Totals
    totalStudentsEl.textContent = String(students.length)
    totalPointsEl.textContent = String(students.reduce((acc, s) => acc + (s.points % REWARD_THRESHOLD), 0))
    totalRewardsEl.textContent = String(students.reduce((acc, s) => acc + (s.rewards || 0), 0))

    studentsList.innerHTML = ''
    for (const s of students) {
      const node = /** @type {HTMLElement} */ (studentCardTemplate.content.firstElementChild.cloneNode(true))
      node.dataset.id = s.id
      node.querySelector('.name').textContent = s.name
      node.querySelector('.points strong').textContent = String(s.points % REWARD_THRESHOLD)
      node.querySelector('.rewards').textContent = `🏆 ${s.rewards || 0}`

      const pct = Math.min(100, ((s.points % REWARD_THRESHOLD) / REWARD_THRESHOLD) * 100)
      node.querySelector('.progress-fill').style.width = pct + '%'
      node.querySelector('.progress-text').textContent = `${s.points % REWARD_THRESHOLD} / ${REWARD_THRESHOLD}`

      const canvas = node.querySelector('canvas.sparkline')
      drawSparkline(canvas, s.history || [])

      node.addEventListener('click', async (ev) => {
        const btn = ev.target
        if (!(btn instanceof HTMLElement)) return
        const action = btn.dataset.action
        if (!action) return
        
        if (action.startsWith('inc')) {
          const delta = action === 'inc-5' ? 5 : action === 'inc-2' ? 2 : 1
          showReasonModal(s.id, delta)
        } else if (action.startsWith('dec')) {
          const delta = action === 'dec-5' ? -5 : action === 'dec-2' ? -2 : -1
          showReasonModal(s.id, delta)
        } else if (action === 'delete') {
          const sure = confirm(`Remove ${s.name}? This cannot be undone.`)
          if (!sure) return
          await removeStudent(s.id)
          showToast(`Removed ${s.name}`)
          await render()
        }
      })

      // Add click handler for sparkline to show history
      canvas.addEventListener('click', () => showHistoryModal(s))

      studentsList.appendChild(node)
    }
  }

  async function addStudent(name) {
    if (isAuthed()) {
      await api('/api/students', { method: 'POST', body: JSON.stringify({ name }) })
      showToast(`Added ${name}`)
      return render()
    }
    const students = await loadStudents()
    const exists = students.some((s) => s.name.toLowerCase() === name.toLowerCase())
    const student = {
      id: uid(),
      name: exists ? `${name} ${Math.floor(Math.random() * 90) + 10}` : name,
      points: 0,
      rewards: 0,
      history: [{ t: Date.now(), points: 0, reason: 'Student created' }],
    }
    students.push(student)
    await saveStudents(students)
    render()
    showToast(`Added ${student.name}`)
  }

  async function adjustPoints(studentId, delta, reason = 'Point adjustment') {
    if (isAuthed()) {
      const updated = await api(`/api/students/${studentId}/adjust`, { method: 'POST', body: JSON.stringify({ delta, reason }) })
      if (updated && updated.rewards) {
        const beforePct = (updated.points - delta) % REWARD_THRESHOLD
        const afterPct = updated.points % REWARD_THRESHOLD
        if (afterPct < beforePct && delta > 0) {
          showRewardModal(updated)
        }
      }
      return render()
    }
    const students = await loadStudents()
    const idx = students.findIndex((s) => s.id === studentId)
    if (idx === -1) return
    const s = students[idx]

    const before = s.points
    let after = Math.max(0, before + delta)

    // Track rewards for every threshold crossed upward
    if (after >= REWARD_THRESHOLD && after > before) {
      const beforeRewards = Math.floor(before / REWARD_THRESHOLD)
      const afterRewards = Math.floor(after / REWARD_THRESHOLD)
      const newlyEarned = afterRewards - beforeRewards
      if (newlyEarned > 0) {
        s.rewards = (s.rewards || 0) + newlyEarned
        showRewardModal(s)
      }
    }

    s.points = after
    s.history = (s.history || []).concat({ t: Date.now(), points: s.points % REWARD_THRESHOLD, reason })
    students[idx] = s
    await saveStudents(students)
    render()
  }

  async function removeStudent(studentId) {
    if (isAuthed()) {
      await api(`/api/students/${studentId}`, { method: 'DELETE' })
      return
    }
    const students = await loadStudents()
    const remaining = students.filter((s) => s.id !== studentId)
    await saveStudents(remaining)
  }

  function drawSparkline(canvas, history) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // axes-free sparkline
    const data = history.slice(-32)
    const values = data.map((d) => d.points)
    const min = Math.min(0, ...values)
    const max = Math.max(100, ...values)
    const range = Math.max(1, max - min)
    const stepX = W / Math.max(1, data.length - 1)

    ctx.lineWidth = 2
    const gradient = ctx.createLinearGradient(0, 0, W, 0)
    gradient.addColorStop(0, '#1fe4a3')
    gradient.addColorStop(1, '#00b6b8')
    ctx.strokeStyle = gradient
    ctx.beginPath()
    data.forEach((d, i) => {
      const x = i * stepX
      const y = H - ((d.points - min) / range) * H
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // fill area
    const fillGrad = ctx.createLinearGradient(0, 0, 0, H)
    fillGrad.addColorStop(0, 'rgba(0,229,255,.25)')
    fillGrad.addColorStop(1, 'rgba(0,229,255,0)')
    ctx.lineTo(W, H)
    ctx.lineTo(0, H)
    ctx.closePath()
    ctx.fillStyle = fillGrad
    ctx.fill()
  }

  // Events
  addStudentForm.addEventListener('submit', (e) => {
    e.preventDefault()
    const name = studentNameInput.value.trim()
    if (!name) return
    addStudent(name)
    studentNameInput.value = ''
  })

  modalOk.addEventListener('click', hideRewardModal)
  closeModal.addEventListener('click', hideRewardModal)
  rewardModal.addEventListener('click', (e) => {
    if (e.target === rewardModal) hideRewardModal()
  })

  if (reasonConfirm) {
    reasonConfirm.addEventListener('click', async () => {
      if (!pendingAdjustment) return
      const reason = reasonInput.value.trim() || 'Point adjustment'
      hideReasonModal()
      await adjustPoints(pendingAdjustment.studentId, pendingAdjustment.delta, reason)
    })
  }

  if (reasonCancel) reasonCancel.addEventListener('click', hideReasonModal)
  if (closeReasonModal) closeReasonModal.addEventListener('click', hideReasonModal)
  if (reasonModal) {
    reasonModal.addEventListener('click', (e) => {
      if (e.target === reasonModal) hideReasonModal()
    })
  }

  if (reasonInput) {
    reasonInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        reasonConfirm?.click()
      }
    })
  }

  if (closeHistoryModal) closeHistoryModal.addEventListener('click', hideHistoryModal)
  if (historyModal) {
    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) hideHistoryModal()
    })
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('kc:token')
      showToast('Logged out')
      render()
      syncAuthUI()
      location.href = 'login.html'
    })
  }

  // Seed example students if empty in preview mode
  loadStudents().then((list) => {
    if (isAuthed() || list.length !== 0) return
    const seed = [
      { name: 'Aisha' },
      { name: 'Bilal' },
      { name: 'Zara' },
    ]
    const seeded = seed.map((s) => ({ id: uid(), name: s.name, points: 0, rewards: 0, history: [{ t: Date.now(), points: 0, reason: 'Student created' }] }))
    saveStudents(seeded)
  })

  syncAuthUI()
  render()
})()


