const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); 
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '_' + file.originalname;
    cb(null, uniqueSuffix);
  }
});

// Initialize upload middleware
const upload = multer({ storage: storage });

const app = express();
const port = process.env.PORT || 3500;

// Serve static files from "public" directory
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Path to the JSON file
const dataFilePath = path.join(__dirname, 'lost_found_data.json');
const usersFilePath = path.join(__dirname, 'users.json');
const commentsFilePath = path.join(__dirname, 'itemComments.json');

function readUsers() {
  try {
    const raw = fs.readFileSync(usersFilePath, 'utf8');
    console.log("✅ User file loaded:", usersFilePath);
    return JSON.parse(raw); // returns { users: [...] }
  } catch (err) {
    console.error('❌ Error reading users file:', err.message);
    return { users: [] };
  }
}

function writeUsers(data) {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(data, null, 2));
    console.log("✅ Users file updated:", usersFilePath);
  } catch (err) {
    console.error('❌ Error writing users file:', err.message);
  }
}

// Read data from JSON file
function readData() {
  try {
    const raw = fs.readFileSync(dataFilePath, 'utf8');
    console.log("✅ JSON file loaded:", dataFilePath);
    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ Error reading data file:', err.message);
    return { items: [] };
  }
}

function readcomments() {
  try {
    const raw = fs.readFileSync(commentsFilePath, 'utf8');
    console.log("✅ JSON file loaded:", commentsFilePath);
    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ Error reading data file:', err.message);
    return { itemcomments: [] };
  }
}

// Write data to JSON file
function writeData(data) {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
    console.log("✅ JSON file updated:", dataFilePath);
  } catch (err) {
    console.error('❌ Error writing data file:', err.message);
  }
}

app.get('/api/users', (req, res) => {
  const data = readUsers();
  res.json({ users: data.users }); // wrapped in an object
});

app.get('/api/comments', (req, res) => {
  const data = readcomments();
  res.json({ itemcomments: data.itemcomments }); // wrapped in an object
});



app.post('/api/signup', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const data = readUsers();
  const existingUser = data.users.find(u => u.username === username);

  if (existingUser) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  // 🧠 Generate new userId
  let lastId = 0;
  if (data.users.length > 0) {
    const ids = data.users.map(u => parseInt(u.userId || "0", 10));
    lastId = Math.max(...ids);
  }
  const newUserId = lastId + 1;

  const newUser = {
    userId: newUserId.toString(), // Ensure it's a string
    username,
    password
  };

  data.users.push(newUser);
  writeUsers(data);

  res.status(201).json({
    message: `User "${username}" registered successfully`,
    userId: newUser.userId
  });
});

app.post('/api/addComment', (req, res) => {
  const { itemId, comment, reporterId } = req.body;

  if (!itemId || !comment || !reporterId) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  fs.readFile(commentsFilePath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ success: false, message: 'Error reading file' });

    let commentsData;
    try {
      commentsData = JSON.parse(data || '{}');
      if (!Array.isArray(commentsData.itemcomments)) {
        commentsData.itemcomments = [];
      }
    } catch {
      return res.status(500).json({ success: false, message: 'JSON parse error' });
    }

    // Determine next ID based on existing comments
    let nextId = 1;
    if (commentsData.itemcomments.length > 0) {
      const lastId = Math.max(...commentsData.itemcomments.map((c, i) => c.id ?? i + 1));
      nextId = lastId + 1;
    }

    const newComment = {
      id: nextId,
      itemId: parseInt(itemId),
      comment,
      reporterId: parseInt(reporterId)
    };

    commentsData.itemcomments.push(newComment);

    fs.writeFile(commentsFilePath, JSON.stringify(commentsData, null, 2), (err) => {
      if (err) return res.status(500).json({ success: false, message: 'Error writing file' });
      res.json({ success: true, comment: newComment });
    });
  });
});

// GET all items or filter by type
app.get('/api/items', (req, res) => {
  const type = req.query.type;
  const data = readData();

  if (type) {
    res.json({ items: data.items.filter(item => item.type === type) });
  } else {
    res.json({ items: data.items });
  }
});


app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const data = readUsers();        // full object
  const users = data.users;        // array inside

  const match = users.find(
    user => user.username === username && user.password === password
  );

  if (match) {
    // Include the userId in the response
    res.json({ 
      success: true, 
      message: 'Login successful',
      userId: match.userId // assuming the user object has an `id` field
    });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.post('/api/report-lost', upload.single('image'), (req, res) => {
  const data = readData();
  const lastId = data.items.length > 0 ? Math.max(...data.items.map(item => item.id)) : 0;
  const newItem = {
    id: lastId + 1,
    name: req.body.name,
    location: req.body.location,
    date: req.body.date,
    description: req.body.description,
    status: 'open',
    type: 'lost',
    reportedBy: req.body.username,
    image: req.file ? `/uploads/${req.file.filename}` : ''
  };

  data.items.push(newItem);
  writeData(data);
  res.json({ message: 'Item added', item: newItem });
});

app.post('/api/report-found', upload.single('image'), (req, res) => {
  const data = readData();
  const lastId = data.items.length > 0 ? Math.max(...data.items.map(item => item.id)) : 0;
  const newItem = {
    id: lastId + 1,
    name: req.body.name,
    location: req.body.location,
    date: req.body.date,
    description: req.body.description,
    status: 'unclaimed',
    type: 'found',
    reportedBy: req.body.username,
    image: req.file ? `/uploads/${req.file.filename}` : ''
  };

  data.items.push(newItem);
  writeData(data);
  res.json({ message: 'Item added', item: newItem });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// GET item by ID
app.get('/api/item/:id', (req, res) => {
  const data = readData();
  const item = data.items.find(i => i.id === parseInt(req.params.id));
  if (item) {
    res.json(item);
  } else {
    res.status(404).json({ error: 'Item not found' });
  }
});

// PUT update item by ID
app.put('/api/item/:id', (req, res) => {
  const data = readData();
  const index = data.items.findIndex(i => String(i.id) === req.params.id);

  if (index !== -1) {
    data.items[index] = { ...data.items[index], ...req.body };
    writeData(data);
    res.json({ message: 'Item updated', item: data.items[index] });
  } else {
    res.status(404).json({ error: 'Item not found' });
  }
});

// DELETE item by ID
app.delete('/api/item/:id', (req, res) => {
  const data = readData();
  const index = data.items.findIndex(i => i.id === parseInt(req.params.id));
  if (index !== -1) {
    const deleted = data.items.splice(index, 1);
    writeData(data);
    res.json({ message: 'Item deleted', item: deleted });
  } else {
    res.status(404).json({ error: 'Item not found' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(` Lost & Found server running at http://localhost:${port}`);
});
