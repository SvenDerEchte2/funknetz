const buttons = document.querySelectorAll('button.name-btn');
const speakingIndicator = document.getElementById('speakingIndicator');

let localStream;
let peer;
let audioTrack;
const peers = new Map();

let currentName = null;
let micOn = false;
let keyDownHandled = false;

const channel = 'funknetz-names';

// NEU: Menge aller aktuell sprechenden Nutzer
const speakingUsers = new Set();

// Load reserved names
function loadUsedNames() {
  return JSON.parse(localStorage.getItem(channel) || '[]');
}

// Save reserved names
function saveUsedNames(names) {
  localStorage.setItem(channel, JSON.stringify(names));
}

// Try reserving a name
function reserveName(name) {
  const usedNames = loadUsedNames();
  if (usedNames.includes(name)) return false;
  usedNames.push(name);
  saveUsedNames(usedNames);
  return true;
}

// Release a name
function releaseName(name) {
  let usedNames = loadUsedNames();
  usedNames = usedNames.filter(n => n !== name);
  saveUsedNames(usedNames);
}

// Update button disabled state
function updateButtons() {
  const usedNames = loadUsedNames();
  buttons.forEach(btn => {
    if (usedNames.includes(btn.dataset.name) && btn.dataset.name !== currentName) {
      btn.disabled = true;
    } else {
      btn.disabled = false;
    }
  });
}

buttons.forEach(button => {
  button.addEventListener('click', async () => {
    if (currentName) {
      alert(`Du bist schon angemeldet als "${currentName}". Seite neu laden um zu wechseln.`);
      return;
    }

    const name = button.dataset.name;
    if (!reserveName(name)) {
      alert(`Der Name "${name}" ist bereits vergeben.`);
      updateButtons();
      return;
    }

    currentName = name;
    updateButtons();
    await joinFunknetz();
  });
});

async function joinFunknetz() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = false;

peer = new Peer(currentName, {
  host: "funknetz-c3a9.onrender.com",
  port: 443,
  path: "/funk",
  secure: true
});

    peer.on('open', () => {
      console.log('Peer offen mit ID:', currentName);
      connectToPeers();
    });

    peer.on('call', call => {
      console.log('Eingehender Anruf von:', call.peer);
      call.answer(localStream);
      setupCallEvents(call);
      peers.set(call.peer, call);
    });

    peer.on('connection', conn => {
      conn.on('data', onDataReceived);
    });

    peer.on('error', err => {
      console.error('PeerJS Fehler:', err);
      alert('Fehler: ' + err);
    });

    setupPushToTalk();

    window.addEventListener('beforeunload', () => {
      releaseName(currentName);
      updateButtons();
    });

  } catch (e) {
    alert('Mikrofonzugriff benötigt!');
    console.error(e);
  }
}

// Connect to all known peers
function connectToPeers() {
  const knownPeers = loadUsedNames();

  knownPeers.forEach(id => {
    if (id !== currentName && !peers.has(id)) {
      const call = peer.call(id, localStream);
      setupCallEvents(call);
      peers.set(id, call);

      // Verbindung für Datenkanal (für Status-Updates)
      const conn = peer.connect(id);
      conn.on('open', () => {
        conn.on('data', onDataReceived);
      });
      peers.set(id + '_conn', conn);
    }
  });
}

function setupCallEvents(call) {
  call.on('stream', remoteStream => {
    console.log('Remote Stream erhalten von', call.peer);
    let audioElem = document.getElementById('audio_' + call.peer);
    if (!audioElem) {
      audioElem = document.createElement('audio');
      audioElem.id = 'audio_' + call.peer;
      audioElem.autoplay = true;
      audioElem.style.display = 'none';
      document.body.appendChild(audioElem);
    }
    audioElem.srcObject = remoteStream;
  });

  call.on('close', () => {
    console.log('Anruf geschlossen:', call.peer);
    const audioElem = document.getElementById('audio_' + call.peer);
    if (audioElem) audioElem.remove();
    peers.delete(call.peer);
  });

  call.on('error', err => {
    console.error('Call Fehler:', err);
  });
}

// Daten empfangen – hier wird die Menge der Sprecher aktualisiert
function onDataReceived(data) {
  if (data.type === 'speakingStatus') {
    if (data.speaking) {
      speakingUsers.add(data.name);
    } else {
      speakingUsers.delete(data.name);
    }
    updateSpeakingIndicator();
  }
}

// NEU: Anzeige aller aktuellen Sprecher
function updateSpeakingIndicator() {
  if (speakingUsers.size > 0) {
    speakingIndicator.textContent = `🎤 Spreche(n): ${Array.from(speakingUsers).join(', ')}`;
    speakingIndicator.style.display = 'block';
  } else {
    speakingIndicator.style.display = 'none';
  }
}

function setupPushToTalk() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  let startBuffer, stopBuffer;

  async function loadSound(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return audioCtx.decodeAudioData(arrayBuffer);
  }

  loadSound('start.wav').then(buffer => startBuffer = buffer);
  loadSound('stop.wav').then(buffer => stopBuffer = buffer);

  function playSound(buffer) {
    if (!buffer) return;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
  }

  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !keyDownHandled && currentName) {
      keyDownHandled = true;
      if (audioTrack && !micOn) {
        playSound(startBuffer);
        audioTrack.enabled = true;
        micOn = true;
        console.log('PTT: Mikro an (Start-Sound)');
        sendSpeakingStatus(true);

        // NEU: eigenen Sprecherstatus setzen und Anzeige aktualisieren
        speakingUsers.add(currentName);
        updateSpeakingIndicator();
      }
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', e => {
    if (e.code === 'Space' && currentName) {
      if (audioTrack && micOn) {
        audioTrack.enabled = false;
        micOn = false;
        playSound(stopBuffer);
        console.log('PTT: Mikro aus (Stop-Sound)');
        sendSpeakingStatus(false);

        // NEU: eigenen Sprecherstatus entfernen und Anzeige aktualisieren
        speakingUsers.delete(currentName);
        updateSpeakingIndicator();
      }
      keyDownHandled = false;
      e.preventDefault();
    }
  });
}

// Sende Status an alle anderen Peers
function sendSpeakingStatus(isSpeaking) {
  peers.forEach((conn, key) => {
    if (key.endsWith('_conn') && conn.open) {
      try {
        conn.send({ type: 'speakingStatus', name: currentName, speaking: isSpeaking });
      } catch (e) {
        console.warn('Senden an', key, 'fehlgeschlagen', e);
      }
    }
  });
}

// Einfaches Drag & Drop für den sprechenden Text
(function makeDraggable(elem) {
  let posX = 0, posY = 0, mouseX = 0, mouseY = 0;

  elem.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    mouseX = e.clientX;
    mouseY = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    posX = mouseX - e.clientX;
    posY = mouseY - e.clientY;
    mouseX = e.clientX;
    mouseY = e.clientY;
    elem.style.top = (elem.offsetTop - posY) + "px";
    elem.style.left = (elem.offsetLeft - posX) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
})(speakingIndicator);
