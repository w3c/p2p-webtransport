async function testWebSocket(ws) {
  ws.binaryType = "uint8array";
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

  const msg1 = copyToArrayBuffer([1, 2, 3, 4]);
  ws.send(msg1);
  console.log("ws.bufferedAmount: " + ws.bufferedAmount);  

  const msg2 = copyToBlob(repeat([1, 2, 3, 4], 100));
  ws.send(msg2);
  console.log("ws.bufferedAmount: " + ws.bufferedAmount);  

  await sleep(10);  // Let that send happen before we close.
  ws.close(500, "We failed");
  console.log("ws.readyState: " + ws.readyState);
}


function* repeat(iterable, times) {
  for (let i = 0; i < times; i++) {
    yield* iterable;
  }
}

function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function test() {
  await testWebSocket(new QuicUnreliableDatagramWebSocket("datagram.us", 12345))
  await testWebSocket(new QuicUnreliableStreamWebSocket("stream.us", 54321))
}

test()
