const possibleEmojis = [
  '🐀','🐁','🐭','🐹','🐂','🐃','🐄','🐮','🐅','🐆','🐯','🐇','🐐','🐑','🐏','🐴',
  '🐎','🐱','🐈','🐰','🐓','🐔','🐤','🐣','🐥','🐦','🐧','🐘','🐩','🐕','🐷','🐖',
  '🐗','🐫','🐪','🐶','🐺','🐻','🐨','🐼','🐵','🙈','🙉','🙊','🐒','🐉','🐲','🐊',
  '🐍','🐢','🐸','🐋','🐳','🐬','🐙','🐟','🐠','🐡','🐚','🐌','🐛','🐜','🐝','🐞',
];
function randomEmoji() {
  var randomIndex = Math.floor(Math.random() * possibleEmojis.length);
  return possibleEmojis[randomIndex];
}

const emoji = randomEmoji();
const name = prompt("What's your name?");

// Generate random chat hash if needed
if (!location.hash) {
  location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const chatHash = location.hash.substring(1);

// TODO: Replace with your own channel ID
const drone = new ScaleDrone('JVoQlf5w3iv0HWNB');
const drone2 = new ScaleDrone('5VhpOmMNWH79aZcJ');
// Scaledrone room name needs to be prefixed with 'observable-'
const roomName = 'observable-' + chatHash;
// Scaledrone room used for signaling
let room;
let room2;

const configuration = {
  iceServers: [{
    url: 'stun:stun.l.google.com:19302'
  }]
};
// RTCPeerConnection
let pc;
// RTCDataChannel
let dataChannel;
// RTCPeerConnection
let pc2;
// RTCDataChannel
let dataChannel2;

// Wait for Scaledrone signalling server to connect
drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  room = drone.subscribe(roomName);
  room.on('open', error => {
    if (error) {
      return console.error(error);
    }
    console.log('Connected to signaling server');
  });
  // We're connected to the room and received an array of 'members'
  // connected to the room (including us). Signaling server is ready.
  room.on('members', members => {
    if (members.length >= 3) {
      console.log("client connection 1 was taken");
      // Wait for Scaledrone signalling server to connect
      drone2.on('open', error => {
        if (error) {
          return console.error(error);
        }
        room2 = drone2.subscribe(roomName);
        room2.on('open', error => {
          if (error) {
            return console.error(error);
          }
          console.log('Connected to signaling server');
        });
        // We're connected to the room and received an array of 'members'
        // connected to the room (including us). Signaling server is ready.
        room2.on('members', members => {
          if (members.length >= 3) {
            console.log("client connection 2 was taken");
            return;
          }
          // If we are the second user to connect to the room we will be creating the offer
          const isOfferer = members.length === 2;
          startWebRTC2(isOfferer);
        });
      });
      return;
    }
    // If we are the second user to connect to the room we will be creating the offer
    const isOfferer = members.length === 2;
    startWebRTC(isOfferer);
  });
});

// Send signaling data via Scaledrone
function sendSignalingMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}

// Send signaling data via Scaledrone
function sendSignalingMessage2(message) {
  drone2.publish({
    room2: roomName,
    message
  });
}

function startWebRTC(isOfferer) {
  console.log('Starting WebRTC in as', isOfferer ? 'offerer' : 'waiter');
  pc = new RTCPeerConnection(configuration);

  // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
  // message to the other peer through the signaling server
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendSignalingMessage({'candidate': event.candidate});
    }
  };


  if (isOfferer) {
    // If user is offerer let them create a negotiation offer and set up the data channel
    pc.onnegotiationneeded = () => {
      pc.createOffer(localDescCreated, error => console.error(error));
    }
    dataChannel = pc.createDataChannel('chat');
    setupDataChannel();
  } else {
    // If user is not the offerer let wait for a data channel
    pc.ondatachannel = event => {
      dataChannel = event.channel;
      setupDataChannel();
    }
  }

  startListentingToSignals();
}

function startWebRTC2(isOfferer) {
  console.log('Starting WebRTC in as', isOfferer ? 'offerer' : 'waiter');
  pc2 = new RTCPeerConnection(configuration);

  // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
  // message to the other peer through the signaling server
  pc2.onicecandidate = event => {
    if (event.candidate) {
      sendSignalingMessage2({'candidate': event.candidate});
    }
  };


  if (isOfferer) {
    // If user is offerer let them create a negotiation offer and set up the data channel
    pc2.onnegotiationneeded = () => {
      pc2.createOffer(localDescCreated2, error => console.error(error));
    }
    dataChannel2 = pc2.createDataChannel('chat');
    setupDataChannel2();
  } else {
    // If user is not the offerer let wait for a data channel
    pc2.ondatachannel = event => {
      dataChannel2 = event.channel;
      setupDataChannel2();
    }
  }

  startListentingToSignals2();
}

function startListentingToSignals() {
  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }
    if (message.sdp) {
      // This is called after receiving an offer or answer from another peer
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        console.log('pc.remoteDescription.type', pc.remoteDescription.type);
        // When receiving an offer lets answer it
        if (pc.remoteDescription.type === 'offer') {
          console.log('Answering offer');
          pc.createAnswer(localDescCreated, error => console.error(error));
        }
      }, error => console.error(error));
    } else if (message.candidate) {
      // Add the new ICE candidate to our connections remote description
      pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  });
}

function startListentingToSignals2() {
  // Listen to signaling data from Scaledrone
  room2.on('data', (message, client) => {
    // Message was sent by us
    if (client.id === drone2.clientId) {
      return;
    }
    if (message.sdp) {
      // This is called after receiving an offer or answer from another peer
      pc2.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        console.log('pc2.remoteDescription.type', pc2.remoteDescription.type);
        // When receiving an offer lets answer it
        if (pc2.remoteDescription.type === 'offer') {
          console.log('Answering offer');
          pc2.createAnswer(localDescCreated2, error => console.error(error));
        }
      }, error => console.error(error));
    } else if (message.candidate) {
      // Add the new ICE candidate to our connections remote description
      pc2.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  });
}

function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendSignalingMessage({'sdp': pc.localDescription}),
    error => console.error(error)
  );
}

function localDescCreated2(desc) {
  pc2.setLocalDescription(
    desc,
    () => sendSignalingMessage({'sdp': pc2.localDescription}),
    error => console.error(error)
  );
}

// Hook up data channel event handlers
function setupDataChannel() {
  checkDataChannelState();
  dataChannel.onopen = checkDataChannelState;
  dataChannel.onclose = checkDataChannelState;
  dataChannel.onmessage = event =>
    insertMessageToDOM(JSON.parse(event.data), false)
}

// Hook up data channel event handlers
function setupDataChannel2() {
  checkDataChannelState2();
  dataChannel2.onopen = checkDataChannelState2;
  dataChannel2.onclose = checkDataChannelState2;
  dataChannel2.onmessage = event =>
    insertMessageToDOM(JSON.parse(event.data), false)
}

function checkDataChannelState() {
  console.log('WebRTC channel 1 state is:', dataChannel.readyState);
  if (dataChannel.readyState === 'open') {
    insertMessageToDOM({content: 'WebRTC data channel 1 is now open'});
  }
}

function checkDataChannelState2() {
  console.log('WebRTC channel 2 state is:', dataChannel2.readyState);
  if (dataChannel2.readyState === 'open') {
    insertMessageToDOM({content: 'WebRTC data channel 2 is now open'});
  }
}

function insertMessageToDOM(options, isFromMe) {
  const template = document.querySelector('template[data-template="message"]');
  const nameEl = template.content.querySelector('.message__name');
  if (options.emoji || options.name) {
    nameEl.innerText = options.emoji + ' ' + options.name;
  }
  template.content.querySelector('.message__bubble').innerText = options.content;
  const clone = document.importNode(template.content, true);
  const messageEl = clone.querySelector('.message');
  if (isFromMe) {
    messageEl.classList.add('message--mine');
  } else {
    messageEl.classList.add('message--theirs');
  }

  const messagesEl = document.querySelector('.messages');
  messagesEl.appendChild(clone);

  // Scroll to bottom
  messagesEl.scrollTop = messagesEl.scrollHeight - messagesEl.clientHeight;
}

const form = document.querySelector('form');
form.addEventListener('submit', () => {
  const input = document.querySelector('input[type="text"]');
  const value = input.value;
  input.value = '';

  const data = {
    name,
    content: value,
    emoji,
  };
  if(typeof dataChannel !== "undefined"){
    dataChannel.send(JSON.stringify(data));
  }
  if(typeof dataChannel2 !== "undefined"){
    dataChannel2.send(JSON.stringify(data));
  }

  insertMessageToDOM(data, true);
});

insertMessageToDOM({content: 'Chat URL is ' + location.href});
