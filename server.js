// server.js
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.db');

db.serialize(() => {
  db.run(`
	CREATE TABLE IF NOT EXISTS elements (
	  id INTEGER PRIMARY KEY AUTOINCREMENT,
	  x INTEGER NOT NULL,
	  y INTEGER NOT NULL,
	  color TEXT NOT NULL,
	  created_at INTEGER NOT NULL
	)
  `);
});

const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = ext === '.css' ? 'text/css' : 'text/html';
  fs.readFile(filePath, (err, content) => {
	if (err) {
	  res.writeHead(404);
	  res.end('File not found');
	} else {
	  res.writeHead(200, { 'Content-Type': contentType });
	  res.end(content);
	}
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('New client connected!');
  
  db.all('SELECT id, x, y, color, created_at FROM elements', (err, rows) => {
	if (err) {
	  console.error('Error fetching elements from database:', err);
	  return;
	}
	ws.send(JSON.stringify({ type: 'init', elements: rows }));
  });

  ws.on('message', (data) => {
	console.log('Received from client:', data);
	try {
	  const message = JSON.parse(data);
	  
	  if (message.type === 'add') {
		const { x, y, color, created_at } = message;
		
		db.run(
		  'INSERT INTO elements (x, y, color, created_at) VALUES (?, ?, ?, ?)',
		  [x, y, color, created_at],
		  function(err) {
			if (err) {
			  console.error('Error saving element to database:', err);
			  return;
			}
			
			const newElement = { 
			  type: 'add', 
			  id: this.lastID, 
			  x, 
			  y, 
			  color, 
			  created_at 
			};
			
			console.log('Element saved to database:', newElement);
			
			// Broadcast to all clients
			wss.clients.forEach((client) => {
			  if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify(newElement));
			  }
			});
		  }
		);
	  } else if (message.type === 'remove') {
		const { id } = message;
		
		// Only try to remove if we have a valid ID
		if (id) {
		  db.run('DELETE FROM elements WHERE id = ?', [id], (err) => {
			if (err) {
			  console.error('Error removing element from database:', err);
			  return;
			}
			
			console.log('Element removed from database:', { id });
			
			// Broadcast removal to all clients
			wss.clients.forEach((client) => {
			  if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify({ type: 'remove', id }));
			  }
			});
		  });
		}
	  }
	} catch (error) {
	  console.error('Error parsing client message:', error);
	}
  });

  ws.on('close', () => {
	console.log('Client disconnected');
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});