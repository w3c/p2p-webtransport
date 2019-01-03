// TODO: 
// - Add support for acking datagrams
// - Add support for readyToSendDatagram
// - Test stream buffering and aborting code :)
// - add QuicTransport onbidirectionalstream, createBidrectionalStream()
class QuicTransport {
  constructor(hostname, port) {
    this._hostname = hostname;
    this._port = port;
    this._state = new State("new");
    this._onError = new Event();
    this._onReceiveStream = new Event();
    this._onDatagramReceived = new Event();

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
    const recvStreamId = sendStreamId + 1
    const maxBufferedAmount = 5000;  // Just make something up
    const recvStream = new QuicReceiveStream(this, recvStreamId, maxBufferedAmount);
    const sendStream = new QuicSendStream(this, sendStreamId, params, recvStream, maxBufferedAmount);
    return sendStream;
  }

  sendDatagram(data) {
    if (this._closedOrFailed) {
      throw new InvalidStateError();
    }
    this._onDatagramReceived.fire(new DatagramReceivedEvent(data));
  }

  set onstatechange(handler) {
    this._state.onchange = (payload) => handler();
  }

  set onerror(handler) {
    this._onError.handler = handler
  }

  set onreceivestream(handler) {
    this._onReceiveStream.handler = handler
  }

  set ondatagramreceived(handler) {
    this._onDatagramReceived.handler = handler
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

class QuicReceiveStream {
  constructor(transport, streamId, maxBufferedAmount) {
    this._transport = transport;
    this._streamId = streamId

    // Data received but not read (buffered)
    this._received = new CircularBuffer(maxBufferedAmount);
    this._receivedFinBit = false;
    this._readableAmount = new State();
    // Whether or not the fin bit has been read out or not
    this._readFinBit = false;

    this._readingAbortedFromSendStream = new OneTimeEvent();
    this._readingAbortedFromReceiveStream = new OneTimeEvent();
  }

  get readable() {
    return !this._readFinBit && !this._transport._closedOrFailed;
  }

  get readableAmount() {
    return this._readableAmount.current;
  }

  get readingAborted() {
    return this._readingAbortedFromSendStream.wait();
  }

  readInto(array) {
    const amount = this._received.dequeInto(array);
    if (this._receivedFinBit) {
      this._readFinBit = true;
    }
    this._readableAmount.change(this._received.usedSize);
    return {
      amount: amount,
      finished: this._receivedFinBit
    }
  }

  abortReading(info) {
    this._readingAbortedFromReceiveStream.set(info);
  }

  async waitForReadable(wantedAmount) {
    await this._readableAmount.until(readableAmount => readableAmount >= wantedAmount);
  }

  set _onreadableamountchanged(handler) {
    this._readableAmount.onchange = handler;
  }

  _receive(array, finBit) {
    let amount = this._received.queue(array);
    if (finBit && amount == array.length) {
      this._receivedFinBit = finBit;
    }
    this._readableAmount.change(this._received.usedSize);
    return amount;
  }
}

class QuicSendStream {
  constructor(transport, streamId, params, recvStream, maxBufferedAmount) {
    this._transport = transport;
    this._streamId = streamId
    this._params = params;
    this._recvStream = recvStream;

    this._unreceived = new CircularBuffer(maxBufferedAmount);  
    this._writeBufferedAmount = new State();
    this._wroteFinBit = false;
    this._receivedFinBit = false;

    this._writingAborted = new OneTimeEvent();

    this._recvStream._onreadableamountchanged = (readableAmount) => {
      this._dequeUnreceived(this._recvStream.readableAmount);
    }
    this._recvStreamFired = false;
  }

  get writable() {
    return !this._wroteFinBit && !this._transport._closedOrFailed;
  }

  get writeBufferedAmount() {
    return this._writeBufferedAmount.current;
  }

  get writingAborted() {
    this._recvStream._readingAbortedFromReceiveStream.wait();
  }

  write(params) {
    if (!this.writable) {
      throw new InvalidStateError();
    }
    if (params.finished && params.data.length == 0) {
      throw new NotSupportedError();
    }
    if (params.finished) {
      this._wroteFinBit = true;
    }

    let receivedAmount = this._recvStream._receive(params.data, params.finished);
    let unreceived = params.data.subarray(receivedAmount);
    if (unreceived.length > 0) {
      this._queueUnreceived(unreceived);
    } else if (params.finished) {
      this._receivedFinBit = true;
    }

    if (!this._recvStreamFired) {
      this._transport._onReceiveStream.fire(new ReceiveStreamEvent(this._recvStream));
      this._recvStreamFired = true;
    }
  }

  abortWriting(info) {
    this.recvStream._readingAbortedFromSendStream.set(info);
  }

  async waitForWriteBufferedAmountBelow(threshold) {
    await this._writeBufferedAmount.until(writableAmount => writableAmount < threshold);
  }

  _queueUnreceived(unreceived) {
    let queuedAmount = this._unreceived.queue(unreceived);
    if (queuedAmount) {
      this._writeBufferedAmount.change(this._unreceived.usedSize);
    }
    if (queuedAmount < unreceived.length) {
      this.abortWriting(500);
    }
  }

  _dequeUnreceived(readableAmount) {
    let dequeAmount  = Math.min(readableAmount, this._unreceived.usedSize);
    if (dequeAmount == 0) {
      return;
    }
    let recvData = new Uint8Array(dequeAmount);
    this._unreceived.dequeInto(recvData);
    let recvFinBit = this._wroteFinBit && (this._unreceived.usedSize == 0);
    this._recvStream._receive(recvData, recvFinBit);
    this._writeBufferedAmount.change(this._unreceived.usedSize);
  };
}

class OneTimeEvent {
  constructor(state) {
    this._set = false;
    this._state = new State(null);
  }

  async wait() {
    if (this._set) {
      return this._state.current;
    }
    return await this._next;
  }

  set(value) {
    this._state.set(value);
    this._set = true;
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

  // async
  get next() {
    return this._changed.next;
  }

  async until(pred) {
    while(!pred(this.current)) {
      await this.next;
    }
  }

  set onchange(handler) {
    this._changed.handler = handler
  }

  change(state) {
    this._state = state;
    this._changed.fire(new Event());
  }
}

class Event {
  constructor() {
    this._handler = null;
    this._resolves = [];
  }

  get next() {
    return new Promise((resolve, reject) => {
      this._resolves.push(resolve);
    });
  }

  set handler(handler) {
    this._handler = handler;
  }

  fire(payload) {
    if (this._handler) {
      this._handler(payload);
    }
    for (const resolve of this._resolves) {
      resolve(payload);
    }
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
  }

  get maxSize() {
    return this._array.length;
  }

  get usedSize() {
    let used = this._end - this._start;
    if (used < 0) {
      used += this.maxSize;
    }
    return used;
  }

  get unusedSize() {
    return this.maxSize - this.usedSize;
  }

  queue(array) {
    let amount = Math.min(array.length, this.unusedSize);

    // Lazy copy; could be faster if not so lazy
    for (let i = 0; i < amount; i++) {
      this._array[this._end] = array[i];
      this._end = (this._end + 1) % this.maxSize;
    }
    return amount;
  }

  dequeInto(array) {
    let amount = Math.min(array.length, this.usedSize);

    // Lazy copy; could be faster if not so lazy
    for (let i = 0; i < amount; i++) {
      array[i] = this._array[this._start];
      this._start = (this._start + 1) % this.maxSize;
    }
    return amount;
  }
}

function later(f) {
  setTimeout(f, 0);
}
