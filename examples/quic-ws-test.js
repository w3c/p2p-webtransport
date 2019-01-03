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
  ws.onmessage = (evt) => {
    console.log("Received message: ");
    console.log(evt.data);
  }

  console.log("ws.readyState: " + ws.readyState);
  console.log("ws.binaryType: " + ws.binaryType);

  const msg1 = new Uint8Array([1, 2, 3, 4]);
  ws.send(msg1);
  console.log("ws.bufferedAmount: " + ws.bufferedAmount);  

  const msg2 = new Uint8Array(repeat([1, 2, 3, 4], 100));
  ws.send(msg2);
  console.log("ws.bufferedAmount: " + ws.bufferedAmount);  

  ws.close(500, "We failed");
  console.log("ws.readyState: " + ws.readyState);
}

testWebSocket(new QuicUnreliableDatagramWebSocket("datagram.us", 12345))
testWebSocket(new QuicUnreliableStreamWebSocket("stream.us", 54321))

function* repeat(iterable, times) {
  for (let i = 0; i < times; i++) {
    yield* iterable;
  }
}
