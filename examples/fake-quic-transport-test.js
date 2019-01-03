async function test() {
  const hostname = "foo.com";
  const port = 1234;
  const quic = new QuicTransport(hostname, port);
  quic.onstatechange = (evt) => {
    console.log("quic.onstatechange: " + quic.state)
  };
  quic.onreceivestream = (evt) => {
    console.log("quic.onreceivestream: " + evt.stream);
    let buffer = new Uint8Array(100);
    let read = evt.stream.readInto(buffer);
    console.log("Read into buffer: ");
    console.log(read);
    console.log(buffer.subarray(0, read.amount));
  }; 
  quic.ondatagramreceived = (evt) => {
    console.log("quic.ondatagramreceived: " + evt.data);
  };
  quic.sendDatagram(new Uint8Array([1, 2, 3, 4]));
  const stream0 = await quic.createSendStream({disableRetransmissions: true});
  console.log("stream0.writable: ");
  console.log(stream0.writable);
  try {
    stream0.write({data: new Uint8Array([]), finished: true});
  } catch(e) {
    console.log("Failed to write empty finished data (as expected)");
  }
  console.log("stream0.writable: ");
  console.log(stream0.writable);
  stream0.write({data: new Uint8Array([1, 2, 3, 4]), finished: true});
  console.log("stream0.writable: ");
  console.log(stream0.writable);
  try {
    stream0.write({data: new Uint8Array([5, 0, 0])});
  } catch(e) {
    console.log("Failed to write after finished (as expected)");
  }
  console.log("quic: ");
  console.log(quic);
  console.log("quic.state: ");
  console.log(quic.state);

  quic.stop();
  try {
    await quic.createSendStream();
  } catch(e) {
    console.log("Failed to create send stream (as expected)");
  }
  try {
    await quic.sendDatagram(toUint8Array("foo"));
  } catch(e) {
    console.log("Failed to send datagram (as expected)");
  }
  console.log("quic: ");
  console.log(quic);
  console.log("quic.state: ");
  console.log(quic.state);
}

test()
