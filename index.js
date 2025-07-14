const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('./middleware/auth');
const roles = require('./middleware/roles');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const pool = require('./db');
const { v4: uuidv4 } = require('uuid');
const CHANNELS_FILE = path.join(__dirname, 'channels.json');

let chats = [];
function saveChannels() {
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(chats, null, 2));
}
function loadChannels() {
  if (fs.existsSync(CHANNELS_FILE)) {
    chats = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));
  }
}

// Load channels on server start
loadChannels();

dotenv.config();

console.log('Backend started, code version: 2024-07-09-3');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://sampleone.in',
    'https://www.sampleone.in'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Fix: Use express.json() for all routes except multipart
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route imports
const customerRoutes = require('./routes/customerRoutes');
const taskRoutes = require('./routes/taskRoutes');
const dealRoutes = require('./routes/dealRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const userRoutes = require('./routes/userRoutes');
const attachmentRoutes = require('./routes/attachmentRoutes');
const teamRoutes = require('./routes/teamRoutes');
const hrActivityRoutes = require('./routes/hrActivityRoutes');
const leadRoutes = require('./routes/leadRoutes');

// Auth logic (user model)
const { createUser, findUserByEmail, findUserById } = require('./models/User');

// ========== ROOT ==========
app.get('/', (req, res) => {
  res.send('CRM Backend is running');
});

// ========== AUTH ROUTES ==========
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }
  try {
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await createUser(name, email, hashedPassword, role);
    res.status(201).json({ message: 'User registered successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }
  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Add this endpoint:
app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const { id } = req.user;
    const user = await require('./models/User').findUserById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get user info' });
  }
});

// ========== CHAT ENDPOINTS (MUST BE BEFORE app.use('/api/users', ...) and app.use('/api/notifications', ...) ==========
const upload = multer({ dest: 'uploads/' });

// In-memory chat data for demo
let chatMessages = {};

// Middleware to check admin
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Admin only' });
}

// Middleware to check channel access
function requireChannelAccess(req, res, next) {
  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) return res.status(404).json({ success: false, message: 'Channel not found' });
  if (chat.type === 'channel' && (req.user.role === 'admin' || (chat.members && chat.members.includes(req.user.id)))) return next();
  if (chat.type === 'dm' && chat.members && chat.members.includes(req.user.id)) return next();
  return res.status(403).json({ success: false, message: 'Not a channel member' });
}

let onlineUsers = new Set();

// --- Socket.IO group call and membership enforcement ---
io.on('connection', (socket) => {
  // User presence: get userId from handshake query
  const userId = socket.handshake.query.userId;
  if (userId) {
    onlineUsers.add(userId);
    io.emit('userPresence', { userId, status: 'online', onlineUsers: Array.from(onlineUsers) });
  }

  // Enforce channel membership on join
  socket.on('join', (chatId) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat || (chat.type !== 'dm' && !chat.members?.includes(userId))) {
      socket.emit('error', 'Not a member of this channel');
      return;
    }
    socket.join(chatId);
    socket.emit('joined', chatId);
  });

  // Group call signaling events
  socket.on('call:join', ({ chatId }) => {
    socket.join(`call-${chatId}`);
    // Notify others in the call room
    socket.to(`call-${chatId}`).emit('call:user-joined', { userId });
  });
  socket.on('call:leave', ({ chatId }) => {
    socket.leave(`call-${chatId}`);
    socket.to(`call-${chatId}`).emit('call:user-left', { userId });
  });
  socket.on('call:signal', ({ chatId, to, data }) => {
    // Forward signaling data to the intended peer in the call room
    socket.to(`call-${chatId}`).emit('call:signal', { from: userId, to, data });
  });

  socket.on('disconnect', () => {
    if (userId) {
      onlineUsers.delete(userId);
      io.emit('userPresence', { userId, status: 'offline', onlineUsers: Array.from(onlineUsers) });
    }
  });
});

// Create channel (admin only)
app.post('/api/chats', auth, requireAdmin, (req, res) => {
  console.log('[CREATE CHANNEL] Headers:', req.headers);
  console.log('[CREATE CHANNEL] Body:', req.body);
  const { name, members = [] } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: 'Channel name is required.' });
  }
  const existing = chats.find(c => c.type === 'channel' && c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return res.status(409).json({ success: false, message: 'Channel with this name already exists.', data: existing });
  }
  let membersSet = new Set(members);
  membersSet.add(req.user.id); // Always add the creator/admin
  const id = uuidv4();
  const newChannel = { id, name, type: 'channel', lastMessage: '', unread: 0, locked: false, members: Array.from(membersSet) };
  chats.push(newChannel);
  chatMessages[id] = [];
  io.emit('channelCreated', newChannel);
  saveChannels();
  res.status(201).json({ success: true, data: newChannel });
});

// Lock/unlock channel (admin only)
app.post('/api/chats/:id/lock', auth, requireAdmin, (req, res) => {
  console.log('[LOCK/UNLOCK] Channel ID:', req.params.id, 'User:', req.user, 'Body:', req.body);
  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) return res.status(404).json({ success: false, message: 'Channel not found' });
  if (chat.type !== 'channel') {
    return res.status(400).json({ success: false, message: 'Cannot lock/unlock DMs' });
  }
  chat.locked = !!req.body.locked;
  // Emit channelLocked event
  io.emit('channelLocked', { id: chat.id, locked: chat.locked });
  saveChannels();
  res.json({ success: true, data: chat });
});

// Rename a channel (admin only)
app.put('/api/chats/:id/rename', auth, requireAdmin, async (req, res) => {
  const { name } = req.body;
  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) return res.status(404).json({ success: false, message: 'Channel not found' });
  chat.name = name;
  io.emit('channelRenamed', { id: chat.id, name });
  saveChannels();
  res.json({ success: true, data: chat });
});

// Leave a channel (any member can remove themselves)
app.put('/api/chats/:id/leave', auth, async (req, res) => {
  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) return res.status(404).json({ success: false, message: 'Channel not found' });
  chat.members = (chat.members || []).filter(id => id !== req.user.id);
  io.emit('channelMemberLeft', { id: chat.id, userId: req.user.id });
  io.to(chat.id).emit('channelMemberUpdated', { id: chat.id, members: chat.members });
  saveChannels();
  res.json({ success: true, data: chat });
});

// Get chat list (only channels user can see)
app.get('/api/chats', auth, (req, res) => {
  try {
    const visibleChats = chats.filter(c => c.type === 'dm' || c.members?.includes(req.user.id));
    res.json({ success: true, data: visibleChats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get chats' });
  }
});

// Get chat messages (only if user can see channel)
app.get('/api/chats/:id/messages', auth, requireChannelAccess, (req, res) => {
  try {
    const msgs = chatMessages[req.params.id] || [];
    res.json({ success: true, data: msgs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get messages' });
  }
});

// Send message (only if channel not locked or user is admin)
app.post('/api/chats/:id/messages', auth, requireChannelAccess, upload.array('attachments'), (req, res) => {
  try {
    const chat = chats.find(c => c.id === req.params.id);
    if (chat.locked && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Channel is locked' });
    }
    const { content } = req.body;
    const sender = req.user.name || 'User';
    const files = req.files || [];
    if (!content && files.length === 0) {
      return res.status(400).json({ success: false, message: 'Message content or attachment required.' });
    }
    const newMsg = {
      id: (chatMessages[req.params.id]?.length || 0) + 1,
      chatId: req.params.id,
      sender,
      message: content || '',
      timestamp: new Date().toISOString(),
      attachments: files.map(f => ({ filename: f.originalname, url: `/uploads/${f.filename}` }))
    };
    if (!chatMessages[req.params.id]) {
      chatMessages[req.params.id] = [];
    }
    chatMessages[req.params.id].push(newMsg);
    chat.lastMessage = content || (files[0] ? files[0].originalname : 'Attachment');
    chat.unread = (chat.unread || 0) + 1;
    // Emit new message to all clients in the chat room
    io.to(req.params.id).emit('newMessage', newMsg);
    res.status(201).json({ success: true, data: newMsg });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// Create DM channel if it doesn't exist
app.post('/api/chats/dm', auth, (req, res) => {
  const { userId, name } = req.body; // userId of the other participant
  const myId = req.user.id;
  const dmId = `dm-${[myId, userId].sort().join('-')}`;
  if (!chats.find(c => c.id === dmId)) {
    const newDM = {
      id: dmId,
      name: name || 'DM',
      type: 'dm',
      lastMessage: '',
      unread: 0,
      locked: false,
      members: [myId, userId]
    };
    chats.push(newDM);
    chatMessages[dmId] = [];
  }
  res.json({ success: true, id: dmId });
});

// Sidebar endpoint
app.get('/api/users/sidebar', (req, res) => {
  // Use the current userProfile for sidebar user info
  const initials = (userProfile.firstName && userProfile.lastName)
    ? userProfile.firstName[0] + userProfile.lastName[0]
    : (userProfile.firstName ? userProfile.firstName[0] : (userProfile.lastName ? userProfile.lastName[0] : 'U'));
  let name = '';
  if (userProfile.firstName && userProfile.lastName) {
    name = `${userProfile.firstName} ${userProfile.lastName}`;
  } else if (userProfile.firstName) {
    name = userProfile.firstName;
  } else if (userProfile.lastName) {
    name = userProfile.lastName;
  } else {
    name = 'User';
  }
  console.log('[GET] /api/users/sidebar userProfile:', userProfile);
  res.json({ success: true, data: {
    user: {
      name,
      email: userProfile.email || '',
      avatar: userProfile.avatar || '',
      initials,
      status: 'Active'
    },
    stats: { customers: 10, deals: 5, tasks: 8 }
  }});
});

// Notifications endpoint
app.get('/api/notifications', (req, res) => {
  res.json({ success: true, data: [
    { id: 1, message: 'New customer added', time: '2 minutes ago', read: false },
    { id: 2, message: 'Deal closed successfully', time: '1 hour ago', read: true }
  ]});
});

// ========== DUMMY DASHBOARD ENDPOINTS (MOVE ABOVE API ROUTES) ==========
app.get('/api/dashboard/stats', (req, res) => {
  res.json({ success: true, data: [
    { label: 'Customers', value: '10', change: '+5%', trend: 'up', icon: 'Users', color: 'bg-blue-500' },
    { label: 'Deals', value: '5', change: '-2%', trend: 'down', icon: 'DollarSign', color: 'bg-green-500' },
    { label: 'Tasks', value: '8', change: '+3%', trend: 'up', icon: 'CheckSquare', emoji: '✅', color: 'bg-purple-500' },
    { label: 'Meetings', value: '2', change: '0%', trend: 'up', icon: 'Calendar', emoji: '📅', color: 'bg-yellow-500' },
  ] });
});
app.get('/api/dashboard/activities', (req, res) => {
  res.json({ success: true, data: [
    { id: 1, type: 'deal', message: 'Deal closed', time: 'Today, 9:00 AM', icon: 'DollarSign' },
    { id: 2, type: 'task', message: 'Task completed', time: 'Yesterday, 3:00 PM', icon: 'CheckSquare' }
  ] });
});
let dashboardMeetings = [
  { id: 1, title: 'Kickoff', time: '10:00 AM', attendees: 3, icon: 'Calendar' },
  { id: 2, title: 'Review', time: '2:00 PM', attendees: 2, icon: 'Calendar' }
];
app.get('/api/dashboard/meetings', (req, res) => {
  res.json({ success: true, data: dashboardMeetings });
});
app.post('/api/dashboard/meetings', (req, res) => {
  const { title, time, attendees } = req.body;
  const newMeeting = {
    id: dashboardMeetings.length + 1,
    title,
    time,
    attendees,
    icon: 'Calendar'
  };
  dashboardMeetings.push(newMeeting);
  res.status(201).json({ success: true, data: newMeeting });
});
// ========== DUMMY VIDEO ENDPOINTS (FORCE CORRECT FIELDS) ==========
app.get('/api/video/meetings', (req, res) => {
  res.json({ success: true, data: [
    {
      id: 1,
      title: 'Team Sync',
      time: '2024-06-04T10:00:00Z',
      duration: '30m',
      attendees: ['John Doe', 'Jane Smith'],
      type: 'video'
    },
    {
      id: 2,
      title: 'Project Kickoff',
      time: '2024-06-05T14:00:00Z',
      duration: '1h',
      attendees: ['John Doe', 'Alice Brown'],
      type: 'video'
    }
  ] });
});
app.get('/api/video/calls', (req, res) => {
  res.json({ success: true, data: [
    {
      id: 1,
      name: 'Support Call',
      company: 'Acme Inc.',
      time: '2024-06-05T15:00:00Z',
      duration: '15m',
      type: 'audio'
    },
    {
      id: 2,
      name: 'Sales Demo',
      company: 'Beta Corp.',
      time: '2024-06-06T11:00:00Z',
      duration: '45m',
      type: 'video'
    }
  ] });
});
// ========== CALENDAR ENDPOINTS ==========
let calendarEvents = [
  { id: 1, title: 'Team Meeting', date: '2024-06-10', attendees: 5, description: 'Weekly team sync', startTime: '10:00', endTime: '11:00', type: 'meeting' },
  { id: 2, title: 'Client Call', date: '2024-06-12', attendees: 2, description: 'Product demo for client', startTime: '14:00', endTime: '15:00', type: 'call' },
  { id: 3, title: 'Project Review', date: '2024-06-15', attendees: 3, description: 'Q2 project review meeting', startTime: '09:00', endTime: '10:30', type: 'review' }
];

app.get('/api/calendar', (req, res) => {
  res.json({ success: true, data: calendarEvents });
});

app.post('/api/calendar', (req, res) => {
  const { title, date, attendees, description, startTime, endTime, type } = req.body;
  
  if (!title || !date) {
    return res.status(400).json({ success: false, message: 'Title and date are required' });
  }
  
  const newEvent = {
    id: calendarEvents.length + 1,
    title,
    date,
    attendees: attendees || 1,
    description: description || '',
    startTime: startTime || '09:00',
    endTime: endTime || '10:00',
    type: type || 'meeting'
  };
  
  calendarEvents.push(newEvent);
  res.status(201).json({ success: true, data: newEvent });
});

app.put('/api/calendar/:id', (req, res) => {
  const { id } = req.params;
  const { title, date, attendees, description, startTime, endTime, type } = req.body;
  
  const eventIndex = calendarEvents.findIndex(e => e.id === parseInt(id));
  if (eventIndex === -1) {
    return res.status(404).json({ success: false, message: 'Event not found' });
  }
  
  calendarEvents[eventIndex] = {
    ...calendarEvents[eventIndex],
    title: title || calendarEvents[eventIndex].title,
    date: date || calendarEvents[eventIndex].date,
    attendees: attendees || calendarEvents[eventIndex].attendees,
    description: description || calendarEvents[eventIndex].description,
    startTime: startTime || calendarEvents[eventIndex].startTime,
    endTime: endTime || calendarEvents[eventIndex].endTime,
    type: type || calendarEvents[eventIndex].type
  };
  
  res.json({ success: true, data: calendarEvents[eventIndex] });
});

app.delete('/api/calendar/:id', (req, res) => {
  const { id } = req.params;
  
  const eventIndex = calendarEvents.findIndex(e => e.id === parseInt(id));
  if (eventIndex === -1) {
    return res.status(404).json({ success: false, message: 'Event not found' });
  }
  
  calendarEvents.splice(eventIndex, 1);
  res.json({ success: true, message: 'Event deleted successfully' });
});

app.get('/api/calendar/:id', (req, res) => {
  const { id } = req.params;
  
  const event = calendarEvents.find(e => e.id === parseInt(id));
  if (!event) {
    return res.status(404).json({ success: false, message: 'Event not found' });
  }
  
  res.json({ success: true, data: event });
});
// ========== ANALYTICS ENDPOINTS ==========
let analyticsData = {
  revenue: [
    { month: 'Jan', value: 45000 },
    { month: 'Feb', value: 52000 },
    { month: 'Mar', value: 48000 },
    { month: 'Apr', value: 61000 },
    { month: 'May', value: 55000 },
    { month: 'Jun', value: 67000 }
  ],
  customers: [
    { month: 'Jan', value: 120 },
    { month: 'Feb', value: 135 },
    { month: 'Mar', value: 142 },
    { month: 'Apr', value: 158 },
    { month: 'May', value: 165 },
    { month: 'Jun', value: 178 }
  ],
  deals: [
    { month: 'Jan', value: 15 },
    { month: 'Feb', value: 18 },
    { month: 'Mar', value: 22 },
    { month: 'Apr', value: 25 },
    { month: 'May', value: 28 },
    { month: 'Jun', value: 32 }
  ],
  tasks: [
    { month: 'Jan', value: 45 },
    { month: 'Feb', value: 52 },
    { month: 'Mar', value: 48 },
    { month: 'Apr', value: 61 },
    { month: 'May', value: 55 },
    { month: 'Jun', value: 67 }
  ]
};

let customMetrics = [
  { id: 1, name: 'Conversion Rate', value: 12.5, unit: '%', trend: 'up', change: '+2.1%', category: 'sales' },
  { id: 2, name: 'Customer Satisfaction', value: 4.8, unit: '/5', trend: 'up', change: '+0.2', category: 'service' },
  { id: 3, name: 'Average Deal Size', value: 8500, unit: '$', trend: 'down', change: '-5.2%', category: 'sales' },
  { id: 4, name: 'Response Time', value: 2.3, unit: 'hrs', trend: 'up', change: '+0.5hrs', category: 'service' }
];

app.get('/api/analytics', (req, res) => {
  res.json({ success: true, data: {
    revenue: analyticsData.revenue,
    customers: analyticsData.customers,
    deals: analyticsData.deals,
    tasks: analyticsData.tasks,
    customMetrics: customMetrics
  }});
});

app.get('/api/analytics/revenue', (req, res) => {
  res.json({ success: true, data: analyticsData.revenue });
});

app.get('/api/analytics/customers', (req, res) => {
  res.json({ success: true, data: analyticsData.customers });
});

app.get('/api/analytics/deals', (req, res) => {
  res.json({ success: true, data: analyticsData.deals });
});

app.get('/api/analytics/tasks', (req, res) => {
  res.json({ success: true, data: analyticsData.tasks });
});

app.get('/api/analytics/metrics', (req, res) => {
  res.json({ success: true, data: customMetrics });
});

app.post('/api/analytics/metrics', (req, res) => {
  const { name, value, unit, category } = req.body;
  
  if (!name || value === undefined || !unit || !category) {
    return res.status(400).json({ success: false, message: 'Name, value, unit, and category are required' });
  }
  
  const newMetric = {
    id: customMetrics.length + 1,
    name,
    value: parseFloat(value),
    unit,
    trend: 'up',
    change: '+0%',
    category
  };
  
  customMetrics.push(newMetric);
  res.status(201).json({ success: true, data: newMetric });
});

app.put('/api/analytics/metrics/:id', (req, res) => {
  const { id } = req.params;
  const { name, value, unit, category, trend, change } = req.body;
  
  const metricIndex = customMetrics.findIndex(m => m.id === parseInt(id));
  if (metricIndex === -1) {
    return res.status(404).json({ success: false, message: 'Metric not found' });
  }
  
  customMetrics[metricIndex] = {
    ...customMetrics[metricIndex],
    name: name || customMetrics[metricIndex].name,
    value: value !== undefined ? parseFloat(value) : customMetrics[metricIndex].value,
    unit: unit || customMetrics[metricIndex].unit,
    category: category || customMetrics[metricIndex].category,
    trend: trend || customMetrics[metricIndex].trend,
    change: change || customMetrics[metricIndex].change
  };
  
  res.json({ success: true, data: customMetrics[metricIndex] });
});

app.delete('/api/analytics/metrics/:id', (req, res) => {
  const { id } = req.params;
  
  const metricIndex = customMetrics.findIndex(m => m.id === parseInt(id));
  if (metricIndex === -1) {
    return res.status(404).json({ success: false, message: 'Metric not found' });
  }
  
  customMetrics.splice(metricIndex, 1);
  res.json({ success: true, message: 'Metric deleted successfully' });
});

app.post('/api/analytics/data', (req, res) => {
  const { type, month, value } = req.body;
  
  if (!type || !month || value === undefined) {
    return res.status(400).json({ success: false, message: 'Type, month, and value are required' });
  }
  
  if (!analyticsData[type]) {
    analyticsData[type] = [];
  }
  
  const existingIndex = analyticsData[type].findIndex(item => item.month === month);
  if (existingIndex !== -1) {
    analyticsData[type][existingIndex].value = parseFloat(value);
  } else {
    analyticsData[type].push({ month, value: parseFloat(value) });
  }
  
  res.status(201).json({ success: true, data: analyticsData[type] });
});

// ========== DUMMY VIDEO ACTION ENDPOINTS ==========
app.post('/api/video/start', (req, res) => {
  res.json({ success: true, message: 'Instant meeting started!', meeting: {
    id: 3,
    title: 'Instant Meeting',
    time: new Date().toISOString(),
    duration: '30m',
    attendees: ['You'],
    type: 'video'
  }});
});
app.post('/api/video/schedule', (req, res) => {
  res.json({ success: true, message: 'Meeting scheduled!', meeting: {
    id: 4,
    title: 'Scheduled Meeting',
    time: new Date(Date.now() + 3600000).toISOString(),
    duration: '1h',
    attendees: ['You', 'Jane Smith'],
    type: 'video'
  }});
});
app.post('/api/video/join', (req, res) => {
  res.json({ success: true, message: 'Joined meeting!', meeting: {
    id: 1,
    title: 'Team Sync',
    time: '2024-06-04T10:00:00Z',
    duration: '30m',
    attendees: ['You', 'Jane Smith'],
    type: 'video'
  }});
});
app.post('/api/video/meetings/join', (req, res) => {
  const { id } = req.body;
  res.json({ success: true, message: `Joined meeting ${id}!`, meeting: { id, title: `Meeting ${id}`, time: new Date().toISOString(), duration: '30m', attendees: ['You'], type: 'video' }});
});

// ========== SETTINGS PAGE ENDPOINTS ==========
let userProfile = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: '+1234567890',
  title: 'Product Manager',
  avatar: ''
};
let userNotificationPrefs = {
  email: ['New messages', 'Meeting reminders'],
  push: ['Chat messages', 'Calendar events']
};

app.get('/api/users/profile', auth, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    // Map DB fields to profile fields as needed
    const profile = {
      firstName: user.first_name || user.name?.split(' ')[0] || '',
      lastName: user.last_name || user.name?.split(' ')[1] || '',
      email: user.email || '',
      phone: user.phone || '',
      title: user.title || user.role || '',
      avatar: user.avatar || '',
      role: user.role || '',
    };
    res.json({ success: true, data: profile });
  } catch (err) {
    console.error('[ERROR] /api/users/profile', err);
    res.status(500).json({ success: false, message: 'Failed to get user profile' });
  }
});

app.put('/api/users/profile', (req, res) => {
  try {
    userProfile = { ...userProfile, ...req.body };
    const profile = {
      firstName: userProfile.firstName || '',
      lastName: userProfile.lastName || '',
      email: userProfile.email || '',
      phone: userProfile.phone || '',
      title: userProfile.title || '',
      avatar: userProfile.avatar || ''
    };
    console.log('[PUT] /api/users/profile updated:', profile);
    res.json({ success: true, data: profile });
  } catch (err) {
    console.error('[ERROR] /api/users/profile PUT', err);
    res.status(500).json({ success: false, message: 'Failed to update user profile' });
  }
});

app.get('/api/users/notifications', (req, res) => {
  try {
    console.log('[GET] /api/users/notifications', userNotificationPrefs);
    // Defensive: always return both arrays
    const prefs = {
      email: Array.isArray(userNotificationPrefs.email) ? userNotificationPrefs.email : [],
      push: Array.isArray(userNotificationPrefs.push) ? userNotificationPrefs.push : []
    };
    res.json({ success: true, data: prefs });
  } catch (err) {
    console.error('[ERROR] /api/users/notifications', err);
    res.status(500).json({ success: false, message: 'Failed to get notification prefs' });
  }
});

app.put('/api/users/notifications', (req, res) => {
  try {
    userNotificationPrefs = { ...userNotificationPrefs, ...req.body };
    const prefs = {
      email: Array.isArray(userNotificationPrefs.email) ? userNotificationPrefs.email : [],
      push: Array.isArray(userNotificationPrefs.push) ? userNotificationPrefs.push : []
    };
    console.log('[PUT] /api/users/notifications updated:', prefs);
    res.json({ success: true, data: prefs });
  } catch (err) {
    console.error('[ERROR] /api/users/notifications PUT', err);
    res.status(500).json({ success: false, message: 'Failed to update notification prefs' });
  }
});

// Avatar upload endpoint
app.post('/api/users/profile/avatar', upload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    // Save the file path in userProfile.avatar
    userProfile.avatar = `/uploads/${req.file.filename}`;
    res.json({ success: true, avatar: userProfile.avatar });
  } catch (err) {
    console.error('[ERROR] /api/users/profile/avatar', err);
    res.status(500).json({ success: false, message: 'Failed to upload avatar' });
  }
});

// Add/remove members to channel (admin only)
app.put('/api/chats/:id/members', auth, requireAdmin, (req, res) => {
  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) return res.status(404).json({ success: false, message: 'Channel not found' });
  let changed = false;
  if (req.body.add) {
    if (!chat.members.includes(req.body.add)) {
      chat.members.push(req.body.add);
      changed = true;
      console.log(`[CHANNEL] Added member ${req.body.add} to channel ${chat.id}`);
    } else {
      // Already present, but still emit for UI update
      console.log(`[CHANNEL] Member ${req.body.add} already in channel ${chat.id}`);
      changed = true;
    }
  }
  if (req.body.remove) {
    const idx = chat.members.indexOf(req.body.remove);
    if (idx !== -1) {
      chat.members.splice(idx, 1);
      changed = true;
      io.emit('channelMemberLeft', { id: chat.id, userId: req.body.remove });
    }
  }
  if (changed) {
    io.to(chat.id).emit('channelMemberUpdated', { id: chat.id, members: chat.members });
    saveChannels();
  }
  res.json({ success: true, data: chat });
});

// ========== API ROUTES ==========
app.use('/api/customers', customerRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/hr-activities', hrActivityRoutes);
app.use('/api/leads', leadRoutes);

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// ========== DOCUMENTATION ENDPOINTS ==========
const docsUpload = multer({ dest: 'uploads/docs/' });
// After uploadsDir is created:
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const docsDir = path.join(uploadsDir, 'docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}
const docsMetaPath = path.join(docsDir, 'docsMeta.json');
if (!fs.existsSync(docsMetaPath)) {
  fs.writeFileSync(docsMetaPath, '{}');
}

// Helper to read/write metadata
function getDocsMeta() {
  return JSON.parse(fs.readFileSync(docsMetaPath, 'utf-8'));
}
function saveDocsMeta(meta) {
  fs.writeFileSync(docsMetaPath, JSON.stringify(meta, null, 2));
}

// Upload a documentation file (admin only)
app.post('/api/docs/upload', auth, requireAdmin, docsUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  const { description = '' } = req.body;
  const meta = getDocsMeta();
  meta[req.file.filename] = {
    originalname: req.file.originalname,
    description,
    uploadDate: new Date().toISOString()
  };
  saveDocsMeta(meta);
  res.json({ success: true, file: req.file.filename, originalname: req.file.originalname });
});

// List all documentation files with metadata
app.get('/api/docs', auth, (req, res) => {
  fs.readdir(docsDir, (err, files) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to list docs' });
    const meta = getDocsMeta();
    // Exclude docsMeta.json from files
    const filtered = files.filter(f => f !== 'docsMeta.json');
    const fileList = filtered.map(filename => ({
      filename,
      originalname: meta[filename]?.originalname || filename,
      description: meta[filename]?.description || '',
      uploadDate: meta[filename]?.uploadDate || ''
    }));
    res.json({ success: true, files: fileList });
  });
});

// Download a documentation file
app.get('/api/docs/:filename', auth, (req, res) => {
  const filePath = path.join(docsDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }
  res.download(filePath);
});

// Defensive DELETE endpoint for docs
app.delete(['/api/docs/:filename', '/api/docs/:filename/'], auth, requireAdmin, (req, res) => {
  const filePath = path.join(docsDir, req.params.filename);
  console.log('Trying to delete:', filePath, fs.existsSync(filePath));
  let meta;
  try {
    meta = getDocsMeta();
  } catch (e) {
    meta = {};
  }
  // Remove file if it exists
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to delete file' });
    }
  }
  // Remove metadata entry if it exists
  if (meta && meta[req.params.filename]) {
    delete meta[req.params.filename];
    try {
      saveDocsMeta(meta);
    } catch (e) {
      // Ignore save error, still return success
    }
  }
  // Always return success, even if nothing was deleted
  return res.json({ success: true });
});
// Edit (update) documentation file description (admin only)
app.put('/api/docs/:filename', auth, requireAdmin, (req, res) => {
  const { description } = req.body;
  const meta = getDocsMeta();
  if (!meta[req.params.filename]) {
    return res.status(404).json({ success: false, message: 'File not found in metadata' });
  }
  meta[req.params.filename].description = description || '';
  saveDocsMeta(meta);
  res.json({ success: true, description: meta[req.params.filename].description });
});

// ========== DESIGNER GROUP CHAT & STATUS ENDPOINTS (PERSISTENT + REAL-TIME) ==========
const designerChatId = 'designer-group';
const designerUploadsDir = path.join(uploadsDir, 'designer');
if (!fs.existsSync(designerUploadsDir)) {
  fs.mkdirSync(designerUploadsDir, { recursive: true });
}
const designerMessagesPath = path.join(designerUploadsDir, 'designerMessages.json');
const designerStatusesPath = path.join(designerUploadsDir, 'designerStatuses.json');
let designerMessages = [];
let designerStatuses = {};
// Load from disk on startup
if (fs.existsSync(designerMessagesPath)) {
  try { designerMessages = JSON.parse(fs.readFileSync(designerMessagesPath, 'utf-8')); } catch {}
}
if (fs.existsSync(designerStatusesPath)) {
  try { designerStatuses = JSON.parse(fs.readFileSync(designerStatusesPath, 'utf-8')); } catch {}
}
function saveDesignerMessages() {
  fs.writeFileSync(designerMessagesPath, JSON.stringify(designerMessages, null, 2));
}
function saveDesignerStatuses() {
  fs.writeFileSync(designerStatusesPath, JSON.stringify(designerStatuses, null, 2));
}
const designerUpload = multer({ dest: designerUploadsDir });

function requireDesignerOrAdmin(req, res, next) {
  if (req.user && (req.user.role === 'designer' || req.user.role === 'admin')) return next();
  return res.status(403).json({ success: false, message: 'Designer/Admin only' });
}

// Get designer chat messages
app.get('/api/designer/messages', auth, requireDesignerOrAdmin, (req, res) => {
  res.json({ success: true, data: designerMessages });
});
// Post a designer chat message (with optional attachment)
app.post('/api/designer/messages', auth, requireDesignerOrAdmin, designerUpload.array('attachments'), (req, res) => {
  const { content } = req.body;
  const files = req.files || [];
  if (!content && files.length === 0) {
    return res.status(400).json({ success: false, message: 'Message content or attachment required.' });
  }
  const newMsg = {
    id: designerMessages.length + 1,
    sender: req.user.name || 'Designer',
    userId: req.user.id,
    message: content || '',
    timestamp: new Date().toISOString(),
    attachments: files.map(f => ({ filename: f.originalname, url: `/uploads/designer/${f.filename}` }))
  };
  designerMessages.push(newMsg);
  saveDesignerMessages();
  io.emit('designerMessage', newMsg);
  res.status(201).json({ success: true, data: newMsg });
});
// Get designer work statuses
app.get('/api/designer/statuses', auth, requireDesignerOrAdmin, (req, res) => {
  res.json({ success: true, data: designerStatuses });
});
// Update own work status
app.post('/api/designer/status', auth, requireDesignerOrAdmin, (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ success: false, message: 'Status required' });
  designerStatuses[req.user.id] = {
    name: req.user.name,
    status,
    updated: new Date().toISOString()
  };
  saveDesignerStatuses();
  io.emit('designerStatus', { userId: req.user.id, ...designerStatuses[req.user.id] });
  res.json({ success: true, data: designerStatuses[req.user.id] });
});
// Socket.IO for real-time designer chat/status
io.on('connection', (socket) => {
  // ... existing user presence code ...
  socket.on('designerMessage', (msg) => {
    // Broadcast to all except sender
    socket.broadcast.emit('designerMessage', msg);
  });
  socket.on('designerStatus', (status) => {
    socket.broadcast.emit('designerStatus', status);
  });
});

// ========== MULTI-PROJECT BACKEND (Website, GMB, Digital Marketing) ==========
const PROJECT_LIST = [
  { id: 'website', name: 'Website' },
  { id: 'gmb', name: 'GMB' },
  { id: 'digital-marketing', name: 'Digital Marketing' }
];
const projectsDir = path.join(uploadsDir, 'projects');
if (!fs.existsSync(projectsDir)) {
  fs.mkdirSync(projectsDir, { recursive: true });
}
function getProjectDataPath(projectId, type) {
  return path.join(projectsDir, `${projectId}-${type}.json`);
}
function loadProjectData(projectId, type, fallback) {
  const p = getProjectDataPath(projectId, type);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
  }
  return fallback;
}
function saveProjectData(projectId, type, data) {
  fs.writeFileSync(getProjectDataPath(projectId, type), JSON.stringify(data, null, 2));
}
const projectUpload = multer({ dest: projectsDir });

// Get all projects
app.get('/api/projects', auth, (req, res) => {
  res.json({ success: true, data: PROJECT_LIST });
});
// Get/set client details for a project
app.get('/api/projects/:id/client', auth, (req, res) => {
  const data = loadProjectData(req.params.id, 'client', {});
  res.json({ success: true, data });
});
app.post('/api/projects/:id/client', auth, (req, res) => {
  const { company, clientName, email, phone, requirements } = req.body;
  const data = { company, clientName, email, phone, requirements };
  saveProjectData(req.params.id, 'client', data);
  // Log activity
  logProjectActivity(req.params.id, 'edit', req.user?.name, 'Edited client details');
  res.json({ success: true, data });
});
// Upload/download files for a project
app.post('/api/projects/:id/files', auth, projectUpload.array('files'), (req, res) => {
  const files = req.files || [];
  let fileList = loadProjectData(req.params.id, 'files', []);
  files.forEach(f => {
    fileList.push({ filename: f.originalname, url: `/uploads/projects/${f.filename}`, uploaded: new Date().toISOString() });
    // Log activity for each file
    logProjectActivity(req.params.id, 'file', req.user?.name, `Uploaded file: ${f.originalname}`);
  });
  saveProjectData(req.params.id, 'files', fileList);
  res.json({ success: true, files: fileList });
});
app.get('/api/projects/:id/files', auth, (req, res) => {
  const fileList = loadProjectData(req.params.id, 'files', []);
  res.json({ success: true, files: fileList });
});
app.get('/api/projects/:id/files/:filename', auth, (req, res) => {
  const filePath = path.join(projectsDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }
  res.download(filePath);
});
// Get/set project status
app.get('/api/projects/:id/status', auth, (req, res) => {
  const status = loadProjectData(req.params.id, 'status', { status: '', updated: '' });
  res.json({ success: true, data: status });
});
app.post('/api/projects/:id/status', auth, (req, res) => {
  const { status } = req.body;
  const data = { status, updated: new Date().toISOString() };
  saveProjectData(req.params.id, 'status', data);
  // Log activity
  logProjectActivity(req.params.id, 'status', req.user?.name, `Status changed to ${status}`);
  io.emit('projectStatus', { projectId: req.params.id, ...data });
  res.json({ success: true, data });
});
// Project-specific chat (persistent + real-time)
app.get('/api/projects/:id/messages', auth, (req, res) => {
  const msgs = loadProjectData(req.params.id, 'messages', []);
  res.json({ success: true, data: msgs });
});
app.post('/api/projects/:id/messages', auth, projectUpload.array('attachments'), (req, res) => {
  const { content, sender = req.user.name } = req.body;
  const files = req.files || [];
  let msgs = loadProjectData(req.params.id, 'messages', []);
  const newMsg = {
    id: msgs.length + 1,
    sender,
    userId: req.user.id,
    message: content || '',
    timestamp: new Date().toISOString(),
    attachments: files.map(f => ({ filename: f.originalname, url: `/uploads/projects/${f.filename}` }))
  };
  msgs.push(newMsg);
  saveProjectData(req.params.id, 'messages', msgs);
  io.emit('projectMessage', { projectId: req.params.id, ...newMsg });
  // Log activity
  logProjectActivity(req.params.id, 'chat', req.user?.name, 'Sent a message in chat');
  res.status(201).json({ success: true, data: newMsg });
});
// Socket.IO for real-time project chat/status
io.on('connection', (socket) => {
  socket.on('projectMessage', (data) => {
    socket.broadcast.emit('projectMessage', data);
  });
  socket.on('projectStatus', (data) => {
    socket.broadcast.emit('projectStatus', data);
  });
});

// Add activity feed endpoints and logging helpers
app.get('/api/projects/:id/activity', auth, (req, res) => {
  const activity = loadProjectData(req.params.id, 'activity', []);
  res.json({ success: true, data: activity });
});
app.post('/api/projects/:id/activity', auth, (req, res) => {
  const { type, detail } = req.body;
  const user = req.user?.name || 'Unknown';
  const time = new Date().toISOString();
  let activity = loadProjectData(req.params.id, 'activity', []);
  const entry = { type, user, detail, time };
  activity.push(entry);
  saveProjectData(req.params.id, 'activity', activity);
  res.json({ success: true, data: entry });
});
function logProjectActivity(projectId, type, user, detail) {
  const time = new Date().toISOString();
  let activity = loadProjectData(projectId, 'activity', []);
  activity.push({ type, user, detail, time });
  saveProjectData(projectId, 'activity', activity);
}

// Helper to persist PROJECT_LIST to disk
const projectListPath = path.join(projectsDir, 'projectList.json');
function saveProjectList() {
  fs.writeFileSync(projectListPath, JSON.stringify(PROJECT_LIST, null, 2));
}
function loadProjectList() {
  if (fs.existsSync(projectListPath)) {
    try {
      const arr = JSON.parse(fs.readFileSync(projectListPath, 'utf-8'));
      if (Array.isArray(arr)) {
        PROJECT_LIST.length = 0;
        arr.forEach(p => PROJECT_LIST.push(p));
      }
    } catch {}
  }
}
// Load project list on startup
loadProjectList();
// Create a new project
app.post('/api/projects', auth, (req, res) => {
  const { id, name, description, incharge } = req.body;
  if (!id || !name) {
    return res.status(400).json({ success: false, message: 'Project id and name are required.' });
  }
  // Check for duplicate
  if (PROJECT_LIST.find(p => p.id === id)) {
    return res.status(400).json({ success: false, message: 'Project with this id already exists.' });
  }
  const newProject = { id, name, description, incharge };
  PROJECT_LIST.push(newProject);
  saveProjectList();
  // Initialize project data
  saveProjectData(id, 'client', { name: '', email: '', company: '', phone: '' });
  saveProjectData(id, 'files', []);
  saveProjectData(id, 'status', { status: '', updated: '' });
  saveProjectData(id, 'messages', []);
  saveProjectData(id, 'activity', []);
  res.json({ success: true, data: newProject });
});

// Multi-client support per project
app.get('/api/projects/:id/clients', auth, (req, res) => {
  console.log('GET /api/projects/:id/clients', req.params.id);
  const clients = loadProjectData(req.params.id, 'clients', []);
  res.json({ success: true, data: clients });
});
app.post('/api/projects/:id/clients', auth, (req, res) => {
  const clients = loadProjectData(req.params.id, 'clients', []);
  const newClient = { ...req.body, id: Date.now().toString() };
  clients.push(newClient);
  saveProjectData(req.params.id, 'clients', clients);
  res.json({ success: true, data: newClient });
});

// Edit (update) a client for a project
app.put('/api/projects/:id/clients/:clientId', auth, (req, res) => {
  const clients = loadProjectData(req.params.id, 'clients', []);
  const idx = clients.findIndex(c => c.id === req.params.clientId);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Client not found' });
  clients[idx] = { ...clients[idx], ...req.body };
  saveProjectData(req.params.id, 'clients', clients);
  res.json({ success: true, data: clients[idx] });
});
// Delete a client for a project
app.delete('/api/projects/:id/clients/:clientId', auth, (req, res) => {
  let clients = loadProjectData(req.params.id, 'clients', []);
  const idx = clients.findIndex(c => c.id === req.params.clientId);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Client not found' });
  const removed = clients.splice(idx, 1);
  saveProjectData(req.params.id, 'clients', clients);
  res.json({ success: true, data: removed[0] });
});

// ========== SERVER ==========
// --- ENVIRONMENT VARIABLES ---
// Use .env file or Render dashboard to set:
//   PORT, DATABASE_URL, JWT_SECRET, etc.
const PORT = process.env.PORT || 5000;

// List all unique user roles
app.get('/api/users/roles', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT DISTINCT role FROM users');
    const roles = rows.map(r => r.role);
    res.json({ roles });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch roles' });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Real staff performance analytics endpoint
app.get('/api/analytics/staff-performance', auth, async (req, res) => {
  try {
    const { role, project } = req.query;
    // Get all users (optionally filter by role)
    let userQuery = 'SELECT id, name, email, role FROM users';
    let userParams = [];
    if (role) {
      userQuery += ' WHERE role = $1';
      userParams.push(role);
    }
    const { rows: users } = await pool.query(userQuery, userParams);
    // Get all tasks (optionally filter by project)
    let taskQuery = 'SELECT * FROM tasks';
    let taskParams = [];
    if (project) {
      taskQuery += ' WHERE project_id = $1';
      taskParams.push(project);
    }
    const { rows: tasks } = await pool.query(taskQuery, taskParams);
    // Aggregate performance
    const staff = users.map(user => {
      const userTasks = tasks.filter(t => t.owner_id == user.id);
      const completedTasks = userTasks.filter(t => t.status === 'completed');
      const projectsHandled = [...new Set(userTasks.map(t => t.project_id))].filter(Boolean).length;
      // Last active: latest updated_at or due_date from user's tasks
      let lastActive = null;
      userTasks.forEach(t => {
        const dates = [t.updated_at, t.due_date, t.created_at].filter(Boolean).map(d => new Date(d));
        dates.forEach(d => {
          if (!lastActive || d > lastActive) lastActive = d;
        });
      });
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        tasksCompleted: completedTasks.length,
        projectsHandled,
        lastActive: lastActive ? lastActive.toISOString() : null
      };
    });
    res.json({ success: true, data: staff });
  } catch (err) {
    console.error('Staff analytics error:', err);
    res.status(500).json({ success: false, message: 'Failed to aggregate staff performance' });
  }
});

module.exports.io = io;