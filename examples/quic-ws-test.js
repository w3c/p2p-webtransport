async function testWebSocket(ws) {
  console.log(ws);
  ws.onopen = () => {
    console.log("onopen");
  };
  ws.onclosed = (evt) => {
    console.log("onclosed: ");
    console.log(evt);
  };
  ws.onerror = (evt) => {
    console.log("onerror: " + evt.message);
  };

  console.log("ws.readyState: " + ws.readyState);
  console.log("ws.binaryType: " + ws.binaryType);
  const msg1 = new Uint8Array([1, 2, 3, 4]);
  ws.onmessage = (evt) => {
    console.log("Received message: ");
    console.log(evt.data);
  }
  ws.send(msg1);
  console.log("ws.bufferedAmount: " + ws.bufferedAmount);  
  await sleep(100);
  ws.close(500, "We failed");

  console.log("ws.readyState: " + ws.readyState);
}

function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function test() {
  await testWebSocket(new QuicUnreliableDatagramWebSocket("datagram.us", 12345))
  await testWebSocket(new QuicUnreliableStreamWebSocket("stream.us", 54321))
}

test();
