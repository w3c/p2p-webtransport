async function test() {
  const hostname = "foo.com";
  const port = 1234;
  const quic = new QuicTransport(hostname, port);
  quic.onstatechange = (evt) => {
    console.log("quic.onstatechange: " + quic.state);
  };

  let receiveStream = null;
  quic.onreceivestream = (evt) => {
    console.log("Received stream (as expected).");
    receiveStream = evt.stream;
  }; 

  // Test datagram support.
  let acked = await quic.sendDatagram(new Uint8Array([1, 2, 3, 4]));
  console.assert(acked, "Datagram is should be acked.");
  quic.sendDatagram(new Uint8Array([5, 6]));
  console.assert(quic._datagramBufferedAmount == 2,
                 "Should have buffered 2 datagrams");
  quic.readyToSendDatagram().then(() => {
     console.log("Ready to send datagram (as expected)");
  });
  let datagrams = await quic.receiveDatagrams();
  console.assert(datagrams.length == 2,
                 "Should have received 2 datagrams");

  // This doesn't resolve until we send a datagram.
  quic.receiveDatagrams().then((datagrams) => {
    console.assert(datagrams.length == 1,
                   "Should have received 1 datagram");
  });
  let receivedDatagramsFailed = false;
  try {
    await quic.receiveDatagrams();
  } catch(e) {
    receivedDatagramsFailed = true;
  }
  console.assert(receivedDatagramsFailed,
                 "receiveDatagrams() should have failed");
  quic.sendDatagram(new Uint8Array([1, 2, 3]));

  // Test basic stream support.
  const sendStream = await quic.createSendStream({disableRetransmissions: true});
  console.assert(sendStream.writable,
                 "sendStream should be writable.");
  let writeFailed = false;
  try {
    sendStream.write({data: new Uint8Array([]), finished: true});
  } catch(e) {
    writeFailed = true;
  }
  console.assert(writeFailed, "Write should have failed with empty params.");

  // Test that if we send more than can be buffered on read side
  // that it gets buffered to the write side.
  sendStream.write({data: new Uint8Array(4999)});
  // One byte write side, one byte read side.
  sendStream.write({data: new Uint8Array(2)});

  console.assert(receiveStream.readableAmount == 5000,
                 "Receive stream should have buffered max amount.");
  console.assert(sendStream.writeBufferedAmount == 1,
                 "Remaining 1 byte should be buffered write side.");

  // Writing again buffers more data.
  sendStream.write({data: new Uint8Array(5), finished: true });
  console.assert(receiveStream.readableAmount == 5000,
                 "Receive stream should have buffered max amount.");
  console.assert(sendStream.writeBufferedAmount = 6,
                 "QuicSendSteram should have 6 bytes buffered.");

  // Reading should trigger the rest of the buffered write data to
  // be written over.
  let readBuffer = new Uint8Array(10);
  let readAmount = receiveStream.readInto(readBuffer).amount;
  console.assert(readAmount == 10, "Should read all data.");
  console.assert(sendStream.writeBufferedAmount == 0,
                 "No data should be write buffered.");
  console.assert(sendStream.writable == false, "FIN is written");

  let writingAborted = false;
  receiveStream.abortReading();
  await sendStream.writingAborted.then(() => {
    writingAborted = true;
  });
  console.assert(writingAborted, "Writing should have been aborted.");

  let readingAborted = false;
  sendStream.abortWriting();
  await receiveStream.readingAborted.then(() => {
    readingAborted = true;
  });
  console.assert(readingAborted, "Reading should have been aborted.");

  writeFailed = false;
  try {
    sendStream.write({data: new Uint8Array([5, 0, 0])});
  } catch(e) {
    writeFailed = true;
  }
  console.assert(writeFailed, "Write should have failed.");

  console.assert(quic.state == "connected");
  quic.stop();

  let sendStreamFailed = false;
  try {
    await quic.createSendStream();
  } catch(e) {
    sendStreamFailed = true;
  }
  console.assert(sendStreamFailed, "createSendStream() should have failed.");

  let sendDatagramFailed = false;
  try {
    await quic.sendDatagram(toUint8Array("foo"));
  } catch(e) {
    sendDatagramFailed = true;
  }
  console.assert(sendDatagramFailed, "sendDatagram() should have failed.");

  let readyToSendDatagramFailed = false;
  try {
    await quic.readyToSendDatagram();
  } catch(e) {
    readyToSendDatagramFailed = true;
  }
  console.assert(readyToSendDatagramFailed, "readyToSendDatagram() should've failed.");

  console.assert(quic.state == "closed");
}

test();
