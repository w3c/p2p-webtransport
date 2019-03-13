// TODO:
// - add QuicTransport onbidirectionalstream, createBidrectionalStream()
//
// A QuicTransport that is connected to itself, meaning that datagrams sent
// are received on the same transport, and QuicSendStreams created are connected
// to a QuicReceiveStrem on the same transport.
class QuicTransport {
  constructor(hostname, port) {
    this._hostname = hostname;
    this._port = port;
    this._state = new State("new");
    this._onError = new Event();
    this._onReceiveStream = new Event();

    this._maxReceivedDatagramAmount = 1000; // Make something up.
    this._resolveReceivedDatagrams = null;
    this._unresolvedDatagramPromise = false;
    this._receivedDatagrams = [];

    // See https://tools.ietf.org/html/draft-ietf-quic-transport-17#section-2.1
    // Including 2 bit suffix, client send streams get 2, 6, 10, ...
    this._lastSendStreamId = 10;
    this._stopInfo = null;

    // Do later to allow watching state change
    later(() => {
      this._state.change("connecting");
      this._state.change("connected");
    });
  }

  get state() {
    return this._state.current;
  }

  get maxDatagramSize() {
    return 1280;
  }

  stop(info) {
    this._stopInfo = info;
    if (info) {
      this._onError.fire({
        message: info.reason
      });
    }
    this._state.change("closed");
  }

  get _closedOrFailed() {
    return this._state.current == "closed" || this._state.current == "failed";
  }

  allocateSendStreamId() {
    // See https://tools.ietf.org/html/draft-ietf-quic-transport-17#section-2.1
    this._lastSendStreamId += 4;
    return this._lastSendStreamId;
  }

  async createSendStream(params) {
    if (this._closedOrFailed) {
      throw new InvalidStateError();
    }
    await this._state.until(state => state == "connected");

    const sendStreamId = this.allocateSendStreamId();
    // See https://tools.ietf.org/html/draft-ietf-quic-transport-17#section-2.1
    const recvStreamId = sendStreamId + 1;
    const maxBufferedAmount = 5000;  // Just make something up
    const recvStream = new QuicReceiveStream(this, recvStreamId, maxBufferedAmount);
    const sendStream = new QuicSendStream(this, sendStreamId, params, recvStream, maxBufferedAmount);
    return sendStream;
  }

  readyToSendDatagram() {
    if (this._closedOrFailed) {
      throw new InvalidStateError();
    }
    return new Promise((resolve, reject) => {
      // Let's pretend that congestion control never blocks the transport ;).
      resolve();
    });
  }

  sendDatagram(data) {
    if (this._closedOrFailed) {
      throw new InvalidStateError();
    }
    // Drop datagrams once the max is hit.
    if (this._receivedDatagrams.length == this._maxReceivedDatagramAmount) {
      return new Promise((resolve, reject) => {
        resolve(false);
      });
    }

    this._receivedDatagrams.push(data);
    // Resolve a receivedDatagrams() promise if one has been returned.
    if (this._unresolvedDatagramPromise) {
      this._resolveReceivedDatagrams(this._receivedDatagrams.slice());
      this._receivedDatagrams = [];
      this._resolveReceivedDatagrams = null;
      this._unresolvedDatagramPromise = false;
    }

    // Return a promise resolved with true, because we know that the datagram
    // has been "acked".
    return new Promise((resolve, reject) => {
      resolve(true);
    });
  }

  receiveDatagrams() {
    if (this._unresolvedDatagramPromise) {
      // Can't return a promise if previous one is unresolved.
      throw new InvalidStateError();
    }

    if (this._receivedDatagrams.length > 0) {
      // Already received datagrams, go ahead and resolve the
      // promise immediately.
      return new Promise((resolve, reject) => {
        resolve(this._receivedDatagrams.slice());
        this._receivedDatagrams = [];
      });
    }
    this._unresolvedDatagramPromise = true;
    return new Promise((resolve, reject) => {
      this._resolveReceivedDatagrams = resolve;
    });
  }

  get _datagramBufferedAmount() {
    return this._receivedDatagrams.length;
  }

  set onstatechange(handler) {
    this._state.onchange = (payload) => handler();
  }

  set onerror(handler) {
    this._onError.handler = handler;
  }

  set onreceivestream(handler) {
    this._onReceiveStream.handler = handler;
  }

  set ondatagramreceived(handler) {
    this._onDatagramReceived.handler = handler;
  }
}

class QuicStream {
  get transport() {
    return this._transport;
  }

  get streamId() {
    return this._streamId;
  }
}

class QuicReceiveStream extends QuicStream {
  constructor(transport, streamId, maxBufferedAmount) {
    super();
    this._transport = transport;
    this._streamId = streamId;

    // Data received but not read (buffered)
    this._receiveBuffer = new CircularBuffer(maxBufferedAmount);
    this._receivedFinBit = false;
    this._readableAmount = new State(0);
    // Whether or not the fin bit has been read out or not
    this._readFinBit = false;

    // Allows the send stream to abort the reading.
    this._abortReadingFromSendStream = null;
    this._readingAbortedFromSendStream = new Promise((resolve, reject) => {
      this._abortReadingFromSendStream = resolve;
    });
    // Allows send stream to access Promise for when reading is aborted from
    // this receive stream.
    this._abortReadingFromReceiveStream = null;
    this._readingAbortedFromReceiveStream = new Promise((resolve, reject) => {
      this._abortReadingFromReceiveStream = resolve;
    });
  }

  get readable() {
    return !this._readFinBit && !this._transport._closedOrFailed;
  }

  get readableAmount() {
    return this._readableAmount.current;
  }

  get readingAborted() {
    return this._readingAbortedFromSendStream;
  }

  readInto(array) {
    const amount = this._receiveBuffer.dequeInto(array);
    if (this._receivedFinBit && this._receiveBuffer.usedSize == 0) {
      this._readFinBit = true;
    }
    this._readableAmount.change(this._receiveBuffer.usedSize);
    return {
      amount: amount,
      finished: this._readFinBit
    };
  }

  abortReading(info) {
    this._abortReadingFromReceiveStream();
  }

  async waitForReadable(wantedAmount) {
    await this._readableAmount.until(readableAmount => readableAmount >= wantedAmount);
  }

  set _onreadableamountchanged(handler) {
    this._readableAmount.onchange = handler;
  }

  // Used by QuicSendStream.
  _receive(array, finBit) {
    if (array.length > this._receiveBuffer.unusedSize) {
      console.error("QuicSendStream sent more data than can be buffered.");
    }

    let x = this._receiveBuffer.queue(array);
    if (finBit) {
      this._receivedFinBit = finBit;
    }
    this._readableAmount.change(this._receiveBuffer.usedSize);
  }
}

// TODO: Implement params.disableRetransmissions.
class QuicSendStream extends QuicStream {
  constructor(transport, streamId, params, recvStream, maxBufferedAmount) {
    super();
    this._transport = transport;
    this._streamId = streamId;
    this._params = params;
    this._recvStream = recvStream;

    this._writeBuffer = new CircularBuffer(maxBufferedAmount);
    this._writeBufferedAmount = new State(0);
    this._wroteFinBit = false;

    this._recvStream._onreadableamountchanged = (readableAmount) => {
      this._dequeUnreceived();
    };
    this._recvStreamFired = false;
  }

  get writable() {
    return !this._wroteFinBit && !this._transport._closedOrFailed;
  }

  get writeBufferedAmount() {
    return this._writeBufferedAmount.current;
  }

  get writingAborted() {
    return this._recvStream._readingAbortedFromReceiveStream;
  }

  write(params) {
    if (!this.writable) {
      throw new InvalidStateError();
    }
    if (params.finished && params.data.length == 0) {
      throw new NotSupportedError();
    }
    if (params.data.length > this._writeBuffer.unusedSize) {
      // We can't write more than available in the buffer.
      throw new NotSupportedError();
    }
    if (params.finished) {
      this._wroteFinBit = true;
    }

    if (this.writeBufferedAmount > 0) {
      // Backpressure is being applied from receive side, so append to
      // already buffered data.
      this._queueUnreceived(params.data);
    } else {
      let sendAmount = Math.min(this._recvStream._receiveBuffer.unusedSize,
                                params.data.length);
      let sendData = params.data.slice(0, sendAmount);
      // Send the FIN bit to receive side if it has been written by write()
      // and we have dequeued everything in the write buffer.
      this._recvStream._receive(sendData, this._wroteFinBit);
      if (sendAmount < params.data.length) {
        // Queue data that couldn't be sent.
        this._queueUnreceived(params.data.slice(sendAmount));
      }
    }

    if (!this._recvStreamFired) {
      this._transport._onReceiveStream.fire(new ReceiveStreamEvent(this._recvStream));
      this._recvStreamFired = true;
    }
  }

  abortWriting(info) {
    this._recvStream._abortReadingFromSendStream();
  }

  async waitForWriteBufferedAmountBelow(threshold) {
    await this._writeBufferedAmount.until(writableAmount => writableAmount < threshold);
  }


  _queueUnreceived(unreceived) {
    let queuedAmount = this._writeBuffer.queue(unreceived);
    if (queuedAmount < unreceived.length) {
      console.error("Could not buffer all write() data.");
      this.abortWriting(500);
    }
    if (queuedAmount) {
      this._writeBufferedAmount.change(this._writeBuffer.usedSize);
    }
  }

  _dequeUnreceived() {
    let dequeAmount  = Math.min(this._recvStream._receiveBuffer.unusedSize,
                                this._writeBuffer.usedSize);
    if (dequeAmount == 0) {
      return;
    }
    let sendData = new Uint8Array(dequeAmount);
    this._writeBuffer.dequeInto(sendData);
    // Send the FIN bit to receive side if it has been written by write()
    // and we have dequeued everything in the write buffer.
    let sendFin = this._wroteFinBit && this._writeBuffer.usedSize == 0;
    this._recvStream._receive(sendData, sendFin);
    this._writeBufferedAmount.change(this._writeBuffer.usedSize);
  }
}

class State {
  constructor(state) {
    this._state = state;
    this._changed = new Event();
  }

  get current() {
    return this._state;
  }

  async until(pred) {
    while(!pred(this.current)) {
      await this._changed.nextStatePromise;
    }
  }

  set onchange(handler) {
    this._changed.handler = handler;
  }

  change(state) {
    this._state = state;
    this._changed.fire(new Event());
  }
}

class Event {
  constructor() {
    this._handler = null;
    this._resolveNextState = null;
    this._nextStatePromise = new Promise((resolve, reject) => {
      this._resolveNextState = resolve;
    });
  }

  get nextStatePromise() {
    return this._nextStatePromise;
  }

  set handler(handler) {
    this._handler = handler;
  }

  fire(payload) {
    if (this._handler) {
      this._handler(payload);
    }
    this._resolveNextState();
    this._nextStatePromise = new Promise((resolve, reject) => {
      this._resolveNextState = resolve;
    });
  }
}

class InvalidStateError extends Error {
}

class NotSupportedError extends Error {
}

class ReceiveStreamEvent extends Event {
  constructor(stream) {
    super();
    this.stream = stream;
  }
}

class DatagramReceivedEvent extends Event {
  constructor(data) {
    super();
    this.data = data;
  }
}

class CircularBuffer {
  constructor(maxSize) {
    this._array = new Uint8Array(maxSize);
    this._start = 0;
    this._end = 0;
    this._usedSize = 0;
  }

  get maxSize() {
    return this._array.length;
  }

  get usedSize() {
    return this._usedSize;
  }

  get unusedSize() {
    return this.maxSize - this._usedSize;
  }

  queue(array) {
    let amount = Math.min(array.length, this.unusedSize);

    // Lazy copy; could be faster if not so lazy
    for (let i = 0; i < amount; i++) {
      this._array[this._end] = array[i];
      this._end = (this._end + 1) % this.maxSize;
    }
    this._usedSize += amount;
    return amount;
  }

  dequeInto(array) {
    let amount = Math.min(array.length, this.usedSize);

    // Lazy copy; could be faster if not so lazy
    for (let i = 0; i < amount; i++) {
      array[i] = this._array[this._start];
      this._start = (this._start + 1) % this.maxSize;
    }
    this._usedSize -= amount;
    return amount;
  }
}

function later(f) {
  setTimeout(f, 0);
}
