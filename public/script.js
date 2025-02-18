// public/script.js
const canvas = document.getElementById('touchCanvas');
const ctx = canvas.getContext('2d');
const ws = new WebSocket(`ws://${window.location.host}`);
const circleSize = 40;

function resizeCanvas() {
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  canvas.width = window.innerWidth * pixelRatio;
  canvas.height = window.innerHeight * pixelRatio;
  ctx.scale(pixelRatio, pixelRatio);
}

resizeCanvas();

const userColor = `hsl(${Math.random() * 360}, 100%, 70%)`;
let elements = [];
let animationFrameId = null;
let lastDrawTime = 0;
const FRAME_RATE = 30;
const FRAME_INTERVAL = 1000 / FRAME_RATE;

// Helper: Draw a circle with opacity based on age
function drawCircle(x, y, color, id, created_at, pending = false) {
  const now = Math.floor(Date.now() / 1000);
  const age = now - created_at;
  const lifespan = 1 * 60;
  const opacity = Math.max(0, 1 - age / lifespan);

  ctx.beginPath();
  ctx.arc(x, y, circleSize, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${color.split('(')[1].split(',')[0]}, 100%, 70%, ${opacity})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.stroke();

  // Only add to elements if not already present
  if (!elements.find(e => e.x === x && e.y === y && e.color === color)) {
	elements.push({ x, y, color, id, created_at, pending });
  }
}

function removeCircle(id) {
  elements = elements.filter((element) => element.id !== id);
  requestRedraw();
}

function requestRedraw() {
  if (!animationFrameId) {
	animationFrameId = requestAnimationFrame(redrawCanvas);
  }
}

function redrawCanvas(timestamp) {
  animationFrameId = null;

  if (timestamp - lastDrawTime < FRAME_INTERVAL) {
	requestRedraw();
	return;
  }

  const now = Math.floor(Date.now() / 1000);
  const lifespan = 1 * 60;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  elements = elements.filter((element) => {
	const age = now - element.created_at;
	if (age >= lifespan) return false;
	
	const opacity = Math.max(0, 1 - age / lifespan);
	ctx.beginPath();
	ctx.arc(element.x, element.y, circleSize, 0, Math.PI * 2);
	ctx.fillStyle = `hsla(${element.color.split('(')[1].split(',')[0]}, 100%, 70%, ${opacity})`;
	ctx.fill();
	ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
	ctx.stroke();
	return true;
  });

  lastDrawTime = timestamp;
  requestRedraw();
}

let inputTimeout;
function handleInput(event) {
  event.preventDefault();

  clearTimeout(inputTimeout);
  inputTimeout = setTimeout(() => {
	const { clientX, clientY } = event.touches ? event.touches[0] : event;

	const clickedElement = elements.find((element) => 
	  Math.abs(clientX - element.x) <= circleSize && 
	  Math.abs(clientY - element.y) <= circleSize
	);

	if (clickedElement) {
	  // Remove circle both locally and on server
	  removeCircle(clickedElement.id);
	  ws.send(JSON.stringify({ type: 'remove', id: clickedElement.id }));
	} else {
	  const created_at = Math.floor(Date.now() / 1000);
	  const newElement = { x: clientX, y: clientY, color: userColor, created_at };
	  
	  // Draw circle immediately but mark as pending
	  drawCircle(newElement.x, newElement.y, newElement.color, null, newElement.created_at, true);
	  ws.send(JSON.stringify({ type: 'add', ...newElement }));
	}
  }, 16);
}

canvas.addEventListener('mousedown', handleInput);
canvas.addEventListener('touchstart', handleInput);

ws.onmessage = async (message) => {
  try {
	const data = typeof message.data === 'string' 
	  ? JSON.parse(message.data)
	  : JSON.parse(await message.data.text());

	switch (data.type) {
	  case 'init':
		elements = [];
		data.elements.forEach(element => 
		  drawCircle(element.x, element.y, element.color, element.id, element.created_at)
		);
		break;
	  case 'add':
		// Update any pending element that matches or add new one
		const pendingElement = elements.find(
		  e => e.pending && e.x === data.x && e.y === data.y && e.color === data.color
		);
		if (pendingElement) {
		  pendingElement.id = data.id;
		  pendingElement.pending = false;
		} else {
		  drawCircle(data.x, data.y, data.color, data.id, data.created_at);
		}
		break;
	  case 'remove':
		removeCircle(data.id);
		break;
	}
  } catch (error) {
	console.error('WebSocket message error:', error);
  }
};

requestRedraw();