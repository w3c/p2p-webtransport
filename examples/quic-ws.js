// - Make sure MessageEvent.type is correct
// - Make sure onerror is being fired correctly
// - Fill in onmessage .origin, lastEventId, source, and ports?
// - Set the CloseEvent.code?
// - Set readyState to CLOSING = 2 at some point?
// - Send/receive/negotiate extensions/protocols?

class QuicWebSocketBase {
  constructor(hostname, port) {
    this._hostname = hostname;
    this._port = port;
    this._readyState = 0;
    this._binaryType = "uint8array";
    this.onopen = null;
    this.onerror = null;
    this.onclose = null;
    this.onmessage = null;

    this._quic = new QuicTransport(hostname, port);
    this._error = null;
    this._quic.onerror = (error) => {
      this._handleQuicError(error);
    };
    this._quic.onstatechange = () => {
      this._handleQuicStateChange();
    };
  }

  get url() {
    return "";  // Doesn't make sense if constructor takes hostname + port.
  }

  get readyState() {
    return this._readyState;
  }

  get extensions() {
    return "";
  }

  get protocol() {
    return "";
  }

  get binaryType() {
    return this._binaryType;
  }

  set binaryType(type) {
    if (type == "blob" || type == "arraybuffer" || type == "uint8array" || type == "string") {
      this._binaryType = type;
      return;
    }
    throw TypeError("binaryType must by blob, arraybuffer, or uint8array.");
  }

  close(code, reason) {
    this._quic.stop({
      errorCode: code,
      reason: reason
    });
  }

  _handleQuicMessageReceived(data) {
    if (!this.onmessage) {
      return;
    }
    this.onmessage(new MessageEvent("message", {
      data: fromUint8Array(data, this.binaryType),
    }));
  }

  _handleQuicError(error) {
    this._error = error;
    if (!this.onerror) {
      return;
    }
    this.onerror(error);
  }

  _handleQuicStateChange() {
    let state = this._quic.state;
    if (state == "connecting") {
      this._readyState = 0;
      return;
    }

    if (state == "connected") {
      this._readyState = 1;
      if (!this.onopen) {
        return;
      }
      this.onopen();
      return;
    }

    // Closed or failed
    this._readyState = 3;
    if (!this.onclose) {
      return;
    }
    if (this._quic.state == "failed") {
      this.onclose(new CloseEvent({
        wasClean: false
      }));
      return;
    }

    // Closed
    if (!this._error) {
      this.onclose(new CloseEvent({
        wasClean: true
      }));
      return;
    }

    // Close w/ error
    this.onclose(new CloseEvent({
      wasClean: false,
      reason: this._error.message
    }));
  }
}

class QuicUnreliableDatagramWebSocket extends QuicWebSocketBase {
  constructor(hostname, port) {
    super(hostname, port);

    this._quic.receiveDatagrams().then((datagrams) => {
      this._handleReceivedDatagrams(datagrams);
    });
  }

  get bufferedAmount() {
    return 0;
  }

  async send(data) {
    data = await toUint8Array(data);
    if (data.length == 0) {
      throw new TypeError("Empty messages not supported.");
    }
    if (data.length > this._quic.maxDatagramSize) {
      throw new TypeError("Message too big.");
    }
    this._quic.sendDatagram(data);
  }

  _handleReceivedDatagrams(datagrams) {
    for (let datagram of datagrams) {
      this._handleQuicMessageReceived(datagram);
    }
    this._quic.receiveDatagrams().then((datagrams) => {
      this._handleReceivedDatagrams(datagrams);
    });
  }
}

class QuicUnreliableStreamWebSocket extends QuicWebSocketBase {
  constructor(hostname, port) {
    super(hostname, port);

    this._recvStreams = new Set();
    this._quic.onreceivestream = event => {
      this._readStreamAsOneMessage(event.stream);
    };
  }

  get bufferedAmount() {
    let bufferedAmount = 0;
    for (let recvStream of this._recvStreams) {
      bufferedAmount += recvStream.readableAmount;
    }
    return bufferedAmount;
  }

  async send(data) {
    data = await toUint8Array(data);
    if (data.length == 0) {
      throw new TypeError("Empty messages not supported.");
    }
    let stream = await this._quic.createSendStream({
      disableRetransmissions: true
    });
    stream.write({
      data: data,
      finished: true
    });
  }

  async _readStreamAsOneMessage(stream) {
    this._recvStreams.add(stream);

    let buffer = new Uint8Array();
    let bufferedSize = 0;
    let finished = false;
    // We keep appending to an array. If we wanted to be efficient
    // we could wait for the finish to arrive and write everything at
    // once in order to reduce copies.
    while (stream.readable) {
      await stream.waitForReadable(1);
      let readBuffer = new Uint8Array(stream.readableAmount);
      let read = stream.readInto(readBuffer);
      let concatBuffer = new Uint8Array(buffer.length + readBuffer.length);
      concatBuffer.set(buffer);
      concatBuffer.set(readBuffer, buffer.length);
      buffer = concatBuffer;
      finished = read.finished;
    }
    if (finished) {
      this._handleQuicMessageReceived(buffer);
    }

    this._recvStreams.delete(stream);
  }
}

// We create our own CloseEvent because the built in CloseEvent has
// read only properties.
class CloseEvent extends Event {
  constructor(params) {
    super();
    this.reason = "";
    if (params.reason) {
      this.reason = params.reason;
    }
    this.wasClean = false;
    if (params.wasClean === true) {
      this.wasClean = true;
    }
  }
}

async function toUint8Array(data) {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (data instanceof Blob) {
    return new Uint8Array(await readBlobAsArrayBuffer(data));
  }
  if (typeof data == "string") {
    return utf8encode(data);
  }
  return Uint8Array.from(data);
}

async function readBlobAsArrayBuffer(blob) {
  const reader = new FileReader();
  const loadend = new Promise((resolve, reject) => {
    reader.onloadend = resolve;
  });
  reader.readAsArrayBuffer(blob);
  await loadend;
  return reader.result;
}

function fromUint8Array(array, binaryType) {
  if (binaryType == "uint8array") {
    return array;
  }
  if (binaryType == "blob") {
    if (array.buffer.byteLength > array.length) {
      return copyToBlob(array);
    }
    return new Blob([array.buffer]);
  }
  if (binaryType == "arraybuffer") {
    if (array.buffer.byteLength > array.length) {
      return copyToArrayBuffer(array);
    }
    return array.buffer;
  }
  if (binaryType == "string") {
    try {
      return utf8decode(array);
    } catch(e) {
      return "";
    }
  }
  return array;
}

function copyToBlob(values) {
  return new Blob([copyToArrayBuffer(values)]);
}

function copyToArrayBuffer(values) {
  const array = new Uint8Array(values);
  return array.buffer;
}

function utf8encode(str) {
  return Uint8Array.from(Array.from(unescape(encodeURIComponent(str))).map(c => c.codePointAt(0)));
}

function utf8decode(bytes) {
  return decodeURIComponent(escape(Array.from(bytes).map(cp => String.fromCodePoint(cp)).join("")));
}
